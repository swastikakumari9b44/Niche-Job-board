const Job = require('../models/Job');
const User = require('../models/User');
const Application = require('../models/Application');
const AppError = require('../utils/AppError');
const { applySchema, statusSchema } = require('../validators/jobValidator');
const { uploadResume, hasPdfSignature, pathFor } = require('../middleware/uploadMiddleware');
const { saveResume, openResume, deleteResume, isStoredInGridFs } = require('../services/resumeStorage');
const { extractPdfText } = require('../services/resumeParser');
const { scoreResume } = require('../services/skillMatcher');
const events = require('../services/events');

const asyncHandler = require('../utils/asyncHandler');
const parseUpload = (req, res) => new Promise((resolve, reject) => uploadResume(req, res, (err) => (err ? reject(err) : resolve())));

// POST /api/apply  (alias: POST /api/applications)   multipart/form-data: jobId, resume (PDF), [candidateName, candidateEmail]
exports.applyToJob = asyncHandler(async (req, res) => {
  let storedResume; // "gridfs:<id>" once saved; removed again if anything below fails
  try {
    await parseUpload(req, res);
    if (!req.file) throw new AppError('A PDF resume is required (form field "resume")', 400);

    // matchScore / status / candidateId etc. can never come from the client: strict schema rejects extras
    const { jobId, candidateName, candidateEmail } = applySchema.parse(req.body);

    if (!hasPdfSignature(req.file.buffer)) throw new AppError('File is not a valid PDF', 400);

    const job = await Job.findById(jobId).select('status requiredSkills title company employerId');
    if (!job) throw new AppError('Job not found', 404);
    if (job.status !== 'active') throw new AppError('This job is closed', 400);

    const candidate = await User.findById(req.user.id).select('name email');
    if (!candidate) throw new AppError('Candidate account not found', 401);
    if (candidateEmail && candidateEmail !== candidate.email) {
      throw new AppError('candidateEmail must match your account email', 400);
    }
    if (await Application.exists({ jobId, candidateId: candidate._id })) {
      throw new AppError('You have already applied to this job', 409);
    }

    // Skill coverage: deterministic keyword matching against the job's required skills (assists review only)
    const text = await extractPdfText(req.file.buffer);
    const result = scoreResume(text, job.requiredSkills);

    storedResume = await saveResume(req.file.buffer, { originalName: req.file.originalname, userId: candidate._id });

    let application;
    try {
      application = await Application.create({
        jobId,
        candidateId: candidate._id,
        candidateName: candidateName || candidate.name,
        candidateEmail: candidate.email,
        resumeUrl: storedResume,
        resumeOriginalName: req.file.originalname.slice(0, 200),
        resumeSize: req.file.size,
        matchStatus: result.status,
        matchScore: result.matchScore,
        extractedSkills: result.extractedSkills,
        matchedSkills: result.matchedSkills,
        missingSkills: result.missingSkills,
      });
    } catch (err) {
      if (err.code === 11000) throw new AppError('You have already applied to this job', 409);
      throw err;
    }
    storedResume = null; // keep the file: the application now owns it
    events.onApplicationSubmitted({ application, job, candidate }); // background notifications
    // Employer-side match analysis and the internal file name are not returned to the candidate
    const { resumeUrl: _f, matchScore: _s, matchedSkills: _m, missingSkills: _x, extractedSkills: _e, matchStatus: _t, ...safe } = application.toObject();
    res.status(201).json({ success: true, message: 'Application submitted successfully', data: safe });
  } finally {
    if (storedResume) await deleteResume(storedResume); // any failure above removes the stored file
  }
});

// GET /api/applications/my
exports.getMyApplications = asyncHandler(async (req, res) => {
  const applications = await Application.find({ candidateId: req.user.id })
    .sort({ createdAt: -1 })
    .select('-extractedSkills -resumeUrl -matchScore -matchedSkills -missingSkills -matchStatus') // storage name and employer-side match analysis stay private
    .populate('jobId', 'title company location nicheCategory status')
    .lean();
  res.json({ success: true, message: 'Applications retrieved successfully', data: applications });
});

