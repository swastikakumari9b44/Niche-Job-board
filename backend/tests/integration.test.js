// DB integration tests. Skipped unless MONGO_URI_TEST is set.
// Safety: the database name must contain "test"; only records created here (tagged by a run id) are removed.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-integration-123';
process.env.CORS_ORIGIN = 'http://localhost:3000';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const makePdf = require('./helpers/makePdf');

const URI = process.env.MONGO_URI_TEST;
const dbName = URI ? new URL(URI.replace('mongodb+srv://', 'mongodb://')).pathname.replace('/', '') : '';
const skip = !URI ? 'MONGO_URI_TEST not set' : !/test/i.test(dbName) ? 'database name must contain "test"' : false;

describe('MongoDB integration', { skip }, () => {
  const run = Date.now();
  const E = (n) => `${n}-${run}@itest.example`;
  let server, base, User, Job, Application, UPLOAD_DIR;
  const cookies = {}; // role/user -> "token=..." (HttpOnly cookie value captured from Set-Cookie)
  let jobId, appId, closedJobId;

  const call = async (p, { method = 'GET', body, who, form, headers = {} } = {}) => {
    const res = await fetch(base + p, {
      method, body: form || (body === undefined ? undefined : JSON.stringify(body)),
      headers: { ...(!form && { 'content-type': 'application/json' }), ...(who && { cookie: cookies[who] }), ...headers },
    });
    return { status: res.status, body: await res.json().catch(() => null), res };
  };
  const auth = async (path, who, payload) => {
    const r = await call(path, { method: 'POST', body: payload });
    if (r.res.headers.get('set-cookie')) cookies[who] = r.res.headers.get('set-cookie').split(';')[0];
    return r;
  };
  const pdfForm = (fields, pdf = makePdf(['Jane Doe - Machine Learning Engineer', 'Skills: Python, PyTorch, SQL, AWS']), name = 'resume.pdf', type = 'application/pdf') => {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    if (pdf) f.append('resume', new Blob([pdf], { type }), name);
    return f;
  };

  before(async () => {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    const app = require('../app');
    User = require('../models/User'); Job = require('../models/Job'); Application = require('../models/Application');
    ({ UPLOAD_DIR } = require('../middleware/uploadMiddleware'));
    await Promise.all([User.init(), Job.init(), Application.init()]);
    await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
  });
  after(async () => {
    const users = await User.find({ email: /@itest\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    const jobs = await Job.find({ employerId: { $in: ids } }).select('_id');
    const apps = await Application.find({ $or: [{ candidateId: { $in: ids } }, { jobId: { $in: jobs.map((j) => j._id) } }] });
    for (const a of apps) fs.rmSync(path.join(UPLOAD_DIR, a.resumeUrl), { force: true }); // only files this run created
    await Application.deleteMany({ _id: { $in: apps.map((a) => a._id) } });
    await Job.deleteMany({ _id: { $in: jobs.map((j) => j._id) } });
    await User.deleteMany({ _id: { $in: ids } });
    server.close(); await mongoose.disconnect();
  });

  const jobBody = {
    title: 'Machine Learning Engineer', company: 'TechNova', description: 'Develop and deploy machine learning models.',
    nicheCategory: 'AI/ML', location: 'Bengaluru', employmentType: 'Full-time',
    salaryRange: { min: 800000, max: 1500000, currency: 'inr' },
    requiredSkills: ['Python', 'PyTorch', 'SQL', 'Docker', 'AWS'],
    customFields: { programmingLanguages: ['Python'], mlFrameworks: ['PyTorch', 'TensorFlow'], modelDeploymentExperience: true, experienceLevel: 'Entry Level' },
  };

  test('health reports database connected', async () => {
    assert.strictEqual((await call('/api/health')).body.database.connected, true);
  });

  test('register sets an HttpOnly cookie, hides the hash, rejects duplicates and bad input', async () => {
    const r = await auth('/api/auth/register', 'emp', { name: 'Emp', email: E('emp'), password: 'password123', role: 'employer' });
    assert.strictEqual(r.status, 201);
    const sc = r.res.headers.get('set-cookie');
    assert.match(sc, /HttpOnly/i); assert.match(sc, /SameSite=Lax/i);
    assert.strictEqual(r.body.data.token, undefined); // token is cookie-only
    assert.ok(!JSON.stringify(r.body).includes('password'));
    await auth('/api/auth/register', 'cand', { name: 'Test Candidate', email: E('cand'), password: 'password123', role: 'candidate' });
    await auth('/api/auth/register', 'cand2', { name: 'Other', email: E('cand2'), password: 'password123', role: 'candidate' });
    await auth('/api/auth/register', 'emp2', { name: 'E2', email: E('emp2'), password: 'password123', role: 'employer' });
    assert.strictEqual((await auth('/api/auth/register', 'x', { name: 'E', email: E('emp').toUpperCase(), password: 'password123', role: 'employer' })).status, 409);
    assert.strictEqual((await auth('/api/auth/register', 'x', { name: 'X', email: 'nope', password: 'short', role: 'admin' })).status, 400);
    assert.match((await User.findOne({ email: E('emp') }).select('+password')).password, /^\$2[aby]\$/);
  });

  test('login, /auth/me, logout; bad credentials are 401', async () => {
    assert.strictEqual((await auth('/api/auth/login', 'emp', { email: E('emp'), password: 'password123' })).status, 200);
    const me = await call('/api/auth/me', { who: 'emp' });
    assert.strictEqual(me.status, 200); assert.strictEqual(me.body.data.user.role, 'employer'); assert.strictEqual(me.body.data.user.password, undefined);
    assert.strictEqual((await call('/api/auth/me')).status, 401);
    assert.strictEqual((await auth('/api/auth/login', 'x', { email: E('emp'), password: 'wrong-password' })).status, 401);
    assert.strictEqual((await auth('/api/auth/login', 'x', { email: 'ghost@itest.example', password: 'password123' })).status, 401);
    const out = await call('/api/auth/logout', { method: 'POST' });
    assert.match(out.res.headers.get('set-cookie'), /token=;/);
  });

  test('profile: update name only; role change forbidden', async () => {
    assert.strictEqual((await call('/api/users/me', { method: 'PATCH', who: 'cand', body: { name: 'Renamed' } })).status, 200);
    assert.strictEqual((await call('/api/users/me', { method: 'PATCH', who: 'cand', body: { role: 'employer' } })).status, 403);
    assert.strictEqual((await User.findOne({ email: E('cand') })).role, 'candidate');
  });

  test('create job: employer only, owner from cookie, custom fields validated + normalized', async () => {
    assert.strictEqual((await call('/api/jobs', { method: 'POST', who: 'cand', body: jobBody })).status, 403);
    assert.strictEqual((await call('/api/jobs', { method: 'POST', body: jobBody })).status, 401);
    assert.strictEqual((await call('/api/jobs', { method: 'POST', who: 'emp', body: { ...jobBody, employerId: '1'.repeat(24) } })).status, 400);
    assert.strictEqual((await call('/api/jobs', { method: 'POST', who: 'emp', body: { ...jobBody, promotion: { pinnedUntil: '2099-01-01' } } })).status, 400);
    assert.strictEqual((await call('/api/jobs', { method: 'POST', who: 'emp', body: { ...jobBody, customFields: { license: 'RN' } } })).status, 400);
    const bad = await call('/api/jobs', { method: 'POST', who: 'emp', body: { ...jobBody, customFields: { programmingLanguages: [], mlFrameworks: ['PyTorch'], experienceLevel: 'Entry Level' } } });
    assert.strictEqual(bad.status, 400);
    const r = await call('/api/jobs', { method: 'POST', who: 'emp', body: jobBody });
    assert.strictEqual(r.status, 201); jobId = r.body.data._id;
    assert.strictEqual(String(r.body.data.employerId), String((await User.findOne({ email: E('emp') }))._id));
    assert.strictEqual(r.body.data.salaryRange.currency, 'INR');
    assert.strictEqual(r.body.data.promotion.pinnedUntil, null);
    // one more job in another niche for filter tests
    const n = await call('/api/jobs', { method: 'POST', who: 'emp', body: { title: 'ICU Nurse', company: 'CityCare', description: 'Care for ICU patients nightly.', nicheCategory: 'Nursing / Healthcare', location: 'Mumbai', employmentType: 'Contract', requiredSkills: ['BLS'], customFields: { license: 'RN', specialization: 'Critical Care', experienceLevel: 'Mid Level' } } });
    assert.strictEqual(n.status, 201); closedJobId = n.body.data._id;
  });

  test('list/filter/search/paginate; employer sees own jobs', async () => {
    assert.ok((await call('/api/jobs?limit=50')).body.data.some((j) => j._id === jobId));
    assert.ok((await call('/api/jobs?search=pytorch')).body.data.some((j) => j._id === jobId));
    assert.ok((await call('/api/jobs?category=AI/ML&location=bengal&employmentType=Full-time')).body.data.some((j) => j._id === jobId));
    assert.ok(!(await call('/api/jobs?category=Nursing / Healthcare')).body.data.some((j) => j._id === jobId));
    assert.ok(!(await call('/api/jobs?employmentType=contract&category=AI/ML')).body.data.some((j) => j._id === jobId));
    assert.strictEqual((await call('/api/jobs?page=1&limit=1')).body.data.length, 1);
    assert.strictEqual((await call('/api/jobs?search=.*')).status, 200);
    assert.strictEqual((await call('/api/jobs?page=0')).status, 400);
    assert.strictEqual((await call('/api/jobs/not-an-id')).status, 400);
    assert.strictEqual((await call('/api/jobs/' + 'b'.repeat(24))).status, 404);
    const mine = await call('/api/employer/jobs', { who: 'emp' });
    assert.ok(mine.body.data.length >= 2);
    assert.strictEqual((await call('/api/employer/jobs', { who: 'emp2' })).body.data.length, 0);
  });

  test('apply: PDF upload validation (type, signature, size, missing file, spoofed fields)', async () => {
    const f = { jobId };
    assert.strictEqual((await call('/api/apply', { method: 'POST', form: pdfForm(f) })).status, 401);
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'emp', form: pdfForm(f) })).status, 403);
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm(f, null) })).status, 400); // no file
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm(f, Buffer.from('hello'), 'resume.txt', 'text/plain') })).status, 400);
    // claims to be a PDF (name + mime) but the bytes are not
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm(f, Buffer.from('<html>not a pdf</html>')) })).status, 400);
    // > 5 MB
    const big = Buffer.concat([makePdf(['x']), Buffer.alloc(5.5 * 1024 * 1024)]);
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm(f, big) })).status, 400);
    // client cannot set the score or status
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm({ ...f, matchScore: '100' }) })).status, 400);
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm({ ...f, candidateEmail: 'other@else.com' }) })).status, 400);
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm({ jobId: 'xyz' }) })).status, 400);
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm({ jobId: 'c'.repeat(24) }) })).status, 404);
    assert.strictEqual(await Application.countDocuments({ candidateId: (await User.findOne({ email: E('cand') }))._id }), 0);
  });

  test('failed applications leave no files behind', async () => {
    const before = fs.readdirSync(UPLOAD_DIR).length;
    await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm({ jobId: 'c'.repeat(24) }) }); // 404 after upload
    await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm({ jobId, matchScore: '99' }) }); // 400 after upload
    assert.strictEqual(fs.readdirSync(UPLOAD_DIR).length, before);
  });

  test('apply succeeds: saved in MongoDB, skill coverage computed server-side, duplicate 409', async () => {
    const r = await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm({ jobId, candidateName: 'Test Candidate', candidateEmail: E('cand') }) });
    assert.strictEqual(r.status, 201); appId = r.body.data._id;
    const saved = await Application.findById(appId);
    assert.ok(saved); assert.strictEqual(saved.status, 'Applied'); assert.strictEqual(saved.matchStatus, 'scored');
    assert.strictEqual(saved.matchScore, 80); // Python, PyTorch, SQL, AWS of 5
    assert.deepStrictEqual([...saved.matchedSkills], ['Python', 'PyTorch', 'SQL', 'AWS']);
    assert.deepStrictEqual([...saved.missingSkills], ['Docker']);
    assert.match(saved.resumeUrl, /^[a-f0-9-]{36}\.pdf$/);
    assert.ok(fs.existsSync(path.join(UPLOAD_DIR, saved.resumeUrl)));
    assert.strictEqual(r.body.data.candidateEmail, E('cand'));
    assert.strictEqual((await call('/api/applications', { method: 'POST', who: 'cand', form: pdfForm({ jobId }) })).status, 409); // alias route too
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', form: pdfForm({ jobId }) })).status, 409);
  });

  test('an unreadable (non-text) PDF is accepted with matchStatus "unavailable"', async () => {
    const r = await call('/api/apply', { method: 'POST', who: 'cand2', form: pdfForm({ jobId }, makePdf([]), 'blank.pdf') });
    assert.strictEqual(r.status, 201);
    const saved = await Application.findById(r.body.data._id);
    assert.strictEqual(saved.matchStatus, 'unavailable');
    assert.strictEqual(saved.matchScore, 0);
    assert.strictEqual(r.body.data.matchScore, undefined); // not echoed to the candidate
  });

  test('candidate sees only own applications, without internal file names', async () => {
    const mine = await call('/api/applications/my', { who: 'cand' });
    assert.strictEqual(mine.body.data.length, 1);
    assert.strictEqual(mine.body.data[0].jobId.title, jobBody.title);
    assert.strictEqual(mine.body.data[0].resumeUrl, undefined);
    assert.strictEqual(mine.body.data[0].matchScore, undefined); // match analysis is employer-only
    assert.strictEqual((await call('/api/applications/my', { who: 'emp' })).status, 403);
  });

  test('employer views applicants; strangers get 401/403; bad id 400', async () => {
    const r = await call(`/api/applications/job/${jobId}`, { who: 'emp' });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.data.length, 2);
    assert.strictEqual(r.body.data.find((a) => a.candidateEmail === E('cand')).matchScore, 80);
    assert.strictEqual(r.body.data[0].resumeUrl, undefined);
    assert.strictEqual((await call(`/api/applications/job/${jobId}`)).status, 401);
    assert.strictEqual((await call(`/api/applications/job/${jobId}`, { who: 'cand' })).status, 403);
    assert.strictEqual((await call(`/api/applications/job/${jobId}`, { who: 'emp2' })).status, 403);
    assert.strictEqual((await call('/api/applications/job/123', { who: 'emp' })).status, 400);
    assert.strictEqual((await call(`/api/applications/${appId}/status`, { method: 'PATCH', who: 'emp2', body: { status: 'Rejected' } })).status, 403);
    assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'PATCH', who: 'emp2', body: { title: 'Hacked title' } })).status, 403);
    assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'DELETE', who: 'emp2' })).status, 403);
  });

  test('resume download: owner employer and the applicant only', async () => {
    const ok = await call(`/api/applications/${appId}/resume`, { who: 'emp' });
    assert.strictEqual(ok.res.status, 200);
    assert.strictEqual(ok.res.headers.get('content-type'), 'application/pdf');
    assert.strictEqual((await call(`/api/applications/${appId}/resume`, { who: 'cand' })).res.status, 200);
    assert.strictEqual((await call(`/api/applications/${appId}/resume`, { who: 'emp2' })).status, 403);
    assert.strictEqual((await call(`/api/applications/${appId}/resume`, { who: 'cand2' })).status, 403);
    assert.strictEqual((await call(`/api/applications/${appId}/resume`)).status, 401);
    const stored = (await Application.findById(appId)).resumeUrl;
    assert.strictEqual((await call(`/uploads/${stored}`)).status, 404); // directory is not served publicly
  });

  test('ATS status update by owner; invalid status rejected; job edit re-validates custom fields', async () => {
    const s = await call(`/api/applications/${appId}/status`, { method: 'PATCH', who: 'emp', body: { status: 'Shortlisted' } });
    assert.strictEqual(s.status, 200); assert.strictEqual((await Application.findById(appId)).status, 'Shortlisted');
    assert.strictEqual((await call(`/api/applications/${appId}/status`, { method: 'PATCH', who: 'emp', body: { status: 'Hired' } })).status, 400);
    assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'PATCH', who: 'emp', body: { title: 'Senior ML Engineer' } })).status, 200);
    // switching category without matching custom fields is refused, so stale fields cannot be saved
    assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'PATCH', who: 'emp', body: { nicheCategory: 'Cybersecurity' } })).status, 400);
    const sw = await call(`/api/jobs/${jobId}`, { method: 'PATCH', who: 'emp', body: { nicheCategory: 'Cybersecurity', customFields: { experienceLevel: 'Senior Level', penetrationTestingExperience: true } } });
    assert.strictEqual(sw.status, 200);
    assert.deepStrictEqual(Object.keys((await Job.findById(jobId)).customFields).sort(), ['experienceLevel', 'penetrationTestingExperience']);
  });

  test('DELETE soft-closes; closed job hidden and refuses applications; data kept', async () => {
    assert.strictEqual((await call(`/api/jobs/${closedJobId}`, { method: 'DELETE', who: 'emp' })).status, 200);
    assert.strictEqual((await Job.findById(closedJobId)).status, 'closed');
    assert.ok(!(await call('/api/jobs?limit=50')).body.data.some((j) => j._id === closedJobId));
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand2', form: pdfForm({ jobId: closedJobId }) })).status, 400);
    assert.strictEqual(await Application.countDocuments({ jobId }), 2); // applications untouched
  });

  test('model constraints: unique email index, unique (job, candidate) index, matchScore range', async () => {
    const idx = await Application.collection.indexes();
    assert.ok(idx.some((i) => i.unique && i.key.jobId === 1 && i.key.candidateId === 1));
    assert.ok((await User.collection.indexes()).some((i) => i.unique && i.key.email === 1));
    await assert.rejects(Application.create({ jobId, candidateId: new mongoose.Types.ObjectId(), candidateName: 'x', candidateEmail: 'x@itest.example', resumeUrl: 'a.pdf', matchScore: 150 }), /matchScore/);
    const app = await Application.findById(appId).populate('jobId candidateId');
    assert.strictEqual(app.jobId.title, 'Senior ML Engineer'); assert.strictEqual(app.candidateId.email, E('cand')); // references resolve
  });
});
