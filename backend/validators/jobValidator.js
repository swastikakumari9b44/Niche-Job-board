const { z } = require('zod');
const { NICHE_CATEGORIES, EMPLOYMENT_TYPES } = require('../models/Job');

const strList = (max = 30) => z.array(z.string().trim().min(1).max(60)).max(max);

// Vertical-Switcher: allowed customFields per niche category. Unknown keys are rejected.
const customFieldSchemas = {
  'AI/ML': z.strictObject({
    framework: z.string().trim().min(1).max(60).optional(),
    experienceLevel: z.string().trim().min(1).max(60).optional(),
    modelFrameworks: strList().optional(),
    researchExperienceRequired: z.boolean().optional(),
    gpuAccessProvided: z.boolean().optional(),
    publicationsPreferred: z.boolean().optional(),
  }),
  Nursing: z.strictObject({
    licenseType: z.enum(['RN', 'LPN', 'NP', 'CNA']).optional(),
    licenseState: z.string().trim().min(1).max(60).optional(),
    shiftType: z.enum(['day', 'night', 'rotating']).optional(),
    yearsExperience: z.number().min(0).max(60).optional(),
    certifications: strList().optional(),
  }),
  Web3: z.strictObject({
    blockchains: strList().optional(),
    smartContractLanguages: strList().optional(),
    auditExperienceRequired: z.boolean().optional(),
    tokenCompensation: z.boolean().optional(),
  }),
  Frontend: z.strictObject({
    frameworks: strList().optional(),
    designSystemExperience: z.boolean().optional(),
    remotePolicy: z.enum(['remote', 'hybrid', 'onsite']).optional(),
  }),
  // "Other": small flat key/value bag
  Other: z
    .record(z.string().min(1).max(50), z.union([z.string().max(500), z.number(), z.boolean()]))
    .refine((o) => Object.keys(o).length <= 20, 'Too many custom fields (max 20)'),
};

// Returns { success, data } or { success: false, error }
function validateCustomFields(category, fields) {
  const schema = customFieldSchemas[category];
  if (!schema) return { success: false, error: new Error(`Unsupported category: ${category}`) };
  return schema.safeParse(fields ?? {});
}

const baseShape = {
  title: z.string().trim().min(3).max(150),
  company: z.string().trim().min(1).max(150),
  description: z.string().trim().min(10).max(10000),
  nicheCategory: z.enum(NICHE_CATEGORIES),
  location: z.string().trim().min(1).max(150),
  employmentType: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(EMPLOYMENT_TYPES)),
  requiredSkills: strList().default([]),
  customFields: z.record(z.string(), z.unknown()).default({}),
};

// strictObject => employerId, promotion, status etc. sent by a client are rejected (400).
const createJobSchema = z.strictObject(baseShape).superRefine((val, ctx) => {
  const r = validateCustomFields(val.nicheCategory, val.customFields);
  if (!r.success) {
    for (const issue of r.error.issues || [{ message: r.error.message, path: [] }]) {
      ctx.addIssue({ code: 'custom', path: ['customFields', ...(issue.path || [])], message: issue.message });
    }
  }
});

// Custom fields are re-validated in the controller against the merged category.
const updateJobSchema = z
  .strictObject({
    ...Object.fromEntries(Object.entries(baseShape).map(([k, v]) => [k, v.optional()])),
    requiredSkills: strList().optional(),
    customFields: z.record(z.string(), z.unknown()).optional(),
    status: z.enum(['active', 'closed']).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'At least one field is required');

const listJobsQuerySchema = z.object({
  category: z.enum(NICHE_CATEGORIES).optional(),
  location: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  keyword: z.string().trim().min(1).max(100).optional(), // alias of "search" (backward compatible)
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Resume "reference": a plain PDF file name only (no paths, no URLs). Real uploads arrive on Day 3.
const RESUME_REF = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.pdf$/i;
const applySchema = z.strictObject({
  jobId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid jobId'),
  candidateName: z.string().trim().min(1, 'Candidate name is required').max(100).optional(),
  candidateEmail: z.string().trim().toLowerCase().email('Invalid email address').max(200).optional(),
  resumeUrl: z.string().trim().regex(RESUME_REF, 'resumeUrl must be a PDF file reference such as "resume.pdf" (no URLs or paths)'),
});

const statusSchema = z.strictObject({
  status: z.enum(['Applied', 'Shortlisted', 'Rejected']),
});

const registerSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email address').max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
  role: z.enum(['candidate', 'employer']),
});

const loginSchema = z.strictObject({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required').max(72),
});

// Only the name is editable. "role" is handled (403) in the controller before this runs.
const updateProfileSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name cannot be empty').max(100),
});

module.exports = {
  createJobSchema, updateJobSchema, listJobsQuerySchema, applySchema, statusSchema,
  registerSchema, loginSchema, updateProfileSchema, validateCustomFields,
};
