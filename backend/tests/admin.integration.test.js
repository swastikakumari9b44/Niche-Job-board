// Admin panel integration tests. Skipped unless MONGO_URI_TEST (a database whose name contains "test") is set.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-integration-123';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const makePdf = require('./helpers/makePdf');

const URI = process.env.MONGO_URI_TEST;
const dbName = URI ? new URL(URI.replace('mongodb+srv://', 'mongodb://')).pathname.replace('/', '') : '';
const skip = !URI ? 'MONGO_URI_TEST not set' : !/test/i.test(dbName) ? 'database name must contain "test"' : false;

describe('Admin panel (MongoDB)', { skip }, () => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const E = (n) => `${n}-${run}@itest.example`;
  let server, base, User, Job, Application, AuditLog, createAdminAccount, UPLOAD_DIR;
  const jar = {}; // who -> "token=<jwt>" cookie (captured from Set-Cookie, like a browser would)
  const ids = {};
  let jobId, appId;

  const call = async (p, { method = 'GET', body, who, form } = {}) => {
    const res = await fetch(base + p, {
      method, body: form || (body === undefined ? undefined : JSON.stringify(body)),
      headers: { ...(!form && { 'content-type': 'application/json' }), ...(who && jar[who] && { cookie: jar[who] }) },
    });
    return { status: res.status, body: await res.json().catch(() => null), res };
  };
  const signIn = async (who, path, payload) => {
    const r = await call(path, { method: 'POST', body: payload });
    const sc = r.res.headers.get('set-cookie');
    if (sc) jar[who] = sc.split(';')[0];
    return r;
  };
  const login = (who, email) => signIn(who, '/api/auth/login', { email, password: 'password123' });
  const reason = 'Violates posting policy';

  before(async () => {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    const app = require('../app');
    User = require('../models/User'); Job = require('../models/Job'); Application = require('../models/Application'); AuditLog = require('../models/AuditLog');
    ({ createAdminAccount } = require('../services/adminBootstrap'));
    ({ UPLOAD_DIR } = require('../middleware/uploadMiddleware'));
    await Promise.all([User.init(), Job.init(), Application.init(), AuditLog.init()]);
    await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
  });

  after(async () => {
    const users = await User.find({ email: /@itest\.example$/ }).select('_id');
    const uids = users.map((u) => u._id);
    const jobs = await Job.find({ employerId: { $in: uids } }).select('_id');
    const jids = jobs.map((j) => j._id);
    const apps = await Application.find({ $or: [{ candidateId: { $in: uids } }, { jobId: { $in: jids } }] });
    for (const a of apps) fs.rmSync(path.join(UPLOAD_DIR, a.resumeUrl), { force: true });
    await Application.deleteMany({ _id: { $in: apps.map((a) => a._id) } });
    await AuditLog.deleteMany({ $or: [{ adminId: { $in: uids } }, { targetId: { $in: [...uids, ...jids] } }] });
    await Job.deleteMany({ _id: { $in: jids } });
    await User.deleteMany({ _id: { $in: uids } });
    server.close(); await mongoose.disconnect();
  });

  test('bootstrap: creates a hashed admin, refuses duplicates, promotes only with the explicit flag', async () => {
    const { user, promoted } = await createAdminAccount({ name: 'Root Admin', email: E('admin'), password: 'a-long-admin-password' });
    assert.strictEqual(promoted, false); assert.strictEqual(user.role, 'admin'); ids.admin = String(user._id);
    assert.match((await User.findById(user._id).select('+password')).password, /^\$2[aby]\$/);
    await assert.rejects(createAdminAccount({ name: 'Root', email: E('admin'), password: 'a-long-admin-password' }), /already an admin/);
    await assert.rejects(createAdminAccount({ name: 'X', email: E('admin'), password: 'short' }), /12 characters/);

    // an existing normal account is NOT silently upgraded
    await signIn('victim', '/api/auth/register', { name: 'Eve', email: E('eve'), password: 'password123', role: 'candidate' });
    await assert.rejects(createAdminAccount({ name: 'Eve', email: E('eve'), password: 'a-long-admin-password' }), /--promote/);
    assert.strictEqual((await User.findOne({ email: E('eve') })).role, 'candidate');
    const p = await createAdminAccount({ name: 'Eve', email: E('eve'), password: 'a-long-admin-password' }, { promoteExisting: true });
    assert.strictEqual(p.promoted, true);
    await User.updateOne({ email: E('eve') }, { role: 'candidate' }); // restore for the rest of the run
  });

  test('admin logs in through the normal login; others cannot become admin', async () => {
    // admin password is not password123, so give this fixture the shared test password via the model (hook hashes it)
    const a = await User.findById(ids.admin); a.password = 'password123'; await a.save();
    const r = await login('admin', E('admin'));
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.data.user.role, 'admin'); assert.strictEqual(r.body.data.user.password, undefined);

    for (const [who, role] of [['emp', 'employer'], ['cand', 'candidate'], ['cand2', 'candidate']]) {
      const x = await signIn(who, '/api/auth/register', { name: `T ${who}`, email: E(who), password: 'password123', role });
      assert.strictEqual(x.status, 201); ids[who] = x.body.data.user._id;
    }
    assert.strictEqual((await call('/api/auth/register', { method: 'POST', body: { name: 'Mal', email: E('mal'), password: 'password123', role: 'admin' } })).status, 400);
    assert.strictEqual((await call('/api/users/me', { method: 'PATCH', who: 'cand', body: { role: 'admin' } })).status, 403);
    assert.strictEqual((await call('/api/users/me', { method: 'PATCH', who: 'cand', body: { status: 'active' } })).status, 400);
    assert.strictEqual((await User.findById(ids.cand)).role, 'candidate');
  });

  test('authorization: 401 anonymous, 403 for candidate/employer, forged admin token refused', async () => {
    assert.strictEqual((await call('/api/admin/stats')).status, 401);
    assert.strictEqual((await call('/api/admin/stats', { who: 'cand' })).status, 403);
    assert.strictEqual((await call('/api/admin/users', { who: 'emp' })).status, 403);
    assert.strictEqual((await call(`/api/admin/users/${ids.cand}/status`, { method: 'PATCH', who: 'emp', body: { status: 'suspended', reason } })).status, 403);
    const forged = jwt.sign({ id: ids.cand, role: 'admin' }, process.env.JWT_SECRET);
    jar.forged = `token=${forged}`;
    assert.strictEqual((await call('/api/admin/stats', { who: 'forged' })).status, 403);
    assert.strictEqual((await call('/api/admin/users/not-an-id', { who: 'admin' })).status, 400);
    assert.strictEqual((await call(`/api/admin/users/${'d'.repeat(24)}`, { who: 'admin' })).status, 404);
  });

  test('dashboard stats come from the database', async () => {
    const r = await call('/api/admin/stats', { who: 'admin' });
    assert.strictEqual(r.status, 200);
    const { users, jobs, applications, recentActivity } = r.body.data;
    assert.strictEqual(users.total, users.candidates + users.employers + users.admins);
    assert.ok(users.candidates >= 2 && users.employers >= 1 && users.admins >= 1);
    assert.strictEqual(jobs.total, jobs.active + jobs.closed);
    assert.ok(Array.isArray(recentActivity));
    assert.ok(recentActivity.length <= 12);
    assert.ok(applications.total >= 0);
    assert.ok(!JSON.stringify(r.body).includes('@itest.example')); // no emails in the activity feed
  });

  test('user list: pagination, search, role and status filters; detail has no password', async () => {
    const all = await call(`/api/admin/users?search=${run}&limit=2&page=1`, { who: 'admin' });
    assert.strictEqual(all.status, 200); assert.strictEqual(all.body.data.length, 2); assert.ok(all.body.pagination.total >= 5);
    const emps = await call(`/api/admin/users?search=${run}&role=employer`, { who: 'admin' });
    assert.ok(emps.body.data.length >= 1 && emps.body.data.every((u) => u.role === 'employer'));
    assert.ok(emps.body.data.every((u) => u.password === undefined));
    assert.strictEqual((await call('/api/admin/users?limit=500', { who: 'admin' })).status, 400);
    assert.strictEqual((await call('/api/admin/users?role=superuser', { who: 'admin' })).status, 400);
    const d = await call(`/api/admin/users/${ids.emp}`, { who: 'admin' });
    assert.strictEqual(d.body.data.email, E('emp')); assert.strictEqual(d.body.data.password, undefined); assert.strictEqual(d.body.data.stats.jobs, 0);
    // regex characters in search are treated literally
    assert.strictEqual((await call('/api/admin/users?search=.*', { who: 'admin' })).status, 200);
  });

  test('suspend / reactivate: validation, self-protection, admin protection, immediate session cut-off, audit trail', async () => {
    const url = (id) => `/api/admin/users/${id}/status`;
    assert.strictEqual((await call(url(ids.cand), { method: 'PATCH', who: 'admin', body: { status: 'suspended' } })).status, 400); // reason required
    assert.strictEqual((await call(url(ids.cand), { method: 'PATCH', who: 'admin', body: { status: 'suspended', reason: 'x' } })).status, 400);
    assert.strictEqual((await call(url(ids.admin), { method: 'PATCH', who: 'admin', body: { status: 'suspended', reason } })).status, 400); // self
    const other = await createAdminAccount({ name: 'Second Admin', email: E('admin2'), password: 'another-long-password' });
    assert.strictEqual((await call(url(other.user._id), { method: 'PATCH', who: 'admin', body: { status: 'suspended', reason } })).status, 403); // other admin

    assert.strictEqual((await call('/api/auth/me', { who: 'cand' })).status, 200); // session works before
    const s = await call(url(ids.cand), { method: 'PATCH', who: 'admin', body: { status: 'suspended', reason } });
    assert.strictEqual(s.status, 200); assert.strictEqual(s.body.data.status, 'suspended');

    // the SAME cookie the user already holds stops working everywhere, immediately
    const me = await call('/api/auth/me', { who: 'cand' });
    assert.strictEqual(me.status, 403); assert.strictEqual(me.body.code, 'ACCOUNT_SUSPENDED');
    assert.strictEqual((await call('/api/applications/my', { who: 'cand' })).status, 403);
    assert.strictEqual((await call('/api/users/me', { who: 'cand' })).status, 403);
    // ...and a fresh login is refused (correct password, suspended account)
    const lg = await call('/api/auth/login', { method: 'POST', body: { email: E('cand'), password: 'password123' } });
    assert.strictEqual(lg.status, 403); assert.strictEqual(lg.body.code, 'ACCOUNT_SUSPENDED');
    // wrong password still reveals nothing about status
    assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: E('cand'), password: 'wrong-password' } })).status, 401);

    assert.strictEqual((await call(url(ids.cand), { method: 'PATCH', who: 'admin', body: { status: 'suspended', reason } })).status, 409);
    const list = await call(`/api/admin/users?search=${run}&status=suspended`, { who: 'admin' });
    assert.ok(list.body.data.some((u) => u._id === ids.cand) && list.body.data.every((u) => u.status === 'suspended'));
    assert.ok(!(await call(`/api/admin/users?search=${run}&status=active`, { who: 'admin' })).body.data.some((u) => u._id === ids.cand));

    const re = await call(url(ids.cand), { method: 'PATCH', who: 'admin', body: { status: 'active', reason: 'Appeal accepted' } });
    assert.strictEqual(re.status, 200);
    assert.strictEqual((await call('/api/auth/me', { who: 'cand' })).status, 200); // old cookie works again
    assert.strictEqual((await login('cand', E('cand'))).status, 200);

    const logs = await AuditLog.find({ targetId: ids.cand }).sort({ createdAt: 1 });
    assert.deepStrictEqual(logs.map((l) => l.action), ['USER_SUSPENDED', 'USER_REACTIVATED']);
    assert.strictEqual(String(logs[0].adminId), ids.admin); assert.strictEqual(logs[0].reason, reason);
    assert.strictEqual(logs[0].targetType, 'user'); assert.ok(logs[0].createdAt);
  });

  test('job moderation: flag, remove, owner lock-out, public hiding, restore; every step audited', async () => {
    const job = { title: `Suspicious Role ${run}`, company: 'ShadyCo', description: 'Pay a fee to apply. Guaranteed income.', nicheCategory: 'AI/ML', location: 'Remote', employmentType: 'Full-time',
      requiredSkills: ['Python'], customFields: { programmingLanguages: ['Python'], mlFrameworks: ['PyTorch'], experienceLevel: 'Entry Level' } };
    const c = await call('/api/jobs', { method: 'POST', who: 'emp', body: job });
    assert.strictEqual(c.status, 201); jobId = c.body.data._id;

    const found = await call(`/api/admin/jobs?search=${run}&category=AI/ML&status=active`, { who: 'admin' });
    assert.ok(found.body.data.some((j) => j._id === jobId));
    assert.strictEqual(found.body.data[0].employerId.email, E('emp'));
    assert.strictEqual((await call('/api/admin/jobs?category=Plumbing', { who: 'admin' })).status, 400);

    const m = (action, r = reason) => call(`/api/admin/jobs/${jobId}/moderation`, { method: 'PATCH', who: 'admin', body: { action, reason: r } });
    assert.strictEqual((await m('flag', '')).status, 400);
    assert.strictEqual((await m('delete')).status, 400);
    assert.strictEqual((await m('restore')).status, 409); // not removed yet
    assert.strictEqual((await m('flag')).status, 200);
    assert.strictEqual((await m('flag')).status, 409);
    assert.ok((await call(`/api/admin/jobs?search=${run}&moderation=flagged`, { who: 'admin' })).body.data.some((j) => j._id === jobId));
    assert.strictEqual((await call(`/api/jobs/${jobId}`)).status, 200); // flagged jobs stay visible
    assert.strictEqual((await call(`/api/jobs/${jobId}`)).body.data.moderation, undefined); // internal notes are not public

    assert.strictEqual((await m('remove', 'Advance-fee scam')).status, 200);
    const stored = await Job.findById(jobId);
    assert.strictEqual(stored.status, 'closed'); assert.strictEqual(stored.moderation.status, 'removed'); assert.strictEqual(stored.moderation.reason, 'Advance-fee scam');
    assert.ok(!(await call(`/api/jobs?search=${run}`)).body.data.some((j) => j._id === jobId)); // gone from public list
    assert.strictEqual((await call(`/api/jobs/${jobId}`)).status, 404);
    // the employer cannot reopen or edit it, but can see why on their own dashboard list
    assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'PATCH', who: 'emp', body: { status: 'active' } })).status, 403);
    assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'DELETE', who: 'emp' })).status, 403);
    const mine = await call('/api/employer/jobs', { who: 'emp' });
    assert.strictEqual(mine.body.data.find((j) => j._id === jobId).moderation.reason, 'Advance-fee scam');
    // nobody can apply to it
    const f = new FormData(); f.append('jobId', jobId); f.append('resume', new Blob([makePdf(['Python developer with years of experience'])], { type: 'application/pdf' }), 'cv.pdf');
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', form: f })).status, 400);

    assert.strictEqual((await m('restore', 'Verified legitimate')).status, 200);
    assert.strictEqual((await call(`/api/jobs/${jobId}`)).status, 200);
    assert.strictEqual((await Job.findById(jobId)).status, 'active');

    const logs = await AuditLog.find({ targetId: jobId }).sort({ createdAt: 1 });
    assert.deepStrictEqual(logs.map((l) => l.action), ['JOB_FLAGGED', 'JOB_REMOVED', 'JOB_RESTORED']);
    assert.ok(logs.every((l) => String(l.adminId) === ids.admin && l.reason && l.targetType === 'job'));
  });

  test('application analytics: aggregates only, correct shape, no personal data, admin cannot open resumes', async () => {
    const f = new FormData(); f.append('jobId', jobId);
    f.append('resume', new Blob([makePdf(['Jane Doe - Python developer', 'Skills: Python and SQL for many years'])], { type: 'application/pdf' }), 'cv.pdf');
    const ap = await call('/api/apply', { method: 'POST', who: 'cand', form: f });
    assert.strictEqual(ap.status, 201); appId = ap.body.data._id;

    const r = await call('/api/admin/analytics/applications?days=7', { who: 'admin' });
    assert.strictEqual(r.status, 200);
    const d = r.body.data;
    assert.ok(d.total >= 1);
    assert.deepStrictEqual(d.byStatus.map((s) => s.status), ['Applied', 'Shortlisted', 'Rejected']);
    assert.ok(d.byCategory.find((c) => c.category === 'AI/ML').count >= 1);
    assert.strictEqual(d.trend.series.length, 7);
    assert.ok(d.trend.series[6].count >= 1); // today
    assert.strictEqual(d.trend.total, d.trend.series.reduce((n, p) => n + p.count, 0));
    assert.ok(d.topJobs.length >= 1);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes('@itest.example') && !/resume/i.test(text)); // no emails, no resume references
    assert.strictEqual((await call('/api/admin/analytics/applications?days=15', { who: 'admin' })).status, 400);
    assert.strictEqual((await call(`/api/applications/${appId}/resume`, { who: 'admin' })).status, 403);
    assert.strictEqual((await call(`/api/applications/job/${jobId}`, { who: 'admin' })).status, 403);
  });

  test('audit log is admin-only, paginated, filterable, and never exposes IPs', async () => {
    assert.strictEqual((await call('/api/admin/audit-logs', { who: 'cand' })).status, 403);
    assert.strictEqual((await call('/api/admin/audit-logs')).status, 401);
    const r = await call('/api/admin/audit-logs?limit=5', { who: 'admin' });
    assert.strictEqual(r.status, 200); assert.ok(r.body.data.length >= 1 && r.body.data.length <= 5);
    assert.ok(r.body.data[0].adminId.name && r.body.data[0].reason && r.body.data[0].createdAt);
    assert.ok(r.body.data.every((l) => l.ip === undefined));
    const only = await call('/api/admin/audit-logs?action=JOB_REMOVED&targetType=job', { who: 'admin' });
    assert.ok(only.body.data.every((l) => l.action === 'JOB_REMOVED'));
    assert.strictEqual((await call('/api/admin/audit-logs?action=HACK', { who: 'admin' })).status, 400);
  });

  test('existing candidate and employer workflows still work after all of the above', async () => {
    assert.strictEqual((await call('/api/jobs?limit=5')).status, 200);
    assert.strictEqual((await call('/api/employer/jobs', { who: 'emp' })).status, 200);
    assert.strictEqual((await call('/api/applications/my', { who: 'cand' })).body.data.length, 1);
    assert.strictEqual((await call(`/api/applications/job/${jobId}`, { who: 'emp' })).body.data.length, 1);
    assert.strictEqual((await call(`/api/applications/${appId}/resume`, { who: 'emp' })).res.status, 200);
  });
});
