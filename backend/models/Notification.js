const mongoose = require('mongoose');

// In-app notification. dedupeKey (unique per user) is what prevents the same event from notifying twice,
// by both channels: an email is sent only when the in-app record was newly created.
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String, required: true,
      enum: ['welcome', 'application_submitted', 'application_received', 'application_status', 'payment_succeeded', 'payment_failed', 'payment_review', 'job_update', 'account'],
    },
    title: { type: String, required: true, maxlength: 140 },
    message: { type: String, required: true, maxlength: 500 },
    link: { type: String, maxlength: 200 }, // internal path only, e.g. /employer/dashboard
    readAt: Date,
    dedupeKey: { type: String, maxlength: 200 },
    emailStatus: { type: String, enum: ['none', 'pending', 'sent', 'failed', 'skipped'], default: 'none' },
    emailError: { type: String, maxlength: 100 },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 180 }, // auto-deleted after 180 days
  },
  { versionKey: false }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, readAt: 1 });
notificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } });

module.exports = mongoose.model('Notification', notificationSchema);
