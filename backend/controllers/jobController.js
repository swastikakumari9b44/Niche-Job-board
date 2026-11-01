const Job = require('../models/Job');
const AppError = require('../utils/AppError');
const { isFeaturedActive, featuredActiveExpr } = require('../utils/featured');
const {
  createJobSchema, updateJobSchema, listJobsQuerySchema, validateCustomFields,
} = require('../validators/jobValidator');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

exports.getJobs = asyncHandler(async (req, res) => {
  const { category, location, employmentType, search, keyword, page, limit } = listJobsQuerySchema.parse(req.query);
  const term = search || keyword;
  const filter = { status: 'active' };
  if (category) filter.nicheCategory = category;
  if (employmentType) filter.employmentType = employmentType;
  if (location) filter.location = new RegExp(escapeRegex(location), 'i');
  if (term) {
    const rx = new RegExp(escapeRegex(term), 'i');
    filter.$or = [{ title: rx }, { company: rx }, { description: rx }, { requiredSkills: rx }];
  }
  // Featured jobs first, THEN newest first, sorted in the database BEFORE skip/limit so pages never repeat or skip jobs.
  const now = new Date();
  const [jobs, total] = await Promise.all([
    Job.aggregate([
      { $match: filter },
      { $addFields: { featured: featuredActiveExpr(now) } },
      { $sort: { featured: -1, createdAt: -1, _id: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $addFields: { featuredUntil: { $cond: ['$featured', '$featuredUntil', '$$REMOVE'] } } },
      { $project: { moderation: 0, isFeatured: 0, featuredAt: 0, featuredPaymentId: 0, __v: 0 } },
    ]),
    Job.countDocuments(filter),
  ]);
  res.json({ success: true, message: 'Jobs retrieved successfully', data: jobs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

exports.getJobById = asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id).lean();
  if (!job || job.moderation?.status === 'removed') throw new AppError('Job not found', 404);
  job.featured = isFeaturedActive(job); // must be computed BEFORE the internal moderation info is removed
  delete job.moderation; // internal moderation notes are not public
  if (!job.featured) delete job.featuredUntil;
  delete job.isFeatured; delete job.featuredAt; delete job.featuredPaymentId;
  res.json({ success: true, message: 'Job retrieved successfully', data: job });
});

exports.createJob = asyncHandler(async (req, res) => {
  const data = createJobSchema.parse(req.body);
  data.customFields = validateCustomFields(data.nicheCategory, data.customFields).data; // trimmed/normalized, known keys only
  const job = await Job.create({ ...data, employerId: req.user.id }); // employerId from token only
  res.status(201).json({ success: true, message: 'Job created successfully', data: job });
});

async function findOwnedJob(req) {
  const job = await Job.findById(req.params.id);
  if (!job) throw new AppError('Job not found', 404);
  if (String(job.employerId) !== req.user.id) throw new AppError('You do not own this job', 403);
  if (job.moderation?.status === 'removed') throw new AppError('This job was removed by a moderator and cannot be changed', 403);
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
    updates.customFields = r.data;
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

// GET /api/employer/jobs: all of the logged-in employer's jobs (active and closed)
exports.getEmployerJobs = asyncHandler(async (req, res) => {
  const jobs = (await Job.find({ employerId: req.user.id }).sort({ createdAt: -1 }).lean()).map((j) => {
    const { featuredPaymentId, isFeatured, ...rest } = j;
    return { ...rest, featured: isFeaturedActive(j), featuredUntil: isFeaturedActive(j) ? j.featuredUntil : undefined };
  });
  res.json({ success: true, message: 'Jobs retrieved successfully', data: jobs });
});
