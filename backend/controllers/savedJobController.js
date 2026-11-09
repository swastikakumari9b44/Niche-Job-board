const Job = require('../models/Job');
const SavedJob = require('../models/SavedJob');
const AppError = require('../utils/AppError');
const { isFeaturedActive } = require('../utils/featured');

const asyncHandler = require('../utils/asyncHandler');
const notRemoved = (j) => j && (j.moderation?.status ?? 'none') !== 'removed';
const visible = (j) => notRemoved(j) && j.status === 'active';

// GET /api/saved-jobs: the candidate's saved jobs that are still publicly listed
exports.list = asyncHandler(async (req, res) => {
  const rows = await SavedJob.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(100)
    .populate('jobId', 'title company location nicheCategory employmentType status moderation requiredSkills createdAt isFeatured featuredUntil featuredPaymentId').lean();
  const data = rows.filter((r) => visible(r.jobId)).map((r) => {
    const { moderation, isFeatured, featuredPaymentId, featuredUntil, ...job } = r.jobId;
    return { ...job, featured: isFeaturedActive(r.jobId), savedAt: r.createdAt };
  });
  res.json({ success: true, message: 'Saved jobs retrieved', data });
});

exports.ids = asyncHandler(async (req, res) => {
  const rows = await SavedJob.find({ userId: req.user.id }).select('jobId').lean();
  res.json({ success: true, message: 'Saved job ids', data: rows.map((r) => String(r.jobId)) });
});

// PUT /api/saved-jobs/:jobId (idempotent)
exports.save = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.jobId).select('status moderation');
  if (!notRemoved(job)) throw new AppError('Job not found', 404);
  if (job.status !== 'active') throw new AppError('This job is closed', 409);
  await SavedJob.updateOne({ userId: req.user.id, jobId: job._id }, { $setOnInsert: { userId: req.user.id, jobId: job._id } }, { upsert: true });
  res.json({ success: true, message: 'Job saved', data: { saved: true } });
});

// DELETE /api/saved-jobs/:jobId (idempotent)
exports.remove = asyncHandler(async (req, res) => {
  await SavedJob.deleteOne({ userId: req.user.id, jobId: req.params.jobId });
  res.json({ success: true, message: 'Job removed from saved', data: { saved: false } });
});
