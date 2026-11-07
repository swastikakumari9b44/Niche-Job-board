// Analytics against a real MongoDB with a hand-built dataset, so every number can be verified exactly.
// All data uses the category "Data Science" (used by no other test file) and unique emails; it is removed afterwards.
// Skipped unless MONGO_URI_TEST (a database whose name contains "test") is set.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-integration-123';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

const URI = process.env.MONGO_URI_TEST;
const dbName = URI ? new URL(URI.replace('mongodb+srv://', 'mongodb://')).pathname.replace('/', '') : '';
const skip = !URI ? 'MONGO_URI_TEST not set' : !/test/i.test(dbName) ? 'database name must contain "test"' : false;
const DAY = 864e5;

describe('Analytics & reporting (MongoDB)', { skip }, () => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const E = (n) => `${n}-${run}@itest.example`;
  const M = {}, jar = {}, U = {}, J = {};
  let server, base;
  const oid = () => new mongoose.Types.ObjectId();
  // Exactly N days before now. (An earlier version used "noon UTC", which made results depend on the time of day.)
  const ago = (n) => new Date(Date.now() - n * DAY);
  const dayStr = (n) => ago(n).toISOString().slice(0, 10);

  const call = async (p, { who } = {}) => {
    const res = await fetch(base + p, { headers: who ? { cookie: jar[who] } : {} });
    const type = res.headers.get('content-type') || '';
    // res.text() silently drops a leading BOM, so decode the raw bytes to be able to verify it
    const text = type.includes('csv') ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(await res.arrayBuffer()) : null;
    return { status: res.status, res, body: type.includes('json') ? await res.json() : null, text };
  };
  const login = async (who, email) => { const r = await fetch(`${base}/api/auth/login`, { method: 'POST', body: JSON.stringify({ email, password: 'password123' }), headers: { 'content-type': 'application/json' } }); jar[who] = r.headers.get('set-cookie').split(';')[0]; };
  const lines = (csv) => csv.replace(/^\uFEFF/, '').trim().split('\r\n');

  before(async () => {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    const app = require('../app');
    for (const n of ['User', 'Job', 'Application', 'Payment']) M[n] = require(`../models/${n}`);
    await Promise.all(Object.values(M).map((m) => m.init()));
    await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });

    // ---- users (real accounts through the model, so passwords are hashed) ----
    const mk = async (key, name, role) => { U[key] = await M.User.create({ name, email: E(key), password: 'password123', role }); };
    await mk('e1', 'Eva One', 'employer'); await mk('e2', 'Eli Two', 'employer'); await mk('e3', 'Empty Employer', 'employer');
    await mk('c1', 'Cara One', 'candidate'); await mk('c2', 'Doe, "Jr"', 'candidate'); await mk('c3', '=HYPERLINK("http://evil.example","click")', 'candidate');
    await mk('c4', 'Dan Four', 'candidate'); await mk('c5', 'Cy Five', 'candidate'); await mk('c6', 'Cat Six', 'candidate'); await mk('c7', 'No Apps', 'candidate');
    await mk('admin', 'Ada Admin', 'admin');
    for (const k of ['e1', 'e2', 'e3', 'c1', 'c7', 'admin']) await login(k, E(k));

    // ---- jobs (dates are set directly so every period is predictable) ----
    const job = (key, title, employer, daysAgo, status = 'active', extra = {}) => ({ _id: (J[key] = oid()), title: `${title} ${run}`, company: 'DataCo', description: 'Analytics test job.', nicheCategory: 'Data Science', location: 'Remote', employmentType: 'full-time', requiredSkills: [], customFields: {}, status, employerId: U[employer]._id, createdAt: ago(daysAgo), updatedAt: ago(daysAgo), ...extra });
    const payFeatured = oid();
    await M.Job.collection.insertMany([
      job('j1', 'Featured DS', 'e1', 45, 'active', { isFeatured: true, featuredPaymentId: payFeatured, featuredUntil: new Date(Date.now() + 3 * DAY), featuredAt: ago(40) }),
      job('j2', 'Plain DS', 'e1', 20), job('j3', 'Closed DS', 'e1', 100, 'closed'), job('j4', 'Other Employer DS', 'e2', 10),
    ]);

    // ---- applications: (job, candidate, daysAgo, status, match score or null) ----
    const mkApp = (j, c, daysAgo, status, score) => ({ jobId: J[j], candidateId: U[c]._id, candidateName: U[c].name, candidateEmail: U[c].email, resumeUrl: 'r.pdf', status, matchStatus: score == null ? 'unavailable' : 'scored', matchScore: score ?? 0, extractedSkills: [], matchedSkills: [], missingSkills: [], createdAt: ago(daysAgo), updatedAt: ago(daysAgo) });
    await M.Application.collection.insertMany([
      mkApp('j1', 'c1', 3, 'Shortlisted', 80), mkApp('j1', 'c2', 10, 'Applied', 60), mkApp('j1', 'c3', 40, 'Rejected', null),
      mkApp('j2', 'c1', 5, 'Applied', 100), mkApp('j2', 'c4', 15, 'Shortlisted', 50),
      mkApp('j3', 'c5', 95, 'Rejected', null),
      mkApp('j4', 'c6', 2, 'Applied', 70),
    ]);

    // ---- payments: paid / pending / failed (only paid may ever count as money) ----
    const pay = (id, e, j, status, amount, extra = {}) => ({ _id: id || oid(), employerId: U[e]._id, jobId: J[j], razorpayOrderId: `order_${run}_${oid()}`, amount, currency: 'INR', status, purpose: 'featured_job', featuredDays: 7, createdAt: ago(extra.created ?? 1), updatedAt: ago(1), ...(status === 'paid' && { razorpayPaymentId: `pay_${run}_${oid()}`, verifiedAt: ago(extra.verified) }), ...(extra.activated && { activatedAt: ago(extra.verified), featuredStartsAt: ago(extra.verified), featuredEndsAt: new Date(ago(extra.verified).getTime() + 7 * DAY) }) });
    await M.Payment.collection.insertMany([
      pay(payFeatured, 'e1', 'j1', 'paid', 49900, { verified: 40, created: 40, activated: true }),
      pay(null, 'e1', 'j2', 'paid', 49900, { verified: 5, created: 5 }), // paid, but never activated
      pay(null, 'e1', 'j2', 'pending', 49900, { created: 1 }),
      pay(null, 'e1', 'j3', 'failed', 49900, { created: 2 }),
      pay(null, 'e2', 'j4', 'paid', 29900, { verified: 3, created: 3 }),
      pay(null, 'e2', 'j4', 'created', 29900, { created: 0 }),
    ]);
  });

  after(async () => {
    const users = await M.User.find({ email: /@itest\.example$/ }).select('_id'); const uids = users.map((u) => u._id);
    const jobs = await M.Job.find({ employerId: { $in: uids } }).select('_id'); const jids = jobs.map((j) => j._id);
    await M.Application.deleteMany({ jobId: { $in: jids } }); await M.Payment.deleteMany({ jobId: { $in: jids } });
    await M.Job.deleteMany({ _id: { $in: jids } }); await M.User.deleteMany({ _id: { $in: uids } });
    server.close(); await mongoose.disconnect();
  });

  /* ---------- employer ---------- */
  test('employer overview: exact all-time totals; revenue/spend counts only confirmed payments', async () => {
    const r = await call('/api/analytics/employer?range=30d', { who: 'e1' });
    assert.strictEqual(r.status, 200);
    const t = r.body.data.totals;
    assert.deepStrictEqual([t.jobs, t.activeJobs, t.closedJobs], [3, 2, 1]);
    assert.deepStrictEqual([t.applications, t.pending, t.shortlisted, t.rejected], [6, 2, 2, 2]);
    assert.deepStrictEqual([t.featuredJobsEver, t.featuredActiveNow], [1, 1]); // only J1 had an ACTIVATED promotion
    assert.deepStrictEqual(t.promotionSpend, { amount: 99800, payments: 2, currency: 'INR' }); // 2 paid; pending + failed excluded
    assert.strictEqual(r.body.data.period.spend.amount, 49900); // only the payment confirmed 5 days ago is inside 30d
  });

  test('employer overview: date filters (7d / 30d / 90d / 12m / custom) give exact period numbers', async () => {
    const get = async (qs) => (await call(`/api/analytics/employer?${qs}`, { who: 'e1' })).body.data;
    const d7 = await get('range=7d'), d30 = await get('range=30d'), d90 = await get('range=90d'), m12 = await get('range=12m');
    assert.deepStrictEqual([d7.period.applications, d30.period.applications, d90.period.applications, m12.period.applications], [2, 4, 5, 6]);
    assert.strictEqual(d7.range.granularity, 'day'); assert.strictEqual(m12.range.granularity, 'month');
    assert.deepStrictEqual([d7.period.series.length, d30.period.series.length, d90.period.series.length, m12.period.series.length], [7, 30, 90, 12]);
    for (const d of [d7, d30, d90, m12]) assert.strictEqual(d.period.series.reduce((n, p) => n + p.total, 0), d.period.applications); // chart adds up to the card
    const custom = await get(`range=custom&from=${dayStr(12)}&to=${dayStr(2)}`);
    assert.strictEqual(custom.period.applications, 3); assert.strictEqual(custom.period.series.length, 11);
    assert.strictEqual(d30.period.series.find((p) => p.key === dayStr(3)).total, 1); // exact day bucket
    assert.strictEqual(d30.period.series.find((p) => p.key === dayStr(4)).total, 0); // zero-filled
    assert.strictEqual(d30.period.uniqueCandidates, 3); // c1, c2, c4
    assert.deepStrictEqual(d30.period.byStatus, { Applied: 2, Shortlisted: 2, Rejected: 0 });
    assert.strictEqual(d90.period.spend.amount, 99800); // 12 months of spend includes the 40-day-old payment
    assert.strictEqual(m12.period.spendSeries.reduce((n, p) => n + p.amount, 0), 99800);
  });

  test('employer overview: applications by job, job comparison and featured vs non-featured', async () => {
    const d = (await call('/api/analytics/employer?range=90d', { who: 'e1' })).body.data;
    assert.deepStrictEqual(d.period.byJob.map((j) => [j.title, j.applications]), [[`Featured DS ${run}`, 3], [`Plain DS ${run}`, 2]]);
    const j1 = d.jobs.find((j) => j.title.startsWith('Featured DS'));
    assert.deepStrictEqual([j1.applications, j1.pending, j1.shortlisted, j1.rejected, j1.shortlistRate, j1.avgMatchScore, j1.featuredEver, j1.featuredActive, j1.daysLive], [3, 1, 1, 1, 33.3, 70, true, true, 45]);
    const j3 = d.jobs.find((j) => j.title.startsWith('Closed DS'));
    assert.deepStrictEqual([j3.status, j3.applications, j3.avgMatchScore], ['closed', 1, null]); // no scorable resume => null, never a fake 0
    assert.deepStrictEqual(d.featuredComparison.featured, { jobs: 1, applications: 3, avgApplicationsPerJob: 3, applicationsPerWeekLive: 0.5 });
    assert.deepStrictEqual([d.featuredComparison.notFeatured.jobs, d.featuredComparison.notFeatured.applications, d.featuredComparison.notFeatured.avgApplicationsPerJob], [2, 3, 1.5]);
    assert.match(d.notes.views, /not tracked/i);
  });

  test('employer isolation: another employer sees only their own data; no leakage', async () => {
    const e2 = (await call('/api/analytics/employer?range=12m', { who: 'e2' })).body.data;
    assert.deepStrictEqual([e2.totals.jobs, e2.totals.applications, e2.totals.promotionSpend.amount], [1, 1, 29900]);
    const text = JSON.stringify(e2);
    for (const secret of ['Featured DS', 'Plain DS', 'Closed DS', U.c1.name, U.c2.name, E('e1')]) assert.ok(!text.includes(secret), `leaked ${secret}`);
    assert.strictEqual((await call('/api/analytics/employer', { who: 'c1' })).status, 403);
    assert.strictEqual((await call('/api/analytics/employer', { who: 'admin' })).status, 403);
    assert.strictEqual((await call('/api/analytics/employer')).status, 401);
  });

  test('employer with no data: zeros, empty lists and no errors', async () => {
    const r = await call('/api/analytics/employer?range=90d', { who: 'e3' });
    assert.strictEqual(r.status, 200);
    const d = r.body.data;
    assert.deepStrictEqual([d.totals.jobs, d.totals.applications, d.totals.promotionSpend.amount, d.period.applications, d.jobs.length, d.period.byJob.length], [0, 0, 0, 0, 0, 0]);
    assert.strictEqual(d.period.series.length, 90); assert.ok(d.period.series.every((p) => p.total === 0));
    assert.deepStrictEqual(d.featuredComparison.featured, { jobs: 0, applications: 0, avgApplicationsPerJob: null, applicationsPerWeekLive: null });
  });

  test('per-job analytics: exact numbers, since-publication series, comparison, ownership', async () => {
    const r = await call(`/api/analytics/employer/jobs/${J.j1}?range=all`, { who: 'e1' });
    assert.strictEqual(r.status, 200);
    const d = r.body.data;
    assert.deepStrictEqual([d.job.daysLive, d.job.featuredActive, d.job.status], [45, true, 'active']);
    assert.deepStrictEqual([d.applications.total, d.applications.shortlistRate, d.applications.avgMatchScore], [3, 33.3, 70]);
    assert.deepStrictEqual(d.applications.byStatus, { Applied: 1, Shortlisted: 1, Rejected: 1 });
    assert.strictEqual(d.seriesTotal, 3); assert.strictEqual(d.series.length, 46); // one bucket per day since publication
    assert.deepStrictEqual(d.comparison, { otherJobs: 2, averageApplicationsOtherJobs: 1.5, thisJobApplications: 3, rank: 1, outOf: 3 });
    assert.strictEqual(d.job.promotions.length, 1); assert.strictEqual(d.job.promotions[0].amount, 49900);
    assert.strictEqual((await call(`/api/analytics/employer/jobs/${J.j1}?range=30d`, { who: 'e1' })).body.data.seriesTotal, 2); // c1 (3d) + c2 (10d)
    assert.strictEqual((await call(`/api/analytics/employer/jobs/${J.j1}`, { who: 'e2' })).status, 404); // someone else's job
    assert.strictEqual((await call(`/api/analytics/employer/jobs/${J.j1}`, { who: 'c1' })).status, 403);
    const single = await call(`/api/analytics/employer/jobs/${J.j4}?range=all`, { who: 'e2' });
    assert.strictEqual(single.body.data.comparison, null); // only one job: nothing to compare with
    assert.strictEqual((await call(`/api/analytics/employer/jobs/${'e'.repeat(24)}`, { who: 'e1' })).status, 404);
  });

  test('employer CSV exports: columns, quoting, formula-injection protection, no private data, own jobs only', async () => {
    const a = await call('/api/analytics/employer/export/applications.csv?range=90d', { who: 'e1' });
    assert.strictEqual(a.status, 200);
    assert.match(a.res.headers.get('content-type'), /text\/csv/); assert.match(a.res.headers.get('content-disposition'), /attachment; filename="applications_.*\.csv"/);
    assert.strictEqual(a.res.headers.get('x-export-truncated'), 'false'); assert.ok(a.text.startsWith('\uFEFF'));
    const L = lines(a.text);
    assert.strictEqual(L[0], 'Applied on (UTC),Job,Category,Candidate name,Status,Skill match %,Status last changed (UTC)');
    assert.strictEqual(L.length - 1, 5); // 5 applications in 90 days
    assert.ok(L.some((l) => l.includes('"Doe, ""Jr"""'))); // quoting
    assert.ok(L.some((l) => l.includes(`'=HYPERLINK`))); // a name starting with = is neutralised
    assert.ok(!L.some((l) => /,=HYPERLINK/.test(l)));
    console.log("DBG", JSON.stringify(a.text.slice(0,900)));
        assert.ok(!a.text.includes('@itest.example') && !/resume|r\.pdf|password|token/i.test(a.text)); // no emails, resumes or credentials
    assert.ok(!a.text.includes(U.c6.name)); // other employer's applicant
    const one = await call(`/api/analytics/employer/export/applications.csv?range=12m&jobId=${J.j2}`, { who: 'e1' });
    assert.strictEqual(lines(one.text).length - 1, 2);
    assert.strictEqual((await call(`/api/analytics/employer/export/applications.csv?jobId=${J.j1}`, { who: 'e2' })).status, 404); // cannot export someone else's job
    const e2 = await call('/api/analytics/employer/export/applications.csv?range=12m', { who: 'e2' });
    assert.deepStrictEqual(lines(e2.text).slice(1).map((l) => l.split(',')[3]), ['Cat Six']);

    const jobs = await call('/api/analytics/employer/export/jobs.csv?range=12m', { who: 'e1' });
    const JL = lines(jobs.text);
    assert.strictEqual(JL.length - 1, 3);
    const featured = JL.find((l) => l.includes('Featured DS'));
    assert.ok(featured.endsWith(',3,1,1,1,33.3,70,Yes,499.00')); // applications, pending, shortlisted, rejected, rate, match, featured, spend (INR)
    assert.ok(JL.find((l) => l.includes('Plain DS')).endsWith(',No,499.00')); // pending/failed payments are not "spend"
    assert.ok(JL.find((l) => l.includes('Closed DS')).endsWith(',No,0.00'));
    assert.strictEqual((await call('/api/analytics/employer/export/jobs.csv', { who: 'c1' })).status, 403);
  });

  /* ---------- candidate ---------- */
  test('candidate insights: own numbers only, status trend, categories, recent activity', async () => {
    const r = await call('/api/analytics/candidate?range=30d', { who: 'c1' });
    assert.strictEqual(r.status, 200);
    const d = r.body.data;
    assert.deepStrictEqual([d.totals.applications, d.totals.pending, d.totals.shortlisted, d.totals.rejected], [2, 1, 1, 0]);
    assert.deepStrictEqual([d.totals.shortlistRate, d.totals.responseRate, d.totals.accepted, d.totals.acceptedSupported], [50, 50, null, false]);
    assert.strictEqual(d.period.applications, 2); assert.strictEqual(d.period.series.length, 30);
    assert.strictEqual(d.period.series.find((p) => p.key === dayStr(3)).Shortlisted, 1);
    assert.deepStrictEqual(d.period.byCategory, [{ category: 'Data Science', count: 2 }]);
    assert.strictEqual(d.recentActivity.length, 2); assert.ok(d.recentActivity.every((a) => a.jobTitle && a.company));
    assert.ok(!JSON.stringify(d).includes(U.c2.name)); // other candidates never appear
    assert.match(d.notes.statusTrend, /CURRENT status/);
    const none = (await call('/api/analytics/candidate?range=12m', { who: 'c7' })).body.data; // a candidate with no applications
    assert.deepStrictEqual([none.totals.applications, none.totals.shortlistRate, none.totals.responseRate, none.period.byCategory.length, none.recentActivity.length], [0, null, null, 0, 0]);
    assert.strictEqual((await call('/api/analytics/candidate', { who: 'e1' })).status, 403);
    assert.strictEqual((await call('/api/analytics/candidate')).status, 401);
  });

  /* ---------- admin ---------- */
  test('admin platform analytics (category = Data Science): exact totals and revenue from confirmed payments only', async () => {
    const r = await call('/api/admin/analytics/platform?range=30d&category=Data%20Science', { who: 'admin' });
    assert.strictEqual(r.status, 200);
    const { totals, period, featuredStats } = r.body.data;
    assert.deepStrictEqual([totals.jobs.total, totals.jobs.active, totals.jobs.closed, totals.applications], [4, 3, 1, 7]);
    assert.deepStrictEqual(totals.payments, { successful: 3, revenue: 129700, currency: 'INR' }); // 49900 + 49900 + 29900; pending/failed/created excluded
    assert.deepStrictEqual([totals.featured.jobsEver, totals.featured.activeNow], [1, 1]);
    assert.ok(totals.users.total >= 11 && totals.users.candidates >= 7 && totals.users.employers >= 3 && totals.users.admins >= 1);
    assert.strictEqual(totals.users.total, totals.users.candidates + totals.users.employers + totals.users.admins);
    assert.deepStrictEqual([period.jobsPosted, period.applications, period.successfulPayments, period.revenue], [2, 5, 2, 79800]); // J2 + J4 posted; verified 5d + 3d ago
    assert.deepStrictEqual(period.categories, [{ category: 'Data Science', jobs: 2, applications: 5 }]);
    assert.deepStrictEqual(period.applicationsByStatus, [{ status: 'Applied', count: 3 }, { status: 'Shortlisted', count: 2 }, { status: 'Rejected', count: 0 }]);
    assert.ok(period.newRegistrations.candidates >= 7 && period.newRegistrations.employers >= 3); // all created just now
    assert.ok(!JSON.stringify(r.body).includes('@itest.example')); // no personal details
    for (const s of [period.registrations, period.jobs, period.applicationsSeries, period.revenueSeries]) assert.strictEqual(s.length, 30);
    assert.strictEqual(period.revenueSeries.reduce((n, p) => n + p.amount, 0), period.revenue); // chart = card
    assert.strictEqual(period.applicationsSeries.reduce((n, p) => n + p.count, 0), period.applications);
    assert.deepStrictEqual(featuredStats.comparison.featured, { jobs: 1, applications: 3, avgApplicationsPerJob: 3 });
    assert.deepStrictEqual(featuredStats.comparison.notFeatured, { jobs: 3, applications: 4, avgApplicationsPerJob: 1.3 });
    assert.strictEqual(featuredStats.share, 25);
  });

  test('admin filters: date range, job status, application status', async () => {
    const q = (qs) => call(`/api/admin/analytics/platform?category=Data%20Science&${qs}`, { who: 'admin' }).then((r) => r.body.data);
    const d7 = await q('range=7d');
    assert.deepStrictEqual([d7.period.applications, d7.period.revenue, d7.period.successfulPayments, d7.period.jobsPosted], [3, 79800, 2, 0]); // c1@J1, c1@J2, c6@J4; the 40-day-old payment is out
    const d90 = await q('range=90d'); assert.deepStrictEqual([d90.period.applications, d90.period.revenue], [6, 129700]);
    const m12 = await q('range=12m'); assert.deepStrictEqual([m12.period.applications, m12.period.jobsPosted, m12.range.granularity, m12.period.revenueSeries.length], [7, 4, 'month', 12]);
    const closed = await q('range=12m&jobStatus=closed'); assert.deepStrictEqual([closed.totals.jobs.total, closed.totals.applications, closed.period.applications], [1, 1, 1]);
    const sl = await q('range=12m&applicationStatus=Shortlisted'); assert.deepStrictEqual([sl.totals.applications, sl.period.applications], [2, 2]);
    const custom = await q(`range=custom&from=${dayStr(12)}&to=${dayStr(2)}`); assert.deepStrictEqual([custom.period.applications, custom.period.revenue], [4, 79800]); // c1@J1, c2@J1, c1@J2, c6@J4
    assert.ok(Array.isArray(custom.period.revenueSeries) && custom.period.revenueSeries.length === 11);
  });

  test('admin analytics with no matching data returns zeros, not errors', async () => {
    const r = await call('/api/admin/analytics/platform?range=90d&category=Web3%20%2F%20Blockchain', { who: 'admin' });
    assert.strictEqual(r.status, 200);
    const d = r.body.data;
    assert.deepStrictEqual([d.totals.jobs.total, d.totals.applications, d.totals.payments.revenue, d.totals.featured.jobsEver, d.period.revenue, d.period.categories.length], [0, 0, 0, 0, 0, 0]);
    assert.deepStrictEqual(d.featuredStats.comparison.featured, { jobs: 0, applications: 0, avgApplicationsPerJob: null }); assert.strictEqual(d.featuredStats.share, null);
    assert.ok(d.period.applicationsSeries.every((p) => p.count === 0));
  });

  test('admin authorization and validation', async () => {
    for (const who of ['e1', 'c1']) assert.strictEqual((await call('/api/admin/analytics/platform', { who })).status, 403);
    assert.strictEqual((await call('/api/admin/analytics/platform')).status, 401);
    for (const qs of ['range=custom', 'range=custom&from=2026-02-01&to=2026-01-01', 'range=custom&from=2020-01-01&to=2026-01-01', 'category=Plumbing', 'jobStatus=paused', 'applicationStatus=Hired', 'range=2y']) assert.strictEqual((await call(`/api/admin/analytics/platform?${qs}`, { who: 'admin' })).status, 400, qs);
  });

  test('admin CSV exports: payments report (all statuses, revenue only for paid), summary and jobs; no personal data', async () => {
    const p = await call('/api/admin/analytics/export/payments.csv?range=90d&category=Data%20Science', { who: 'admin' });
    assert.strictEqual(p.status, 200); assert.match(p.res.headers.get('content-disposition'), /payments_.*\.csv/);
    const L = lines(p.text);
    assert.strictEqual(L[0], 'Created (UTC),Confirmed (UTC),Status,Counts as revenue,Amount (INR),Currency,Employer,Job,Category,Razorpay order id,Razorpay payment id,Featured from (UTC),Featured until (UTC),Needs review');
    assert.strictEqual(L.length - 1, 6); // 3 paid + pending + failed + created, all inside 90 days
    const rows = L.slice(1).map((l) => l.split(','));
    const revenueRows = rows.filter((c) => c[3] === 'Yes');
    assert.ok(revenueRows.length === 3 && revenueRows.every((c) => c[2] === 'paid'));
    assert.strictEqual(revenueRows.reduce((n, c) => n + Number(c[4]), 0), 1297); // INR 1,297.00 = confirmed payments only
    assert.ok(rows.filter((c) => c[3] === 'No').every((c) => ['pending', 'failed', 'created'].includes(c[2])));
    assert.ok(!p.text.includes('@itest.example') && !/password|secret|token/i.test(p.text)); // employer NAME only, no email, no credentials
    const paid = await call('/api/admin/analytics/export/payments.csv?range=90d&category=Data%20Science&paymentStatus=paid', { who: 'admin' });
    assert.strictEqual(lines(paid.text).length - 1, 3);

    const s = await call('/api/admin/analytics/export/summary.csv?range=30d&category=Data%20Science', { who: 'admin' });
    const SL = lines(s.text);
    assert.strictEqual(SL[0], 'Day (UTC),New candidates,New employers,Jobs posted,Applications,Successful payments,Revenue (INR)');
    assert.strictEqual(SL.length - 1, 30);
    assert.strictEqual(SL.slice(1).reduce((n, l) => n + Number(l.split(',')[6]), 0), 798); // INR 798.00 in 30 days
    assert.strictEqual(SL.find((l) => l.startsWith(dayStr(3))).split(',')[6], '299.00');
    const j = await call('/api/admin/analytics/export/jobs.csv?range=12m&category=Data%20Science', { who: 'admin' });
    assert.strictEqual(lines(j.text).length - 1, 4);
    assert.ok(lines(j.text).find((l) => l.includes('Featured DS')).endsWith(',3,1,Yes'));
    for (const path of ['payments', 'summary', 'jobs']) for (const who of ['e1', 'c1', undefined]) assert.ok([401, 403].includes((await call(`/api/admin/analytics/export/${path}.csv`, { who })).status), `${path} ${who}`);
    assert.strictEqual((await call('/api/admin/analytics/export/payments.csv?paymentStatus=refunded', { who: 'admin' })).status, 400);
  });

  test('existing admin analytics endpoints and dashboards still work', async () => {
    assert.strictEqual((await call('/api/admin/analytics/applications?days=30', { who: 'admin' })).status, 200);
    assert.strictEqual((await call('/api/admin/stats', { who: 'admin' })).status, 200);
    assert.strictEqual((await call('/api/admin/payments/summary', { who: 'admin' })).status, 200);
    assert.strictEqual((await call('/api/dashboard/employer', { who: 'e1' })).status, 200);
    assert.strictEqual((await call('/api/dashboard/candidate', { who: 'c1' })).status, 200);
  });
});
