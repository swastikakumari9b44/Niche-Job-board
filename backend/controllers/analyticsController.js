// Employer and candidate analytics. Every query is scoped to the signed-in account (jobs by employerId, applications by
// those jobs or by candidateId), so one user can never see another user's numbers.
const mongoose = require('mongoose');
const Job = require('../models/Job');
const Application = require('../models/Application');
const Payment = require('../models/Payment');
const AppError = require('../utils/AppError');
const { parseRange, bucketExpr, fillSeries, rangeInfo, DAY } = require('../utils/dateRange');
const { isFeaturedActive } = require('../utils/featured');
const { sendCsv, inr } = require('../utils/csv');
const v = require('../validators/analyticsValidator');

const asyncHandler = require('../utils/asyncHandler');
const oid = (id) => new mongoose.Types.ObjectId(String(id));
const STATUSES = ['Applied', 'Shortlisted', 'Rejected'];
const EXPORT_LIMIT = 10000;
const respond = (res, message, data) => { res.set('Cache-Control', 'no-store'); res.json({ success: true, message, data }); };
const statusCounts = (rows) => Object.fromEntries(STATUSES.map((s) => [s, rows.find((r) => r._id === s)?.count || 0]));
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null); // one decimal, null when undefined (never a fake 0%)
const sumStatuses = (c) => c.Applied + c.Shortlisted + c.Rejected;

// Per-status counters used inside $group stages.
const statusSums = () => Object.fromEntries(STATUSES.map((s) => [s, { $sum: { $cond: [{ $eq: ['$status', s] }, 1, 0] } }]));
const scoredAvg = () => ({ matchSum: { $sum: { $cond: [{ $eq: ['$matchStatus', 'scored'] }, '$matchScore', 0] } }, scored: { $sum: { $cond: [{ $eq: ['$matchStatus', 'scored'] }, 1, 0] } } });
const avgScore = (sum, n) => (n ? Math.round(sum / n) : null); // only resumes that could be scored

