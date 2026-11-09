// Database outage: the API must answer 503 DB_UNAVAILABLE (never a raw 500 / hang) and recover when the database returns.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-integration-0123456789abcdef';
process.env.CORS_ORIGIN = 'http://localhost:3000';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { URI, skip, makeClient, pdfForm } = require('./helpers/itest');

describe('Database outage handling (MongoDB)', { skip }, () => {
  const run = Date.now();
  let server, base, User;
  const { call, signIn, jar } = makeClient(() => base);

  before(async () => {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    const app = require('../app'); User = require('../models/User'); await User.init();
    await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
  });
  after(async () => {
    if (mongoose.connection.readyState !== 1) await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    const users = await User.find({ email: /@outage\.example$/ }).select('_id');
    await require('../models/Session').deleteMany({ userId: { $in: users.map((u) => u._id) } });
    await User.deleteMany({ _id: { $in: users.map((u) => u._id) } });
    server.close(); await mongoose.disconnect();
  });

  test('while the database is down every route family answers 503 with a friendly message and Retry-After', async () => {
    await signIn('u', '/api/auth/register', { name: 'U', email: `u-${run}@outage.example`, password: 'password123', role: 'candidate' });
    assert.strictEqual((await call('/api/auth/me', { who: 'u' })).status, 200);
    await mongoose.disconnect(); // simulate the outage
    const cases = [
      ['GET', '/api/jobs'], ['GET', '/api/auth/me', 'u'], ['GET', '/api/dashboard/candidate', 'u'], ['GET', '/api/notifications', 'u'],
      ['POST', '/api/auth/login', null, { email: 'x@y.co', password: 'password123' }], ['POST', '/api/auth/register', null, { name: 'x', email: 'x@y.co', password: 'password123', role: 'candidate' }],
      ['POST', '/api/auth/forgot-password', null, { email: 'x@y.co' }], ['POST', '/api/auth/logout', 'u'],
    ];
    for (const [method, path, who, body] of cases) {
      const r = await call(path, { method, who, body });
      assert.strictEqual(r.status, 503, `${method} ${path} -> ${r.status} ${r.text.slice(0, 120)}`);
      assert.strictEqual(r.body.code, 'DB_UNAVAILABLE'); assert.strictEqual(r.res.headers.get('retry-after'), '5');
      assert.doesNotMatch(r.text, /mongo|ECONN|bufferCommands|stack/i);
    }
    const apply = await call('/api/apply', { method: 'POST', who: 'u', form: pdfForm({ jobId: 'c'.repeat(24) }) });
    assert.strictEqual(apply.status, 503); assert.strictEqual(apply.body.code, 'DB_UNAVAILABLE');
  });
  test('liveness stays 200 (so Render does not restart the server) while readiness reports 503', async () => {
    const h = await call('/api/health'); assert.strictEqual(h.status, 200); assert.strictEqual(h.body.database.connected, false);
    const r = await call('/api/ready'); assert.strictEqual(r.status, 503); assert.strictEqual(r.body.status, 'database_unavailable');
  });
  test('malformed requests are still answered correctly during the outage (400 before the database is touched)', async () => {
    assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: 'nope' } })).status, 400);
    assert.strictEqual((await call('/api/nonexistent')).status, 404);
  });
  test('recovery: when the database is back, the same session works again with no restart', async () => {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    assert.strictEqual((await call('/api/auth/me', { who: 'u' })).status, 200);
    assert.strictEqual((await call('/api/ready')).status, 200);
    assert.strictEqual((await call('/api/jobs')).status, 200);
  });
});
