const { z } = require('zod');
const User = require('../models/User');

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email: z.string().trim().toLowerCase().email('Invalid email address').max(200),
  password: z.string().min(12, 'Admin password must be at least 12 characters').max(72, 'Password must be at most 72 characters'),
});

// The ONLY way to obtain an admin account. There is no API route for it, by design.
// promoteExisting=true upgrades an existing candidate/employer account (its password is left unchanged).
async function createAdminAccount(input, { promoteExisting = false } = {}) {
  const { name, email, password } = schema.parse(input);
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role === 'admin') throw new Error('That account is already an admin.');
    if (!promoteExisting) throw new Error('An account with that email already exists. Re-run with --promote to make it an admin.');
    existing.role = 'admin';
    existing.status = 'active';
    await existing.save();
    return { user: existing, promoted: true };
  }
  const user = await User.create({ name, email, password, role: 'admin' });
  return { user, promoted: false };
}

module.exports = { createAdminAccount };
