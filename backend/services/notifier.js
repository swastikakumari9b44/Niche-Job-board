// One place that creates in-app notifications and (optionally) emails the same event, safely.
//  - never throws and never blocks the caller's request (fire-and-forget, see `idle()` for tests)
//  - dedupeKey: the same event can only notify once; email is sent only if the in-app record was newly created
//  - email failures are recorded on the notification, never surfaced to the user's request
const Notification = require('../models/Notification');
const User = require('../models/User');
const email = require('./email');
const { logError } = require('../utils/logger');

const pending = new Set();
const track = (promise) => { pending.add(promise); promise.finally(() => pending.delete(promise)); return promise; };
const idle = async () => { while (pending.size) await Promise.allSettled([...pending]); }; // lets tests wait for background work

// opts: { userId, type, title, message, link, dedupeKey, mail: { subject, html, text } | null, essential }
async function deliver({ userId, type, title, message, link, dedupeKey, mail, essential = false }) {
  try {
    let doc;
    try {
      doc = await Notification.create({ userId, type, title, message, link, dedupeKey, emailStatus: mail ? 'pending' : 'none' });
    } catch (err) {
      if (err.code === 11000) return { duplicate: true }; // already notified for this event
      throw err;
    }
    if (!mail) return { created: true };

    const user = await User.findById(userId).select('email notifyByEmail status').lean();
    let status = 'skipped', error;
    if (user?.email && (essential || user.notifyByEmail !== false)) {
      const r = await email.send({ to: user.email, ...mail });
      status = r.ok ? 'sent' : r.skipped ? 'skipped' : 'failed';
      error = r.ok || r.skipped ? undefined : String(r.error || 'Send failed').slice(0, 100);
    }
    await Notification.updateOne({ _id: doc._id }, { $set: { emailStatus: status, ...(error && { emailError: error }) } });
    return { created: true, emailStatus: status };
  } catch (err) {
    logError(`Notification failed (${type})`, err);
    return { error: true };
  }
}

const notify = (opts) => track(deliver(opts)); // returns a promise that never rejects; callers need not await it

// Send to every active admin (in-app + email).
async function notifyAdmins(base) {
  try {
    const admins = await User.find({ role: 'admin', status: { $ne: 'suspended' } }).select('_id').lean();
    return Promise.all(admins.map((a) => notify({ ...base, userId: a._id, dedupeKey: base.dedupeKey && `${base.dedupeKey}:${a._id}` })));
  } catch (err) {
    logError('Admin notification failed', err);
    return [];
  }
}

// Run any background task (e.g. a password-reset email) so it never blocks or fails the request.
const background = (fn) => track(Promise.resolve().then(fn).catch((err) => logError('Background task failed', err)));

// Used by graceful shutdown: wait for in-flight e-mail/notification jobs, but never longer than timeoutMs.
async function drain(timeoutMs = 8000) {
  const timedOut = Symbol('timeout');
  let timer;
  const result = await Promise.race([idle().then(() => 'drained'), new Promise((r) => { timer = setTimeout(() => r(timedOut), timeoutMs); })]);
  clearTimeout(timer);
  return result === timedOut ? { drained: false, pending: pending.size } : { drained: true, pending: 0 };
}

module.exports = { notify, notifyAdmins, background, idle, drain };
