// Milestone 10 security regression tests that need NO database.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'unit-test-secret-0123456789-abcdefghijklmnop';
process.env.CORS_ORIGIN = 'https://app.example.com';
const { test, describe } = require('node:test');
const assert = require('node:assert');
const express = require('express');

const { validateEnv, checkJwtSecret, isAllowedOrigin } = require('../config/env');
const cookies = require('../utils/cookies');
const { originGuard } = require('../middleware/csrf');
const { redact, describe: describeErr } = require('../utils/logger');
const { extractPdfText, withTimeout } = require('../services/resumeParser');
const { createShutdown } = require('../services/shutdown');
const { createLoginAccountLimiter, createUploadLimiter } = require('../middleware/rateLimiters');
const { errorHandler, isDbUnavailable } = require('../middleware/errorMiddleware');
const makePdf = require('./helpers/makePdf');

const GOOD = { MONGO_URI: 'mongodb://x/y', JWT_SECRET: 'q8Zr2kLx9PvT4mNc7WbY1dHs6GfJ3aEu5oIe0RtV' };
const withEnv = (vars, fn) => {
  const old = {};
  for (const k of Object.keys(vars)) { old[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { return fn(); } finally { for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
};

describe('JWT_SECRET and environment validation', () => {
  test('rejects short, placeholder and low-entropy secrets; accepts a random 40+ char secret', () => {
    assert.match(checkJwtSecret('short'), /at least 32/);
    assert.match(checkJwtSecret('replace-with-a-long-random-secret-xxxxxxxx'), /placeholder/);
    assert.match(checkJwtSecret('a'.repeat(64)), /repetitive|low-entropy/);
    assert.match(checkJwtSecret('ab'.repeat(20)), /repetitive|low-entropy/);
    assert.strictEqual(checkJwtSecret(GOOD.JWT_SECRET), null);
    assert.strictEqual(checkJwtSecret(require('crypto').randomBytes(48).toString('hex')), null);
  });

  test('validateEnv reports every problem in one clear error', () => {
    assert.throws(() => validateEnv({ NODE_ENV: 'production' }), /Missing required environment variables: MONGO_URI, JWT_SECRET/);
    assert.throws(() => validateEnv({ ...GOOD, JWT_SECRET: 'tooshort' }), /JWT_SECRET must be at least 32/);
    assert.throws(() => validateEnv({ ...GOOD, JWT_EXPIRES_IN: '7days' }), /JWT_EXPIRES_IN="7days" is invalid/);
    assert.throws(() => validateEnv({ ...GOOD, COOKIE_SAMESITE: 'None ' + 'x' }), /COOKIE_SAMESITE=.* is invalid/);
    assert.throws(() => validateEnv({ ...GOOD, COOKIE_SAMESITE: 'strictt' }), /Allowed values: lax, strict, none/);
    assert.throws(() => validateEnv({ ...GOOD, JWT_SECRET: 'x', COOKIE_SAMESITE: 'bad', JWT_EXPIRES_IN: 'zz' }), (e) => /JWT_SECRET/.test(e.message) && /COOKIE_SAMESITE/.test(e.message) && /JWT_EXPIRES_IN/.test(e.message));
  });

  test('COOKIE_SAMESITE accepts lax/strict/none in any case, with quotes or spaces', () => {
    for (const v of ['lax', 'Strict', 'NONE', ' none ', '"none"', '']) assert.doesNotThrow(() => validateEnv({ ...GOOD, COOKIE_SAMESITE: v }), v);
  });

  test('production requires an exact https CORS_ORIGIN and warns when COOKIE_SAMESITE is unset', () => {
    const prod = { ...GOOD, NODE_ENV: 'production' };
    assert.throws(() => validateEnv(prod), /CORS_ORIGIN must be set/);
    assert.throws(() => validateEnv({ ...prod, CORS_ORIGIN: '*' }), /exact https/);
    assert.throws(() => validateEnv({ ...prod, CORS_ORIGIN: 'http://site.com' }), /exact https/);
    const warnings = validateEnv({ ...prod, CORS_ORIGIN: 'https://site.vercel.app' });
    assert.ok(warnings.some((w) => /COOKIE_SAMESITE is not set/.test(w)));
    assert.deepStrictEqual(validateEnv({ ...prod, CORS_ORIGIN: 'https://site.vercel.app', COOKIE_SAMESITE: 'none', FRONTEND_URL: 'https://site.vercel.app' }), []);
  });
});

describe('cookie options', () => {
  test('defaults: HttpOnly, SameSite=Lax, Secure only in production', () => {
    withEnv({ COOKIE_SAMESITE: undefined, NODE_ENV: 'development' }, () => assert.deepStrictEqual(cookies.cookieOptions(), { httpOnly: true, secure: false, sameSite: 'lax', path: '/' }));
    withEnv({ COOKIE_SAMESITE: undefined, NODE_ENV: 'production' }, () => assert.strictEqual(cookies.cookieOptions().secure, true));
  });
  test('SameSite=None forces Secure (browsers drop the cookie otherwise); casing is normalised', () => {
    withEnv({ COOKIE_SAMESITE: 'None', NODE_ENV: 'development' }, () => { const o = cookies.cookieOptions(); assert.strictEqual(o.sameSite, 'none'); assert.strictEqual(o.secure, true); });
  });
  test('an invalid value can never reach the Set-Cookie header (falls back to lax)', () => {
    withEnv({ COOKIE_SAMESITE: 'nonee' }, () => assert.strictEqual(cookies.cookieOptions().sameSite, 'lax'));
  });
});

describe('CSRF origin guard (unit)', () => {
  const run = (req, env = {}) => withEnv({ NODE_ENV: 'test', ...env }, () => { let result; originGuard({ cookies: {}, headers: {}, ...req }, null, (e) => { result = e; }); return result; });
  test('safe methods are never blocked', () => assert.strictEqual(run({ method: 'GET', headers: { origin: 'https://evil.example' } }), undefined));
  test('unknown origin, "null" origin and empty origin are blocked on unsafe methods', () => {
    for (const origin of ['https://evil.example', 'null', '', 'https://app.example.com.evil.example', 'http://app.example.com']) {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.strictEqual(run({ method, headers: { origin } })?.errorCode, 'CSRF_BLOCKED', `${method} ${origin}`);
    }
  });
  test('the allow-listed origin passes', () => assert.strictEqual(run({ method: 'POST', headers: { origin: 'https://app.example.com' } }), undefined));
  test('no Origin: Sec-Fetch-Site decides, then Referer', () => {
    assert.strictEqual(run({ method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } })?.errorCode, 'CSRF_BLOCKED');
    assert.strictEqual(run({ method: 'POST', headers: { 'sec-fetch-site': 'same-site' } })?.errorCode, 'CSRF_BLOCKED');
    assert.strictEqual(run({ method: 'POST', headers: { 'sec-fetch-site': 'same-origin' } }), undefined);
    assert.strictEqual(run({ method: 'POST', headers: { referer: 'https://evil.example/x' } })?.errorCode, 'CSRF_BLOCKED');
    assert.strictEqual(run({ method: 'POST', headers: { referer: 'https://app.example.com/jobs' } }), undefined);
  });
  test('cookie request with no provenance headers is refused in production only; bearer/curl without cookie is allowed', () => {
    assert.strictEqual(run({ method: 'POST', cookies: { token: 'x' } }, { NODE_ENV: 'production' })?.errorCode, 'CSRF_BLOCKED');
    assert.strictEqual(run({ method: 'POST', cookies: { token: 'x' } }), undefined);
    assert.strictEqual(run({ method: 'POST', headers: { authorization: 'Bearer abc' } }, { NODE_ENV: 'production' }), undefined);
  });
  test('isAllowedOrigin: production does not accept localhost', () => {
    withEnv({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.example.com' }, () => {
      assert.strictEqual(isAllowedOrigin('http://localhost:3000'), false);
      assert.strictEqual(isAllowedOrigin('https://app.example.com'), true);
    });
  });
});

describe('HTTP behaviour through the real app (no database)', () => {
  let server, base;
  const app = require('../app');
  const start = async () => { await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }); };
  test('setup', start);

  test('cross-origin multipart POST /api/apply is rejected with 403 BEFORE the upload is read', async () => {
    const f = new FormData();
    f.append('jobId', 'a'.repeat(24));
    f.append('resume', new Blob([makePdf(['x'])], { type: 'application/pdf' }), 'r.pdf');
    for (const path of ['/api/apply', '/api/applications']) {
      const r = await fetch(base + path, { method: 'POST', body: f, headers: { origin: 'https://evil.example', cookie: 'token=whatever' } });
      assert.strictEqual(r.status, 403, path);
      assert.strictEqual((await r.json()).code, 'CSRF_BLOCKED');
    }
  });
  test('cross-origin login, logout, register, status change and payment calls are blocked', async () => {
    const evil = { origin: 'https://evil.example', 'content-type': 'application/json' };
    for (const [m, p] of [['POST', '/api/auth/login'], ['POST', '/api/auth/logout'], ['POST', '/api/auth/register'], ['PATCH', `/api/applications/${'a'.repeat(24)}/status`], ['POST', '/api/payments/create-order'], ['DELETE', `/api/jobs/${'a'.repeat(24)}`]]) {
      assert.strictEqual((await fetch(base + p, { method: m, headers: evil, body: m === 'DELETE' ? undefined : '{}' })).status, 403, `${m} ${p}`);
    }
  });
  test('an allow-listed origin is not blocked by the guard (reaches normal auth, 401)', async () => {
    const r = await fetch(base + '/api/apply', { method: 'POST', headers: { origin: 'https://app.example.com' } });
    assert.strictEqual(r.status, 401);
  });
  test('Razorpay webhook is not subject to the origin guard (it is verified by signature instead)', async () => {
    const r = await fetch(base + '/api/payments/webhook', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
    const body = await r.json().catch(() => ({}));
    assert.notStrictEqual(body.code, 'CSRF_BLOCKED'); // it is rejected (or accepted) by its signature check, never by the origin guard
  });
  test('API security headers are present and nothing leaks the framework', async () => {
    const r = await fetch(base + '/api/health');
    assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-security-policy'), /default-src 'none'/);
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.strictEqual(r.headers.get('referrer-policy'), 'no-referrer');
    assert.match(r.headers.get('permissions-policy'), /camera=\(\)/);
    assert.strictEqual(r.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.strictEqual(r.headers.get('x-powered-by'), null);
    assert.strictEqual(r.headers.get('strict-transport-security'), null); // HSTS only when NODE_ENV=production (HTTPS)
  });
  test('database outage: public and protected routes return 503 DB_UNAVAILABLE with Retry-After, never a raw 500', async () => {
    const r = await fetch(base + '/api/jobs');
    assert.strictEqual(r.status, 503);
    const body = await r.json();
    assert.strictEqual(body.code, 'DB_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(body), /mongo|bufferCommands|ECONN/i);
    assert.strictEqual(r.headers.get('retry-after'), '5');
    const login = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'a@b.co', password: 'password123' }) });
    assert.strictEqual(login.status, 503);
  });
  test('health stays 200 (liveness) while /api/ready reports 503 when the database is down', async () => {
    const h = await fetch(base + '/api/health');
    assert.strictEqual(h.status, 200);
    assert.strictEqual((await h.json()).database.connected, false);
    const r = await fetch(base + '/api/ready');
    assert.strictEqual(r.status, 503);
    assert.strictEqual((await r.json()).status, 'database_unavailable');
  });
  test('errors are logged sanitized: never the whole error object, URI, JWT or e-mail', async () => {
    const lines = [];
    const orig = console.error; console.error = (...a) => lines.push(a);
    try {
      const err = Object.assign(new Error('boom mongodb+srv://user:pa55@cluster0.x.mongodb.net/db token=abc123 jane@example.com eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEifQ.signaturepart'), { extra: { password: 'hunter2' } });
      const a = express();
      a.get('/x', () => { throw err; });
      a.use(errorHandler);
      const s = await new Promise((r) => { const sv = a.listen(0, () => r(sv)); });
      const res = await fetch(`http://127.0.0.1:${s.address().port}/x`);
      s.close();
      assert.strictEqual(res.status, 500);
      assert.deepStrictEqual(await res.json(), { success: false, message: 'Internal server error' });
    } finally { console.error = orig; }
    const text = lines.map((l) => l.map(String).join(' ')).join('\n');
    assert.ok(lines.every((l) => l.every((x) => typeof x === 'string')), 'only strings are logged, never error objects');
    assert.doesNotMatch(text, /pa55|abc123|hunter2|jane@example\.com|signaturepart|cluster0/);
    assert.match(text, /\[redacted\]|\[jwt-redacted\]|\[email-redacted\]/);
  });
  test('teardown', () => new Promise((r) => server.close(r)));
});