// GET /api/applications/job/:jobId
exports.getJobApplications = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.jobId).select('employerId');
  if (!job) throw new AppError('Job not found', 404);
  if (String(job.employerId) !== req.user.id) throw new AppError('You do not own this job', 403);
  const applications = await Application.find({ jobId: job._id }).sort({ createdAt: -1 }).select('-resumeUrl').lean();
  res.json({ success: true, message: 'Applications retrieved successfully', data: applications });
});

// PATCH /api/applications/:id/status
exports.updateApplicationStatus = asyncHandler(async (req, res) => {
  const { status } = statusSchema.parse(req.body);
  const application = await Application.findById(req.params.id);
  if (!application) throw new AppError('Application not found', 404);
  const job = await Job.findById(application.jobId).select('employerId title company');
  if (!job || String(job.employerId) !== req.user.id) throw new AppError('You do not own this job', 403);
  // Atomic: only the request that really changes the status wins, so double clicks notify the candidate once.
  const updated = await Application.findOneAndUpdate({ _id: application._id, status: { $ne: status } }, { $set: { status } }, { new: true });
  if (updated) events.onStatusChanged({ application: updated, job, status });
  const { resumeUrl, ...safe } = (updated || application).toObject();
  res.json({ success: true, message: 'Application status updated', data: safe });
});

// GET /api/applications/:id/resume  - only the job's employer or the applicant may download
exports.getResume = asyncHandler(async (req, res) => {
  const application = await Application.findById(req.params.id);
  if (!application) throw new AppError('Application not found', 404);
  const job = await Job.findById(application.jobId).select('employerId');
  const isEmployer = req.user.role === 'employer' && job && String(job.employerId) === req.user.id;
  const isOwner = req.user.role === 'candidate' && String(application.candidateId) === req.user.id;
  if (!isEmployer && !isOwner) throw new AppError('You are not allowed to access this resume', 403);

  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline; filename="resume.pdf"',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });

  if (isStoredInGridFs(application.resumeUrl)) {
    const stream = await openResume(application.resumeUrl);
    if (!stream) throw new AppError('Resume not available', 404);
    stream.on('error', () => { if (!res.headersSent) res.status(500).json({ success: false, message: 'Could not read the resume' }); else res.destroy(); });
    return stream.pipe(res);
  }

  // Legacy: files saved on local disk before persistent storage was added (only present if that disk still exists).
  const file = pathFor(application.resumeUrl); // null unless the name matches our generated pattern (no traversal)
  if (!file) throw new AppError('Resume not available', 404);
  res.sendFile(file, (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'Resume file not found' });
  });
});

// GET /api/employer/applications: every application across the employer's jobs in ONE request (replaces one request per job).
exports.getEmployerApplications = asyncHandler(async (req, res) => {
  const LIMIT = 500;
  const jobs = await Job.find({ employerId: req.user.id }).select('title').lean();
  const jobIds = jobs.map((j) => j._id);
  const titles = new Map(jobs.map((j) => [String(j._id), j.title]));
  const [applications, countRows] = await Promise.all([
    Application.find({ jobId: { $in: jobIds } }).sort({ createdAt: -1 }).limit(LIMIT).select('-resumeUrl').lean(),
    Application.aggregate([{ $match: { jobId: { $in: jobIds } } }, { $group: { _id: '$jobId', count: { $sum: 1 } } }]),
  ]);
  const countsByJob = Object.fromEntries(countRows.map((r) => [String(r._id), r.count]));
  const total = countRows.reduce((n, r) => n + r.count, 0);
  res.json({
    success: true,
    message: 'Applications retrieved successfully',
    data: applications.map((a) => ({ ...a, jobTitle: titles.get(String(a.jobId)) })),
    meta: { countsByJob, total, truncated: total > applications.length },
  });
});
