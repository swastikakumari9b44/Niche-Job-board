const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const User = require('../models/User');
const Session = require('../models/Session');
const { COOKIE_NAME } = require('../utils/cookies');

const ROLES = ['candidate', 'employer', 'admin'];

// Step 1 (no database): verify the JWT from the HttpOnly cookie, or from the Authorization header for API clients/tests.
function protect(req, _res, next) {
  const [scheme, bearer] = (req.headers.authorization || '').split(' ');
  const token = req.cookies?.[COOKIE_NAME] || (scheme === 'Bearer' ? bearer : null);
  if (!token) return next(new AppError('Authentication required', 401));
  if (!process.env.JWT_SECRET) return next(new AppError('Server configuration error', 500));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload.id || !payload.jti || !ROLES.includes(payload.role)) return next(new AppError('Invalid token', 401)); // tokens without a session id (issued before revocation existed) are refused
    req.user = { id: String(payload.id), role: payload.role, iat: payload.iat, jti: String(payload.jti) };
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}

// Step 2 (database): the account must still exist and not be suspended. The stored role is authoritative,
// so a suspended user's old cookie stops working immediately and a token can never grant a role the account lacks.
async function loadActiveUser(req) {
  const [user, session] = await Promise.all([
    User.findById(req.user.id).select('role status passwordChangedAt').lean(),
    Session.exists({ jti: req.user.jti, userId: req.user.id }), // logout / "log out everywhere" deletes this row
  ]);
  if (!user) throw new AppError('Account no longer exists', 401);
  if (!session) throw new AppError('Your session has ended. Please sign in again.', 401);
  if (user.status === 'suspended') throw new AppError('Your account has been suspended. Please contact support.', 403, 'ACCOUNT_SUSPENDED');
  // A password reset signs out every session that was issued before it.
  if (user.passwordChangedAt && req.user.iat < Math.floor(new Date(user.passwordChangedAt).getTime() / 1000)) {
    throw new AppError('Your session has expired. Please sign in again.', 401);
  }
  req.user.role = user.role;
}

// For routes open to any signed-in role.
function requireActive(req, _res, next) {
  if (!req.user) return next(new AppError('Authentication required', 401));
  loadActiveUser(req).then(() => next(), next);
}

// Cheap role check from the token first, then the database check, then the role check again against the stored role.
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new AppError('Authentication required', 401));
  const deny = () => new AppError('You do not have permission to perform this action', 403);
  if (!roles.includes(req.user.role)) return next(deny());
  loadActiveUser(req).then(() => (roles.includes(req.user.role) ? next() : next(deny())), next);
};

module.exports = { protect, requireRole, requireActive };
