const crypto = require('crypto');
const User = require('../models/User');
const PasswordReset = require('../models/PasswordReset');
const AppError = require('../utils/AppError');
const email = require('../services/email');
const { templates: t, abs } = require('../services/emailTemplates');
const { background } = require('../services/notifier');
const v = require('../validators/productValidator');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const RESET_MINUTES = 30;
const RESEND_AFTER_SECONDS = 60; // one reset email per minute per account (stops inbox flooding)
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const GENERIC = 'If an account exists for that email, a password reset link has been sent.';

// POST /api/auth/forgot-password  { email }
// Always answers the same way, so nobody can use this form to discover which emails are registered.
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email: address } = v.forgotBody.parse(req.body);
  const user = await User.findOne({ email: address }).select('name email');
  if (user) {
    const recent = await PasswordReset.exists({ userId: user._id, createdAt: { $gt: new Date(Date.now() - RESEND_AFTER_SECONDS * 1000) } });
    if (!recent) {
      await PasswordReset.deleteMany({ userId: user._id }); // older links stop working
      const token = crypto.randomBytes(32).toString('hex'); // 256 bits from the OS CSPRNG
      await PasswordReset.create({ userId: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60000) });
      const url = `${abs('/reset-password')}?token=${token}`;
      // sent in the background so the response time does not reveal whether the account exists
      background(() => email.send({ to: user.email, ...t.passwordReset({ name: user.name, url, minutes: RESET_MINUTES }) }));
    }
  }
  res.json({ success: true, message: GENERIC });
});

// POST /api/auth/reset-password  { token, password }
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = v.resetBody.parse(req.body);
  const invalid = () => new AppError('This reset link is invalid or has expired. Please request a new one.', 400);
  // Atomic single use: only one request can flip usedAt, so a link can never be replayed or raced.
  const record = await PasswordReset.findOneAndUpdate({ tokenHash: sha256(token.toLowerCase()), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { $set: { usedAt: new Date() } });
  if (!record) throw invalid();
  const user = await User.findById(record.userId);
  if (!user) throw invalid();
  user.password = password; // hashed by the model's existing pre-save hook (bcrypt)
  user.passwordChangedAt = new Date(); // all earlier sessions become invalid
  await user.save();
  await PasswordReset.deleteMany({ userId: user._id });
  background(() => email.send({ to: user.email, ...t.passwordChanged({ name: user.name }) }));
  res.json({ success: true, message: 'Your password was updated. You can now sign in.' });
});