describe('logger / redaction', () => {
  test('redacts connection strings, JWTs, bearer tokens, API keys, e-mails and password-like pairs', () => {
    const s = redact('mongodb+srv://u:p@h/db Bearer abc.def re_ABCDEF123456 rzp_live_ABCDEF123456 a@b.com password=hunter2 eyJhbGciOi.eyJpZCI6IjEifQ.sig_1234567');
    for (const leak of ['u:p@h', 'abc.def', 're_ABCDEF123456', 'rzp_live_ABCDEF123456', 'a@b.com', 'hunter2', 'sig_1234567']) assert.ok(!s.includes(leak), leak);
  });
  test('describe() prints only name/code/status/redacted message and truncates long messages', () => {
    const d = describeErr(Object.assign(new Error('x'.repeat(5000)), { code: 11000, config: { secret: 'S3CRET' } }));
    assert.ok(d.length < 500); assert.doesNotMatch(d, /S3CRET/); assert.match(d, /code=11000/);
  });
});

describe('database outage detection', () => {
  test('recognises driver and mongoose connectivity errors, not ordinary errors', () => {
    assert.ok(isDbUnavailable({ name: 'MongoServerSelectionError', message: 'x' }));
    assert.ok(isDbUnavailable({ name: 'MongoNetworkError', message: 'x' }));
    assert.ok(isDbUnavailable(new Error('Cannot call `users.findOne()` before initial connection is complete if `bufferCommands = false`.')));
    assert.ok(!isDbUnavailable(new Error('Something else')));
    assert.ok(!isDbUnavailable({ name: 'ValidationError', message: 'x' }));
  });
});

