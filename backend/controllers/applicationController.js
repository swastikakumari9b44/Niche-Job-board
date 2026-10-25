const Job = require('../models/Job');
const User = require('../models/User');
const Application = require('../models/Application');
const AppError = require('../utils/AppError');
const { applySchema, statusSchema } = require('../validators/jobValidator');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/applications  (also reachable as POST /api/apply for backward compatibility)
exports.applyToJob = asyncHandler(async (req, res) => {
  const { jobId, resumeUrl, candidateName, candidateEmail } = applySchema.parse(req.body);

  const job = await Job.findById(jobId).select('status');
  if (!job) throw new AppError('Job not found', 404);
  if (job.status !== 'active') throw new AppError('This job is closed', 400);

  const candidate = await User.findById(req.user.id).select('name email');
  if (!candidate) throw new AppError('Candidate account not found', 401);
  // The application is always tied to the logged-in account; a different email is refused.
  if (candidateEmail && candidateEmail !== candidate.email) {
    throw new AppError('candidateEmail must match your account email', 400);
  }

  try {
    const application = await Application.create({
      jobId,
      candidateId: candidate._id,
      candidateName: candidateName || candidate.name,
      candidateEmail: candidate.email,
      resumeUrl, // an unverified reference only; never fetched or served as a trusted file
    });
    res.status(201).json({ success: true, message: 'Application submitted successfully', data: application });
  } catch (err) {
    if (err.code === 11000) throw new AppError('You have already applied to this job', 409);
    throw err;
  }
});

// GET /api/applications/my
exports.getMyApplications = asyncHandler(async (req, res) => {
  const applications = await Application.find({ candidateId: req.user.id })
    .sort({ createdAt: -1 })
    .populate('jobId', 'title company location nicheCategory status')
    .lean();
  res.json({ success: true, message: 'Applications retrieved successfully', data: applications });
});

// GET /api/applications/job/:jobId
exports.getJobApplications = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.jobId).select('employerId');
  if (!job) throw new AppError('Job not found', 404);
  if (String(job.employerId) !== req.user.id) throw new AppError('You do not own this job', 403);
  const applications = await Application.find({ jobId: job._id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, message: 'Applications retrieved successfully', data: applications });
});

// PATCH /api/applications/:id/status
exports.updateApplicationStatus = asyncHandler(async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const application = await Application.findById(req.params.id);
  if (!application) throw new AppError('Application not found', 404);
  const job = await Job.findById(application.jobId).select('employerId');
  if (!job || String(job.employerId) !== req.user.id) throw new AppError('You do not own this job', 403);
  application.status = status;
  await application.save();
  res.json({ success: true, message: 'Application status updated', data: application });
});
