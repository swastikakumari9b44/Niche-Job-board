// Payment integration tests against a real MongoDB. Razorpay itself is MOCKED (no network, no keys needed).
// Skipped unless MONGO_URI_TEST points to a database whose name contains "test".
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-integration-123';
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummykey123';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_value_123';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_value_123';
delete process.env.FEATURED_PRICE_PAISE; delete process.env.FEATURED_DAYS;
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const URI = process.env.MONGO_URI_TEST;
const dbName = URI ? new URL(URI.replace('mongodb+srv://', 'mongodb://')).pathname.replace('/', '') : '';
const skip = !URI ? 'MONGO_URI_TEST not set' : !/test/i.test(dbName) ? 'database name must contain "test"' : false;

describe('Razorpay featured-job payments (MongoDB, mocked gateway)', { skip }, () => {
  const run = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const E = (n) => `${n}-${run}@itest.example`;
  const DAY = 864e5;
  let server, base, User, Job, Payment, WebhookEvent, razorpay, AppError;
  const jar = {}, ids = {}, jobs = {};
  let orderSeq = 0, evtSeq = 0;
  const gateway = new Map(); // fake Razorpay: paymentId -> payment entity
  let gatewayDown = false;

  const call = async (p, { method = 'GET', body, who } = {}) => {
    const res = await fetch(base + p, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json', ...(who && { cookie: jar[who] }) } });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const signIn = async (who, path, payload) => {
    const res = await fetch(base + path, { method: 'POST', body: JSON.stringify(payload), headers: { 'content-type': 'application/json' } });
    jar[who] = res.headers.get('set-cookie').split(';')[0];
    return (await res.json()).data.user;
  };
  const hmac = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
  const checkoutSig = (orderId, payId, secret = process.env.RAZORPAY_KEY_SECRET) => hmac(secret, `${orderId}|${payId}`);

  // A signed webhook delivery exactly as Razorpay would send it (raw body bytes + signature header).
  const webhook = async (event, rp, { eventId = `evt_${run}_${++evtSeq}`, secret = process.env.RAZORPAY_WEBHOOK_SECRET, createdAt = Math.floor(Date.now() / 1000) } = {}) => {
    const raw = JSON.stringify({ entity: 'event', event, created_at: createdAt, payload: { payment: { entity: rp } } });
    const res = await fetch(`${base}/api/payments/webhook`, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-razorpay-signature': hmac(secret, raw), 'x-razorpay-event-id': eventId } });
    return { status: res.status, body: await res.json(), eventId };
  };
  const entity = (order, payId, extra = {}) => ({ id: payId, order_id: order.orderId, amount: order.amount, currency: order.currency, status: 'captured', ...extra });
  const newPayId = () => `pay_T${run}${++orderSeq}`;

  const newJob = async (who, title, extra = {}) => {
    const r = await call('/api/jobs', { method: 'POST', who, body: { title: `${title} ${run}`, company: 'PayCo', description: 'A job used by payment tests.', nicheCategory: 'AI/ML', location: 'Remote', employmentType: 'Full-time', requiredSkills: ['Python'], customFields: { programmingLanguages: ['Python'], mlFrameworks: ['PyTorch'], experienceLevel: 'Entry Level' }, ...extra } });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body.data._id;
  };
  const order = async (who, jobId) => { const r = await call('/api/payments/create-order', { method: 'POST', who, body: { jobId } }); return r; };

  before(async () => {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    const app = require('../app');
    User = require('../models/User'); Job = require('../models/Job'); Payment = require('../models/Payment'); WebhookEvent = require('../models/WebhookEvent');
    razorpay = require('../services/razorpay'); AppError = require('../utils/AppError');
    await Promise.all([User.init(), Job.init(), Payment.init(), WebhookEvent.init()]);
    // ---- fake Razorpay: no network ----
    razorpay.createOrder = async ({ amount, currency, notes }) => ({ id: `order_T${run}${++orderSeq}`, amount, currency, notes, status: 'created' });
    razorpay.fetchPayment = async (id) => { if (gatewayDown) throw new AppError('The payment gateway is unavailable right now.', 502); const p = gateway.get(id); if (!p) throw new AppError('The payment gateway is unavailable right now.', 502); return p; };
    await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });

    ids.emp = (await signIn('emp', '/api/auth/register', { name: 'Pay Emp', email: E('emp'), password: 'password123', role: 'employer' }))._id;
    ids.emp2 = (await signIn('emp2', '/api/auth/register', { name: 'Other Emp', email: E('emp2'), password: 'password123', role: 'employer' }))._id;
    ids.cand = (await signIn('cand', '/api/auth/register', { name: 'Pay Cand', email: E('cand'), password: 'password123', role: 'candidate' }))._id;
    const admin = await User.create({ name: 'Pay Admin', email: E('admin'), password: 'password123', role: 'admin' }); ids.admin = String(admin._id);
    await signIn('admin', '/api/auth/login', { email: E('admin'), password: 'password123' });
    for (const k of ['A', 'B', 'C', 'D', 'E', 'F']) jobs[k] = await newJob('emp', `Job${k}`);
    jobs.other = await newJob('emp2', 'OtherEmployerJob');
    jobs.closed = await newJob('emp', 'ClosedJob'); await Job.updateOne({ _id: jobs.closed }, { status: 'closed' });
    jobs.removed = await newJob('emp', 'RemovedJob'); await Job.updateOne({ _id: jobs.removed }, { 'moderation.status': 'removed', status: 'closed' });
    jobs.flagged = await newJob('emp', 'FlaggedJob'); await Job.updateOne({ _id: jobs.flagged }, { 'moderation.status': 'flagged' });
  });

  after(async () => {
    const users = await User.find({ email: /@itest\.example$/ }).select('_id');
    const uids = users.map((u) => u._id);
    await Payment.deleteMany({ employerId: { $in: uids } });
    await WebhookEvent.deleteMany({ eventId: new RegExp(`^evt_${run}_`) });
    await Job.deleteMany({ employerId: { $in: uids } });
    await User.deleteMany({ _id: { $in: uids } });
    server.close(); await mongoose.disconnect();
  });

  test('order creation: authentication, role, ownership and eligibility', async () => {
    assert.strictEqual((await order(undefined, jobs.A)).status, 401);
    assert.strictEqual((await order('cand', jobs.A)).status, 403); // candidate
    assert.strictEqual((await order('admin', jobs.A)).status, 403);
    assert.strictEqual((await order('emp2', jobs.A)).status, 403); // someone else's job
    assert.strictEqual((await order('emp', 'e'.repeat(24))).status, 404);
    assert.strictEqual((await order('emp', jobs.closed)).status, 409); // closed
    assert.strictEqual((await order('emp', jobs.removed)).status, 409); // removed by a moderator
    assert.strictEqual((await order('emp', jobs.flagged)).status, 409); // under moderation review
    assert.strictEqual(await Payment.countDocuments({ employerId: ids.emp, jobId: { $in: [jobs.closed, jobs.removed, jobs.flagged, jobs.A] } }), 0);
    assert.strictEqual((await call('/api/payments/create-order', { method: 'POST', who: 'emp', body: { jobId: jobs.A, amount: 1, currency: 'INR' } })).status, 400);
  });

  test('valid order: price decided by the server, only safe data returned, duplicate clicks reuse one order', async () => {
    const cfg = (await call('/api/payments/config', { who: 'emp' })).body.data;
    assert.deepStrictEqual([cfg.enabled, cfg.amount, cfg.currency, cfg.days, cfg.mode], [true, 49900, 'INR', 7, 'test']);
    const r = await order('emp', jobs.A);
    assert.strictEqual(r.status, 201);
    const d = r.body.data; ids.orderA = d;
    assert.deepStrictEqual([d.amount, d.currency, d.keyId], [49900, 'INR', 'rzp_test_dummykey123']);
    assert.ok(!JSON.stringify(r.body).includes(process.env.RAZORPAY_KEY_SECRET));
    const rec = await Payment.findById(d.paymentRecordId);
    assert.strictEqual(rec.status, 'created'); assert.strictEqual(String(rec.employerId), ids.emp); assert.strictEqual(rec.amount, 49900); assert.strictEqual(rec.featuredDays, 7);
    // double click / parallel clicks => the same order, one record
    const again = await Promise.all([order('emp', jobs.A), order('emp', jobs.A), order('emp', jobs.A)]);
    assert.ok(again.every((x) => x.body.data.orderId === d.orderId && [200, 201].includes(x.status)));
    assert.strictEqual(await Payment.countDocuments({ jobId: jobs.A }), 1);
  });

  test('invalid checkout signature, wrong order, or someone else\'s record are rejected; nothing is activated', async () => {
    const o = ids.orderA, payId = newPayId();
    gateway.set(payId, entity(o, payId));
    const verify = (who, body) => call('/api/payments/verify', { method: 'POST', who, body });
    const good = { paymentRecordId: o.paymentRecordId, razorpay_order_id: o.orderId, razorpay_payment_id: payId };
    assert.strictEqual((await verify('emp', { ...good, razorpay_signature: 'a'.repeat(64) })).status, 400);
    assert.strictEqual((await verify('emp', { ...good, razorpay_signature: checkoutSig(o.orderId, payId, 'wrong-secret') })).status, 400);
    assert.strictEqual((await verify('emp', { ...good, razorpay_order_id: 'order_SOMETHINGELSE', razorpay_signature: checkoutSig('order_SOMETHINGELSE', payId) })).status, 400); // browser-supplied order id is not trusted
    assert.strictEqual((await verify('emp2', { ...good, razorpay_signature: checkoutSig(o.orderId, payId) })).status, 404); // other employer
    assert.strictEqual((await verify('cand', { ...good, razorpay_signature: checkoutSig(o.orderId, payId) })).status, 403);
    assert.strictEqual((await verify(undefined, { ...good, razorpay_signature: checkoutSig(o.orderId, payId) })).status, 401);
    const rec = await Payment.findById(o.paymentRecordId);
    assert.strictEqual(rec.status, 'created'); assert.ok(!(await Job.findById(jobs.A)).isFeatured);
  });

  test('valid signature but not captured yet => pending, NOT featured; gateway outage does not activate either', async () => {
    const o = ids.orderA, payId = newPayId(); ids.payA = payId;
    gateway.set(payId, entity(o, payId, { status: 'authorized' }));
    const sig = checkoutSig(o.orderId, payId);
    const r = await call('/api/payments/verify', { method: 'POST', who: 'emp', body: { paymentRecordId: o.paymentRecordId, razorpay_order_id: o.orderId, razorpay_payment_id: payId, razorpay_signature: sig } });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.data.status, 'pending'); assert.match(r.body.message, /waiting/i);
    assert.ok(!(await Job.findById(jobs.A)).isFeatured);
    assert.strictEqual((await order('emp', jobs.A)).status, 409); // awaiting confirmation: no second checkout
    // gateway down during verify: 502, record stays pending, still nothing featured
    gatewayDown = true;
    const down = await call('/api/payments/verify', { method: 'POST', who: 'emp', body: { paymentRecordId: o.paymentRecordId, razorpay_order_id: o.orderId, razorpay_payment_id: payId, razorpay_signature: sig } });
    gatewayDown = false;
    assert.strictEqual(down.status, 502);
    assert.strictEqual((await Payment.findById(o.paymentRecordId)).status, 'pending'); assert.ok(!(await Job.findById(jobs.A)).isFeatured);
  });

  test('webhook: invalid signature is rejected and changes nothing', async () => {
    const o = ids.orderA;
    const bad = await webhook('payment.captured', entity(o, ids.payA), { secret: 'not-the-secret' });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual((await Payment.findById(o.paymentRecordId)).status, 'pending');
    assert.ok(!(await Job.findById(jobs.A)).isFeatured);
    assert.strictEqual((await webhook('payment.captured', entity(o, ids.payA), { createdAt: Math.floor(Date.now() / 1000) - 5 * 86400 })).status, 400); // stale / replayed old event
    assert.strictEqual(await WebhookEvent.countDocuments({ eventId: bad.eventId }), 0);
  });

  test('webhook: captured payment activates the featured job once; duplicates and retries cannot extend it', async () => {
    const o = ids.orderA;
    const w = await webhook('payment.captured', entity(o, ids.payA));
    assert.strictEqual(w.status, 200); assert.strictEqual(w.body.outcome, 'paid');
    const job = await Job.findById(jobs.A); const rec = await Payment.findById(o.paymentRecordId);
    assert.strictEqual(rec.status, 'paid'); assert.ok(rec.verifiedAt && rec.activatedAt);
    assert.strictEqual(job.isFeatured, true); assert.strictEqual(String(job.featuredPaymentId), String(rec._id));
    assert.ok(Math.abs(job.featuredUntil - (Date.now() + 7 * DAY)) < 60000);
    assert.strictEqual(+rec.featuredEndsAt, +job.featuredUntil);
    const until = +job.featuredUntil;

    const dup = await webhook('payment.captured', entity(o, ids.payA), { eventId: w.eventId }); // exact replay
    assert.strictEqual(dup.status, 200); assert.strictEqual(dup.body.outcome, 'duplicate');
    const other = await webhook('order.paid', entity(o, ids.payA)); // Razorpay also sends order.paid with another event id
    assert.strictEqual(other.status, 200); assert.strictEqual(other.body.outcome, 'already_paid');
    const verifyAgain = await call('/api/payments/verify', { method: 'POST', who: 'emp', body: { paymentRecordId: o.paymentRecordId, razorpay_order_id: o.orderId, razorpay_payment_id: ids.payA, razorpay_signature: checkoutSig(o.orderId, ids.payA) } });
    assert.strictEqual(verifyAgain.body.data.status, 'paid');
    assert.strictEqual(+(await Job.findById(jobs.A)).featuredUntil, until); // never extended
    assert.strictEqual(await WebhookEvent.countDocuments({ eventId: w.eventId }), 1);
    assert.strictEqual(await Payment.countDocuments({ jobId: jobs.A }), 1);
    // parallel duplicate deliveries
    await Promise.all([1, 2, 3].map(() => webhook('payment.captured', entity(o, ids.payA))));
    assert.strictEqual(+(await Job.findById(jobs.A)).featuredUntil, until);
    assert.strictEqual((await order('emp', jobs.A)).status, 409); // already featured: cannot buy again while active
  });

  test('wrong amount or currency or unknown order from a signed webhook never activates anything', async () => {
    const o = (await order('emp', jobs.B)).body.data; ids.orderB = o;
    const cap = (x) => webhook('payment.captured', x);
    assert.strictEqual((await cap(entity(o, newPayId(), { amount: 100 }))).body.outcome, 'mismatch');
    assert.strictEqual((await cap(entity(o, newPayId(), { currency: 'USD' }))).body.outcome, 'mismatch');
    assert.strictEqual((await cap(entity({ ...o, orderId: 'order_UNKNOWN' }, newPayId()))).body.outcome, 'unknown_order');
    assert.strictEqual((await webhook('payment.authorized', entity(o, newPayId()))).body.outcome, 'ignored');
    assert.strictEqual((await Payment.findById(o.paymentRecordId)).status, 'created'); assert.ok(!(await Job.findById(jobs.B)).isFeatured);
  });

  test('failed payment, then out-of-order events: failed -> captured wins; late failed after paid is ignored', async () => {
    const o = ids.orderB;
    const p1 = newPayId();
    assert.strictEqual((await webhook('payment.failed', entity(o, p1, { status: 'failed', error_description: 'Card declined' }))).body.outcome, 'failed');
    let rec = await Payment.findById(o.paymentRecordId);
    assert.strictEqual(rec.status, 'failed'); assert.strictEqual(rec.failureReason, 'Card declined'); assert.ok(!(await Job.findById(jobs.B)).isFeatured);
    // customer retries on the same order and succeeds: captured arrives AFTER failed
    const p2 = newPayId();
    assert.strictEqual((await webhook('payment.captured', entity(o, p2))).body.outcome, 'paid');
    rec = await Payment.findById(o.paymentRecordId);
    assert.strictEqual(rec.status, 'paid'); assert.strictEqual(rec.razorpayPaymentId, p2); assert.ok(!rec.failureReason);
    const until = +(await Job.findById(jobs.B)).featuredUntil; assert.ok(until > Date.now());
    // a delayed failed event for the first attempt now arrives: must not undo the payment
    await webhook('payment.failed', entity(o, p1, { status: 'failed' }));
    assert.strictEqual((await Payment.findById(o.paymentRecordId)).status, 'paid');
    assert.strictEqual(+(await Job.findById(jobs.B)).featuredUntil, until);
  });

  test('checkout path: signature + Razorpay API says captured => paid and featured, idempotent', async () => {
    const o = (await order('emp', jobs.C)).body.data, payId = newPayId();
    gateway.set(payId, entity(o, payId));
    const body = { paymentRecordId: o.paymentRecordId, razorpay_order_id: o.orderId, razorpay_payment_id: payId, razorpay_signature: checkoutSig(o.orderId, payId) };
    const r = await call('/api/payments/verify', { method: 'POST', who: 'emp', body });
    assert.strictEqual(r.status, 200); assert.strictEqual(r.body.data.status, 'paid'); assert.strictEqual(r.body.data.activated, true);
    const until = +(await Job.findById(jobs.C)).featuredUntil;
    await Promise.all([1, 2, 3].map(() => call('/api/payments/verify', { method: 'POST', who: 'emp', body })));
    assert.strictEqual(+(await Job.findById(jobs.C)).featuredUntil, until);
    // gateway says the amount differs from our record => refused
    const o2 = (await order('emp', jobs.D)).body.data, p2 = newPayId();
    gateway.set(p2, entity(o2, p2, { amount: 100 }));
    await call('/api/payments/verify', { method: 'POST', who: 'emp', body: { paymentRecordId: o2.paymentRecordId, razorpay_order_id: o2.orderId, razorpay_payment_id: p2, razorpay_signature: checkoutSig(o2.orderId, p2) } });
    assert.notStrictEqual((await Payment.findById(o2.paymentRecordId)).status, 'paid'); assert.ok(!(await Job.findById(jobs.D)).isFeatured);
    // gateway reports failure
    const p3 = newPayId(); gateway.set(p3, entity(o2, p3, { status: 'failed', error_description: 'Bank error' }));
    const f = await call('/api/payments/verify', { method: 'POST', who: 'emp', body: { paymentRecordId: o2.paymentRecordId, razorpay_order_id: o2.orderId, razorpay_payment_id: p3, razorpay_signature: checkoutSig(o2.orderId, p3) } });
    assert.strictEqual(f.body.data.status, 'failed'); assert.ok(!(await Job.findById(jobs.D)).isFeatured);
    // after a failure a NEW order can be created
    const o3 = await order('emp', jobs.D);
    assert.strictEqual(o3.status, 201); assert.notStrictEqual(o3.body.data.orderId, o2.orderId);
  });

  test('paid for a job that was closed meanwhile: payment recorded, no featured placement, flagged for review', async () => {
    const o = (await order('emp', jobs.E)).body.data;
    await Job.updateOne({ _id: jobs.E }, { status: 'closed' });
    assert.strictEqual((await webhook('payment.captured', entity(o, newPayId()))).body.outcome, 'paid');
    const rec = await Payment.findById(o.paymentRecordId), job = await Job.findById(jobs.E);
    assert.strictEqual(rec.status, 'paid'); assert.ok(!rec.activatedAt); assert.match(rec.activationNote, /closed or removed/);
    assert.ok(!job.isFeatured);
    await Job.updateOne({ _id: jobs.E }, { status: 'active' }); // restore for later listing checks
  });

  test('featured jobs are listed first; pagination is correct; filters still work; internals are hidden', async () => {
    const q = (extra = '') => `/api/jobs?search=${run}&limit=50${extra}`;
    const all = (await call(q())).body.data;
    const featuredIds = [jobs.A, jobs.B, jobs.C];
    const firstThree = all.slice(0, 3).map((j) => j._id).sort();
    assert.deepStrictEqual(firstThree, [...featuredIds].sort()); // featured on top of newer regular jobs
    assert.ok(all.slice(0, 3).every((j) => j.featured === true && j.featuredUntil));
    assert.ok(all.slice(3).every((j) => j.featured === false && j.featuredUntil === undefined));
    for (const j of all) for (const k of ['featuredPaymentId', 'isFeatured', 'moderation', 'featuredAt']) assert.strictEqual(j[k], undefined, k);
    // page through with a small limit: no repeats, no gaps, same order as the full list
    const paged = []; let pg = 1, pages = 1;
    while (pg <= pages) { const r = (await call(`/api/jobs?search=${run}&limit=2&page=${pg}`)).body; pages = r.pagination.pages; paged.push(...r.data.map((j) => j._id)); pg++; }
    assert.deepStrictEqual(paged, all.map((j) => j._id));
    assert.strictEqual(new Set(paged).size, paged.length);
    // existing filters keep working together with featured sorting
    assert.ok((await call(q('&category=AI/ML'))).body.data.length >= 3);
    assert.strictEqual((await call(q('&category=Cybersecurity'))).body.data.length, 0);
    assert.ok((await call(q('&location=remote&employmentType=Full-time'))).body.data[0].featured);
    const one = (await call(`/api/jobs/${jobs.A}`)).body.data;
    assert.strictEqual(one.featured, true); assert.strictEqual(one.featuredPaymentId, undefined);
    assert.strictEqual((await call(`/api/jobs/${jobs.D}`)).body.data.featured, false);
  });

  test('employers and clients cannot set featured fields themselves', async () => {
    for (const extra of [{ isFeatured: true }, { featuredUntil: '2099-01-01' }, { featuredPaymentId: jobs.A }, { promotion: { pinnedUntil: '2099-01-01' } }]) {
      assert.strictEqual((await call(`/api/jobs/${jobs.F}`, { method: 'PATCH', who: 'emp', body: extra })).status, 400, JSON.stringify(extra));
    }
    assert.strictEqual((await call('/api/jobs', { method: 'POST', who: 'emp', body: { title: 'Hack job title', company: 'X', description: 'Trying to self-feature this job', nicheCategory: 'Other', location: 'X', employmentType: 'Full-time', isFeatured: true } })).status, 400);
    assert.ok(!(await Job.findById(jobs.F)).isFeatured);
  });

  test('expiry: an expired featured job is treated as a regular listing and can be bought again', async () => {
    await Job.updateOne({ _id: jobs.A }, { featuredUntil: new Date(Date.now() - 1000) }); // isFeatured is still true in the database
    const all = (await call(`/api/jobs?search=${run}&limit=50`)).body.data;
    const a = all.find((j) => j._id === jobs.A);
    assert.strictEqual(a.featured, false); assert.strictEqual(a.featuredUntil, undefined);
    assert.ok(all.slice(0, 2).every((j) => j.featured)); // only B and C remain on top
    assert.strictEqual((await call(`/api/jobs/${jobs.A}`)).body.data.featured, false);
    assert.strictEqual((await call('/api/employer/jobs', { who: 'emp' })).body.data.find((j) => j._id === jobs.A).featured, false);
    const again = await order('emp', jobs.A);
    assert.strictEqual(again.status, 201); assert.notStrictEqual(again.body.data.orderId, ids.orderA.orderId);
    // closing or moderating a featured job removes its placement immediately
    await Job.updateOne({ _id: jobs.B }, { 'moderation.status': 'flagged' });
    assert.strictEqual((await call(`/api/jobs/${jobs.B}`)).body.data.featured, false);
    assert.ok(!(await call(`/api/jobs?search=${run}&limit=50`)).body.data.slice(0, 1).some((j) => j._id === jobs.B));
    await Job.updateOne({ _id: jobs.B }, { 'moderation.status': 'none' });
    assert.strictEqual((await call(`/api/jobs/${jobs.B}`)).body.data.featured, true);
  });

  test('paying again while still featured stacks after the current period (no overlap loss)', async () => {
    const before = +(await Job.findById(jobs.C)).featuredUntil;
    await Payment.updateOne({ jobId: jobs.C }, { $set: { status: 'paid' } }); // keep the first one paid
    // bypass the "already featured" guard to simulate an older open order being paid later
    const o = await Payment.create({ employerId: ids.emp, jobId: jobs.C, razorpayOrderId: `order_T${run}stack`, amount: 49900, currency: 'INR', featuredDays: 7 });
    assert.strictEqual((await webhook('payment.captured', { id: newPayId(), order_id: o.razorpayOrderId, amount: 49900, currency: 'INR', status: 'captured' })).body.outcome, 'paid');
    assert.ok(Math.abs(+(await Job.findById(jobs.C)).featuredUntil - (before + 7 * DAY)) < 1000);
  });

  test('payment history: employers see only their own records', async () => {
    const mine = await call('/api/payments/my?limit=50', { who: 'emp' });
    assert.strictEqual(mine.status, 200); assert.ok(mine.body.data.length >= 4);
    assert.ok(mine.body.data.every((p) => p.jobTitle && p.amount && p.currency && p.status && p.createdAt));
    const paid = mine.body.data.find((p) => p.status === 'paid' && p.activated);
    assert.ok(paid.featuredStartsAt && paid.featuredEndsAt && paid.verifiedAt);
    assert.ok(mine.body.data.some((p) => p.status === 'failed' && p.failureReason));
    assert.ok(mine.body.data.every((p) => p.razorpayOrderId === undefined && p.employerId === undefined)); // no gateway internals
    assert.strictEqual((await call('/api/payments/my', { who: 'emp2' })).body.data.length, 0);
    assert.strictEqual((await call('/api/payments/my', { who: 'cand' })).status, 403);
    assert.strictEqual((await call('/api/payments/my')).status, 401);
    const someId = mine.body.data[0]._id;
    assert.strictEqual((await call(`/api/payments/${someId}`, { who: 'emp' })).status, 200);
    assert.strictEqual((await call(`/api/payments/${someId}`, { who: 'emp2' })).status, 404);
    assert.strictEqual((await call('/api/payments/not-an-id', { who: 'emp' })).status, 400);
    assert.strictEqual((await call('/api/payments/my?limit=500', { who: 'emp' })).status, 400);
  });

  test('admin: transactions, filters, search and revenue (only confirmed payments count)', async () => {
    for (const who of ['emp', 'cand', undefined]) {
      assert.ok([401, 403].includes((await call('/api/admin/payments', { who })).status));
      assert.ok([401, 403].includes((await call('/api/admin/payments/summary', { who })).status));
    }
    const list = await call(`/api/admin/payments?search=${run}&limit=50`, { who: 'admin' });
    assert.strictEqual(list.status, 200); assert.ok(list.body.data.length >= 5);
    const row = list.body.data[0];
    assert.ok(row.employer.email && row.job.title && row.amount && row.status);
    assert.strictEqual(row.razorpayOrderId.startsWith('order_'), true);
    const failed = await call(`/api/admin/payments?search=${run}&status=failed`, { who: 'admin' });
    assert.ok(failed.body.data.length >= 1 && failed.body.data.every((p) => p.status === 'failed'));
    assert.ok((await call(`/api/admin/payments?search=${encodeURIComponent(E('emp'))}`, { who: 'admin' })).body.data.length >= 5); // by employer email
    assert.ok((await call(`/api/admin/payments?search=${ids.orderB.orderId}`, { who: 'admin' })).body.data.length === 1); // by order id
    assert.strictEqual((await call('/api/admin/payments?status=refunded', { who: 'admin' })).status, 400);
    const pg1 = (await call(`/api/admin/payments?search=${run}&limit=2&page=1`, { who: 'admin' })).body;
    assert.strictEqual(pg1.data.length, 2); assert.ok(pg1.pagination.total >= 5);

    const s = (await call('/api/admin/payments/summary', { who: 'admin' })).body.data;
    const dbPaid = await Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, sum: { $sum: '$amount' }, n: { $sum: 1 } } }]);
    assert.strictEqual(s.revenue.total, dbPaid[0].sum); assert.strictEqual(s.counts.paid, dbPaid[0].n); // failed / created / pending excluded
    assert.ok(s.counts.failed >= 1); assert.strictEqual(s.currency, 'INR');
    assert.ok(s.needsReview >= 1); // the paid-but-job-closed case
    const titles = s.activePromotions.items.map((i) => i.title);
    assert.ok(titles.includes(`JobB ${run}`) && titles.includes(`JobC ${run}`));
    assert.ok(!titles.includes(`JobA ${run}`)); // expired
    assert.strictEqual((await call('/api/admin/payments/mark-paid', { method: 'POST', who: 'admin', body: {} })).status, 404); // no manual "mark as paid"
  });

  test('server-side price/duration config: changing env changes the plan and replaces stale orders', async () => {
    process.env.FEATURED_PRICE_PAISE = '59900'; process.env.FEATURED_DAYS = '14';
    try {
      const cfg = (await call('/api/payments/config', { who: 'emp' })).body.data;
      assert.deepStrictEqual([cfg.amount, cfg.days], [59900, 14]);
      const open = await Payment.findOne({ jobId: jobs.A, status: 'created' }); // order made earlier at the old price
      assert.strictEqual(open.amount, 49900);
      const fresh = await order('emp', jobs.A);
      assert.strictEqual(fresh.status, 201); assert.strictEqual(fresh.body.data.amount, 59900); assert.strictEqual(fresh.body.data.days, 14);
      assert.strictEqual((await Payment.findById(open._id)).status, 'failed'); // stale order retired
    } finally { delete process.env.FEATURED_PRICE_PAISE; delete process.env.FEATURED_DAYS; }
  });

  test('model constraints: unique order id, unique payment id, one open order per job', async () => {
    const idx = await Payment.collection.indexes();
    assert.ok(idx.some((i) => i.unique && i.key.razorpayOrderId === 1));
    assert.ok(idx.some((i) => i.unique && i.key.razorpayPaymentId === 1));
    assert.ok(idx.some((i) => i.unique && i.key.employerId === 1 && i.key.jobId === 1 && i.partialFilterExpression));
    await assert.rejects(Payment.create({ employerId: ids.emp, jobId: jobs.F, razorpayOrderId: ids.orderB.orderId, amount: 100, currency: 'INR', featuredDays: 7 }), /duplicate|E11000/);
    await assert.rejects(Payment.create({ employerId: ids.emp, jobId: jobs.F, razorpayOrderId: 'order_x1', amount: 0, currency: 'INR', featuredDays: 7 }), /amount/);
  });
});
