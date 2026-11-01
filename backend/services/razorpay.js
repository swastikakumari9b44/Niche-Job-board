const crypto = require('crypto');
const Razorpay = require('razorpay');
const AppError = require('../utils/AppError');

// All Razorpay access goes through this file so tests can replace createOrder / fetchPayment with fakes.
let client;
let clientFor; // which key pair the cached client was built with
// Hosting dashboards make it easy to paste a trailing space, a newline or surrounding quotes. Strip them.
const clean = (v) => String(v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
const keyId = () => clean(process.env.RAZORPAY_KEY_ID);
const keySecret = () => clean(process.env.RAZORPAY_KEY_SECRET);
const webhookSecret = () => clean(process.env.RAZORPAY_WEBHOOK_SECRET);
const isConfigured = () => !!(keyId() && keySecret());
const isWebhookConfigured = () => !!webhookSecret();
const mode = () => (keyId().startsWith('rzp_live_') ? 'live' : 'test');

function getClient() {
  if (!isConfigured()) throw new AppError('Payments are not configured on this server', 503);
  const pair = `${keyId()}:${keySecret()}`;
  if (!client || clientFor !== pair) { client = new Razorpay({ key_id: keyId(), key_secret: keySecret() }); clientFor = pair; }
  return client;
}

// Constant-time comparison of two hex digests.
function safeEqual(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

// Checkout signature = HMAC_SHA256(orderId + "|" + paymentId, KEY_SECRET). The caller passes the order id stored on OUR server.
function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  if (!keySecret() || !orderId || !paymentId || !signature) return false;
  return safeEqual(hmac(keySecret(), `${orderId}|${paymentId}`), signature);
}

// Webhook signature = HMAC_SHA256(exact raw request body, WEBHOOK_SECRET). rawBody must be the untouched Buffer.
function verifyWebhookSignature(rawBody, signature) {
  if (!isWebhookConfigured() || !Buffer.isBuffer(rawBody) || !signature) return false;
  return safeEqual(hmac(webhookSecret(), rawBody), signature);
}

// Errors are logged without request bodies or secrets, and shown to users in a generic form.
function gatewayError(action, err) {
  console.error(`Razorpay ${action} failed: status=${err?.statusCode ?? 'n/a'} code=${err?.error?.code ?? err?.code ?? 'n/a'} reason="${err?.error?.description ?? err?.message ?? 'n/a'}"`);
  if (err?.statusCode === 401) {
    console.error('  -> Razorpay rejected the API keys. On this server, RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be a MATCHING pair generated together in the same mode (Test or Live), with no spaces or quotes. Regenerate the key pair, update both, then redeploy.');
  }
  return new AppError('The payment gateway is unavailable right now. Please try again in a moment.', 502);
}

async function createOrder({ amount, currency, receipt, notes }) {
  try {
    return await getClient().orders.create({ amount, currency, receipt, notes });
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw gatewayError('order creation', err);
  }
}

async function fetchPayment(paymentId) {
  try {
    return await getClient().payments.fetch(paymentId);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw gatewayError('payment lookup', err);
  }
}

// Printed once at startup. Shows only non-secret facts so a wrong setup is obvious in the logs.
function logConfigStatus() {
  if (!isConfigured()) return console.warn('Payments: DISABLED (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set)');
  const id = keyId(), secret = keySecret();
  const problems = [];
  if (!/^rzp_(test|live)_[A-Za-z0-9]+$/.test(id)) problems.push('RAZORPAY_KEY_ID should look like rzp_test_XXXXXXXX');
  if (secret.length < 16 || /\s/.test(secret)) problems.push('RAZORPAY_KEY_SECRET looks wrong (too short or contains spaces)');
  if (clean(process.env.RAZORPAY_KEY_ID) !== String(process.env.RAZORPAY_KEY_ID)) problems.push('RAZORPAY_KEY_ID had stray spaces/quotes (cleaned automatically; fix it anyway)');
  if (clean(process.env.RAZORPAY_KEY_SECRET) !== String(process.env.RAZORPAY_KEY_SECRET)) problems.push('RAZORPAY_KEY_SECRET had stray spaces/quotes (cleaned automatically; fix it anyway)');
  if (!isWebhookConfigured()) problems.push('RAZORPAY_WEBHOOK_SECRET is not set (webhooks will be rejected)');
  console.log(`Payments: enabled in ${mode()} mode, key id ${id.slice(0, 12)}..., secret length ${secret.length}${isWebhookConfigured() ? ', webhook secret set' : ''}`);
  for (const p of problems) console.warn(`Payments warning: ${p}`);
}

module.exports = { keyId, logConfigStatus, isConfigured, isWebhookConfigured, mode, verifyCheckoutSignature, verifyWebhookSignature, createOrder, fetchPayment };
