const User = require('../models/User');
const AppError = require('../utils/AppError');
const { updateProfileSchema } = require('../validators/jobValidator');
const { profileCompletion } = require('../utils/profile');

const withCompletion = (user) => ({ ...user.toJSON(), profileCompletion: profileCompletion(user) });

const asyncHandler = require('../utils/asyncHandler');

exports.getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('Account no longer exists', 401);
  res.json({ success: true, message: 'Profile retrieved successfully', data: withCompletion(user) });
});

exports.updateMe = asyncHandler(async (req, res) => {
  // Role (and anything privileged) can never be changed through the profile endpoint.
  if (req.body && typeof req.body === 'object' && 'role' in req.body) {
    throw new AppError('Role cannot be changed', 403);
  }
  const updates = updateProfileSchema.parse(req.body);
  if (updates.companyName !== undefined && req.user.role !== 'employer') throw new AppError('Company name is only available for employer accounts', 400);
  const user = await User.findById(req.user.id);
  if (!user) throw new AppError('Account no longer exists', 401);
  user.set(updates);
  await user.save();
  res.json({ success: true, message: 'Profile updated successfully', data: withCompletion(user) });
});
