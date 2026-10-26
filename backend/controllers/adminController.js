const User = require('../models/User');
const Job = require('../models/Job');
const Application = require('../models/Application');
const AuditLog = require('../models/AuditLog');
const AppError = require('../utils/AppError');
const { escapeRegex } = require('../utils/regex');
const { recordAudit } = require('../services/audit');
const v = require('../validators/adminValidator');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, message, data, extra = {}) => res.json({ success: true, message, data, ...extra });
const pagination = (page, limit, total) => ({ page, limit, total, pages: Math.ceil(total / limit) });
const daysAgo = (n) => new Date(Date.now() - n * 864e5);
// Accounts created before moderation existed have no status field: they count as active.
const ACTIVE_FILTER = { $ne: 'suspended' };

/* ---------------- dashboard ---------------- */
exports.getStats = asyncHandler(async (_req, res) => {
  const week = daysAgo(7);
  const [userAgg, jobAgg, appAgg, flaggedJobs, newUsers, newApps, lastUsers, lastJobs, lastApps, lastAudit] = await Promise.all([
    User.aggregate([{ $group: { _id: { role: '$role', status: { $ifNull: ['$status', 'active'] } }, count: { $sum: 1 } } }]),
    Job.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Job.countDocuments({ 'moderation.status': 'flagged' }),
    User.countDocuments({ createdAt: { $gte: week } }),
    Application.countDocuments({ createdAt: { $gte: week } }),
    User.find().sort({ createdAt: -1 }).limit(5).select('name role createdAt').lean(),
    Job.find().sort({ createdAt: -1 }).limit(5).select('title company createdAt').lean(),
    Application.find().sort({ createdAt: -1 }).limit(5).select('jobId createdAt').populate('jobId', 'title').lean(),
    AuditLog.find().sort({ createdAt: -1 }).limit(5).populate('adminId', 'name').lean(),
  ]);

  const users = { total: 0, candidates: 0, employers: 0, admins: 0, suspended: 0 };
  for (const { _id, count } of userAgg) {
    users.total += count;
    if (_id.role === 'candidate') users.candidates += count;
    if (_id.role === 'employer') users.employers += count;
    if (_id.role === 'admin') users.admins += count;
    if (_id.status === 'suspended') users.suspended += count;
  }
  const jobs = { total: 0, active: 0, closed: 0, flagged: flaggedJobs };
  for (const { _id, count } of jobAgg) { jobs.total += count; if (_id === 'active') jobs.active = count; if (_id === 'closed') jobs.closed = count; }
  const applications = { total: appAgg.reduce((n, a) => n + a.count, 0), byStatus: Object.fromEntries(appAgg.map((a) => [a._id, a.count])) };

  // Recent activity avoids personal details: applications show only the job title, never the candidate.
  const recentActivity = [
    ...lastUsers.map((u) => ({ type: 'user', at: u.createdAt, text: `${u.name} joined as ${u.role}` })),
    ...lastJobs.map((j) => ({ type: 'job', at: j.createdAt, text: `${j.company} posted "${j.title}"` })),
    ...lastApps.map((a) => ({ type: 'application', at: a.createdAt, text: `New application for "${a.jobId?.title ?? 'a removed job'}"` })),
    ...lastAudit.map((l) => ({ type: 'admin', at: l.createdAt, text: `${l.adminId?.name ?? 'An admin'}: ${l.action.replace(/_/g, ' ').toLowerCase()}` })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 12);

  ok(res, 'Stats retrieved', { users, jobs, applications, last7Days: { newUsers, newApplications: newApps }, recentActivity });
});

/* ---------------- users ---------------- */
exports.listUsers = asyncHandler(async (req, res) => {
  const { page, limit, search, role, status } = v.listUsersQuery.parse(req.query);
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status === 'suspended' ? 'suspended' : ACTIVE_FILTER;
  if (search) { const rx = new RegExp(escapeRegex(search), 'i'); filter.$or = [{ name: rx }, { email: rx }]; }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  ok(res, 'Users retrieved', users.map(({ password, __v, ...u }) => ({ ...u, status: u.status || 'active' })), { pagination: pagination(page, limit, total) });
});

exports.getUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw new AppError('User not found', 404);
  const { password, __v, ...safe } = user;
  const [jobs, activeJobs, applications, history] = await Promise.all([
    Job.countDocuments({ employerId: user._id }),
    Job.countDocuments({ employerId: user._id, status: 'active' }),
    Application.countDocuments({ candidateId: user._id }),
    AuditLog.find({ targetType: 'user', targetId: user._id }).sort({ createdAt: -1 }).limit(10).populate('adminId', 'name').lean(),
  ]);
  ok(res, 'User retrieved', { ...safe, status: safe.status || 'active', stats: { jobs, activeJobs, applications }, history });
});

exports.setUserStatus = asyncHandler(async (req, res) => {
  const { status, reason } = v.userStatusBody.parse(req.body);
  const target = await User.findById(req.params.id);
  if (!target) throw new AppError('User not found', 404);
  if (String(target._id) === req.user.id) throw new AppError('You cannot change the status of your own account', 400);
  if (target.role === 'admin') throw new AppError('Admin accounts cannot be suspended here', 403);
  const previous = target.status || 'active';
  if (previous === status) throw new AppError(`Account is already ${status}`, 409);

  target.status = status;
  target.statusReason = reason;
  target.statusChangedAt = new Date();
  target.statusChangedBy = req.user.id;
  await target.save();
  await recordAudit(req, {
    action: status === 'suspended' ? 'USER_SUSPENDED' : 'USER_REACTIVATED',
    targetType: 'user', targetId: target._id, reason,
    metadata: { role: target.role, previousStatus: previous },
  });
  ok(res, status === 'suspended' ? 'Account suspended' : 'Account reactivated', { _id: target._id, status: target.status });
});

