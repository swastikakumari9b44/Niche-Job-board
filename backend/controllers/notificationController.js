const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const v = require('../validators/productValidator');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// Every query below is scoped to req.user.id: nobody can read or change another user's notifications.
const shape = ({ emailStatus, emailError, dedupeKey, ...n }) => n;

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, unread } = v.notificationsQuery.parse(req.query);
  const filter = { userId: req.user.id };
  if (unread === 'true') filter.readAt = { $exists: false };
  const [rows, total, unreadCount] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ userId: req.user.id, readAt: { $exists: false } }),
  ]);
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, message: 'Notifications retrieved', data: rows.map(shape), unreadCount, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

exports.unreadCount = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, message: 'Unread count', data: { unreadCount: await Notification.countDocuments({ userId: req.user.id, readAt: { $exists: false } }) } });
});

exports.markRead = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, userId: req.user.id }; // scoped to the caller: other users' ids look like "not found"
  await Notification.updateOne({ ...filter, readAt: { $exists: false } }, { $set: { readAt: new Date() } }); // keeps the first read time
  const n = await Notification.findOne(filter).lean();
  if (!n) throw new AppError('Notification not found', 404);
  res.json({ success: true, message: 'Marked as read', data: shape(n) });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  const r = await Notification.updateMany({ userId: req.user.id, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  res.json({ success: true, message: 'All notifications marked as read', data: { updated: r.modifiedCount } });
});