describe('resume parsing limits', () => {
  test('a real PDF still parses', async () => {
    const text = await extractPdfText(makePdf(['Jane Doe', 'Skills: Python, SQL']));
    assert.match(text, /Python/);
  });
  test('garbage / truncated / non-PDF bytes return "" and never throw', async () => {
    assert.strictEqual(await extractPdfText(Buffer.from('%PDF-1.4 not really a pdf')), '');
    assert.strictEqual(await extractPdfText(Buffer.alloc(2048, 7)), '');
  });
  test('only the first N pages are requested (page limit)', async () => {
    let seen;
    const out = await extractPdfText(Buffer.from('%PDF-x'), { maxPages: 3, parserFactory: () => ({ getText: async (p) => { seen = p; return { text: 'hello' }; }, destroy: async () => {} }) });
    assert.deepStrictEqual(seen, { first: 3 }); assert.strictEqual(out, 'hello');
  });
  test('PDF_MAX_PAGES env is honoured by default', async () => {
    let seen;
    await withEnv({ PDF_MAX_PAGES: '4' }, () => extractPdfText(Buffer.from('%PDF-x'), { parserFactory: () => ({ getText: async (p) => { seen = p; return { text: '' }; }, destroy: async () => {} }) }));
    assert.deepStrictEqual(seen, { first: 4 });
  });
  test('a parser that hangs is abandoned after the timeout (returns "" quickly) and is destroyed', async () => {
    let destroyed = false;
    const t0 = Date.now();
    const out = await extractPdfText(Buffer.from('%PDF-x'), { timeoutMs: 150, parserFactory: () => ({ getText: () => new Promise(() => {}), destroy: async () => { destroyed = true; } }) });
    assert.strictEqual(out, ''); assert.ok(Date.now() - t0 < 1500, 'returned promptly'); assert.ok(destroyed);
  });
  test('withTimeout rejects with PARSE_TIMEOUT and passes fast results through', async () => {
    await assert.rejects(withTimeout(new Promise(() => {}), 20), (e) => e.code === 'PARSE_TIMEOUT');
    assert.strictEqual(await withTimeout(Promise.resolve(5), 50), 5);
  });
  test('extracted text is capped at 200,000 characters', async () => {
    const out = await extractPdfText(Buffer.from('%PDF-x'), { parserFactory: () => ({ getText: async () => ({ text: 'a'.repeat(500000) }), destroy: async () => {} }) });
    assert.strictEqual(out.length, 200000);
  });
});

