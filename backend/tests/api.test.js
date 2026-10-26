// No real MongoDB needed: every test below is rejected/answered before any DB call.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-123';
process.env.CORS_ORIGIN = 'http://localhost:5173'; // deliberately stale
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const { createJobSchema, validateCustomFields } = require('../validators/jobValidator');

let server, base;
const ID = 'a'.repeat(24);
// One account per role. The auth middleware now checks the account in the database (exists, not suspended, stored role),
// so these unit tests stub that single lookup instead of needing MongoDB.
const IDS = { candidate: ID, employer: 'b'.repeat(24), admin: 'c'.repeat(24) };
const accounts = Object.fromEntries(Object.entries(IDS).map(([role, id]) => [id, { _id: id, role, status: 'active', name: role, email: `${role}@example.com` }]));
const realFindById = User.findById;
User.findById = (id) => {
  const doc = accounts[String(id)] || null;
  return Object.assign(Promise.resolve(doc), { select: () => ({ lean: () => Promise.resolve(doc) }) });
};
const token = (role) => jwt.sign({ id: IDS[role], role }, process.env.JWT_SECRET, { expiresIn: '1h' });
const call = (path, opts = {}) =>
  fetch(base + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });

before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => { server.close(); User.findById = realFindById; });

const validJob = {
  title: 'ML Engineer', company: 'Acme', description: 'Build and ship models.',
  nicheCategory: 'AI/ML', location: 'Remote', employmentType: 'full-time',
  requiredSkills: ['python'],
  customFields: { programmingLanguages: ['Python'], mlFrameworks: ['PyTorch'], experienceLevel: 'Entry Level' },
};

test('GET / and /api/health respond without a database', async () => {
  assert.strictEqual((await call('/')).status, 200);
  const res = await call('/api/health');
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.database.connected, false);
});

test('job schema accepts a valid job', () => {
  assert.ok(createJobSchema.safeParse(validJob).success);
});

test('job schema rejects missing fields, bad category, and client-supplied employerId/promotion', () => {
  assert.ok(!createJobSchema.safeParse({ title: 'x' }).success);
  assert.ok(!createJobSchema.safeParse({ ...validJob, nicheCategory: 'Plumbing' }).success);
  assert.ok(!createJobSchema.safeParse({ ...validJob, employerId: ID }).success);
  assert.ok(!createJobSchema.safeParse({ ...validJob, promotion: { pinnedUntil: '2099-01-01' } }).success);
});

test('category-specific custom fields are enforced (Vertical-Switcher)', () => {
  const N = 'Nursing / Healthcare';
  assert.ok(validateCustomFields(N, { license: 'RN', specialization: 'Pediatrics', experienceLevel: 'Mid Level' }).success);
  assert.ok(!validateCustomFields(N, { license: 'RN', specialization: 'Pediatrics', experienceLevel: 'Mid Level', blockchainEcosystem: ['Ethereum'] }).success); // foreign field
  assert.ok(!validateCustomFields(N, { specialization: 'Pediatrics', experienceLevel: 'Mid Level' }).success); // required license missing
  assert.ok(!validateCustomFields(N, { license: 'DOCTOR', specialization: 'Pediatrics', experienceLevel: 'Mid Level' }).success); // bad option
  assert.ok(!validateCustomFields('Web3 / Blockchain', { blockchainEcosystem: [], smartContractLanguages: ['Solidity'] }).success); // empty required list
  assert.ok(validateCustomFields('Other', {}).success);
  assert.ok(!validateCustomFields('Other', { anything: 'x' }).success); // no arbitrary injection
  assert.ok(!createJobSchema.safeParse({ ...validJob, customFields: { license: 'RN' } }).success);
  assert.ok(createJobSchema.safeParse({ ...validJob, salaryRange: { min: 10, max: 20 } }).success);
  assert.ok(!createJobSchema.safeParse({ ...validJob, salaryRange: { min: 30, max: 20 } }).success);
});

test('GET /api/categories exposes the shared config for the frontend', async () => {
  const body = await (await call('/api/categories')).json();
  assert.deepStrictEqual(Object.keys(body.data.categories), ['AI/ML', 'Frontend Development', 'Web3 / Blockchain', 'Nursing / Healthcare', 'Data Science', 'Cybersecurity', 'Other']);
});

