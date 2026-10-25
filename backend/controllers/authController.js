const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { registerSchema, loginSchema } = require('../validators/jobValidator');
const { setAuthCookie, clearAuthCookie } = require('../utils/cookies');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const signToken = (user) =>
  jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

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
  setAuthCookie(res, signToken(user));
  res.status(201).json({ success: true, message: 'Registration successful', data: { user } }); // toJSON strips the hash
});

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const user = await User.findOne({ email }).select('+password');
  const ok = user ? await user.comparePassword(password) : (await bcrypt.compare(password, DUMMY_HASH), false);
  if (!ok) throw new AppError('Invalid email or password', 401);
  setAuthCookie(res, signToken(user));
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

exports.logout = (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: 'Logged out' });
};
