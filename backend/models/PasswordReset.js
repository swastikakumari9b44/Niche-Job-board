const mongoose = require('mongoose');

// Only the SHA-256 hash of the emailed token is stored, so a database leak cannot be used to reset passwords.
const passwordResetSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } }, // MongoDB deletes expired rows automatically
    usedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