test('GET /api/auth/me and employer jobs need authentication; resume needs authentication', async () => {
  assert.strictEqual((await call('/api/auth/me')).status, 401);
  assert.strictEqual((await call('/api/employer/jobs')).status, 401);
  assert.strictEqual((await call(`/api/applications/${ID}/resume`)).status, 401);
  assert.strictEqual((await call('/api/employer/jobs', { headers: { authorization: `Bearer ${token('candidate')}` } })).status, 403);
});

test('auth cookie is accepted; uploads dir is not publicly served', async () => {
  const res = await call('/api/auth/me', { headers: { cookie: `token=${token('employer')}` } });
  assert.notStrictEqual(res.status, 401); // reaches the DB lookup (which has no DB here) instead of being rejected
  assert.strictEqual((await call('/uploads/anything.pdf')).status, 404);
});

test('protected endpoints return 401 without a token', async () => {
  for (const [m, p] of [
    ['POST', '/api/jobs'], ['PATCH', `/api/jobs/${ID}`], ['DELETE', `/api/jobs/${ID}`],
    ['POST', '/api/apply'], ['GET', `/api/applications/job/${ID}`], ['PATCH', `/api/applications/${ID}/status`],
  ]) {
    assert.strictEqual((await call(p, { method: m, body: m === 'GET' ? undefined : '{}' })).status, 401, `${m} ${p}`);
  }
});

test('invalid or wrongly signed tokens return 401', async () => {
  const bad = jwt.sign({ id: ID, role: 'employer' }, 'other-secret-other-secret');
  const res = await call('/api/jobs', { method: 'POST', body: '{}', headers: { authorization: `Bearer ${bad}` } });
  assert.strictEqual(res.status, 401);
});

test('wrong role returns 403', async () => {
  const asCandidate = await call('/api/jobs', { method: 'POST', body: JSON.stringify(validJob), headers: { authorization: `Bearer ${token('candidate')}` } });
  assert.strictEqual(asCandidate.status, 403);
  const asEmployer = await call('/api/apply', { method: 'POST', body: '{}', headers: { authorization: `Bearer ${token('employer')}` } });
  assert.strictEqual(asEmployer.status, 403);
});

test('invalid body from an employer returns 400 with validation details', async () => {
  const res = await call('/api/jobs', { method: 'POST', body: JSON.stringify({ title: 'x' }), headers: { authorization: `Bearer ${token('employer')}` } });
  const body = await res.json();
  assert.strictEqual(res.status, 400);
  assert.strictEqual(body.success, false);
  assert.ok(Array.isArray(body.errors));
});

test('invalid ObjectId returns 400', async () => {
  assert.strictEqual((await call('/api/jobs/not-an-id')).status, 400);
  const res = await call('/api/applications/job/123', { headers: { authorization: `Bearer ${token('employer')}` } });
  assert.strictEqual(res.status, 400);
});

test('error responses are JSON and do not leak internals', async () => {
  const nf = await call('/api/nope');
  assert.strictEqual(nf.status, 404);
  assert.strictEqual((await nf.json()).success, false);
  const bad = await call('/api/jobs', { method: 'POST', body: '{bad json', headers: { authorization: `Bearer ${token('employer')}` } });
  const body = await bad.json();
  assert.strictEqual(bad.status, 400);
  assert.ok(!JSON.stringify(body).includes('stack'));
});

test('invalid query params return 400', async () => {
  assert.strictEqual((await call('/api/jobs?category=Plumbing')).status, 400);
  assert.strictEqual((await call('/api/jobs?limit=9999')).status, 400);
});

