const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const skipInTests = () => process.env.NODE_ENV === 'test' && !process.env.FORCE_RATE_LIMIT;
const tooMany = (message) => (_req, res) => res.status(429).json({ success: false, message });

// Brute-force protection for login/register. Counts per client IP.
function createAuthLimiter(max = Number(process.env.AUTH_RATE_LIMIT_MAX) || 20, windowMs = 15 * 60 * 1000) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: skipInTests,
    handler: tooMany('Too many attempts. Please try again later.'),
  });
}

// Per-ACCOUNT login limiter: stops one account being guessed from many IPs (a botnet gets 10 tries per account, total).
// Only failed attempts count, so a real user who signs in correctly is never locked out by earlier successes.
function createLoginAccountLimiter(max = Number(process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX) || 10, windowMs = 15 * 60 * 1000) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    skip: skipInTests,
    keyGenerator: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
      return email ? `acct:${email}` : `ip:${ipKeyGenerator(req.ip)}`;
    },
    handler: tooMany('Too many failed sign-in attempts for this account. Please try again in a few minutes.'),
  });
}

// Resume uploads, per signed-in user (mount AFTER protect so req.user exists). Each upload triggers parsing, which is CPU heavy.
function createUploadLimiter(max = Number(process.env.UPLOAD_RATE_LIMIT_MAX) || 15, windowMs = 60 * 60 * 1000) {
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: skipInTests,
    keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip)}`),
    handler: tooMany('Too many applications submitted. Please wait a while before applying again.'),
  });
}

// ONE shared instance for every route that accepts a resume (/api/apply and its alias /api/applications),
// so alternating between the two URLs cannot double a user's budget.
let sharedUpload;
const uploadLimiter = () => (sharedUpload ||= createUploadLimiter());

// Payment endpoints (order creation / verification), per client IP.
function createPaymentLimiter(max = Number(process.env.PAYMENT_RATE_LIMIT_MAX) || 30, windowMs = 15 * 60 * 1000) {
  return rateLimit({
    windowMs, limit: max, standardHeaders: 'draft-7', legacyHeaders: false,
    skip: skipInTests,
    handler: tooMany('Too many payment requests. Please wait a few minutes.'),
  });
}

module.exports = { createAuthLimiter, createLoginAccountLimiter, createUploadLimiter, uploadLimiter, createPaymentLimiter };
