const jwt = require('jsonwebtoken');
const AppError = require('../utils/AppError');
const { COOKIE_NAME } = require('../utils/cookies');

// Verifies "Authorization: Bearer <jwt>". Tokens are issued by the Day 2 login endpoint.
// Payload expected: { id, role }. Stateless: no DB lookup on Day 1.
function protect(req, _res, next) {
  // Primary: HttpOnly cookie. Fallback: Authorization header (API clients / tests). Tokens are never kept in localStorage.
  const [scheme, bearer] = (req.headers.authorization || '').split(' ');
  const token = req.cookies?.[COOKIE_NAME] || (scheme === 'Bearer' ? bearer : null);
  if (!token) return next(new AppError('Authentication required', 401));
  if (!process.env.JWT_SECRET) return next(new AppError('Server configuration error', 500));
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    if (!payload.id || !['candidate', 'employer'].includes(payload.role)) {
      return next(new AppError('Invalid token', 401));
    }
    req.user = { id: String(payload.id), role: payload.role };
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}

const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new AppError('Authentication required', 401));
  if (!roles.includes(req.user.role)) return next(new AppError('You do not have permission to perform this action', 403));
  next();
};

module.exports = { protect, requireRole };
