const crypto = require('crypto');
const Razorpay = require('razorpay');
const AppError = require('../utils/AppError');

// All Razorpay access goes through this file so tests can replace createOrder / fetchPayment with fakes.
let client;
const isConfigured = () => !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
const isWebhookConfigured = () => !!process.env.RAZORPAY_WEBHOOK_SECRET;
const mode = () => (String(process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_live_') ? 'live' : 'test');

function getClient() {
  if (!isConfigured()) throw new AppError('Payments are not configured on this server', 503);
  if (!client) client = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
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
  if (!process.env.RAZORPAY_KEY_SECRET || !orderId || !paymentId || !signature) return false;
  return safeEqual(hmac(process.env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`), signature);
}

// Webhook signature = HMAC_SHA256(exact raw request body, WEBHOOK_SECRET). rawBody must be the untouched Buffer.
function verifyWebhookSignature(rawBody, signature) {
  if (!isWebhookConfigured() || !Buffer.isBuffer(rawBody) || !signature) return false;
  return safeEqual(hmac(process.env.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
}

// Errors are logged without request bodies or secrets, and shown to users in a generic form.
function gatewayError(action, err) {
  console.error(`Razorpay ${action} failed: status=${err?.statusCode ?? 'n/a'} code=${err?.error?.code ?? err?.code ?? 'n/a'}`);
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

module.exports = { isConfigured, isWebhookConfigured, mode, verifyCheckoutSignature, verifyWebhookSignature, createOrder, fetchPayment };
