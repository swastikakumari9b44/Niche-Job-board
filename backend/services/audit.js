const AuditLog = require('../models/AuditLog');

// Writes one audit entry for an admin action. Awaited by the caller so a failed write is never silent.
function recordAudit(req, { action, targetType, targetId, reason, metadata = {} }) {
  return AuditLog.create({ adminId: req.user.id, action, targetType, targetId, reason, metadata, ip: req.ip });
}

module.exports = { recordAudit };
