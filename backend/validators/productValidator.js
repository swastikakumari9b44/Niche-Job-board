const { z } = require('zod');

const forgotBody = z.strictObject({ email: z.string().trim().toLowerCase().email('Enter a valid email address').max(200) });
const resetBody = z.strictObject({
  token: z.string().regex(/^[a-f0-9]{64}$/i, 'This reset link is invalid'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password must be at most 72 characters'),
});
const notificationsQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  unread: z.enum(['true', 'false']).optional(),
});

module.exports = { forgotBody, resetBody, notificationsQuery };