describe('rate limiters', () => {
  const serve = async (mount) => { const a = express(); a.set('trust proxy', true); a.use(express.json()); mount(a); const s = await new Promise((r) => { const sv = a.listen(0, () => r(sv)); }); return { s, url: `http://127.0.0.1:${s.address().port}` }; };
  const post = (url, ip, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body) }).then((r) => r.status);

  test('per-ACCOUNT login limiter: many IPs cannot keep guessing one account; other accounts are unaffected; successes do not count', async () => {
    process.env.FORCE_RATE_LIMIT = '1';
    const { s, url } = await serve((a) => a.post('/login', createLoginAccountLimiter(3), (req, res) => res.status(req.body.password === 'right' ? 200 : 401).json({})));
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push(await post(url + '/login', `10.0.0.${i + 1}`, { email: 'Victim@Example.com', password: 'wrong' })); // five different IPs, same account (case-insensitive)
    assert.deepStrictEqual(codes, [401, 401, 401, 429, 429]);
    assert.strictEqual(await post(url + '/login', '10.9.9.9', { email: 'someone-else@example.com', password: 'wrong' }), 401);
    for (let i = 0; i < 6; i++) assert.strictEqual(await post(url + '/login', '10.8.8.8', { email: 'good@example.com', password: 'right' }), 200); // successes never lock you out
    assert.strictEqual(await post(url + '/login', '10.8.8.8', { email: 'good@example.com', password: 'wrong' }), 401);
    s.close(); delete process.env.FORCE_RATE_LIMIT;
  });
  test('upload limiter is per signed-in user, not per IP', async () => {
    process.env.FORCE_RATE_LIMIT = '1';
    const { s, url } = await serve((a) => a.post('/up', (req, _res, next) => { req.user = { id: req.headers['x-user'] }; next(); }, createUploadLimiter(2), (_req, res) => res.json({})));
    const hit = (user, ip) => fetch(url + '/up', { method: 'POST', headers: { 'x-user': user, 'x-forwarded-for': ip } }).then((r) => r.status);
    assert.deepStrictEqual([await hit('u1', '1.1.1.1'), await hit('u1', '2.2.2.2'), await hit('u1', '3.3.3.3')], [200, 200, 429]);
    assert.strictEqual(await hit('u2', '1.1.1.1'), 200);
    s.close(); delete process.env.FORCE_RATE_LIMIT;
  });
});

