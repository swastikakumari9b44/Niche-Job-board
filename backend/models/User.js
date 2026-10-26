const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: {
    type: String, required: true, unique: true, lowercase: true, trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
  },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ['candidate', 'employer', 'admin'], required: true },
  // Accounts created before moderation existed have no status; every check treats a missing status as 'active'.
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  statusReason: { type: String, trim: true, maxlength: 500 },
  statusChangedAt: Date,
  statusChangedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
},
{ timestamps: true });

userSchema.index({ role: 1, status: 1, createdAt: -1 });

// Hash only when the password changed.
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

// Never leak the hash in JSON responses.
userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
