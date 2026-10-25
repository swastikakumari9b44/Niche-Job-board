// No real MongoDB needed: every test below is rejected/answered before any DB call.
process.env.JWT_SECRET = 'test-secret-test-secret-123';
process.env.CORS_ORIGIN = 'http://localhost:5173';
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
  requiredSkills: ['python'], customFields: { modelFrameworks: ['pytorch'], gpuAccessProvided: true },
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

test('category-specific custom fields are enforced', () => {
  assert.ok(validateCustomFields('Nursing', { licenseType: 'RN', shiftType: 'night' }).success);
  assert.ok(!validateCustomFields('Nursing', { blockchains: ['eth'] }).success); // Web3 field on Nursing
  assert.ok(!validateCustomFields('Nursing', { licenseType: 'DOCTOR' }).success);
  assert.ok(!validateCustomFields('Web3', { auditExperienceRequired: 'yes' }).success);
  assert.ok(!createJobSchema.safeParse({ ...validJob, customFields: { licenseType: 'RN' } }).success);
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
