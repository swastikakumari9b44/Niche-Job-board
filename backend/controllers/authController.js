const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { registerSchema, loginSchema } = require('../validators/jobValidator');
const Session = require('../models/Session');
const { setAuthCookie, clearAuthCookie, maxAgeMs, COOKIE_NAME } = require('../utils/cookies');
const events = require('../services/events');

const asyncHandler = require('../utils/asyncHandler');

// Every token is tied to a Session row (its `jti`). Deleting the row revokes the token immediately, even if a copy exists elsewhere.
const issueSession = async (user) => {
  const jti = crypto.randomUUID();
  await Session.create({ jti, userId: user._id, expiresAt: new Date(Date.now() + maxAgeMs()) });
  return jwt.sign({ id: String(user._id), role: user.role, jti }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// Compared against when the email is unknown so response time does not reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

exports.register = asyncHandler(async (req, res) => {
  const data = registerSchema.parse(req.body);
  if (await User.exists({ email: data.email })) throw new AppError('An account with this email already exists', 409);
  let user;
  try {
    user = await User.create(data); // password hashed by the model's pre-save hook
  } catch (err) {
    if (err.code === 11000) throw new AppError('An account with this email already exists', 409);
    throw err;
  }
  events.onRegistered(user); // background: an email problem can never fail registration
  setAuthCookie(res, await issueSession(user));
  res.status(201).json({ success: true, message: 'Registration successful', data: { user } }); // toJSON strips the hash
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email }).select('+password');
  const ok = user ? await user.comparePassword(password) : (await bcrypt.compare(password, DUMMY_HASH), false);
  if (!ok) throw new AppError('Invalid email or password', 401);
  if (user.status === 'suspended') throw new AppError('Your account has been suspended. Please contact support.', 403, 'ACCOUNT_SUSPENDED');
  setAuthCookie(res, await issueSession(user));
  res.json({ success: true, message: 'Login successful', data: { user } });
});

exports.me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    clearAuthCookie(res);
    throw new AppError('Account no longer exists', 401);
  }
  res.json({ success: true, message: 'Authenticated', data: { user } });
});

// Logout revokes the server-side session, so a copied cookie stops working. It never fails the user: the cookie is always cleared.
exports.logout = asyncHandler(async (req, res) => {
  const [scheme, bearer] = (req.headers.authorization || '').split(' ');
  const token = req.cookies?.[COOKIE_NAME] || (scheme === 'Bearer' ? bearer : null);
  if (token && process.env.JWT_SECRET) {
    try {
      const p = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'], ignoreExpiration: true });
      if (p.jti) await Session.deleteOne({ jti: String(p.jti), userId: p.id });
    } catch (err) {
      if (err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError') throw err; // bad token: nothing to revoke; DB problems are reported
    }
  }
  clearAuthCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

// POST /api/auth/logout-all: ends every session of the signed-in user (all devices).
exports.logoutAll = asyncHandler(async (req, res) => {
  await Session.deleteMany({ userId: req.user.id });
  clearAuthCookie(res);
  res.json({ success: true, message: 'Signed out of all devices' });
});
