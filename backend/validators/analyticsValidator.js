const { z } = require('zod');
const { NICHE_CATEGORIES } = require('../config/categories');
const { MAX_CUSTOM_DAYS, DAY } = require('../utils/dateRange');

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Dates must look like 2026-01-31').refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s), 'Not a real calendar date');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// Shared date-range rules. "custom" needs from + to (from <= to, not in the future, at most 366 days).
const withRange = (extra, { allowAll = false } = {}) =>
  z
    .object({ range: z.enum(allowAll ? ['7d', '30d', '90d', '12m', 'custom', 'all'] : ['7d', '30d', '90d', '12m', 'custom']).default('30d'), from: day.optional(), to: day.optional(), ...extra })
    .superRefine((q, ctx) => {
      if (q.range !== 'custom') return;
      if (!q.from || !q.to) return ctx.addIssue({ code: 'custom', path: ['from'], message: 'A custom range needs both from and to dates' });
      const from = new Date(`${q.from}T00:00:00Z`), to = new Date(`${q.to}T00:00:00Z`);
      if (from > to) ctx.addIssue({ code: 'custom', path: ['from'], message: 'The start date must be on or before the end date' });
      else if ((to - from) / DAY + 1 > MAX_CUSTOM_DAYS) ctx.addIssue({ code: 'custom', path: ['to'], message: `Choose a range of at most ${MAX_CUSTOM_DAYS} days` });
      if (from > new Date()) ctx.addIssue({ code: 'custom', path: ['from'], message: 'The start date cannot be in the future' });
    });

const category = z.enum(NICHE_CATEGORIES).optional();

const employerQuery = withRange({});
const employerJobQuery = withRange({}, { allowAll: true });
const employerExportQuery = withRange({ jobId: objectId.optional() });
const candidateQuery = withRange({});
const platformQuery = withRange({ category, jobStatus: z.enum(['active', 'closed']).optional(), applicationStatus: z.enum(['Applied', 'Shortlisted', 'Rejected']).optional() });
const adminExportQuery = withRange({ category, paymentStatus: z.enum(['created', 'pending', 'paid', 'failed']).optional() });

module.exports = { employerQuery, employerJobQuery, employerExportQuery, candidateQuery, platformQuery, adminExportQuery };