/* ---------------- jobs ---------------- */
exports.listJobs = asyncHandler(async (req, res) => {
  const { page, limit, search, category, status, moderation } = v.listJobsQuery.parse(req.query);
  const filter = {};
  if (category) filter.nicheCategory = category;
  if (status) filter.status = status;
  if (moderation) filter['moderation.status'] = moderation === 'none' ? { $nin: ['flagged', 'removed'] } : moderation;
  if (search) { const rx = new RegExp(escapeRegex(search), 'i'); filter.$or = [{ title: rx }, { company: rx }]; }
  const [jobs, total] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .select('title company nicheCategory location status moderation createdAt employerId').populate('employerId', 'name email status').lean(),
    Job.countDocuments(filter),
  ]);
  const counts = await Application.aggregate([{ $match: { jobId: { $in: jobs.map((j) => j._id) } } }, { $group: { _id: '$jobId', n: { $sum: 1 } } }]);
  const byJob = new Map(counts.map((c) => [String(c._id), c.n]));
  ok(res, 'Jobs retrieved', jobs.map((j) => ({ ...j, moderation: { status: 'none', ...j.moderation }, applications: byJob.get(String(j._id)) || 0 })), { pagination: pagination(page, limit, total) });
});

const TRANSITIONS = {
  flag: { from: ['none'], action: 'JOB_FLAGGED' },
  unflag: { from: ['flagged'], action: 'JOB_UNFLAGGED' },
  remove: { from: ['none', 'flagged'], action: 'JOB_REMOVED' },
  restore: { from: ['removed'], action: 'JOB_RESTORED' },
};

exports.moderateJob = asyncHandler(async (req, res) => {
  const { action, reason } = v.jobModerationBody.parse(req.body);
  const job = await Job.findById(req.params.id);
  if (!job) throw new AppError('Job not found', 404);
  const current = job.moderation?.status || 'none';
  const rule = TRANSITIONS[action];
  if (!rule.from.includes(current)) throw new AppError(`Cannot ${action} a job whose moderation status is "${current}"`, 409);
  const previousStatus = job.status;

  if (action === 'flag') job.moderation = { status: 'flagged', reason, at: new Date(), by: req.user.id };
  if (action === 'unflag' || action === 'restore') job.moderation = { status: 'none', reason, at: new Date(), by: req.user.id };
  if (action === 'remove') { job.status = 'closed'; job.moderation = { status: 'removed', reason, at: new Date(), by: req.user.id }; }
  if (action === 'restore') job.status = 'active';
  await job.save();

  await recordAudit(req, { action: rule.action, targetType: 'job', targetId: job._id, reason, metadata: { title: job.title, company: job.company, previousStatus } });
  ok(res, 'Job updated', { _id: job._id, status: job.status, moderation: job.moderation });
});

/* ---------------- application analytics (aggregates only: no resumes, no personal data) ---------------- */
exports.applicationAnalytics = asyncHandler(async (req, res) => {
  const { days } = v.analyticsQuery.parse(req.query);
  const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - (days - 1));

  const [total, byStatus, byCategory, trend, topJobs, scoreAgg] = await Promise.all([
    Application.countDocuments(),
    Application.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.aggregate([
      { $lookup: { from: Job.collection.name, localField: 'jobId', foreignField: '_id', as: 'job' } },
      { $unwind: '$job' },
      { $group: { _id: '$job.nicheCategory', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Application.aggregate([
      { $match: { createdAt: { $gte: start } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
    ]),
    Application.aggregate([
      { $group: { _id: '$jobId', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 },
      { $lookup: { from: Job.collection.name, localField: '_id', foreignField: '_id', as: 'job' } }, { $unwind: '$job' },
      { $project: { _id: 1, count: 1, title: '$job.title', company: '$job.company' } },
    ]),
    Application.aggregate([{ $match: { matchStatus: 'scored' } }, { $group: { _id: null, avg: { $avg: '$matchScore' }, n: { $sum: 1 } } }]),
  ]);

  const counts = new Map(trend.map((t) => [t._id, t.count]));
  const series = Array.from({ length: days }, (_, i) => {
    const d = new Date(start); d.setUTCDate(start.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    return { date: key, count: counts.get(key) || 0 };
  });

  ok(res, 'Analytics retrieved', {
    total,
    byStatus: ['Applied', 'Shortlisted', 'Rejected'].map((s) => ({ status: s, count: byStatus.find((x) => x._id === s)?.count || 0 })),
    byCategory: byCategory.map((c) => ({ category: c._id, count: c.count })),
    trend: { days, series, total: series.reduce((n, p) => n + p.count, 0) },
    topJobs: topJobs.map((j) => ({ jobId: j._id, title: j.title, company: j.company, count: j.count })),
    averageMatchScore: scoreAgg[0] ? Math.round(scoreAgg[0].avg) : null,
  });
});

/* ---------------- audit log ---------------- */
exports.listAuditLogs = asyncHandler(async (req, res) => {
  const { page, limit, action, targetType } = v.auditQuery.parse(req.query);
  const filter = {};
  if (action) filter.action = action;
  if (targetType) filter.targetType = targetType;
  const [logs, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('adminId', 'name email').lean(),
    AuditLog.countDocuments(filter),
  ]);
  ok(res, 'Audit log retrieved', logs.map(({ ip, __v, ...l }) => l), { pagination: pagination(page, limit, total) });
});
