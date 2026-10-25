const { z } = require('zod');
const { NICHE_CATEGORIES, EMPLOYMENT_TYPES, categories } = require('../config/categories');

const strList = (max = 30) => z.array(z.string().trim().min(1).max(60)).max(max);

// Vertical-Switcher: Zod schemas are generated from config/categories.json (same data the frontend renders from).
// z.strictObject => any key not defined for the category is rejected, so no arbitrary field injection.
function fieldToZod(field) {
  let schema;
  switch (field.type) {
    case 'select':
      schema = z.enum(field.options);
      break;
    case 'multiselect':
      schema = z.array(z.enum(field.options)).max(field.options.length);
      if (field.required) schema = schema.min(1, `${field.label}: select at least one`);
      break;
    case 'tags':
      schema = strList();
      if (field.required) schema = schema.min(1, `${field.label}: add at least one`);
      break;
    case 'boolean':
      schema = z.boolean();
      break;
    default:
      schema = z.string().trim().min(1).max(200);
  }
  return field.required ? schema : schema.optional();
}

const customFieldSchemas = Object.fromEntries(
  NICHE_CATEGORIES.map((name) => [
    name,
    z.strictObject(Object.fromEntries(categories[name].fields.map((f) => [f.key, fieldToZod(f)]))),
  ])
);

// Returns { success, data } or { success: false, error }
function validateCustomFields(category, fields) {
  const schema = customFieldSchemas[category];
  if (!schema) return { success: false, error: new Error(`Unsupported category: ${category}`) };
  return schema.safeParse(fields ?? {});
}

const salaryRangeSchema = z
  .strictObject({
    min: z.number().min(0).max(1e9).optional(),
    max: z.number().min(0).max(1e9).optional(),
    currency: z.string().trim().length(3).toUpperCase().optional(),
  })
  .refine((s) => s.min === undefined || s.max === undefined || s.min <= s.max, 'Minimum salary cannot exceed maximum');

const baseShape = {
  title: z.string().trim().min(3).max(150),
  company: z.string().trim().min(1).max(150),
  description: z.string().trim().min(10).max(10000),
  nicheCategory: z.enum(NICHE_CATEGORIES),
  location: z.string().trim().min(1).max(150),
  employmentType: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(EMPLOYMENT_TYPES)),
  salaryRange: salaryRangeSchema.optional(),
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
  employmentType: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(EMPLOYMENT_TYPES)).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  keyword: z.string().trim().min(1).max(100).optional(), // alias of "search" (backward compatible)
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Multipart text fields; the PDF itself arrives as the "resume" file part.
const applySchema = z.strictObject({
  jobId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid jobId'),
  candidateName: z.string().trim().min(1, 'Candidate name is required').max(100).optional(),
  candidateEmail: z.string().trim().toLowerCase().email('Invalid email address').max(200).optional(),
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
