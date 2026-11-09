// Payment unit tests: no database, no network. Razorpay is never contacted.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-123';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummykey123';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_value_123';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_value_123';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const razorpay = require('../services/razorpay');
const { isFeaturedActive } = require('../utils/featured');

const IDS = { candidate: 'a'.repeat(24), employer: 'b'.repeat(24), admin: 'c'.repeat(24) };
const accounts = Object.fromEntries(Object.entries(IDS).map(([role, id]) => [id, { _id: id, role, status: 'active' }]));
const realFind = User.findById;
require('../models/Session').exists = async () => ({ _id: 'stub-session' }); // unit tests have no database: every token's session counts as live
User.findById = (id) => { const d = accounts[String(id)] || null; return Object.assign(Promise.resolve(d), { select: () => ({ lean: () => Promise.resolve(d) }) }); };
const token = (role) => jwt.sign({ id: IDS[role], role, jti: 'test-jti' }, process.env.JWT_SECRET, { expiresIn: '1h' });
const auth = (role) => ({ authorization: `Bearer ${token(role)}` });

let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => { server.close(); User.findById = realFind; });
const call = (p, { method = 'GET', body, headers = {} } = {}) => fetch(base + p, { method, body, headers: { 'content-type': 'application/json', ...headers } });
const sign = (raw) => crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');

test('payment endpoints need a login and the employer role (401 / 403)', async () => {
  const jobId = 'd'.repeat(24);
  for (const [m, p] of [['POST', '/api/payments/create-order'], ['POST', '/api/payments/verify'], ['GET', '/api/payments/my'], ['GET', '/api/payments/config'], ['GET', `/api/payments/${jobId}`]]) {
    assert.strictEqual((await call(p, { method: m, body: m === 'POST' ? '{}' : undefined })).status, 401, `anonymous ${m} ${p}`);
    for (const role of ['candidate', 'admin']) {
      assert.strictEqual((await call(p, { method: m, body: m === 'POST' ? '{}' : undefined, headers: auth(role) })).status, 403, `${role} ${m} ${p}`);
    }
  }
});

test('admin payment endpoints: 401 anonymous, 403 for candidates and employers', async () => {
  for (const p of ['/api/admin/payments', '/api/admin/payments/summary']) {
    assert.strictEqual((await call(p)).status, 401);
    for (const role of ['candidate', 'employer']) assert.strictEqual((await call(p, { headers: auth(role) })).status, 403, `${role} ${p}`);
  }
});

test('the client can never choose the price: amount, currency or other fields are rejected', async () => {
  const jobId = 'd'.repeat(24);
  for (const extra of [{ amount: 1 }, { currency: 'USD' }, { amount: 49900, currency: 'INR' }, { employerId: IDS.employer }, { status: 'paid' }]) {
    const r = await call('/api/payments/create-order', { method: 'POST', body: JSON.stringify({ jobId, ...extra }), headers: auth('employer') });
    assert.strictEqual(r.status, 400, JSON.stringify(extra));
  }
  assert.strictEqual((await call('/api/payments/create-order', { method: 'POST', body: JSON.stringify({ jobId: 'nope' }), headers: auth('employer') })).status, 400);
});

test('checkout verification input is validated before anything else', async () => {
  const good = { paymentRecordId: 'd'.repeat(24), razorpay_order_id: 'order_ABC123', razorpay_payment_id: 'pay_ABC123', razorpay_signature: 'a'.repeat(64) };
  for (const bad of [{ razorpay_signature: 'xyz' }, { razorpay_payment_id: 'hack' }, { razorpay_order_id: '../etc' }, { paymentRecordId: '1' }, { amount: 1 }]) {
    const r = await call('/api/payments/verify', { method: 'POST', body: JSON.stringify({ ...good, ...bad }), headers: auth('employer') });
    assert.strictEqual(r.status, 400, JSON.stringify(bad));
  }
});

test('checkout signature: correct HMAC accepted; wrong key, wrong order or tampering rejected', () => {
  const orderId = 'order_Abc123', paymentId = 'pay_Xyz789';
  const good = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest('hex');
  assert.ok(razorpay.verifyCheckoutSignature({ orderId, paymentId, signature: good }));
  assert.ok(!razorpay.verifyCheckoutSignature({ orderId: 'order_Other', paymentId, signature: good }));
  assert.ok(!razorpay.verifyCheckoutSignature({ orderId, paymentId: 'pay_Other', signature: good }));
  assert.ok(!razorpay.verifyCheckoutSignature({ orderId, paymentId, signature: good.replace(/.$/, good.endsWith('0') ? '1' : '0') }));
  assert.ok(!razorpay.verifyCheckoutSignature({ orderId, paymentId, signature: '' }));
  assert.ok(!razorpay.verifyCheckoutSignature({ orderId, paymentId, signature: crypto.createHmac('sha256', 'wrong').update(`${orderId}|${paymentId}`).digest('hex') }));
});

