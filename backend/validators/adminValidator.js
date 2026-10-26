const { z } = require('zod');
const { NICHE_CATEGORIES } = require('../config/categories');

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(50).default(10);
const search = z.string().trim().min(1).max(100).optional();
const reason = z.string().trim().min(5, 'Please give a reason (at least 5 characters)').max(500);

const listUsersQuery = z.object({
  page, limit, search,
  role: z.enum(['candidate', 'employer', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

const listJobsQuery = z.object({
  page, limit, search,
  category: z.enum(NICHE_CATEGORIES).optional(),
  status: z.enum(['active', 'closed']).optional(),
  moderation: z.enum(['none', 'flagged', 'removed']).optional(),
});

const userStatusBody = z.strictObject({ status: z.enum(['active', 'suspended']), reason });
const jobModerationBody = z.strictObject({ action: z.enum(['flag', 'unflag', 'remove', 'restore']), reason });

const analyticsQuery = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d), 'days must be 7, 30 or 90').default(30) });

const auditQuery = z.object({
  page, limit,
  action: z.enum(['USER_SUSPENDED', 'USER_REACTIVATED', 'JOB_FLAGGED', 'JOB_UNFLAGGED', 'JOB_REMOVED', 'JOB_RESTORED']).optional(),
  targetType: z.enum(['user', 'job']).optional(),
});

module.exports = { listUsersQuery, listJobsQuery, userStatusBody, jobModerationBody, analyticsQuery, auditQuery };
