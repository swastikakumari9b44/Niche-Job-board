// No real MongoDB needed: every test below is rejected/answered before any DB call.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-123';
process.env.CORS_ORIGIN = 'http://localhost:5173'; // deliberately stale
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const app = require('../app');
const { createJobSchema, validateCustomFields } = require('../validators/jobValidator');

let server, base;
const ID = 'a'.repeat(24);
const token = (role) => jwt.sign({ id: ID, role }, process.env.JWT_SECRET, { expiresIn: '1h' });
const call = (path, opts = {}) =>
  fetch(base + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } });

before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => server.close());

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
