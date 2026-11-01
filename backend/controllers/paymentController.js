const Job = require('../models/Job');
const Payment = require('../models/Payment');
const WebhookEvent = require('../models/WebhookEvent');
const AppError = require('../utils/AppError');
const razorpay = require('../services/razorpay');
const { applyGatewayPayment, markFailed, matchesRecord } = require('../services/paymentProcessor');
const { featuredJob, ORDER_REUSE_MINUTES } = require('../config/payments');
const { isFeaturedActive } = require('../utils/featured');
const v = require('../validators/paymentValidator');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const OPEN = Payment.OPEN;
const STALE_WEBHOOK_MS = 72 * 3600 * 1000; // Razorpay retries for ~24h; anything older than 72h is treated as a replay

// What the browser is allowed to know about a payment record.
const publicPayment = (p) => ({
  _id: p._id, jobId: p.jobId, amount: p.amount, currency: p.currency, status: p.status, purpose: p.purpose,
  failureReason: p.failureReason, createdAt: p.createdAt, verifiedAt: p.verifiedAt,
  featuredStartsAt: p.featuredStartsAt, featuredEndsAt: p.featuredEndsAt, activated: !!p.activatedAt,
  needsReview: !!p.activationNote,
});

/* GET /api/payments/config (employer): the plan shown on the button. Pricing lives on the server. */
exports.getConfig = (_req, res) => {
  const plan = featuredJob();
  res.json({
    success: true, message: 'Payment configuration',
    data: { enabled: razorpay.isConfigured(), mode: razorpay.mode(), amount: plan.amount, currency: plan.currency, days: plan.days, keyId: razorpay.isConfigured() ? process.env.RAZORPAY_KEY_ID : null },
  });
};

/* POST /api/payments/create-order  { jobId } */
exports.createOrder = asyncHandler(async (req, res) => {
  const { jobId } = v.createOrderBody.parse(req.body);
  if (!razorpay.isConfigured()) throw new AppError('Payments are not configured on this server', 503);
  const plan = featuredJob();

  const job = await Job.findById(jobId).select('title employerId status moderation isFeatured featuredUntil featuredPaymentId');
  if (!job) throw new AppError('Job not found', 404);
  if (String(job.employerId) !== req.user.id) throw new AppError('You do not own this job', 403);
  if (job.status !== 'active') throw new AppError('Only active jobs can be featured', 409);
  if ((job.moderation?.status ?? 'none') !== 'none') throw new AppError('This job is under moderation review and cannot be featured', 409);
  if (isFeaturedActive(job)) throw new AppError(`This job is already featured until ${job.featuredUntil.toISOString().slice(0, 10)}`, 409);

  const key = { employerId: req.user.id, jobId: job._id, purpose: plan.purpose };
  // Abandoned checkouts (and orders at an outdated price) stop blocking new orders.
  await Payment.updateMany(
    { ...key, status: 'created', $or: [{ createdAt: { $lt: new Date(Date.now() - ORDER_REUSE_MINUTES * 60000) } }, { amount: { $ne: plan.amount } }] },
    { $set: { status: 'failed', failureReason: 'Abandoned: checkout was not completed' } }
  );

  const respond = (payment, status) => {
    if (payment.status === 'pending') throw new AppError('A payment for this job is already awaiting confirmation. Please wait a minute and refresh.', 409);
    return res.status(status).json({
      success: true, message: status === 201 ? 'Order created' : 'Existing order reused',
      data: { paymentRecordId: payment._id, orderId: payment.razorpayOrderId, amount: payment.amount, currency: payment.currency, keyId: process.env.RAZORPAY_KEY_ID, jobTitle: job.title, days: payment.featuredDays },
    });
  };

  const existing = await Payment.findOne({ ...key, status: { $in: OPEN } }); // double-click / second tab: same order
  if (existing) return respond(existing, 200);

  const order = await razorpay.createOrder({
    amount: plan.amount, currency: plan.currency,
    receipt: `job_${String(job._id).slice(-8)}_${Date.now()}`.slice(0, 40),
    notes: { jobId: String(job._id), employerId: req.user.id, purpose: plan.purpose },
  });
  if (!order?.id || Number(order.amount) !== plan.amount || order.currency !== plan.currency) throw new AppError('The payment gateway returned an unexpected order. Please try again.', 502);

  let payment;
  try {
    payment = await Payment.create({ ...key, razorpayOrderId: order.id, amount: plan.amount, currency: plan.currency, featuredDays: plan.days });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const raced = await Payment.findOne({ ...key, status: { $in: OPEN } }); // a parallel request won the unique index
    if (!raced) throw err;
    return respond(raced, 200);
  }
  return respond(payment, 201);
});

