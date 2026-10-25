const Job = require('../models/Job');
const AppError = require('../utils/AppError');
const {
  createJobSchema, updateJobSchema, listJobsQuerySchema, validateCustomFields,
} = require('../validators/jobValidator');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getJobs = asyncHandler(async (req, res) => {
  const { category, location, search, keyword, page, limit } = listJobsQuerySchema.parse(req.query);
  const term = search || keyword;
  const filter = { status: 'active' };
  if (category) filter.nicheCategory = category;
  if (location) filter.location = new RegExp(escapeRegex(location), 'i');
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i');
    filter.$or = [{ title: rx }, { company: rx }, { description: rx }, { requiredSkills: rx }];
  }
  const [jobs, total] = await Promise.all([
    Job.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Job.countDocuments(filter),
  ]);
  res.json({ success: true, message: 'Jobs retrieved successfully', data: jobs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

exports.getJobById = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id).lean();
  if (!job) throw new AppError('Job not found', 404);
  res.json({ success: true, message: 'Job retrieved successfully', data: job });
});

exports.createJob = asyncHandler(async (req, res) => {
  const data = createJobSchema.parse(req.body);
  const job = await Job.create({ ...data, employerId: req.user.id }); // employerId from token only
  res.status(201).json({ success: true, message: 'Job created successfully', data: job });
});

async function findOwnedJob(req) {
  const job = await Job.findById(req.params.id);
  if (!job) throw new AppError('Job not found', 404);
  if (String(job.employerId) !== req.user.id) throw new AppError('You do not own this job', 403);
  return job;
}

exports.updateJob = asyncHandler(async (req, res) => {
  const updates = updateJobSchema.parse(req.body);
  const job = await findOwnedJob(req);

  if (updates.nicheCategory || updates.customFields) {
    const category = updates.nicheCategory || job.nicheCategory;
    const fields = updates.customFields ?? job.customFields;
    const r = validateCustomFields(category, fields);
    if (!r.success) {
      throw new AppError(`Invalid customFields for ${category}: ${r.error.issues.map((i) => i.message).join('; ')}`, 400);
    }
  }
  job.set(updates);
  await job.save();
  res.json({ success: true, message: 'Job updated successfully', data: job });
});

// Soft delete: closes the job
exports.closeJob = asyncHandler(async (req, res) => {
  const job = await findOwnedJob(req);
  job.status = 'closed';
  await job.save();
  res.json({ success: true, message: 'Job closed', data: job });
});