/* ===================== EMPLOYER ===================== */
exports.employerOverview = asyncHandler(async (req, res) => {
  const q = v.employerQuery.parse(req.query);
  const r = parseRange(q);
  const employerId = oid(req.user.id);
  const now = new Date();

  const jobs = await Job.find({ employerId }).select('title status createdAt nicheCategory isFeatured featuredUntil featuredPaymentId moderation').lean();
  const jobIds = jobs.map((j) => j._id);
  const hasJobs = jobIds.length > 0;
  const inRange = { $gte: r.from, $lte: r.to };

  const [allByStatus, allByJob, period, pay] = await Promise.all([
    hasJobs ? Application.aggregate([{ $match: { jobId: { $in: jobIds } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]) : [],
    hasJobs ? Application.aggregate([{ $match: { jobId: { $in: jobIds } } }, { $group: { _id: '$jobId', total: { $sum: 1 }, ...statusSums(), ...scoredAvg() } }]) : [],
    hasJobs ? Application.aggregate([
      { $match: { jobId: { $in: jobIds }, createdAt: inRange } },
      { $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        series: [{ $group: { _id: bucketExpr(r.granularity), total: { $sum: 1 }, ...statusSums(), candidates: { $addToSet: '$candidateId' } } }, { $project: { total: 1, Applied: 1, Shortlisted: 1, Rejected: 1, uniqueCandidates: { $size: '$candidates' } } }],
        byJob: [{ $group: { _id: '$jobId', total: { $sum: 1 }, ...statusSums() } }],
        candidates: [{ $group: { _id: '$candidateId' } }, { $count: 'n' }],
      } },
    ]) : [{ byStatus: [], series: [], byJob: [], candidates: [] }],
    Payment.aggregate([
      { $match: { employerId, status: 'paid' } }, // only confirmed payments count as spend
      { $facet: {
        all: [{ $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }],
        inRange: [{ $match: { verifiedAt: inRange } }, { $group: { _id: null, amount: { $sum: '$amount' }, count: { $sum: 1 } } }],
        series: [{ $match: { verifiedAt: inRange } }, { $group: { _id: bucketExpr(r.granularity, '$verifiedAt'), amount: { $sum: '$amount' }, count: { $sum: 1 } } }],
        featuredJobs: [{ $match: { activatedAt: { $exists: true } } }, { $group: { _id: '$jobId' } }],
      } },
    ]),
  ]);
  const P = period[0], PAY = pay[0];

  const featuredEver = new Set(PAY.featuredJobs.map((j) => String(j._id)));
  const totalsByJob = new Map(allByJob.map((j) => [String(j._id), j]));
  const rangeByJob = new Map(P.byJob.map((j) => [String(j._id), j]));
  const all = statusCounts(allByStatus);

  // One row per job: all-time performance (fair comparison) plus what happened inside the selected range.
  const jobRows = jobs.map((j) => {
    const t = totalsByJob.get(String(j._id)) || { total: 0, Applied: 0, Shortlisted: 0, Rejected: 0, matchSum: 0, scored: 0 };
    const inR = rangeByJob.get(String(j._id));
    const daysLive = Math.max(1, Math.floor((now - j.createdAt) / DAY));
    return {
      jobId: j._id, title: j.title, category: j.nicheCategory, status: j.status, postedAt: j.createdAt, daysLive,
      featuredEver: featuredEver.has(String(j._id)), featuredActive: isFeaturedActive(j, now),
      applications: t.total, applicationsInRange: inR?.total || 0, pending: t.Applied, shortlisted: t.Shortlisted, rejected: t.Rejected,
      shortlistRate: pct(t.Shortlisted, t.total), avgMatchScore: avgScore(t.matchSum, t.scored), applicationsPerWeek: Math.round((t.total / daysLive) * 7 * 10) / 10,
    };
  }).sort((a, b) => b.applicationsInRange - a.applicationsInRange || b.applications - a.applications);

  // Featured vs not featured. Observational: promoted jobs may differ from others in other ways too.
  const group = (rows) => {
    const apps = rows.reduce((n, j) => n + j.applications, 0), liveDays = rows.reduce((n, j) => n + j.daysLive, 0);
    return { jobs: rows.length, applications: apps, avgApplicationsPerJob: rows.length ? Math.round((apps / rows.length) * 10) / 10 : null, applicationsPerWeekLive: liveDays ? Math.round((apps / liveDays) * 7 * 10) / 10 : null };
  };

  const byStatusPeriod = statusCounts(P.byStatus);
  respond(res, 'Employer analytics retrieved', {
    range: rangeInfo(r),
    totals: {
      jobs: jobs.length, activeJobs: jobs.filter((j) => j.status === 'active').length, closedJobs: jobs.filter((j) => j.status === 'closed').length,
      applications: sumStatuses(all), pending: all.Applied, shortlisted: all.Shortlisted, rejected: all.Rejected,
      featuredJobsEver: featuredEver.size, featuredActiveNow: jobs.filter((j) => isFeaturedActive(j, now)).length,
      promotionSpend: { amount: PAY.all[0]?.amount || 0, payments: PAY.all[0]?.count || 0, currency: 'INR' },
    },
    period: {
      applications: sumStatuses(byStatusPeriod), uniqueCandidates: P.candidates[0]?.n || 0, byStatus: byStatusPeriod,
      spend: { amount: PAY.inRange[0]?.amount || 0, payments: PAY.inRange[0]?.count || 0, currency: 'INR' },
      series: fillSeries(r.buckets, P.series, ['total', ...STATUSES, 'uniqueCandidates']),
      spendSeries: fillSeries(r.buckets, PAY.series, ['amount', 'count']),
      byJob: jobRows.filter((j) => j.applicationsInRange > 0).slice(0, 10).map((j) => ({ jobId: j.jobId, title: j.title, applications: j.applicationsInRange })),
    },
    jobs: jobRows.slice(0, 100), // pagination guard: an employer's own job list is small; capped for safety
    jobsTruncated: jobRows.length > 100,
    featuredComparison: { featured: group(jobRows.filter((j) => j.featuredEver)), notFeatured: group(jobRows.filter((j) => !j.featuredEver)) },
    notes: { statusModel: 'Statuses are Applied, Shortlisted and Rejected. There is no separate Accepted status.', views: 'Job views and clicks are not tracked, so they are not shown.' },
  });
});

// GET /api/analytics/employer/jobs/:id
exports.employerJob = asyncHandler(async (req, res) => {
  const q = v.employerJobQuery.parse(req.query);
  const now = new Date();
  const job = await Job.findById(req.params.id).select('title status createdAt nicheCategory location employerId isFeatured featuredUntil featuredPaymentId moderation').lean();
  if (!job || String(job.employerId) !== req.user.id) throw new AppError('Job not found', 404); // other employers' jobs look like "not found"
  const r = parseRange(q, now, { since: job.createdAt });

  const employerJobIds = (await Job.find({ employerId: job.employerId }).select('_id').lean()).map((j) => j._id);
  const [own, series, perJob, payments] = await Promise.all([
    Application.aggregate([{ $match: { jobId: job._id } }, { $group: { _id: null, total: { $sum: 1 }, ...statusSums(), ...scoredAvg(), lastAt: { $max: '$createdAt' } } }]),
    Application.aggregate([{ $match: { jobId: job._id, createdAt: { $gte: r.from, $lte: r.to } } }, { $group: { _id: bucketExpr(r.granularity), total: { $sum: 1 }, ...statusSums() } }]),
    Application.aggregate([{ $match: { jobId: { $in: employerJobIds } } }, { $group: { _id: '$jobId', total: { $sum: 1 } } }]),
    Payment.find({ jobId: job._id, employerId: job.employerId, status: 'paid' }).select('amount currency featuredStartsAt featuredEndsAt activatedAt verifiedAt').sort({ verifiedAt: -1 }).lean(),
  ]);
  const t = own[0] || { total: 0, Applied: 0, Shortlisted: 0, Rejected: 0, matchSum: 0, scored: 0 };
  const daysLive = Math.max(0, Math.floor((now - job.createdAt) / DAY));

  // Comparison with the same employer's other jobs (all-time application counts).
  const counts = new Map(perJob.map((p) => [String(p._id), p.total]));
  const totals = employerJobIds.map((id) => counts.get(String(id)) || 0);
  const others = employerJobIds.filter((id) => String(id) !== String(job._id)).map((id) => counts.get(String(id)) || 0);
  const comparison = others.length === 0 ? null : {
    otherJobs: others.length,
    averageApplicationsOtherJobs: Math.round((others.reduce((a, b) => a + b, 0) / others.length) * 10) / 10,
    thisJobApplications: t.total,
    rank: 1 + totals.filter((n) => n > t.total).length, // 1 = most applications
    outOf: totals.length,
  };

  respond(res, 'Job analytics retrieved', {
    range: rangeInfo(r),
    job: { _id: job._id, title: job.title, category: job.nicheCategory, location: job.location, status: job.status, postedAt: job.createdAt, daysLive, featuredActive: isFeaturedActive(job, now), featuredUntil: isFeaturedActive(job, now) ? job.featuredUntil : null, promotions: payments.map((p) => ({ amount: p.amount, currency: p.currency, from: p.featuredStartsAt, until: p.featuredEndsAt, paidAt: p.verifiedAt })) },
    applications: { total: t.total, byStatus: { Applied: t.Applied, Shortlisted: t.Shortlisted, Rejected: t.Rejected }, shortlistRate: pct(t.Shortlisted, t.total), avgMatchScore: avgScore(t.matchSum, t.scored), lastApplicationAt: t.lastAt || null, perWeekLive: Math.round((t.total / Math.max(1, daysLive)) * 7 * 10) / 10 },
    series: fillSeries(r.buckets, series, ['total', ...STATUSES]),
    seriesTotal: series.reduce((n, s) => n + s.total, 0),
    comparison,
  });
});

/* ----- exports (employer) ----- */
// Application report: candidate NAME, status and skill match only. No email, phone, resume or internal ids.
exports.employerApplicationsCsv = asyncHandler(async (req, res) => {
  const q = v.employerExportQuery.parse(req.query);
  const r = parseRange(q);
  const jobFilter = { employerId: req.user.id, ...(q.jobId && { _id: q.jobId }) };
  const jobs = await Job.find(jobFilter).select('title nicheCategory').lean();
  if (q.jobId && !jobs.length) throw new AppError('Job not found', 404);
  const byId = new Map(jobs.map((j) => [String(j._id), j]));
  const rows = await Application.find({ jobId: { $in: jobs.map((j) => j._id) }, createdAt: { $gte: r.from, $lte: r.to } }).sort({ createdAt: -1 }).limit(EXPORT_LIMIT + 1).select('jobId candidateName status matchStatus matchScore createdAt updatedAt').lean();
  const truncated = rows.length > EXPORT_LIMIT;
  sendCsv(res, `applications_${r.from.toISOString().slice(0, 10)}_to_${r.to.toISOString().slice(0, 10)}.csv`,
    ['Applied on (UTC)', 'Job', 'Category', 'Candidate name', 'Status', 'Skill match %', 'Status last changed (UTC)'],
    rows.slice(0, EXPORT_LIMIT).map((a) => [a.createdAt, byId.get(String(a.jobId))?.title, byId.get(String(a.jobId))?.nicheCategory, a.candidateName, a.status, a.matchStatus === 'scored' ? a.matchScore : '', a.updatedAt]), { truncated });
});

exports.employerJobsCsv = asyncHandler(async (req, res) => {
  const q = v.employerQuery.parse(req.query);
  const r = parseRange(q);
  const now = new Date();
  const jobs = await Job.find({ employerId: req.user.id, createdAt: { $gte: r.from, $lte: r.to } }).sort({ createdAt: -1 }).limit(EXPORT_LIMIT).select('title status createdAt nicheCategory location isFeatured featuredUntil featuredPaymentId moderation').lean();
  const ids = jobs.map((j) => j._id);
  const [stats, paid] = await Promise.all([
    ids.length ? Application.aggregate([{ $match: { jobId: { $in: ids } } }, { $group: { _id: '$jobId', total: { $sum: 1 }, ...statusSums(), ...scoredAvg() } }]) : [],
    ids.length ? Payment.aggregate([{ $match: { employerId: oid(req.user.id), jobId: { $in: ids }, status: 'paid' } }, { $group: { _id: '$jobId', amount: { $sum: '$amount' } } }]) : [],
  ]);
  const s = new Map(stats.map((x) => [String(x._id), x])), p = new Map(paid.map((x) => [String(x._id), x.amount]));
  sendCsv(res, `job_performance_${r.from.toISOString().slice(0, 10)}_to_${r.to.toISOString().slice(0, 10)}.csv`,
    ['Posted on (UTC)', 'Job', 'Category', 'Location', 'Status', 'Days since posted', 'Applications', 'Pending', 'Shortlisted', 'Rejected', 'Shortlist rate %', 'Avg skill match %', 'Featured now', 'Promotion spend (INR)'],
    jobs.map((j) => { const t = s.get(String(j._id)) || { total: 0, Applied: 0, Shortlisted: 0, Rejected: 0, matchSum: 0, scored: 0 };
      return [j.createdAt, j.title, j.nicheCategory, j.location, j.status, Math.floor((now - j.createdAt) / DAY), t.total, t.Applied, t.Shortlisted, t.Rejected, pct(t.Shortlisted, t.total) ?? '', avgScore(t.matchSum, t.scored) ?? '', isFeaturedActive(j, now) ? 'Yes' : 'No', inr(p.get(String(j._id)))]; }));
});

/* ===================== CANDIDATE ===================== */
exports.candidateInsights = asyncHandler(async (req, res) => {
  const q = v.candidateQuery.parse(req.query);
  const r = parseRange(q);
  const candidateId = oid(req.user.id);
  const inRange = { $gte: r.from, $lte: r.to };

  const [allByStatus, period, recent] = await Promise.all([
    Application.aggregate([{ $match: { candidateId } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.aggregate([
      { $match: { candidateId, createdAt: inRange } },
      { $facet: {
        byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        series: [{ $group: { _id: bucketExpr(r.granularity), total: { $sum: 1 }, ...statusSums() } }],
        byCategory: [{ $lookup: { from: Job.collection.name, localField: 'jobId', foreignField: '_id', as: 'job' } }, { $unwind: '$job' }, { $group: { _id: '$job.nicheCategory', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
      } },
    ]),
    Application.find({ candidateId }).sort({ updatedAt: -1 }).limit(8).select('status createdAt updatedAt jobId').populate('jobId', 'title company').lean(),
  ]);
  const all = statusCounts(allByStatus), total = sumStatuses(all), P = period[0];
  const byStatus = statusCounts(P.byStatus);
  respond(res, 'Candidate insights retrieved', {
    range: rangeInfo(r),
    totals: { applications: total, pending: all.Applied, shortlisted: all.Shortlisted, rejected: all.Rejected, accepted: null, acceptedSupported: false, shortlistRate: pct(all.Shortlisted, total), responseRate: pct(all.Shortlisted + all.Rejected, total) },
    period: { applications: sumStatuses(byStatus), byStatus, series: fillSeries(r.buckets, P.series, ['total', ...STATUSES]), byCategory: P.byCategory.map((c) => ({ category: c._id, count: c.count })) },
    recentActivity: recent.map((a) => ({ _id: a._id, jobId: a.jobId?._id, jobTitle: a.jobId?.title ?? 'Job removed', company: a.jobId?.company, status: a.status, appliedAt: a.createdAt, updatedAt: a.updatedAt, statusChanged: +a.updatedAt - +a.createdAt > 1000 })),
    notes: { statusTrend: 'Status history is not recorded, so the status chart shows the CURRENT status of applications submitted in each period.' },
  });
});
