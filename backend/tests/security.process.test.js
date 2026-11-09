// Starts the REAL server.js as a child process: startup validation, keep-alive (502 fix), security headers in production mode, graceful SIGTERM.
const { test, describe } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { URI, skip } = require('./helpers/itest');

const STRONG = 'q8Zr2kLx9PvT4mNc7WbY1dHs6GfJ3aEu5oIe0RtV';
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const start = (env) => {
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { PATH: process.env.PATH, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = { stdout: '', stderr: '' };
  child.stdout.on('data', (d) => { out.stdout += d; }); child.stderr.on('data', (d) => { out.stderr += d; });
  const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })));
  const waitFor = (re, ms = 15000) => new Promise((resolve, reject) => { const t0 = Date.now(); const i = setInterval(() => { if (re.test(out.stdout + out.stderr)) { clearInterval(i); resolve(); } else if (Date.now() - t0 > ms) { clearInterval(i); reject(new Error(`timeout waiting for ${re}\n${out.stdout}\n${out.stderr}`)); } }, 50); });
  return { child, out, exited, waitFor };
};

describe('server.js process', () => {
  test('refuses to start with a weak JWT_SECRET and prints a clear message (without echoing the secret)', async () => {
    const p = start({ NODE_ENV: 'development', MONGO_URI: 'mongodb://127.0.0.1:1/x', JWT_SECRET: 'weak-secret-1234' });
    const { code } = await p.exited;
    assert.strictEqual(code, 1); assert.match(p.out.stderr, /JWT_SECRET must be at least 32/); assert.doesNotMatch(p.out.stderr + p.out.stdout, /weak-secret-1234/);
  });
  test('refuses to start with an invalid COOKIE_SAMESITE or JWT_EXPIRES_IN and names the variable', async () => {
    const p = start({ NODE_ENV: 'development', MONGO_URI: 'mongodb://127.0.0.1:1/x', JWT_SECRET: STRONG, COOKIE_SAMESITE: 'strictt', JWT_EXPIRES_IN: '7days' });
    assert.strictEqual((await p.exited).code, 1);
    assert.match(p.out.stderr, /COOKIE_SAMESITE="strictt" is invalid/); assert.match(p.out.stderr, /JWT_EXPIRES_IN="7days" is invalid/);
  });
  test('production refuses to start without an https CORS_ORIGIN', async () => {
    const p = start({ NODE_ENV: 'production', MONGO_URI: 'mongodb://127.0.0.1:1/x', JWT_SECRET: STRONG });
    assert.strictEqual((await p.exited).code, 1); assert.match(p.out.stderr, /CORS_ORIGIN must be set/);
  });
  test('a bad MONGO_URI fails with a hint and never prints the credentials', async () => {
    const p = start({ NODE_ENV: 'development', MONGO_URI: 'mongodb://user:SuperSecretPw@127.0.0.1:1/x?serverSelectionTimeoutMS=500', JWT_SECRET: STRONG });
    assert.strictEqual((await p.exited).code, 1); assert.match(p.out.stderr, /Could not connect to MongoDB/); assert.doesNotMatch(p.out.stderr + p.out.stdout, /SuperSecretPw/);
  });

  describe('running (production mode against the test database)', { skip }, () => {
    test('keep-alive survives past Node\'s 5 s default, HSTS present, cross-origin POST blocked, SIGTERM exits 0 gracefully', async (t) => {
      const port = await freePort();
      const p = start({ NODE_ENV: 'production', PORT: String(port), MONGO_URI: URI, JWT_SECRET: STRONG, CORS_ORIGIN: 'https://app.example.com', COOKIE_SAMESITE: 'none', FRONTEND_URL: 'https://app.example.com' });
      await p.waitFor(/Server running on port/);
      assert.doesNotMatch(p.out.stdout + p.out.stderr, new RegExp(STRONG));

      const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
      const get = (pathname, headers = {}, method = 'GET') => new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port, path: pathname, method, agent, headers }, (res) => { let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ res, body: b, reused: req.reusedSocket })); }); req.on('error', reject); req.end(); });
      const first = await get('/api/health');
      assert.strictEqual(first.res.statusCode, 200); assert.strictEqual(first.reused, false);
      assert.match(first.res.headers['strict-transport-security'], /max-age=31536000/);
      await new Promise((r) => setTimeout(r, 6500)); // longer than Node's default 5 s keepAliveTimeout
      const second = await get('/api/health');
      assert.strictEqual(second.res.statusCode, 200);
      assert.strictEqual(second.reused, true, 'idle keep-alive connection must still be open after 6.5 s (default would have been closed => random 502s behind a proxy)');

      const blocked = await get('/api/auth/logout', { origin: 'https://evil.example' }, 'POST');
      assert.strictEqual(blocked.res.statusCode, 403); assert.match(blocked.body, /CSRF_BLOCKED/);
      const noProvenance = await get('/api/auth/logout', { cookie: 'token=abc' }, 'POST'); // cookie but no Origin/Referer/Sec-Fetch-Site, production
      assert.strictEqual(noProvenance.res.statusCode, 403);

      agent.destroy();
      p.child.kill('SIGTERM');
      const { code } = await p.exited;
      assert.strictEqual(code, 0); assert.match(p.out.stdout, /SIGTERM received: shutting down gracefully/);
    });
  });
});