test('webhook: invalid, missing or tampered signature is rejected with 400 before any processing', async () => {
  const raw = JSON.stringify({ event: 'payment.captured', created_at: Math.floor(Date.now() / 1000), payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', amount: 49900, currency: 'INR', status: 'captured' } } } });
  const post = (body, sig) => fetch(`${base}/api/payments/webhook`, { method: 'POST', body, headers: { 'content-type': 'application/json', ...(sig && { 'x-razorpay-signature': sig }), 'x-razorpay-event-id': 'evt_unit_1' } });
  assert.strictEqual((await post(raw)).status, 400); // no signature
  assert.strictEqual((await post(raw, 'a'.repeat(64))).status, 400); // wrong signature
  assert.strictEqual((await post(raw, crypto.createHmac('sha256', 'not-the-webhook-secret').update(raw).digest('hex'))).status, 400); // signed with the wrong secret
  assert.strictEqual((await post(raw.replace('49900', '1'), sign(raw))).status, 400); // body changed after signing
  assert.strictEqual((await post(JSON.stringify(JSON.parse(raw), null, 2), sign(raw))).status, 400); // re-serialized JSON is a different byte sequence
});

test('webhook does not need a login cookie and is not affected by the JSON body parser', async () => {
  // A signature-valid but irrelevant event gets past verification (then needs no DB because the event is ignored and event-id lookup is the first DB use).
  const raw = '{"event":"payment.authorized","created_at":' + Math.floor(Date.now() / 1000) + ',"payload":{}}';
  const r = await fetch(`${base}/api/payments/webhook`, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': sign(raw), 'x-razorpay-event-id': 'evt_unit_2' } });
  assert.notStrictEqual(r.status, 400); // passed signature verification (spaces/whitespace preserved byte-for-byte)
  assert.notStrictEqual(r.status, 401);
});

test('webhook answers 503 when no webhook secret is configured (never "accepts everything")', async () => {
  const saved = process.env.RAZORPAY_WEBHOOK_SECRET; delete process.env.RAZORPAY_WEBHOOK_SECRET;
  const r = await fetch(`${base}/api/payments/webhook`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json', 'x-razorpay-signature': 'x' } });
  process.env.RAZORPAY_WEBHOOK_SECRET = saved;
  assert.strictEqual(r.status, 503);
});

test('featured is active only with payment id + future expiry + active job + not moderated', () => {
  const future = new Date(Date.now() + 864e5), past = new Date(Date.now() - 1000);
  const base = { isFeatured: true, featuredPaymentId: 'p1', featuredUntil: future, status: 'active', moderation: { status: 'none' } };
  assert.ok(isFeaturedActive(base));
  assert.ok(isFeaturedActive({ ...base, moderation: undefined })); // older jobs without the field
  assert.ok(!isFeaturedActive({ ...base, isFeatured: false }));
  assert.ok(!isFeaturedActive({ ...base, featuredPaymentId: undefined })); // boolean alone is never trusted
  assert.ok(!isFeaturedActive({ ...base, featuredUntil: past })); // expired
  assert.ok(!isFeaturedActive({ ...base, featuredUntil: undefined }));
  assert.ok(!isFeaturedActive({ ...base, status: 'closed' }));
  assert.ok(!isFeaturedActive({ ...base, moderation: { status: 'removed' } }));
  assert.ok(!isFeaturedActive({ ...base, moderation: { status: 'flagged' } }));
  assert.ok(!isFeaturedActive(null));
});

test('payment price and duration come from server configuration', () => {
  const { featuredJob } = require('../config/payments');
  const saved = { p: process.env.FEATURED_PRICE_PAISE, d: process.env.FEATURED_DAYS };
  delete process.env.FEATURED_PRICE_PAISE; delete process.env.FEATURED_DAYS;
  assert.deepStrictEqual(featuredJob(), { purpose: 'featured_job', amount: 49900, currency: 'INR', days: 7 });
  process.env.FEATURED_PRICE_PAISE = '99900'; process.env.FEATURED_DAYS = '14';
  assert.strictEqual(featuredJob().amount, 99900); assert.strictEqual(featuredJob().days, 14);
  process.env.FEATURED_PRICE_PAISE = 'abc'; assert.strictEqual(featuredJob().amount, 49900); // bad value falls back safely
  if (saved.p === undefined) delete process.env.FEATURED_PRICE_PAISE; else process.env.FEATURED_PRICE_PAISE = saved.p;
  if (saved.d === undefined) delete process.env.FEATURED_DAYS; else process.env.FEATURED_DAYS = saved.d;
});

test('keys pasted with spaces, newlines or quotes still work (common hosting-dashboard mistake)', () => {
  const saved = { id: process.env.RAZORPAY_KEY_ID, sec: process.env.RAZORPAY_KEY_SECRET };
  process.env.RAZORPAY_KEY_ID = ' "rzp_test_dummykey123"\n';
  process.env.RAZORPAY_KEY_SECRET = '  \'test_key_secret_value_123\'  \n';
  try {
    assert.strictEqual(razorpay.keyId(), 'rzp_test_dummykey123');
    assert.ok(razorpay.isConfigured());
    const sig = crypto.createHmac('sha256', 'test_key_secret_value_123').update('order_A|pay_B').digest('hex');
    assert.ok(razorpay.verifyCheckoutSignature({ orderId: 'order_A', paymentId: 'pay_B', signature: sig }));
  } finally { process.env.RAZORPAY_KEY_ID = saved.id; process.env.RAZORPAY_KEY_SECRET = saved.sec; }
});

test('startup status line shows mode and warnings but never the secret', () => {
  const logs = []; const { log, warn } = console;
  console.log = (...a) => logs.push(a.join(' ')); console.warn = (...a) => logs.push(a.join(' '));
  try { razorpay.logConfigStatus(); } finally { console.log = log; console.warn = warn; }
  const text = logs.join('\n');
  assert.match(text, /enabled in test mode/);
  assert.ok(!text.includes(process.env.RAZORPAY_KEY_SECRET));
});
