// The ONLY place where a payment becomes "paid" and a job becomes featured.
// Both the checkout-verify endpoint and the webhook call applyGatewayPayment(), so the rules are identical and
// every step is idempotent: retries, duplicates and out-of-order events cannot activate or extend a purchase twice.
const Payment = require('../models/Payment');
const Job = require('../models/Job');
const { isFeaturedActive } = require('../utils/featured');
const events = require('./events');

const DAY = 864e5;

// Money amounts/currency/order id from Razorpay must match what WE stored when the order was created.
function matchesRecord(payment, rp) {
  return rp && rp.order_id === payment.razorpayOrderId && Number(rp.amount) === payment.amount && String(rp.currency).toUpperCase() === payment.currency;
}

async function markFailed(payment, reason) {
  // 'paid' is terminal: a late "failed" event must never undo a confirmed payment.
  const r = await Payment.updateOne({ _id: payment._id, status: { $in: ['created', 'pending'] } }, { $set: { status: 'failed', failureReason: String(reason || 'Payment failed').slice(0, 300) } });
  if (r.modifiedCount) events.onPaymentFailed(payment); // only the request that really failed it notifies
}

// Switch the featured placement on, once. Safe to call repeatedly.
async function activate(payment) {
  const job = await Job.findById(payment.jobId).select('status moderation isFeatured featuredUntil featuredAt featuredPaymentId');
  const syncFromJob = async (j) => {
    const end = j.featuredUntil;
    await Payment.updateOne({ _id: payment._id }, { $set: { activatedAt: j.featuredAt, featuredEndsAt: end, featuredStartsAt: new Date(end.getTime() - payment.featuredDays * DAY) }, $unset: { activationNote: 1 } });
  };

  if (job && String(job.featuredPaymentId) === String(payment._id)) return syncFromJob(job); // already applied

  if (!job || job.status !== 'active' || job.moderation?.status === 'removed') {
    await Payment.updateOne({ _id: payment._id, activatedAt: { $exists: false } }, { $set: { activationNote: 'Payment received but the job was closed or removed, so no featured placement was activated. Review or refund in the Razorpay dashboard.' } });
    return null;
  }

  const now = new Date();
  const start = isFeaturedActive(job, now) ? job.featuredUntil : now; // paying while still featured stacks after the current period
  const end = new Date(start.getTime() + payment.featuredDays * DAY);
  // The condition makes this a one-time write per payment even if two requests race.
  await Job.updateOne({ _id: job._id, featuredPaymentId: { $ne: payment._id } }, { $set: { isFeatured: true, featuredAt: now, featuredUntil: end, featuredPaymentId: payment._id } });
  const fresh = await Job.findById(job._id).select('featuredUntil featuredAt featuredPaymentId');
  if (String(fresh.featuredPaymentId) === String(payment._id)) await syncFromJob(fresh);
  return fresh;
}

async function confirmPaid(payment, razorpayPaymentId) {
  const paid = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $ne: 'paid' } }, // atomic: only one caller wins this transition
    { $set: { status: 'paid', razorpayPaymentId, verifiedAt: new Date() }, $unset: { failureReason: 1 } },
    { new: true }
  );
  if (paid) {
    await activate(paid);
    const fresh = await Payment.findById(paid._id);
    events.onPaymentSucceeded(fresh);
    if (!fresh.activatedAt && fresh.activationNote) events.onPaymentNeedsReview(fresh);
  }
  else if (payment.status === 'paid' && !payment.activatedAt && !payment.activationNote) await activate(payment); // recover from a crash between the two steps
  return { payment: await Payment.findById(payment._id), newlyPaid: !!paid };
}

// rp = the payment entity from Razorpay (fetched with our API keys, or taken from a signature-verified webhook).
async function applyGatewayPayment(payment, rp) {
  if (!matchesRecord(payment, rp)) {
    console.warn(`Payment ${payment._id}: gateway data does not match the stored order (order/amount/currency). Not activating.`);
    return { payment, outcome: 'mismatch' };
  }
  if (rp.status === 'captured') {
    const r = await confirmPaid(payment, rp.id);
    return { ...r, outcome: r.newlyPaid ? 'paid' : 'already_paid' };
  }
  if (rp.status === 'failed') {
    await markFailed(payment, rp.error_description);
    return { payment: await Payment.findById(payment._id), outcome: 'failed' };
  }
  // created / authorized: money not captured yet
  await Payment.updateOne({ _id: payment._id, status: 'created' }, { $set: { status: 'pending', razorpayPaymentId: rp.id } }).catch(() => {});
  return { payment: await Payment.findById(payment._id), outcome: 'pending' };
}

module.exports = { applyGatewayPayment, confirmPaid, markFailed, activate, matchesRecord };
