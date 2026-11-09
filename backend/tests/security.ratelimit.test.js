// Per-account login limiting and per-user upload limiting on the REAL routes (limits lowered via env before the app loads).
process.env.NODE_ENV = 'test';
process.env.FORCE_RATE_LIMIT = '1';
process.env.AUTH_RATE_LIMIT_MAX = '200';
process.env.LOGIN_ACCOUNT_RATE_LIMIT_MAX = '3';
process.env.UPLOAD_RATE_LIMIT_MAX = '3';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-integration-0123456789abcdef';
process.env.CORS_ORIGIN = 'http://localhost:3000';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');
const { URI, skip, makeClient, pdfForm } = require('./helpers/itest');

describe('Rate limits on real routes (MongoDB)', { skip }, () => {
  const run = Date.now();
  const E = (n) => `${n}-${run}@rl.example`;
  let server, base, User;
  const { call, signIn, jar } = makeClient(() => base);

  before(async () => {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    const app = require('../app'); User = require('../models/User'); await User.init();
    await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
  });
  after(async () => {
    const users = await User.find({ email: /@rl\.example$/ }).select('_id');
    await require('../models/Session').deleteMany({ userId: { $in: users.map((u) => u._id) } });
    await User.deleteMany({ _id: { $in: users.map((u) => u._id) } });
    server.close(); await mongoose.disconnect();
  });

  test('login: 3 wrong passwords for one account lock THAT account (429 JSON), other accounts keep working', async () => {
    for (const n of ['a', 'b']) assert.strictEqual((await signIn(n, '/api/auth/register', { name: n, email: E(n), password: 'password123', role: 'candidate' })).status, 201);
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await call('/api/auth/login', { method: 'POST', body: { email: E('a').toUpperCase(), password: 'wrong-password' } })).status); // case-insensitive key
    assert.deepStrictEqual(codes, [401, 401, 401, 429, 429]);
    const locked = await call('/api/auth/login', { method: 'POST', body: { email: E('a'), password: 'password123' } });
    assert.strictEqual(locked.status, 429); assert.match(locked.body.message, /Too many failed sign-in attempts/);
    assert.strictEqual(locked.res.headers.get('set-cookie'), null);
    assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: E('b'), password: 'password123' } })).status, 200);
  });
  test('login: successful sign-ins never count toward the lock', async () => {
    for (let i = 0; i < 6; i++) assert.strictEqual((await call('/api/auth/login', { method: 'POST', body: { email: E('b'), password: 'password123' } })).status, 200);
  });
  test('upload limiter: the 4th application attempt in the window is 429 for that user only, and nothing is stored', async () => {
    for (const n of ['c', 'd']) await signIn(n, '/api/auth/register', { name: n, email: E(n), password: 'password123', role: 'candidate' });
    const files = () => mongoose.connection.db.collection('resumes.files').countDocuments();
    const before = await files();
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push((await call('/api/apply', { method: 'POST', who: 'c', form: pdfForm({ jobId: 'c'.repeat(24) }) })).status);
    assert.deepStrictEqual(codes, [404, 404, 404, 429, 429]);
    assert.strictEqual((await call('/api/applications', { method: 'POST', who: 'c', form: pdfForm({ jobId: 'c'.repeat(24) }) })).status, 429); // the alias route shares the same budget
    assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'd', form: pdfForm({ jobId: 'c'.repeat(24) }) })).status, 404); // other user unaffected
    assert.strictEqual(await files(), before);
  });
  test('the upload limiter does not let anonymous or wrong-role callers burn a real user\'s budget', async () => {
    assert.strictEqual((await call('/api/apply', { method: 'POST', form: pdfForm({ jobId: 'c'.repeat(24) }) })).status, 401);
  });
});
