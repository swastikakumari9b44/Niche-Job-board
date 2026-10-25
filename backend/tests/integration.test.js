// DB integration tests. Skipped unless MONGO_URI_TEST is set.
// Safety: the database name must contain "test"; only records created here (tagged by a run id) are removed.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-integration-123';
process.env.CORS_ORIGIN = 'http://localhost:5173';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const URI = process.env.MONGO_URI_TEST;
const dbName = URI ? new URL(URI.replace('mongodb+srv://', 'mongodb://')).pathname.replace('/', '') : '';
const skip = !URI ? 'MONGO_URI_TEST not set' : !/test/i.test(dbName) ? 'database name must contain "test"' : false;

describe('MongoDB integration', { skip }, () => {
  const run = Date.now();
  const emp = `emp-${run}@itest.example`, cand = `cand-${run}@itest.example`, cand2 = `cand2-${run}@itest.example`;
  let server, base, app, User, Job, Application;
  let empTok, candTok, cand2Tok, jobId, appId;
  const call = async (path, { method = 'GET', body, token } = {}) => {
    const res = await fetch(base + path, {
      method, body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    });
    return { status: res.status, body: await res.json() };
  };

  before(async () => {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    app = require('../app'); User = require('../models/User'); Job = require('../models/Job'); Application = require('../models/Application');
    await Promise.all([User.init(), Job.init(), Application.init()]); // make sure unique indexes exist
    await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
  });
  after(async () => {
    const users = await User.find({ email: /@itest\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    const jobs = await Job.find({ employerId: { $in: ids } }).select('_id');
    await Application.deleteMany({ $or: [{ candidateId: { $in: ids } }, { jobId: { $in: jobs.map((j) => j._id) } }] });
    await Job.deleteMany({ _id: { $in: jobs.map((j) => j._id) } });
    await User.deleteMany({ _id: { $in: ids } });
    server.close(); await mongoose.disconnect();
  });

  const jobBody = {
    title: 'Machine Learning Engineer', company: 'TechNova', description: 'Develop and deploy machine learning models.',
    nicheCategory: 'AI/ML', location: 'Bengaluru', employmentType: 'Full-time',
    requiredSkills: ['Python', 'PyTorch', 'MongoDB'], customFields: { framework: 'PyTorch', experienceLevel: 'Entry Level' },
  };

  test('health reports database connected', async () => {
    const r = await call('/api/health');
    assert.strictEqual(r.body.database.connected, true);
  });

  test('register employer + candidates; no password hash leaks; duplicate email 409', async () => {
    const r = await call('/api/auth/register', { method: 'POST', body: { name: 'Emp', email: emp, password: 'password123', role: 'employer' } });
    assert.strictEqual(r.status, 201);
    assert.ok(r.body.data.token);
    assert.ok(!JSON.stringify(r.body).includes('password'));
    const c = await call('/api/auth/register', { method: 'POST', body: { name: 'Test Candidate', email: cand, password: 'password123', role: 'candidate' } });
    assert.strictEqual(c.status, 201);
    await call('/api/auth/register', { method: 'POST', body: { name: 'Other', email: cand2, password: 'password123', role: 'candidate' } });
    const dup = await call('/api/auth/register', { method: 'POST', body: { name: 'Emp', email: emp.toUpperCase(), password: 'password123', role: 'employer' } });
    assert.strictEqual(dup.status, 409);
    const bad = await call('/api/auth/register', { method: 'POST', body: { name: 'X', email: 'nope', password: 'short', role: 'admin' } });
    assert.strictEqual(bad.status, 400);
    const stored = await User.findOne({ email: emp }).select('+password');
    assert.match(stored.password, /^\$2[aby]\$/); // bcrypt hash, not plaintext
  });

  test('login success and failure', async () => {
    const ok = await call('/api/auth/login', { method: 'POST', body: { email: emp, password: 'password123' } });
    assert.strictEqual(ok.status, 200); empTok = ok.body.data.token;
    candTok = (await call('/api/auth/login', { method: 'POST', body: { email: cand, password: 'password123' } })).body.data.token;
    cand2Tok = (await call('/api/auth/login', { method: 'POST', body: { email: cand2, password: 'password123' } })).body.data.token;
    assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: emp, password: 'wrong-password' } })).status, 401);
    assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'ghost@itest.example', password: 'password123' } })).status, 401);
  });

  test('profile: get, update name, cannot change role, 401 without token', async () => {
    const me = await call('/api/users/me', { token: candTok });
    assert.strictEqual(me.body.data.email, cand);
    assert.strictEqual(me.body.data.password, undefined);
    const up = await call('/api/users/me', { method: 'PATCH', token: candTok, body: { name: 'Renamed' } });
    assert.strictEqual(up.status, 200); assert.strictEqual(up.body.data.name, 'Renamed');
    assert.strictEqual((await call('/api/users/me', { method: 'PATCH', token: candTok, body: { role: 'employer' } })).status, 403);
    assert.strictEqual((await User.findOne({ email: cand })).role, 'candidate');
    assert.strictEqual((await call('/api/users/me')).status, 401);
  });

  test('create job: employer only, ownership from token, 201 + message', async () => {
    assert.strictEqual((await call('/api/jobs', { method: 'POST', token: candTok, body: jobBody })).status, 403);
    assert.strictEqual((await call('/api/jobs', { method: 'POST', body: jobBody })).status, 401);
    const spoof = await call('/api/jobs', { method: 'POST', token: empTok, body: { ...jobBody, employerId: '1'.repeat(24) } });
    assert.strictEqual(spoof.status, 400);
    const r = await call('/api/jobs', { method: 'POST', token: empTok, body: jobBody });
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.message, 'Job created successfully');
    jobId = r.body.data._id;
    const emp1 = await User.findOne({ email: emp });
    assert.strictEqual(String(r.body.data.employerId), String(emp1._id));
    assert.strictEqual(r.body.data.employmentType, 'full-time');
  });

  test('validation errors use {field, message}', async () => {
    const r = await call('/api/jobs', { method: 'POST', token: empTok, body: { ...jobBody, title: '' } });
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.errors.some((e) => e.field === 'title' && e.message));
  });

  test('list, get by id, search, category, location, pagination', async () => {
    const list = await call('/api/jobs?limit=5');
    assert.ok(list.body.data.some((j) => j._id === jobId));
    assert.strictEqual((await call(`/api/jobs/${jobId}`)).body.data.title, jobBody.title);
    assert.ok((await call('/api/jobs?search=pytorch')).body.data.some((j) => j._id === jobId)); // case-insensitive
    assert.ok((await call('/api/jobs?category=AI/ML&location=bengal')).body.data.some((j) => j._id === jobId));
    assert.ok(!(await call('/api/jobs?category=Nursing')).body.data.some((j) => j._id === jobId));
    assert.ok(!(await call('/api/jobs?search=zzzznomatch')).body.data.some((j) => j._id === jobId));
    const pg = await call('/api/jobs?page=1&limit=1');
    assert.strictEqual(pg.body.data.length, 1); assert.strictEqual(pg.body.pagination.limit, 1);
    assert.strictEqual((await call('/api/jobs?search=.*')).status, 200); // regex chars are escaped, not executed
    assert.strictEqual((await call('/api/jobs?page=0')).status, 400);
    assert.strictEqual((await call('/api/jobs/' + 'b'.repeat(24))).status, 404);
  });

  test('applications: validation, success, duplicate 409, spoofed email, bad resume refs', async () => {
    const good = { jobId, candidateName: 'Test Candidate', candidateEmail: cand, resumeUrl: 'test-resume-reference.pdf' };
    assert.strictEqual((await call('/api/applications', { method: 'POST', body: good })).status, 401);
    assert.strictEqual((await call('/api/applications', { method: 'POST', token: empTok, body: good })).status, 403);
    for (const resumeUrl of ['https://evil.example/x.pdf', '../../etc/passwd.pdf', 'resume.exe', 'javascript:alert(1).pdf']) {
      assert.strictEqual((await call('/api/applications', { method: 'POST', token: candTok, body: { ...good, resumeUrl } })).status, 400, resumeUrl);
    }
    assert.strictEqual((await call('/api/applications', { method: 'POST', token: candTok, body: { ...good, candidateEmail: 'someone@else.com' } })).status, 400);
    assert.strictEqual((await call('/api/applications', { method: 'POST', token: candTok, body: { ...good, jobId: 'xyz' } })).status, 400);
    assert.strictEqual((await call('/api/applications', { method: 'POST', token: candTok, body: { ...good, jobId: 'c'.repeat(24) } })).status, 404);
    const r = await call('/api/applications', { method: 'POST', token: candTok, body: good });
    assert.strictEqual(r.status, 201); appId = r.body.data._id;
    const saved = await Application.findById(appId); // verified directly in MongoDB
    assert.ok(saved); assert.strictEqual(saved.status, 'Applied'); assert.strictEqual(saved.candidateEmail, cand);
    assert.strictEqual((await call('/api/applications', { method: 'POST', token: candTok, body: good })).status, 409);
    assert.strictEqual((await call('/api/apply', { method: 'POST', token: candTok, body: good })).status, 409); // legacy alias
  });

  test('candidate sees own applications only', async () => {
    const mine = await call('/api/applications/my', { token: candTok });
    assert.strictEqual(mine.body.data.length, 1);
    assert.strictEqual(mine.body.data[0].jobId.title, jobBody.title);
    assert.strictEqual((await call('/api/applications/my', { token: cand2Tok })).body.data.length, 0);
    assert.strictEqual((await call('/api/applications/my', { token: empTok })).status, 403);
  });

  test('employer views applications; others get 401/403; bad id 400', async () => {
    const r = await call(`/api/applications/job/${jobId}`, { token: empTok });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.data.length, 1);
    assert.strictEqual(r.body.data[0].candidateEmail, cand);
    assert.strictEqual((await call(`/api/applications/job/${jobId}`)).status, 401);
    assert.strictEqual((await call(`/api/applications/job/${jobId}`, { token: candTok })).status, 403);
    assert.strictEqual((await call('/api/applications/job/123', { token: empTok })).status, 400);
    // a second employer cannot read or modify them
    await call('/api/auth/register', { method: 'POST', body: { name: 'E2', email: `e2-${run}@itest.example`, password: 'password123', role: 'employer' } });
    const e2 = (await call('/api/auth/login', { method: 'POST', body: { email: `e2-${run}@itest.example`, password: 'password123' } })).body.data.token;
    assert.strictEqual((await call(`/api/applications/job/${jobId}`, { token: e2 })).status, 403);
    assert.strictEqual((await call(`/api/applications/${appId}/status`, { method: 'PATCH', token: e2, body: { status: 'Rejected' } })).status, 403);
    assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'PATCH', token: e2, body: { title: 'Hacked title' } })).status, 403);
    assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'DELETE', token: e2 })).status, 403);
  });

  test('owner updates status and job; invalid custom fields rejected on update', async () => {
    const s = await call(`/api/applications/${appId}/status`, { method: 'PATCH', token: empTok, body: { status: 'Shortlisted' } });
    assert.strictEqual(s.status, 200); assert.strictEqual((await Application.findById(appId)).status, 'Shortlisted');
    assert.strictEqual((await call(`/api/applications/${appId}/status`, { method: 'PATCH', token: empTok, body: { status: 'Hired' } })).status, 400);
    assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'PATCH', token: empTok, body: { title: 'Senior ML Engineer' } })).status, 200);
    assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'PATCH', token: empTok, body: { customFields: { licenseType: 'RN' } } })).status, 400);
  });

  test('DELETE soft-closes; closed job hidden from list and refuses applications', async () => {
    const d = await call(`/api/jobs/${jobId}`, { method: 'DELETE', token: empTok });
    assert.strictEqual(d.status, 200);
    assert.strictEqual((await Job.findById(jobId)).status, 'closed'); // still in DB
    assert.ok(!(await call('/api/jobs?limit=50')).body.data.some((j) => j._id === jobId));
    const r = await call('/api/applications', { method: 'POST', token: cand2Tok, body: { jobId, resumeUrl: 'cv.pdf' } });
    assert.strictEqual(r.status, 400);
  });
});