/* POST /api/payments/verify  Called right after Razorpay Checkout succeeds. The result is provisional until Razorpay confirms capture. */
exports.verifyPayment = asyncHandler(async (req, res) => {
  const body = v.verifyBody.parse(req.body);
  const payment = await Payment.findOne({ _id: body.paymentRecordId, employerId: req.user.id }); // 404 for other people's records
  if (!payment) throw new AppError('Payment not found', 404);
  // The signature is checked against the order id stored on OUR server, never one supplied by the browser.
  if (body.razorpay_order_id !== payment.razorpayOrderId) throw new AppError('Payment does not match this order', 400);
  if (!razorpay.verifyCheckoutSignature({ orderId: payment.razorpayOrderId, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature })) {
    throw new AppError('Invalid payment signature', 400);
  }

  if (payment.status !== 'paid') {
    // Ask Razorpay (authenticated) what really happened. The browser's word is not enough.
    const rp = await razorpay.fetchPayment(body.razorpay_payment_id);
    await applyGatewayPayment(payment, rp);
  }
  const fresh = await Payment.findById(payment._id);
  const message = fresh.status === 'paid' ? 'Payment confirmed' : fresh.status === 'failed' ? 'Payment failed' : 'Payment received, waiting for confirmation';
  res.json({ success: true, message, data: publicPayment(fresh) });
});

/* GET /api/payments/my  (employer sees only their own records) */
exports.myPayments = asyncHandler(async (req, res) => {
  const { page, limit } = v.myPaymentsQuery.parse(req.query);
  const filter = { employerId: req.user.id };
  const [rows, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('jobId', 'title company').lean(),
    Payment.countDocuments(filter),
  ]);
  const data = rows.map((p) => ({ ...publicPayment(p), jobId: p.jobId?._id ?? p.jobId, jobTitle: p.jobId?.title ?? 'Deleted job', company: p.jobId?.company }));
  res.json({ success: true, message: 'Payments retrieved', data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

/* GET /api/payments/:id  (own record: used to poll while a payment awaits confirmation) */
exports.getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ _id: req.params.id, employerId: req.user.id });
  if (!payment) throw new AppError('Payment not found', 404);
  res.json({ success: true, message: 'Payment retrieved', data: publicPayment(payment) });
});

/* POST /api/payments/webhook  Called by Razorpay servers (no cookie). app.js gives this route the RAW body. */
exports.webhook = asyncHandler(async (req, res) => {
  const raw = req.body;
  const signature = req.get('x-razorpay-signature');
  if (!razorpay.isWebhookConfigured()) return res.status(503).json({ success: false, message: 'Webhook not configured' });
  if (!Buffer.isBuffer(raw) || !razorpay.verifyWebhookSignature(raw, signature)) {
    return res.status(400).json({ success: false, message: 'Invalid signature' }); // 4xx: do not process
  }

  let evt;
  try { evt = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).json({ success: false, message: 'Invalid payload' }); }
  const eventId = req.get('x-razorpay-event-id');
  if (!eventId) return res.status(400).json({ success: false, message: 'Missing event id' });
  const ack = (outcome, extra = {}) => res.json({ success: true, outcome, ...extra }); // always 200 once handled, so Razorpay stops retrying

  if (evt.created_at && Date.now() - evt.created_at * 1000 > STALE_WEBHOOK_MS) return res.status(400).json({ success: false, message: 'Event too old' });
  if (await WebhookEvent.exists({ eventId })) return ack('duplicate'); // replay or retry of an event we already handled

  const rp = evt?.payload?.payment?.entity;
  let outcome = 'ignored';
  let orderId = rp?.order_id;
  if (['payment.captured', 'order.paid', 'payment.failed'].includes(evt.event) && rp?.id && orderId) {
    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    if (!payment) outcome = 'unknown_order'; // e.g. another product on the same Razorpay account
    else if (!matchesRecord(payment, rp)) outcome = 'mismatch';
    else if (evt.event === 'payment.failed') { await markFailed(payment, rp.error_description); outcome = 'failed'; }
    else outcome = (await applyGatewayPayment(payment, { ...rp, status: 'captured' })).outcome; // webhook is signed, so the event itself is the trusted confirmation
    if (outcome === 'mismatch') console.warn(`Webhook ${eventId}: amount/currency/order mismatch for payment ${payment?._id}`);
  }

  try {
    await WebhookEvent.create({ eventId, event: String(evt.event).slice(0, 60), razorpayOrderId: orderId, outcome });
  } catch (err) {
    if (err.code !== 11000) throw err; // two copies arrived at once: both were processed idempotently
  }
  return ack(outcome);
});
