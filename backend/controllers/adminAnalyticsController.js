// Platform-wide analytics for admins. Aggregates only; exports contain no emails, passwords, tokens or resumes.
const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Payment = require('../models/Payment');
const { parseRange, bucketExpr, fillSeries, rangeInfo } = require('../utils/dateRange');
const { featuredActiveExpr, isFeaturedActive } = require('../utils/featured');
const { sendCsv, inr } = require('../utils/csv');
const v = require('../validators/analyticsValidator');

const asyncHandler = require('../utils/asyncHandler');
const STATUSES = ['Applied', 'Shortlisted', 'Rejected'];
const EXPORT_LIMIT = 10000;
const respond = (res, message, data) => { res.set('Cache-Control', 'no-store'); res.json({ success: true, message, data }); };
const r1 = (n) => Math.round(n * 10) / 10;

// Category / job-status filters select a set of jobs; applications and payments are then limited to those jobs.
async function jobScope({ category, jobStatus }) {
  const jobMatch = {};
  if (category) jobMatch.nicheCategory = category;
  if (jobStatus) jobMatch.status = jobStatus;
  const scoped = !!(category || jobStatus);
  const jobIds = scoped ? await Job.find(jobMatch).distinct('_id') : null;
  return { jobMatch, scoped, jobIds };
}

