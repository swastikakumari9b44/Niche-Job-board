const mongoose = require('mongoose');

// One row per signed-in browser/device. The JWT carries the row's `jti`; a token whose row is gone is rejected,
// so logging out (or "log out everywhere", or a password reset) really kills copied cookies.
const sessionSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // MongoDB deletes expired sessions by itself

module.exports = mongoose.model('Session', sessionSchema);