test('CORS: local Next.js origin is allowed in development even if CORS_ORIGIN is stale; unknown origins are not', async () => {
  const pre = (origin) => fetch(base + '/api/auth/login', { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
  const ok = await pre('http://localhost:3000');
  assert.strictEqual(ok.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  assert.strictEqual(ok.headers.get('access-control-allow-credentials'), 'true');
  assert.strictEqual((await pre('http://localhost:3001')).headers.get('access-control-allow-origin'), 'http://localhost:3001'); // Next.js fallback port
  assert.strictEqual((await pre('http://evil.example')).headers.get('access-control-allow-origin'), null);
  assert.strictEqual((await pre('http://localhost.evil.example')).headers.get('access-control-allow-origin'), null);
});

test('admin API: 401 without a token, 403 for candidates and employers, never reachable by role in the token alone', async () => {
  const paths = ['/api/admin/stats', '/api/admin/users', `/api/admin/users/${ID}`, '/api/admin/jobs', '/api/admin/analytics/applications', '/api/admin/audit-logs'];
  for (const p of paths) {
    assert.strictEqual((await call(p)).status, 401, `no token ${p}`);
    for (const role of ['candidate', 'employer']) {
      const r = await call(p, { headers: { authorization: `Bearer ${token(role)}` } });
      assert.strictEqual(r.status, 403, `${role} ${p}`);
    }
  }
  for (const [m, p] of [['PATCH', `/api/admin/users/${ID}/status`], ['PATCH', `/api/admin/jobs/${ID}/moderation`]]) {
    assert.strictEqual((await call(p, { method: m, body: '{}' })).status, 401);
    assert.strictEqual((await call(p, { method: m, body: '{}', headers: { authorization: `Bearer ${token('employer')}` } })).status, 403);
  }
});

test('a token claiming "admin" for an account that is not an admin is refused (database role wins)', async () => {
  const forged = jwt.sign({ id: IDS.candidate, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const r = await call('/api/admin/stats', { headers: { authorization: `Bearer ${forged}` } });
  assert.strictEqual(r.status, 403);
});

test('suspended and deleted accounts are rejected on every protected route', async () => {
  accounts[IDS.candidate].status = 'suspended';
  const sus = await call('/api/auth/me', { headers: { authorization: `Bearer ${token('candidate')}` } });
  assert.strictEqual(sus.status, 403);
  assert.strictEqual((await sus.json()).code, 'ACCOUNT_SUSPENDED');
  accounts[IDS.candidate].status = 'active';
  const gone = accounts[IDS.employer]; delete accounts[IDS.employer];
  assert.strictEqual((await call('/api/employer/jobs', { headers: { authorization: `Bearer ${token('employer')}` } })).status, 401);
  accounts[IDS.employer] = gone;
});

test('nobody can register as admin or smuggle role/status in', async () => {
  for (const extra of [{ role: 'admin' }, { role: 'Admin' }, { role: 'employer', status: 'active' }, { role: 'candidate', isAdmin: true }]) {
    const r = await call('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'X', email: 'x@example.com', password: 'password123', ...{ role: 'candidate' }, ...extra }) });
    assert.strictEqual(r.status, 400, JSON.stringify(extra));
  }
});

test('admin request validation (pure schemas)', () => {
  const v = require('../validators/adminValidator');
  assert.ok(v.userStatusBody.safeParse({ status: 'suspended', reason: 'Spam postings' }).success);
  assert.ok(!v.userStatusBody.safeParse({ status: 'suspended' }).success); // reason required
  assert.ok(!v.userStatusBody.safeParse({ status: 'suspended', reason: 'no' }).success);
  assert.ok(!v.userStatusBody.safeParse({ status: 'banned', reason: 'Spam postings' }).success);
  assert.ok(!v.userStatusBody.safeParse({ status: 'active', reason: 'Appeal accepted', role: 'admin' }).success); // strict
  assert.ok(v.jobModerationBody.safeParse({ action: 'remove', reason: 'Fraudulent listing' }).success);
  assert.ok(!v.jobModerationBody.safeParse({ action: 'delete', reason: 'Fraudulent listing' }).success);
  assert.ok(!v.listUsersQuery.safeParse({ limit: 500 }).success);
  assert.ok(!v.analyticsQuery.safeParse({ days: 15 }).success);
  assert.strictEqual(v.analyticsQuery.parse({}).days, 30);
});

test('admin bootstrap rejects weak passwords and bad emails (no database needed)', async () => {
  const { createAdminAccount } = require('../services/adminBootstrap');
  await assert.rejects(createAdminAccount({ name: 'A', email: 'a@example.com', password: 'short' }), /12 characters/);
  await assert.rejects(createAdminAccount({ name: 'A', email: 'nope', password: 'a-long-enough-password' }), /email/i);
});
