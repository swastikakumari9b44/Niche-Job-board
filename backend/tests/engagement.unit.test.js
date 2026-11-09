// Unit tests for email, templates, notifier safety and input validation. No database, no network.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-123';
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const Notification = require('../models/Notification');
const email = require('../services/email');
const { templates, esc } = require('../services/emailTemplates');
const { notify, idle } = require('../services/notifier');
const v = require('../validators/productValidator');
const { updateProfileSchema } = require('../validators/jobValidator');
const { profileCompletion } = require('../utils/profile');

const IDS = { candidate: 'a'.repeat(24), employer: 'b'.repeat(24), admin: 'c'.repeat(24) };
const accounts = Object.fromEntries(Object.entries(IDS).map(([role, id]) => [id, { _id: id, role, status: 'active' }]));
const realFind = User.findById, realCreate = Notification.create;
require('../models/Session').exists = async () => ({ _id: 'stub-session' }); // unit tests have no database: every token's session counts as live
User.findById = (id) => { const d = accounts[String(id)] || null; return Object.assign(Promise.resolve(d), { select: () => ({ lean: () => Promise.resolve(d) }) }); };
const token = (role) => jwt.sign({ id: IDS[role], role, jti: 'test-jti' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (role) => ({ authorization: `Bearer ${token(role)}` });

let server, base, realFetch, savedEnv;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => { server.close(); User.findById = realFind; Notification.create = realCreate; });
beforeEach(() => { savedEnv = { k: process.env.RESEND_API_KEY, f: process.env.EMAIL_FROM, u: process.env.FRONTEND_URL, c: process.env.CORS_ORIGIN }; realFetch = global.fetch; });
const restore = () => { global.fetch = realFetch; for (const [k, e] of [['k', 'RESEND_API_KEY'], ['f', 'EMAIL_FROM'], ['u', 'FRONTEND_URL'], ['c', 'CORS_ORIGIN']]) { if (savedEnv[k] === undefined) delete process.env[e]; else process.env[e] = savedEnv[k]; } };
const call = (p, { method = 'GET', body, headers = {} } = {}) => fetch(base + p, { method, body, headers: { 'content-type': 'application/json', ...headers } });

test('email: not configured => skipped, never throws', async () => {
  try { delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM;
    assert.deepStrictEqual(await email.send({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' }), { ok: false, skipped: true });
  } finally { restore(); }
});

test('email: sends through Resend with the key only in the Authorization header; success and failure results', async () => {
  try {
    process.env.RESEND_API_KEY = 're_secret_key_123'; process.env.EMAIL_FROM = 'NicheHire <noreply@example.com>';
    const calls = [];
    global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, json: async () => ({ id: 'em_1' }) }; };
    const r = await email.send({ to: 'user@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
    assert.deepStrictEqual(r, { ok: true, id: 'em_1' });
    assert.strictEqual(calls[0].url, 'https://api.resend.com/emails');
    assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer re_secret_key_123');
    const body = JSON.parse(calls[0].opts.body);
    assert.deepStrictEqual([body.from, body.to, body.subject], ['NicheHire <noreply@example.com>', ['user@example.com'], 'Hi']);
    assert.ok(!calls[0].opts.body.includes('re_secret_key_123')); // key never in the payload
    assert.ok(!JSON.stringify(r).includes('re_secret_key_123'));

    const errors = []; const origErr = console.error; console.error = (...a) => errors.push(a.join(' '));
    try {
      global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
      const bad = await email.send({ to: 'u@example.com', subject: 'x', html: 'x' });
      assert.strictEqual(bad.ok, false); assert.match(bad.error, /500/);
      global.fetch = async () => { throw new Error('ECONNRESET secret re_secret_key_123'); };
      const net = await email.send({ to: 'u@example.com', subject: 'x', html: 'x' });
      assert.deepStrictEqual(net, { ok: false, error: 'Network error' });
      assert.ok(!errors.join('\n').includes('re_secret_key_123')); // never logged
    } finally { console.error = origErr; }
    assert.strictEqual((await email.send({ to: '', subject: 'x' })).ok, false); // bad input, still no throw
  } finally { restore(); }
});

test('email: links use FRONTEND_URL, then a public CORS origin, then localhost', () => {
  try {
    process.env.FRONTEND_URL = 'https://app.example.com/'; assert.strictEqual(email.frontendUrl(), 'https://app.example.com');
    delete process.env.FRONTEND_URL; process.env.CORS_ORIGIN = 'http://localhost:3000, https://niche.vercel.app';
    assert.strictEqual(email.frontendUrl(), 'https://niche.vercel.app');
    delete process.env.CORS_ORIGIN; assert.strictEqual(email.frontendUrl(), 'http://localhost:3000');
  } finally { restore(); }
});

test('templates: branded, link to the site, and every user value is HTML-escaped', () => {
  process.env.FRONTEND_URL = 'https://app.example.com';
  try {
    const evil = '<script>alert(1)</script>"&';
    const m = templates.newApplication({ employerName: evil, candidateName: evil, job: { title: evil, company: 'C' }, matchScore: 80 });
    assert.ok(m.html.includes('NicheHire') && m.html.includes('https://app.example.com/employer/dashboard') && m.html.includes('80%'));
    assert.ok(!m.html.includes('<script>')); assert.ok(m.html.includes('&lt;script&gt;'));
    for (const [name, args] of Object.entries({ welcome: { name: 'A', role: 'candidate' }, applicationSubmitted: { name: 'A', job: { title: 'T', company: 'C' } }, statusChanged: { name: 'A', job: { title: 'T', company: 'C' }, status: 'Shortlisted' }, passwordReset: { name: 'A', url: 'https://app.example.com/reset-password?token=abc', minutes: 30 }, passwordChanged: { name: 'A' }, jobRemoved: { name: 'A', job: { title: 'T' }, reason: 'r' }, accountStatus: { name: 'A', status: 'suspended', reason: 'r' }, paymentSucceeded: { name: 'A', job: { title: 'T' }, payment: { amount: 49900, currency: 'INR' }, activated: true }, paymentReview: { job: { title: 'T' }, payment: { amount: 1, currency: 'INR' }, employerEmail: 'e@x.com' } })) {
      const out = templates[name](args);
      assert.ok(out.subject && out.html.includes('NicheHire') && out.text, `template ${name}`);
    }
    assert.ok(templates.paymentSucceeded({ name: 'A', job: { title: 'T' }, payment: { amount: 49900, currency: 'INR' }, activated: true }).html.includes('499'));
    assert.strictEqual(esc(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
  } finally { restore(); }
});

test('notifier never throws or blocks: a database failure resolves quietly', async () => {
  const origErr = console.error; console.error = () => {};
  Notification.create = () => Promise.reject(new Error('db down'));
  try {
    const r = await notify({ userId: IDS.candidate, type: 'welcome', title: 't', message: 'm' });
    assert.deepStrictEqual(r, { error: true });
    await idle();
  } finally { Notification.create = realCreate; console.error = origErr; }
});

test('notifier: a duplicate event (same dedupeKey) sends neither a second notification nor a second email', async () => {
  let created = 0; const sent = [];
  Notification.create = async (doc) => { if (created++) { const e = new Error('dup'); e.code = 11000; throw e; } return { _id: 'n1', ...doc }; };
  Notification.updateOne = async () => ({});
  const orig = email.transport; email.transport = async (m) => { sent.push(m); return { ok: true, id: 'x' }; };
  process.env.RESEND_API_KEY = 're_x'; process.env.EMAIL_FROM = 'a@b.com';
  User.findById = () => ({ select: () => ({ lean: async () => ({ email: 'u@example.com', notifyByEmail: true }) }) });
  try {
    const opts = { userId: IDS.candidate, type: 'welcome', title: 't', message: 'm', dedupeKey: 'k1', mail: { subject: 's', html: 'h', text: 't' } };
    assert.strictEqual((await notify(opts)).created, true);
    assert.deepStrictEqual(await notify(opts), { duplicate: true });
    assert.strictEqual(sent.length, 1);
  } finally { email.transport = orig; restore(); Notification.create = realCreate; delete Notification.updateOne; User.findById = (id) => { const d = accounts[String(id)] || null; return Object.assign(Promise.resolve(d), { select: () => ({ lean: () => Promise.resolve(d) }) }); }; }
});

test('notification endpoints: 401 anonymously; id and query validated', async () => {
  for (const [m, p] of [['GET', '/api/notifications'], ['GET', '/api/notifications/unread-count'], ['PATCH', '/api/notifications/read-all'], ['PATCH', `/api/notifications/${'d'.repeat(24)}/read`], ['GET', '/api/dashboard/candidate'], ['GET', '/api/saved-jobs']]) {
    assert.strictEqual((await call(p, { method: m, body: m === 'PATCH' ? '{}' : undefined })).status, 401, `${m} ${p}`);
  }
  assert.strictEqual((await call('/api/notifications/not-an-id/read', { method: 'PATCH', body: '{}', headers: auth('candidate') })).status, 400);
  assert.strictEqual((await call('/api/notifications?limit=500', { headers: auth('candidate') })).status, 400);
});

test('dashboards and saved jobs are role-restricted', async () => {
  assert.strictEqual((await call('/api/dashboard/employer', { headers: auth('candidate') })).status, 403);
  assert.strictEqual((await call('/api/dashboard/candidate', { headers: auth('employer') })).status, 403);
  assert.strictEqual((await call('/api/saved-jobs', { headers: auth('employer') })).status, 403);
  assert.strictEqual((await call(`/api/saved-jobs/${'d'.repeat(24)}`, { method: 'PUT', headers: auth('admin') })).status, 403);
  assert.strictEqual((await call('/api/saved-jobs/bad-id', { method: 'PUT', headers: auth('candidate') })).status, 400);
});

test('password recovery input validation (no account lookup happens for bad input)', async () => {
  assert.strictEqual((await call('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: 'not-an-email' }) })).status, 400);
  assert.strictEqual((await call('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: 'a@b.com', role: 'admin' }) })).status, 400);
  const good = { token: 'a'.repeat(64), password: 'new-password-1' };
  for (const bad of [{ token: 'short' }, { token: 'z'.repeat(64) }, { password: 'short' }, { password: 'x'.repeat(73) }, { extra: 1 }]) {
    assert.strictEqual((await call('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ ...good, ...bad }) })).status, 400, JSON.stringify(bad));
  }
  assert.ok(v.resetBody.safeParse(good).success);
});

test('profile validation: only known fields; role/status can never be sent', () => {
  assert.ok(updateProfileSchema.safeParse({ name: 'A', headline: 'Dev', location: 'Pune', phone: '+91 98765 43210', notifyByEmail: false }).success);
  assert.ok(updateProfileSchema.safeParse({ phone: '' }).success); // clearing a field
  for (const bad of [{}, { role: 'admin' }, { status: 'active' }, { phone: 'abc' }, { headline: 'x'.repeat(121) }, { notifyByEmail: 'yes' }, { name: '' }]) assert.ok(!updateProfileSchema.safeParse(bad).success, JSON.stringify(bad));
});

test('profile completion guidance', () => {
  assert.deepStrictEqual(profileCompletion({ role: 'candidate', name: 'A' }), { percent: 25, missing: ['A short professional headline', 'Your location', 'A phone number'] });
  assert.strictEqual(profileCompletion({ role: 'candidate', name: 'A', headline: 'h', location: 'l', phone: 'p' }).percent, 100);
  assert.strictEqual(profileCompletion({ role: 'employer', name: 'A', companyName: 'C' }).percent, 40);
  assert.strictEqual(profileCompletion({ role: 'admin', name: 'A' }), null);
});