describe('graceful shutdown', () => {
  const fake = () => { const calls = []; return { calls, server: { close: (cb) => { calls.push('server.close'); cb(); }, closeIdleConnections: () => calls.push('closeIdle') }, disconnect: async () => { calls.push('disconnect'); }, drain: async () => { calls.push('drain'); return { drained: true }; }, log: () => {}, exit: (c) => calls.push(`exit:${c}`) }; };
  test('stops the server, drains background jobs, closes the database, then exits 0 - in that order, once', async () => {
    const f = fake();
    const sd = createShutdown(f);
    await sd('SIGTERM'); await sd('SIGTERM');
    assert.deepStrictEqual(f.calls.filter((c) => !c.startsWith('closeIdle')), ['server.close', 'drain', 'disconnect', 'exit:0']);
  });
  test('exit code is preserved for crashes and a stuck shutdown is forced after the timeout', async () => {
    const f = fake();
    await createShutdown(f)('uncaughtException', 1);
    assert.strictEqual(f.calls.at(-1), 'exit:1');
    const g = fake(); g.server.close = () => g.calls.push('never-closes');
    await new Promise((r) => { g.exit = (c) => { g.calls.push(`exit:${c}`); r(); }; createShutdown({ ...g, timeoutMs: 100 })('SIGTERM'); });
    assert.ok(g.calls.includes('exit:1'));
  });
  test('background e-mail jobs: drain waits for them but gives up after the time limit', async () => {
    const { background, drain } = require('../services/notifier');
    let done = false;
    background(() => new Promise((r) => setTimeout(() => { done = true; r(); }, 80)));
    assert.deepStrictEqual(await drain(2000), { drained: true, pending: 0 }); assert.ok(done);
    background(() => new Promise((r) => setTimeout(r, 600)));
    const slow = await drain(50);
    assert.strictEqual(slow.drained, false); assert.strictEqual(slow.pending, 1);
    await drain(2000);
  });
  test('a failing background job is logged sanitized and never crashes the process', async () => {
    const { background, drain } = require('../services/notifier');
    const lines = []; const orig = console.error; console.error = (...a) => lines.push(a.join(' '));
    try { background(() => { throw new Error('mail failed for jane@example.com'); }); await drain(1000); } finally { console.error = orig; }
    assert.match(lines.join('\n'), /Background task failed/); assert.doesNotMatch(lines.join('\n'), /jane@example\.com/);
  });
});

describe('configuration consistency', () => {
  test('Node version is pinned for Render/Vercel and tests run serially', () => {
    const pkg = require('../package.json'); const fs = require('fs'); const path = require('path');
    assert.strictEqual(pkg.engines.node, '22.x');
    assert.strictEqual(fs.readFileSync(path.join(__dirname, '..', '.node-version'), 'utf8').trim(), '22');
    assert.match(pkg.scripts.test, /test-concurrency=1/);
  });
  test('the duplicated asyncHandler helper now lives in one place', () => {
    const fs = require('fs'); const path = require('path');
    const dir = path.join(__dirname, '..', 'controllers');
    for (const f of fs.readdirSync(dir)) assert.doesNotMatch(fs.readFileSync(path.join(dir, f), 'utf8'), /const asyncHandler = \(fn\)/, f);
  });
});
