const mongoose = require('mongoose');

// Append-only record of administrative actions. There are intentionally no update or delete endpoints for it.
const auditLogSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: {
      type: String,
      required: true,
      enum: ['USER_SUSPENDED', 'USER_REACTIVATED', 'JOB_FLAGGED', 'JOB_UNFLAGGED', 'JOB_REMOVED', 'JOB_RESTORED'],
    },
    targetType: { type: String, required: true, enum: ['user', 'job'] },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }, // small, non-sensitive context (titles, previous status)
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
