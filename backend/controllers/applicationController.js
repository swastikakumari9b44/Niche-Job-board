const Job = require('../models/Job');
const User = require('../models/User');
const Application = require('../models/Application');
const AppError = require('../utils/AppError');
const { applySchema, statusSchema } = require('../validators/jobValidator');
const { uploadResume, hasPdfSignature, removeFile, pathFor } = require('../middleware/uploadMiddleware');
const { extractPdfText } = require('../services/resumeParser');
const { scoreResume } = require('../services/skillMatcher');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const parseUpload = (req, res) => new Promise((resolve, reject) => uploadResume(req, res, (err) => (err ? reject(err) : resolve())));

// POST /api/apply  (alias: POST /api/applications)   multipart/form-data: jobId, resume (PDF), [candidateName, candidateEmail]
exports.applyToJob = asyncHandler(async (req, res) => {
  let filePath;
  try {
    await parseUpload(req, res);
    filePath = req.file?.path;
    if (!req.file) throw new AppError('A PDF resume is required (form field "resume")', 400);

    // matchScore / status / candidateId etc. can never come from the client: strict schema rejects extras
    const { jobId, candidateName, candidateEmail } = applySchema.parse(req.body);

    if (!(await hasPdfSignature(filePath))) throw new AppError('File is not a valid PDF', 400);

    const job = await Job.findById(jobId).select('status requiredSkills');
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
    const text = await extractPdfText(filePath);
    const result = scoreResume(text, job.requiredSkills);

    let application;
    try {
      application = await Application.create({
        jobId,
        candidateId: candidate._id,
        candidateName: candidateName || candidate.name,
        candidateEmail: candidate.email,
        resumeUrl: req.file.filename,
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
    filePath = null; // keep the file: the application now owns it
    // Employer-side match analysis and the internal file name are not returned to the candidate
    const { resumeUrl: _f, matchScore: _s, matchedSkills: _m, missingSkills: _x, extractedSkills: _e, matchStatus: _t, ...safe } = application.toObject();
    res.status(201).json({ success: true, message: 'Application submitted successfully', data: safe });
  } finally {
    await removeFile(filePath); // any failure above removes the uploaded file
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
  const job = await Job.findById(application.jobId).select('employerId');
  if (!job || String(job.employerId) !== req.user.id) throw new AppError('You do not own this job', 403);
  application.status = status;
  await application.save();
  const { resumeUrl, ...safe } = application.toObject();
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

  const file = pathFor(application.resumeUrl); // null unless the name matches our generated pattern (no traversal)
  if (!file) throw new AppError('Resume not available', 404);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'inline; filename="resume.pdf"',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.sendFile(file, (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, message: 'Resume file not found' });
  });
});