// GET /api/admin/analytics/platform
exports.platform = asyncHandler(async (req, res) => {
  const q = v.platformQuery.parse(req.query);
  const r = parseRange(q);
  const now = new Date();
  const inRange = { $gte: r.from, $lte: r.to };
  const { jobMatch, scoped, jobIds } = await jobScope(q);

  const appBase = { ...(scoped && { jobId: { $in: jobIds } }), ...(q.applicationStatus && { status: q.applicationStatus }) };
  const payBase = scoped ? { jobId: { $in: jobIds } } : {};
  const regMatch = { createdAt: inRange, role: { $in: ['candidate', 'employer'] } }; // admins are not "registrations"

  const [usersAll, jobsAll, appsTotal, featuredEverIds, featuredActiveNow, payAll, newUsers, jobsPosted, appsPeriod, payPeriod,
    regSeries, jobSeries, appSeries, paySeries, jobsByCat, appsByJobPeriod, appsByStatus, perJobApps, allJobsLite] = await Promise.all([
    User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    Job.aggregate([{ $match: jobMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.countDocuments(appBase),
    Payment.distinct('jobId', { ...payBase, status: 'paid', activatedAt: { $exists: true } }),
    Job.countDocuments({ ...jobMatch, isFeatured: true, $expr: featuredActiveExpr(now) }),
    Payment.aggregate([{ $match: { ...payBase, status: 'paid' } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    User.aggregate([{ $match: regMatch }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
    Job.countDocuments({ ...jobMatch, createdAt: inRange }),
    Application.countDocuments({ ...appBase, createdAt: inRange }),
    Payment.aggregate([{ $match: { ...payBase, status: 'paid', verifiedAt: inRange } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]), // revenue = confirmed payments only
    User.aggregate([{ $match: regMatch }, { $group: { _id: bucketExpr(r.granularity), candidates: { $sum: { $cond: [{ $eq: ['$role', 'candidate'] }, 1, 0] } }, employers: { $sum: { $cond: [{ $eq: ['$role', 'employer'] }, 1, 0] } } } }]),
    Job.aggregate([{ $match: { ...jobMatch, createdAt: inRange } }, { $group: { _id: bucketExpr(r.granularity), count: { $sum: 1 } } }]),
    Application.aggregate([{ $match: { ...appBase, createdAt: inRange } }, { $group: { _id: bucketExpr(r.granularity), count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { ...payBase, status: 'paid', verifiedAt: inRange } }, { $group: { _id: bucketExpr(r.granularity, '$verifiedAt'), amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Job.aggregate([{ $match: { ...jobMatch, createdAt: inRange } }, { $group: { _id: '$nicheCategory', count: { $sum: 1 } } }]),
    Application.aggregate([{ $match: { ...appBase, createdAt: inRange } }, { $group: { _id: '$jobId', count: { $sum: 1 } } }]), // grouped per job; mapped to categories below (cheaper than a $lookup per application)
    Application.aggregate([{ $match: { ...appBase, createdAt: inRange } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.aggregate([{ $match: appBase }, { $group: { _id: '$jobId', n: { $sum: 1 } } }]),
    Job.find(jobMatch).select('createdAt nicheCategory').lean(),
  ]);

  const role = (rows, k) => rows.find((x) => x._id === k)?.count || 0;
  const status = (rows, k) => rows.find((x) => x._id === k)?.count || 0;

  // Featured vs not featured (all-time, within the chosen filters). Observational only.
  const ever = new Set(featuredEverIds.map(String));
  const appsOf = new Map(perJobApps.map((p) => [String(p._id), p.n]));
  const split = (isFeatured) => {
    const list = allJobsLite.filter((j) => ever.has(String(j._id)) === isFeatured);
    const apps = list.reduce((n, j) => n + (appsOf.get(String(j._id)) || 0), 0);
    return { jobs: list.length, applications: apps, avgApplicationsPerJob: list.length ? r1(apps / list.length) : null };
  };

  const categoryOf = new Map(allJobsLite.map((j) => [String(j._id), j.nicheCategory]));
  const appsByCat = [];
  for (const row of appsByJobPeriod) { const c = categoryOf.get(String(row._id)); if (!c) continue; const hit = appsByCat.find((x) => x._id === c); if (hit) hit.count += row.count; else appsByCat.push({ _id: c, count: row.count }); }

  const categories = [...new Set([...jobsByCat.map((c) => c._id), ...appsByCat.map((c) => c._id)])].map((c) => ({ category: c, jobs: role(jobsByCat, c), applications: role(appsByCat, c) })).sort((a, b) => b.applications - a.applications || b.jobs - a.jobs);

  const regs = fillSeries(r.buckets, regSeries, ['candidates', 'employers']);
  respond(res, 'Platform analytics retrieved', {
    range: rangeInfo(r),
    filters: { category: q.category || null, jobStatus: q.jobStatus || null, applicationStatus: q.applicationStatus || null },
    totals: {
      users: { total: usersAll.reduce((n, u) => n + u.count, 0), candidates: role(usersAll, 'candidate'), employers: role(usersAll, 'employer'), admins: role(usersAll, 'admin') },
      jobs: { total: status(jobsAll, 'active') + status(jobsAll, 'closed'), active: status(jobsAll, 'active'), closed: status(jobsAll, 'closed') },
      applications: appsTotal,
      featured: { jobsEver: ever.size, activeNow: featuredActiveNow },
      payments: { successful: payAll[0]?.count || 0, revenue: payAll[0]?.amount || 0, currency: 'INR' },
    },
    period: {
      newRegistrations: { total: role(newUsers, 'candidate') + role(newUsers, 'employer'), candidates: role(newUsers, 'candidate'), employers: role(newUsers, 'employer') },
      jobsPosted, applications: appsPeriod, successfulPayments: payPeriod[0]?.count || 0, revenue: payPeriod[0]?.amount || 0,
      registrations: regs,
      jobs: fillSeries(r.buckets, jobSeries, ['count']),
      applicationsSeries: fillSeries(r.buckets, appSeries, ['count']),
      revenueSeries: fillSeries(r.buckets, paySeries, ['amount', 'count']),
      categories,
      applicationsByStatus: STATUSES.map((s) => ({ status: s, count: status(appsByStatus, s) })),
    },
    featuredStats: { activeNow: featuredActiveNow, jobsEver: ever.size, share: allJobsLite.length ? r1((ever.size / allJobsLite.length) * 100) : null, purchasesInRange: payPeriod[0]?.count || 0, revenueInRange: payPeriod[0]?.amount || 0, comparison: { featured: split(true), notFeatured: split(false) } },
    notes: { scope: 'Category and job-status filters apply to jobs, applications, featured stats and revenue. User registrations are not tied to a category.', niches: 'In NicheHire a niche is a job category, so one category filter covers both.', timezone: 'All dates are UTC.' },
  });
});

/* ----- exports (admin only: mounted behind the admin guard) ----- */
// Payment report: all statuses in the date range (createdAt) so admins can reconcile; "Counts as revenue" is Yes only for paid.
exports.paymentsCsv = asyncHandler(async (req, res) => {
  const q = v.adminExportQuery.parse(req.query);
  const r = parseRange(q);
  const { scoped, jobIds } = await jobScope(q);
  const filter = { createdAt: { $gte: r.from, $lte: r.to }, ...(q.paymentStatus && { status: q.paymentStatus }), ...(scoped && { jobId: { $in: jobIds } }) };
  const rows = await Payment.find(filter).sort({ createdAt: -1 }).limit(EXPORT_LIMIT + 1)
    .populate('employerId', 'name').populate('jobId', 'title nicheCategory').lean(); // employer NAME only: no email
  const truncated = rows.length > EXPORT_LIMIT;
  sendCsv(res, `payments_${r.from.toISOString().slice(0, 10)}_to_${r.to.toISOString().slice(0, 10)}.csv`,
    ['Created (UTC)', 'Confirmed (UTC)', 'Status', 'Counts as revenue', 'Amount (INR)', 'Currency', 'Employer', 'Job', 'Category', 'Razorpay order id', 'Razorpay payment id', 'Featured from (UTC)', 'Featured until (UTC)', 'Needs review'],
    rows.slice(0, EXPORT_LIMIT).map((p) => [p.createdAt, p.verifiedAt, p.status, p.status === 'paid' ? 'Yes' : 'No', inr(p.amount), p.currency, p.employerId?.name, p.jobId?.title, p.jobId?.nicheCategory, p.razorpayOrderId, p.razorpayPaymentId, p.featuredStartsAt, p.featuredEndsAt, p.activationNote ? 'Yes' : 'No']), { truncated });
});

// One row per period: the numbers behind the platform charts.
exports.summaryCsv = asyncHandler(async (req, res) => {
  const q = v.adminExportQuery.parse(req.query);
  const r = parseRange(q);
  const { scoped, jobIds } = await jobScope(q);
  const inRange = { $gte: r.from, $lte: r.to };
  const [regs, jobs, apps, pay] = await Promise.all([
    User.aggregate([{ $match: { createdAt: inRange, role: { $in: ['candidate', 'employer'] } } }, { $group: { _id: bucketExpr(r.granularity), candidates: { $sum: { $cond: [{ $eq: ['$role', 'candidate'] }, 1, 0] } }, employers: { $sum: { $cond: [{ $eq: ['$role', 'employer'] }, 1, 0] } } } }]),
    Job.aggregate([{ $match: { createdAt: inRange, ...(q.category && { nicheCategory: q.category }) } }, { $group: { _id: bucketExpr(r.granularity), count: { $sum: 1 } } }]),
    Application.aggregate([{ $match: { createdAt: inRange, ...(scoped && { jobId: { $in: jobIds } }) } }, { $group: { _id: bucketExpr(r.granularity), count: { $sum: 1 } } }]),
    Payment.aggregate([{ $match: { status: 'paid', verifiedAt: inRange, ...(scoped && { jobId: { $in: jobIds } }) } }, { $group: { _id: bucketExpr(r.granularity, '$verifiedAt'), amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
  ]);
  const R = fillSeries(r.buckets, regs, ['candidates', 'employers']), J = fillSeries(r.buckets, jobs, ['count']), A = fillSeries(r.buckets, apps, ['count']), P = fillSeries(r.buckets, pay, ['amount', 'count']);
  sendCsv(res, `platform_summary_${r.from.toISOString().slice(0, 10)}_to_${r.to.toISOString().slice(0, 10)}.csv`,
    [r.granularity === 'day' ? 'Day (UTC)' : 'Month (UTC)', 'New candidates', 'New employers', 'Jobs posted', 'Applications', 'Successful payments', 'Revenue (INR)'],
    r.buckets.map((k, i) => [k, R[i].candidates, R[i].employers, J[i].count, A[i].count, P[i].count, inr(P[i].amount)]));
});

exports.jobsCsv = asyncHandler(async (req, res) => {
  const q = v.adminExportQuery.parse(req.query);
  const r = parseRange(q);
  const now = new Date();
  const jobs = await Job.find({ createdAt: { $gte: r.from, $lte: r.to }, ...(q.category && { nicheCategory: q.category }) }).sort({ createdAt: -1 }).limit(EXPORT_LIMIT + 1)
    .select('title company status createdAt nicheCategory moderation isFeatured featuredUntil featuredPaymentId').lean();
  const truncated = jobs.length > EXPORT_LIMIT;
  const list = jobs.slice(0, EXPORT_LIMIT);
  const ids = list.map((j) => j._id);
  const stats = ids.length ? await Application.aggregate([{ $match: { jobId: { $in: ids } } }, { $group: { _id: '$jobId', total: { $sum: 1 }, shortlisted: { $sum: { $cond: [{ $eq: ['$status', 'Shortlisted'] }, 1, 0] } } } }]) : [];
  const s = new Map(stats.map((x) => [String(x._id), x]));
  sendCsv(res, `jobs_${r.from.toISOString().slice(0, 10)}_to_${r.to.toISOString().slice(0, 10)}.csv`,
    ['Posted (UTC)', 'Job', 'Company', 'Category', 'Status', 'Moderation', 'Applications', 'Shortlisted', 'Featured now'],
    list.map((j) => [j.createdAt, j.title, j.company, j.nicheCategory, j.status, j.moderation?.status || 'none', s.get(String(j._id))?.total || 0, s.get(String(j._id))?.shortlisted || 0, isFeaturedActive(j, now) ? 'Yes' : 'No']), { truncated });
});
