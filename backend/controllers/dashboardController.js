const mongoose = require('mongoose');
const Job = require('../models/Job');
const User = require('../models/User');
const Application = require('../models/Application');
const SavedJob = require('../models/SavedJob');
const { featuredActiveExpr } = require('../utils/featured');
const { profileCompletion } = require('../utils/profile');

const asyncHandler = require('../utils/asyncHandler');
const byStatus = (rows) => ({ Applied: 0, Shortlisted: 0, Rejected: 0, ...Object.fromEntries(rows.map((r) => [r._id, r.count])) });
const respond = (res, data) => { res.set('Cache-Control', 'no-store'); res.json({ success: true, message: 'Dashboard retrieved', data }); };

// GET /api/dashboard/candidate
exports.candidate = asyncHandler(async (req, res) => {
  const [user, statusRows, recent, saved] = await Promise.all([
    User.findById(req.user.id).lean(),
    Application.aggregate([{ $match: { candidateId: new mongoose.Types.ObjectId(req.user.id) } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.find({ candidateId: req.user.id }).sort({ createdAt: -1 }).limit(5).select('status createdAt jobId').populate('jobId', 'title company').lean(),
    SavedJob.countDocuments({ userId: req.user.id }),
  ]);
  const counts = byStatus(statusRows);
  respond(res, {
    stats: { total: counts.Applied + counts.Shortlisted + counts.Rejected, ...counts, saved },
    recentApplications: recent.map((a) => ({ _id: a._id, status: a.status, createdAt: a.createdAt, jobId: a.jobId?._id, jobTitle: a.jobId?.title ?? 'Job removed', company: a.jobId?.company })),
    profileCompletion: profileCompletion(user),
  });
});

// GET /api/dashboard/employer
exports.employer = asyncHandler(async (req, res) => {
  const now = new Date();
  const jobs = await Job.find({ employerId: req.user.id }).select('title status moderation isFeatured featuredUntil featuredPaymentId').lean();
  const jobIds = jobs.map((j) => j._id);
  const title = new Map(jobs.map((j) => [String(j._id), j.title]));
  const week = new Date(now.getTime() - 7 * 864e5);

  const [statusRows, last7, recent, featuredRows] = await Promise.all([
    Application.aggregate([{ $match: { jobId: { $in: jobIds } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Application.countDocuments({ jobId: { $in: jobIds }, createdAt: { $gte: week } }),
    Application.find({ jobId: { $in: jobIds } }).sort({ createdAt: -1 }).limit(6).select('candidateName status createdAt jobId matchScore matchStatus').lean(),
    Job.aggregate([{ $match: { employerId: new mongoose.Types.ObjectId(req.user.id), isFeatured: true } }, { $match: { $expr: featuredActiveExpr(now) } }, { $sort: { featuredUntil: 1 } }, { $project: { title: 1, featuredUntil: 1 } }]),
  ]);
  const counts = byStatus(statusRows);
  respond(res, {
    jobs: { total: jobs.length, active: jobs.filter((j) => j.status === 'active').length, closed: jobs.filter((j) => j.status === 'closed').length, featured: featuredRows.length },
    applications: { total: counts.Applied + counts.Shortlisted + counts.Rejected, last7Days: last7, awaitingReview: counts.Applied, ...counts },
    recentApplications: recent.map((a) => ({ _id: a._id, candidateName: a.candidateName, status: a.status, createdAt: a.createdAt, jobId: a.jobId, jobTitle: title.get(String(a.jobId)), matchScore: a.matchStatus === 'scored' ? a.matchScore : null })),
    featuredJobs: featuredRows.map((j) => ({ _id: j._id, title: j.title, featuredUntil: j.featuredUntil, daysLeft: Math.max(0, Math.ceil((j.featuredUntil - now) / 864e5)), expiresSoon: j.featuredUntil - now < 2 * 864e5 })),
  });
});
