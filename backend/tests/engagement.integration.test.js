// Emails, notifications, password recovery, dashboards, profile and saved jobs against a real MongoDB.
// The email provider and Razorpay are MOCKED. Skipped unless MONGO_URI_TEST (database name contains "test") is set.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-integration-123';
process.env.RESEND_API_KEY = 're_test_dummy_key';
process.env.EMAIL_FROM = 'NicheHire <noreply@example.com>';
process.env.FRONTEND_URL = 'https://nichehire.test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummykey123';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_value_123';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_value_123';
delete process.env.FEATURED_PRICE_PAISE; delete process.env.FEATURED_DAYS;
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const makePdf = require('./helpers/makePdf');

const URI = process.env.MONGO_URI_TEST;
const dbName = URI ? new URL(URI.replace('mongodb+srv://', 'mongodb://')).pathname.replace('/', '') : '';
const skip = !URI ? 'MONGO_URI_TEST not set' : !/test/i.test(dbName) ? 'database name must contain "test"' : false;

describe('Engagement features (MongoDB, mocked email + gateway)', { skip }, () => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const E = (n) => `${n}-${run}@itest.example`;
  let server, base, M = {}, email, notifier, razorpay;
  const jar = {}, ids = {}, jobs = {};
  const sent = []; // every email the (mocked) provider received
  let emailMode = 'ok'; // 'ok' | 'fail'
  let seq = 0;

  const call = async (p, { method = 'GET', body, who, form, cookie } = {}) => {
    const res = await fetch(base + p, { method, body: form || (body === undefined ? undefined : JSON.stringify(body)), headers: { ...(!form && { 'content-type': 'application/json' }), ...((who || cookie) && { cookie: cookie || jar[who] }) } });
    return { status: res.status, body: await res.json().catch(() => null), res };
  };
  const signIn = async (who, p, payload) => { const r = await call(p, { method: 'POST', body: payload }); const sc = r.res.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0]; return r; };
  const settle = () => notifier.idle();
  const mailsTo = (addr) => sent.filter((m) => m.to === addr);
  const notes = (userId, type) => M.Notification.find({ userId, ...(type && { type }) }).sort({ createdAt: 1 }).lean();
  const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
  const webhook = async (event, rp) => { const raw = JSON.stringify({ event, created_at: Math.floor(Date.now() / 1000), payload: { payment: { entity: rp } } }); const res = await fetch(`${base}/api/payments/webhook`, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmac(process.env.RAZORPAY_WEBHOOK_SECRET, raw), 'x-razorpay-event-id': `evt_${run}_${++seq}` } }); return { status: res.status, body: await res.json(), eventId: res.headers.get('x') }; };
  const newJob = async (who, title, extra = {}) => (await call('/api/jobs', { method: 'POST', who, body: { title: `${title} ${run}`, company: 'EngCo', description: 'A job for engagement tests.', nicheCategory: 'AI/ML', location: 'Remote', employmentType: 'Full-time', requiredSkills: ['Python', 'SQL'], customFields: { programmingLanguages: ['Python'], mlFrameworks: ['PyTorch'], experienceLevel: 'Entry Level' }, ...extra } })).body.data._id;
  const apply = (who, jobId, text = ['Jane Doe', 'Skills: Python and SQL for many years of experience']) => { const f = new FormData(); f.append('jobId', jobId); f.append('resume', new Blob([makePdf(text)], { type: 'application/pdf' }), 'cv.pdf'); return call('/api/apply', { method: 'POST', who, form: f }); };

  before(async () => {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    const app = require('../app');
    for (const n of ['User', 'Job', 'Application', 'Payment', 'WebhookEvent', 'Notification', 'PasswordReset', 'SavedJob', 'AuditLog']) M[n] = require(`../models/${n}`);
    email = require('../services/email'); notifier = require('../services/notifier'); razorpay = require('../services/razorpay');
    await Promise.all(Object.values(M).map((m) => m.init()));
    email.transport = async (m) => { sent.push(m); return emailMode === 'fail' ? { ok: false, error: 'Provider returned HTTP 500' } : { ok: true, id: `em_${sent.length}` }; };
    razorpay.createOrder = async ({ amount, currency }) => ({ id: `order_E${run}${++seq}`, amount, currency });
    razorpay.fetchPayment = async () => { throw new Error('not used'); };
    await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
  });

  after(async () => {
    await settle();
    const users = await M.User.find({ email: /@itest\.example$/ }).select('_id'); const uids = users.map((u) => u._id);
    const js = await M.Job.find({ employerId: { $in: uids } }).select('_id'); const jids = js.map((j) => j._id);
    const apps = await M.Application.find({ $or: [{ candidateId: { $in: uids } }, { jobId: { $in: jids } }] });
    for (const a of apps) fs.rmSync(path.join(require('../middleware/uploadMiddleware').UPLOAD_DIR, a.resumeUrl), { force: true });
    await M.Application.deleteMany({ _id: { $in: apps.map((a) => a._id) } });
    await Promise.all([M.Notification.deleteMany({ userId: { $in: uids } }), M.PasswordReset.deleteMany({ userId: { $in: uids } }), M.SavedJob.deleteMany({ userId: { $in: uids } }), M.Payment.deleteMany({ employerId: { $in: uids } }), M.WebhookEvent.deleteMany({ eventId: new RegExp(`^evt_${run}_`) }), M.AuditLog.deleteMany({ $or: [{ adminId: { $in: uids } }, { targetId: { $in: [...uids, ...jids] } }] })]);
    await M.Job.deleteMany({ _id: { $in: jids } }); await M.User.deleteMany({ _id: { $in: uids } });
    server.close(); await mongoose.disconnect();
  });

  test('welcome: in-app + email on registration; a failing email provider never breaks registration', async () => {
    const r = await signIn('emp', '/api/auth/register', { name: 'Eva Employer', email: E('emp'), password: 'password123', role: 'employer' });
    assert.strictEqual(r.status, 201); ids.emp = r.body.data.user._id; await settle();
    const m = mailsTo(E('emp'))[0];
    assert.match(m.subject, /Welcome/); assert.ok(m.html.includes('NicheHire') && m.html.includes('https://nichehire.test/employer/post')); assert.ok(m.text);
    assert.strictEqual((await notes(ids.emp, 'welcome')).length, 1); assert.strictEqual((await notes(ids.emp, 'welcome'))[0].emailStatus, 'sent');

    emailMode = 'fail';
    const bad = await signIn('cand', '/api/auth/register', { name: 'Cam <b>Candidate</b>', email: E('cand'), password: 'password123', role: 'candidate' });
    await settle(); // let the background email attempt run while the provider is still failing
    emailMode = 'ok';
    assert.strictEqual(bad.status, 201); ids.cand = bad.body.data.user._id;
    const n = (await notes(ids.cand, 'welcome'))[0];
    assert.strictEqual(n.emailStatus, 'failed'); assert.match(n.emailError, /HTTP 500/);

    // email service not configured: still fine, status "skipped"
    const savedKey = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
    const r3 = await signIn('cand2', '/api/auth/register', { name: 'Cora', email: E('cand2'), password: 'password123', role: 'candidate' });
    await settle(); // the background send must run while the key is still missing
    process.env.RESEND_API_KEY = savedKey; ids.cand2 = r3.body.data.user._id;
    assert.strictEqual(r3.status, 201); assert.strictEqual((await notes(ids.cand2, 'welcome'))[0].emailStatus, 'skipped');

    const admin = await M.User.create({ name: 'Ada Admin', email: E('admin'), password: 'password123', role: 'admin' }); ids.admin = String(admin._id);
    await signIn('admin', '/api/auth/login', { email: E('admin'), password: 'password123' });
    ids.emp2 = (await signIn('emp2', '/api/auth/register', { name: 'Other Emp', email: E('emp2'), password: 'password123', role: 'employer' })).body.data.user._id;
    jobs.A = await newJob('emp', 'JobA'); jobs.B = await newJob('emp', 'JobB');
  });

  test('application: candidate confirmation + employer alert (escaped), no duplicates on a repeat apply', async () => {
    const before = sent.length;
    const r = await apply('cand', jobs.A);
    assert.strictEqual(r.status, 201); ids.appA = r.body.data._id; await settle();
    const cm = mailsTo(E('cand')).filter((m) => /Application received/.test(m.subject)); assert.strictEqual(cm.length, 1);
    assert.ok(cm[0].html.includes(`JobA ${run}`) && cm[0].html.includes('https://nichehire.test/candidate/dashboard'));
    const em = mailsTo(E('emp')).filter((m) => /New application/.test(m.subject)); assert.strictEqual(em.length, 1);
    assert.ok(em[0].html.includes(`JobA ${run}`) && em[0].html.includes('100%'));
    assert.ok(em[0].html.includes('Cam &lt;b&gt;Candidate&lt;/b&gt;') && !em[0].html.includes('<b>Candidate</b>')); // HTML in a name cannot inject markup
    assert.strictEqual((await notes(ids.emp, 'application_received')).length, 1);
    assert.strictEqual((await notes(ids.cand, 'application_submitted')).length, 1);
    const count = sent.length;
    assert.strictEqual((await apply('cand', jobs.A)).status, 409); await settle(); // duplicate application
    assert.strictEqual(sent.length, count); assert.strictEqual((await notes(ids.emp, 'application_received')).length, 1);
    assert.ok(sent.length > before);
  });

  test('status change: candidate is told once per real change; same status and double clicks do not re-notify', async () => {
    const patch = (who, st) => call(`/api/applications/${ids.appA}/status`, { method: 'PATCH', who, body: { status: st } });
    assert.strictEqual((await patch('emp2', 'Shortlisted')).status, 403); await settle();
    assert.strictEqual((await notes(ids.cand, 'application_status')).length, 0); // forbidden change notifies nobody
    assert.strictEqual((await patch('emp', 'Shortlisted')).status, 200); await settle();
    let st = await notes(ids.cand, 'application_status'); assert.strictEqual(st.length, 1); assert.match(st[0].title, /shortlisted/i); assert.strictEqual(st[0].link, '/candidate/dashboard');
    const m = mailsTo(E('cand')).filter((x) => /shortlisted/i.test(x.subject)); assert.strictEqual(m.length, 1); assert.ok(m[0].html.includes('Good news'));
    assert.strictEqual((await patch('emp', 'Shortlisted')).status, 200); await settle(); // same status again
    assert.strictEqual((await notes(ids.cand, 'application_status')).length, 1);
    const sentBefore = sent.length;
    await Promise.all([1, 2, 3].map(() => patch('emp', 'Rejected'))); await settle(); // parallel double clicks
    st = await notes(ids.cand, 'application_status'); assert.strictEqual(st.length, 2);
    assert.strictEqual(sent.length - sentBefore, 1);
    assert.strictEqual((await call(`/api/applications/${ids.appA}/status`, { method: 'PATCH', who: 'emp', body: { status: 'Hired' } })).status, 400);
  });

  test('email preference: non-essential email is skipped, in-app still delivered; essential notices always send', async () => {
    assert.strictEqual((await call('/api/users/me', { method: 'PATCH', who: 'cand', body: { notifyByEmail: false } })).status, 200);
    const before = mailsTo(E('cand')).length;
    await call(`/api/applications/${ids.appA}/status`, { method: 'PATCH', who: 'emp', body: { status: 'Shortlisted' } }); await settle();
    const last = (await notes(ids.cand, 'application_status')).at(-1);
    assert.strictEqual(last.emailStatus, 'skipped'); assert.strictEqual(mailsTo(E('cand')).length, before);
    // essential: account suspension email ignores the preference
    assert.strictEqual((await call(`/api/admin/users/${ids.cand}/status`, { method: 'PATCH', who: 'admin', body: { status: 'suspended', reason: 'Spam applications' } })).status, 200); await settle();
    const sm = mailsTo(E('cand')).at(-1); assert.match(sm.subject, /suspended/i); assert.ok(sm.html.includes('Spam applications'));
    assert.strictEqual((await call(`/api/admin/users/${ids.cand}/status`, { method: 'PATCH', who: 'admin', body: { status: 'active', reason: 'Appeal accepted' } })).status, 200); await settle();
    assert.match(mailsTo(E('cand')).at(-1).subject, /reactivated/i);
    assert.strictEqual((await call('/api/users/me', { method: 'PATCH', who: 'cand', body: { notifyByEmail: true } })).status, 200);
  });

  test('job moderation: removal tells the employer (email + in-app); flagging does not; restore is in-app only', async () => {
    const m = (action, reason = 'Policy violation') => call(`/api/admin/jobs/${jobs.B}/moderation`, { method: 'PATCH', who: 'admin', body: { action, reason } });
    const mails = mailsTo(E('emp')).length;
    assert.strictEqual((await m('flag')).status, 200); await settle();
    assert.strictEqual((await notes(ids.emp, 'job_update')).length, 0); assert.strictEqual(mailsTo(E('emp')).length, mails);
    assert.strictEqual((await m('remove', 'Advance-fee scam')).status, 200); await settle();
    const n = (await notes(ids.emp, 'job_update'))[0]; assert.match(n.title, /removed/i); assert.ok(n.message.includes('Advance-fee scam'));
    const rm = mailsTo(E('emp')).at(-1); assert.match(rm.subject, /removed/); assert.ok(rm.html.includes('Advance-fee scam'));
    assert.strictEqual((await m('restore', 'Verified legitimate')).status, 200); await settle();
    const all = await notes(ids.emp, 'job_update'); assert.strictEqual(all.length, 2); assert.strictEqual(all[1].emailStatus, 'none');
  });

  test('payments: success is announced (email + in-app, once); failure in-app only; paid-but-unactivated alerts every admin', async () => {
    const order = async (jobId) => (await call('/api/payments/create-order', { method: 'POST', who: 'emp', body: { jobId } })).body.data;
    const o = await order(jobs.B); const payId = `pay_E${run}1`;
    const entity = (ord, id, x = {}) => ({ id, order_id: ord.orderId, amount: ord.amount, currency: ord.currency, status: 'captured', ...x });
    // failure first
    await webhook('payment.failed', entity(o, `pay_E${run}0`, { status: 'failed', error_description: 'Declined' })); await settle();
    const f = await notes(ids.emp, 'payment_failed'); assert.strictEqual(f.length, 1); assert.strictEqual(f[0].emailStatus, 'none');
    await webhook('payment.captured', entity(o, payId)); await settle();
    const ps = await notes(ids.emp, 'payment_succeeded'); assert.strictEqual(ps.length, 1);
    const pm = mailsTo(E('emp')).filter((x) => /Payment received/.test(x.subject)); assert.strictEqual(pm.length, 1);
    assert.ok(pm[0].html.includes('499') && pm[0].html.includes(`JobB ${run}`) && pm[0].subject.includes('now featured'));
    await webhook('payment.captured', entity(o, payId)); await webhook('order.paid', entity(o, payId)); await settle(); // duplicates / retries
    assert.strictEqual((await notes(ids.emp, 'payment_succeeded')).length, 1); assert.strictEqual(mailsTo(E('emp')).filter((x) => /Payment received/.test(x.subject)).length, 1);

    // paid, but the job was closed meanwhile => admins are alerted
    const closedJob = await newJob('emp', 'ClosedMid'); const o2 = await order(closedJob);
    await M.Job.updateOne({ _id: closedJob }, { status: 'closed' });
    await webhook('payment.captured', entity(o2, `pay_E${run}2`)); await settle();
    const an = await notes(ids.admin, 'payment_review'); assert.strictEqual(an.length, 1); assert.strictEqual(an[0].link, '/admin/payments');
    const am = mailsTo(E('admin')).filter((x) => /Action needed/.test(x.subject)); assert.strictEqual(am.length, 1); assert.ok(am[0].html.includes(E('emp')));
    assert.strictEqual((await notes(ids.emp, 'payment_succeeded')).length, 2); // the employer still gets a receipt
    assert.match(mailsTo(E('emp')).at(-1).html, /could not be featured/);
  });

  test('notifications API: own notifications only, mark read (idempotent), mark all, filters, pagination, safe fields', async () => {
    const list = await call('/api/notifications?limit=50', { who: 'emp' });
    assert.strictEqual(list.status, 200); assert.ok(list.body.data.length >= 4);
    assert.ok(list.body.data.every((n) => String(n.userId) === ids.emp));
    for (const n of list.body.data) for (const k of ['emailStatus', 'emailError', 'dedupeKey']) assert.strictEqual(n[k], undefined, k);
    assert.ok(list.body.data[0].createdAt && list.body.data[0].title && list.body.data[0].message);
    assert.strictEqual(list.body.unreadCount, list.body.data.filter((n) => !n.readAt).length);
    const first = list.body.data.find((n) => !n.readAt);
    // nobody else can read or change it
    assert.strictEqual((await call(`/api/notifications/${first._id}/read`, { method: 'PATCH', who: 'cand2', body: {} })).status, 404);
    assert.strictEqual((await call(`/api/notifications/${first._id}/read`, { method: 'PATCH', who: 'admin', body: {} })).status, 404); // admins have no special access
    assert.strictEqual((await call(`/api/notifications/${first._id}/read`, { method: 'PATCH', body: {} })).status, 401);
    assert.ok(!(await M.Notification.findById(first._id)).readAt);
    assert.ok(!(await call('/api/notifications?limit=50', { who: 'cand2' })).body.data.some((n) => n._id === first._id));
    // mark one read; calling again keeps the original read time
    const r1 = await call(`/api/notifications/${first._id}/read`, { method: 'PATCH', who: 'emp', body: {} }); assert.strictEqual(r1.status, 200); assert.ok(r1.body.data.readAt);
    await new Promise((r) => setTimeout(r, 15));
    const r2 = await call(`/api/notifications/${first._id}/read`, { method: 'PATCH', who: 'emp', body: {} }); assert.strictEqual(r2.body.data.readAt, r1.body.data.readAt);
    const unread = (await call('/api/notifications/unread-count', { who: 'emp' })).body.data.unreadCount; assert.strictEqual(unread, list.body.unreadCount - 1);
    assert.ok((await call('/api/notifications?unread=true&limit=50', { who: 'emp' })).body.data.every((n) => !n.readAt));
    const pg = await call('/api/notifications?limit=2&page=2', { who: 'emp' }); assert.strictEqual(pg.body.pagination.page, 2); assert.ok(pg.body.data.length <= 2);
    const all = await call('/api/notifications/read-all', { method: 'PATCH', who: 'emp', body: {} }); assert.strictEqual(all.status, 200); assert.strictEqual(all.body.data.updated, unread);
    assert.strictEqual((await call('/api/notifications/unread-count', { who: 'emp' })).body.data.unreadCount, 0);
    assert.strictEqual((await call('/api/notifications/unread-count', { who: 'cand2' })).body.data.unreadCount >= 1, true); // others untouched
    assert.strictEqual((await call('/api/notifications/not-an-id/read', { method: 'PATCH', who: 'emp', body: {} })).status, 400);
  });

  test('password recovery: generic answers, hashed single-use expiring token, old sessions revoked', async () => {
    const forgot = (addr) => call('/api/auth/forgot-password', { method: 'POST', body: { email: addr } });
    const known = await forgot(E('cand2')); await settle();
    const unknown = await forgot(`nobody-${run}@itest.example`); await settle();
    assert.strictEqual(known.status, 200); assert.strictEqual(unknown.status, 200);
    assert.strictEqual(known.body.message, unknown.body.message); // same wording: no account discovery
    assert.strictEqual(mailsTo(`nobody-${run}@itest.example`).length, 0);
    const mails = mailsTo(E('cand2')).filter((m) => /Reset your/.test(m.subject)); assert.strictEqual(mails.length, 1);
    const token = /token=([a-f0-9]{64})/.exec(mails[0].html)[1];
    assert.ok(mails[0].html.includes('https://nichehire.test/reset-password?token=') && /30 minutes/.test(mails[0].html));
    // only a hash is stored; the token itself is nowhere in the database
    const rec = await M.PasswordReset.findOne({ userId: ids.cand2 }).lean();
    assert.ok(rec.tokenHash && rec.tokenHash !== token && rec.tokenHash === crypto.createHash('sha256').update(token).digest('hex'));
    assert.ok(!JSON.stringify(rec).includes(token));
    assert.ok(rec.expiresAt - Date.now() <= 30 * 60000 + 1000 && rec.expiresAt > Date.now());
    // throttle: a second request within a minute sends nothing new
    await forgot(E('cand2')); await settle(); assert.strictEqual(mailsTo(E('cand2')).filter((m) => /Reset your/.test(m.subject)).length, 1);
    // the account has a live session from before the reset
    assert.strictEqual((await call('/api/auth/me', { who: 'cand2' })).status, 200);

    const reset = (t, pw = 'brand-new-pass-1') => call('/api/auth/reset-password', { method: 'POST', body: { token: t, password: pw } });
    assert.strictEqual((await reset('f'.repeat(64))).status, 400); // wrong token
    assert.strictEqual((await reset(token, 'short')).status, 400); // weak password does not burn the token
    assert.ok(!(await M.PasswordReset.findOne({ userId: ids.cand2 })).usedAt);
    await new Promise((r) => setTimeout(r, 1100)); // sessions are compared at one-second precision
    const ok = await reset(token); assert.strictEqual(ok.status, 200); await settle();
    assert.match(mailsTo(E('cand2')).at(-1).subject, /password was changed/);
    assert.strictEqual((await reset(token)).status, 400); // reuse
    assert.strictEqual(await M.PasswordReset.countDocuments({ userId: ids.cand2 }), 0); // all tokens gone
    assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: E('cand2'), password: 'password123' } })).status, 401); // old password dead
    const login = await signIn('cand2n', '/api/auth/login', { email: E('cand2'), password: 'brand-new-pass-1' }); assert.strictEqual(login.status, 200);
    assert.match((await M.User.findById(ids.cand2).select('+password')).password, /^\$2[aby]\$/); // bcrypt, via the existing hook
    assert.strictEqual((await call('/api/auth/me', { who: 'cand2' })).status, 401); // the OLD session cookie no longer works
    assert.strictEqual((await call('/api/auth/me', { who: 'cand2n' })).status, 200); // the new one does

    // expired link
    await new Promise((r) => setTimeout(r, 1100)); await forgot(E('cand2')); await settle();
    const t2 = /token=([a-f0-9]{64})/.exec(mailsTo(E('cand2')).filter((m) => /Reset your/.test(m.subject)).at(-1).html)[1];
    await M.PasswordReset.updateOne({ userId: ids.cand2 }, { expiresAt: new Date(Date.now() - 1000) });
    assert.strictEqual((await reset(t2)).status, 400);
    // a new request replaces the older link
    await M.PasswordReset.deleteMany({ userId: ids.cand2 }); await forgot(E('cand2')); await settle();
    const t3 = /token=([a-f0-9]{64})/.exec(mailsTo(E('cand2')).filter((m) => /Reset your/.test(m.subject)).at(-1).html)[1];
    assert.strictEqual(await M.PasswordReset.countDocuments({ userId: ids.cand2 }), 1);
    // two parallel uses of the same valid link: exactly one wins
    const race = await Promise.all([reset(t3, 'race-winner-pass-1'), reset(t3, 'race-loser-pass-2')]);
    assert.deepStrictEqual(race.map((x) => x.status).sort(), [200, 400]);
  });

  test('dashboards: real numbers, role-restricted', async () => {
    const c = await call('/api/dashboard/candidate', { who: 'cand' });
    assert.strictEqual(c.status, 200);
    assert.deepStrictEqual([c.body.data.stats.total, c.body.data.stats.Shortlisted, c.body.data.stats.Rejected], [1, 1, 0]);
    assert.strictEqual(c.body.data.recentApplications[0].jobTitle, `JobA ${run}`);
    assert.strictEqual(c.body.data.profileCompletion.percent, 25);
    assert.strictEqual((await call('/api/dashboard/candidate', { who: 'emp' })).status, 403);
    assert.strictEqual((await call('/api/dashboard/candidate')).status, 401);

    const e = (await call('/api/dashboard/employer', { who: 'emp' })).body.data;
    const myJobs = await M.Job.find({ employerId: ids.emp });
    assert.strictEqual(e.jobs.total, myJobs.length); assert.strictEqual(e.jobs.active, myJobs.filter((j) => j.status === 'active').length); assert.strictEqual(e.jobs.closed, myJobs.filter((j) => j.status === 'closed').length);
    assert.strictEqual(e.applications.total, 1); assert.strictEqual(e.applications.last7Days, 1); assert.strictEqual(e.applications.Shortlisted, 1);
    assert.strictEqual(e.recentApplications[0].candidateName, 'Cam <b>Candidate</b>'); assert.strictEqual(e.recentApplications[0].matchScore, 100);
    assert.strictEqual(e.jobs.featured, 1); assert.strictEqual(e.featuredJobs[0].title, `JobB ${run}`); assert.strictEqual(e.featuredJobs[0].daysLeft, 7); assert.strictEqual(e.featuredJobs[0].expiresSoon, false);
    const other = (await call('/api/dashboard/employer', { who: 'emp2' })).body.data; // another employer sees none of it
    assert.deepStrictEqual([other.jobs.total, other.applications.total, other.recentApplications.length, other.featuredJobs.length], [0, 0, 0, 0]);
    assert.strictEqual((await call('/api/dashboard/employer', { who: 'cand' })).status, 403);
    await M.Job.updateOne({ _id: jobs.B }, { featuredUntil: new Date(Date.now() + 36 * 3600 * 1000) });
    assert.strictEqual((await call('/api/dashboard/employer', { who: 'emp' })).body.data.featuredJobs[0].expiresSoon, true);
  });

  test('profile: update, completion guidance, employer-only company, nothing privileged accepted', async () => {
    const up = await call('/api/users/me', { method: 'PATCH', who: 'cand', body: { headline: 'ML engineer', location: 'Pune', phone: '+91 98765 43210' } });
    assert.strictEqual(up.status, 200); assert.strictEqual(up.body.data.profileCompletion.percent, 100); assert.deepStrictEqual(up.body.data.profileCompletion.missing, []);
    assert.strictEqual(up.body.data.password, undefined);
    const me = (await call('/api/users/me', { who: 'cand' })).body.data; assert.strictEqual(me.headline, 'ML engineer');
    assert.strictEqual((await call('/api/users/me', { method: 'PATCH', who: 'cand', body: { companyName: 'X' } })).status, 400);
    assert.strictEqual((await call('/api/users/me', { method: 'PATCH', who: 'emp', body: { companyName: 'EngCo' } })).status, 200);
    assert.strictEqual((await call('/api/users/me', { method: 'PATCH', who: 'cand', body: { role: 'admin' } })).status, 403);
    for (const bad of [{ status: 'active' }, { phone: 'abc' }, { passwordChangedAt: '2000-01-01' }, {}]) assert.strictEqual((await call('/api/users/me', { method: 'PATCH', who: 'cand', body: bad })).status, 400, JSON.stringify(bad));
    assert.strictEqual((await call('/api/dashboard/candidate', { who: 'cand' })).body.data.profileCompletion.percent, 100);
  });

  test('saved jobs: save/unsave idempotently, closed or removed jobs drop out, candidates only', async () => {
    const put = (id) => call(`/api/saved-jobs/${id}`, { method: 'PUT', who: 'cand' });
    assert.strictEqual((await put(jobs.A)).status, 200); assert.strictEqual((await put(jobs.A)).status, 200);
    assert.strictEqual(await M.SavedJob.countDocuments({ userId: ids.cand }), 1);
    assert.deepStrictEqual((await call('/api/saved-jobs/ids', { who: 'cand' })).body.data, [jobs.A]);
    const list = (await call('/api/saved-jobs', { who: 'cand' })).body.data;
    assert.strictEqual(list[0].title, `JobA ${run}`); assert.strictEqual(list[0].moderation, undefined); assert.strictEqual(list[0].featured, false);
    assert.strictEqual((await put('e'.repeat(24))).status, 404);
    assert.strictEqual((await call('/api/saved-jobs', { who: 'emp' })).status, 403);
    assert.strictEqual((await call('/api/saved-jobs')).status, 401);
    await signIn('cand3', '/api/auth/register', { name: 'Third Cand', email: E('cand3'), password: 'password123', role: 'candidate' });
    assert.strictEqual((await call('/api/saved-jobs/ids', { who: 'cand3' })).body.data.length, 0); // someone else's list is separate
    await M.Job.updateOne({ _id: jobs.A }, { status: 'closed' });
    assert.strictEqual((await call('/api/saved-jobs', { who: 'cand' })).body.data.length, 0); // hidden, record kept
    assert.strictEqual((await put(jobs.A)).status, 409); await M.Job.updateOne({ _id: jobs.A }, { status: 'active' });
    assert.strictEqual((await call(`/api/saved-jobs/${jobs.A}`, { method: 'DELETE', who: 'cand' })).body.data.saved, false);
    assert.strictEqual((await call(`/api/saved-jobs/${jobs.A}`, { method: 'DELETE', who: 'cand' })).status, 200);
    assert.strictEqual(await M.SavedJob.countDocuments({ userId: ids.cand }), 0);
  });

  test('regression: auth, applications, job management and payment history still behave', async () => {
    assert.strictEqual((await call('/api/auth/me', { who: 'emp' })).status, 200);
    assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: E('emp'), password: 'wrong-password' } })).status, 401);
    assert.strictEqual((await call('/api/applications/my', { who: 'cand' })).body.data.length, 1);
    assert.strictEqual((await call(`/api/applications/job/${jobs.A}`, { who: 'emp' })).body.data.length, 1);
    assert.strictEqual((await call(`/api/jobs/${jobs.A}`, { method: 'PATCH', who: 'emp', body: { title: `Renamed ${run}` } })).status, 200);
    assert.strictEqual((await call(`/api/jobs/${jobs.A}`, { method: 'DELETE', who: 'emp2' })).status, 403);
    assert.ok((await call('/api/payments/my', { who: 'emp' })).body.data.length >= 2);
    assert.strictEqual((await call('/api/admin/stats', { who: 'admin' })).status, 200);
  });
});
