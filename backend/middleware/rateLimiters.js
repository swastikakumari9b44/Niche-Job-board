const rateLimit = require('express-rate-limit');

// Brute-force protection for login/register. Counts per client IP.
function createAuthLimiter(max = Number(process.env.AUTH_RATE_LIMIT_MAX) || 20, windowMs = 15 * 60 * 1000) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test' && !process.env.FORCE_RATE_LIMIT,
    handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many attempts. Please try again later.' }),
  });
}

module.exports = { createAuthLimiter };
