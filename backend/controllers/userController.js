const User = require('../models/User');
const AppError = require('../utils/AppError');
const { updateProfileSchema } = require('../validators/jobValidator');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('Account no longer exists', 401);
  res.json({ success: true, message: 'Profile retrieved successfully', data: user });
});

exports.updateMe = asyncHandler(async (req, res) => {
  // Role (and anything privileged) can never be changed through the profile endpoint.
  if (req.body && typeof req.body === 'object' && 'role' in req.body) {
    throw new AppError('Role cannot be changed', 403);
  }
  const updates = updateProfileSchema.parse(req.body);
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('Account no longer exists', 401);
  user.set(updates);
  await user.save();
  res.json({ success: true, message: 'Profile updated successfully', data: user });
});
