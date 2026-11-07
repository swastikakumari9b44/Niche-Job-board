// Analytics unit tests: date ranges, CSV safety, validation, authorization. No database.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-test-secret-123';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const app = require('../app');
const User = require('../models/User');
const { parseRange, fillSeries, bucketExpr, DAY } = require('../utils/dateRange');
const { toCsv, cell, inr, safeFilename, BOM } = require('../utils/csv');
const v = require('../validators/analyticsValidator');

const IDS = { candidate: 'a'.repeat(24), employer: 'b'.repeat(24), admin: 'c'.repeat(24) };
const accounts = Object.fromEntries(Object.entries(IDS).map(([role, id]) => [id, { _id: id, role, status: 'active' }]));
const realFind = User.findById;
User.findById = (id) => { const d = accounts[String(id)] || null; return Object.assign(Promise.resolve(d), { select: () => ({ lean: () => Promise.resolve(d) }) }); };
const auth = (role) => ({ authorization: `Bearer ${jwt.sign({ id: IDS[role], role }, process.env.JWT_SECRET, { expiresIn: '1h' })}` });
let server, base;
before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => { server.close(); User.findById = realFind; });
const get = (p, headers = {}) => fetch(base + p, { headers });

test('date ranges: presets, buckets, zero-fill and UTC boundaries', () => {
  const now = new Date('2026-11-15T10:00:00Z');
  const d7 = parseRange({ range: '7d' }, now);
  assert.deepStrictEqual([d7.granularity, d7.buckets.length, d7.buckets[0], d7.buckets.at(-1)], ['day', 7, '2026-11-09', '2026-11-15']);
  assert.strictEqual(+d7.from, Date.UTC(2026, 10, 9)); // start of the first day, UTC
  assert.strictEqual(parseRange({ range: '30d' }, now).buckets.length, 30);
  assert.strictEqual(parseRange({ range: '90d' }, now).buckets.length, 90);
  const m12 = parseRange({ range: '12m' }, now);
  assert.deepStrictEqual([m12.granularity, m12.buckets.length, m12.buckets[0], m12.buckets.at(-1)], ['month', 12, '2025-12', '2026-11']);
  const c = parseRange({ range: 'custom', from: '2026-01-01', to: '2026-01-10' }, now);
  assert.deepStrictEqual([c.buckets.length, +c.to], [10, Date.UTC(2026, 0, 10) + DAY - 1]); // inclusive end of the last day
  assert.strictEqual(parseRange({ range: 'custom', from: '2026-11-10', to: '2026-12-31' }, now).to.getTime(), now.getTime()); // never into the future
  assert.strictEqual(parseRange({ range: 'custom', from: '2025-01-01', to: '2025-12-31' }, now).granularity, 'month'); // long spans become monthly
  assert.strictEqual(parseRange({ range: 'all' }, now, { since: new Date('2026-11-01T15:00:00Z') }).buckets.length, 15);
  assert.throws(() => parseRange({ range: 'bogus' }, now));
  const filled = fillSeries(['a', 'b', 'c'], [{ _id: 'b', n: 5 }], ['n', 'm']);
  assert.deepStrictEqual(filled, [{ key: 'a', n: 0, m: 0 }, { key: 'b', n: 5, m: 0 }, { key: 'c', n: 0, m: 0 }]);
  assert.deepStrictEqual(bucketExpr('month').$dateToString, { format: '%Y-%m', date: '$createdAt', timezone: 'UTC' });
});

test('CSV: RFC 4180 quoting, BOM, CRLF, and formula-injection protection', () => {
  assert.strictEqual(cell('plain'), 'plain');
  assert.strictEqual(cell('a,b'), '"a,b"');
  assert.strictEqual(cell('say "hi"'), '"say ""hi"""');
  assert.strictEqual(cell('line1\nline2'), '"line1\nline2"');
  assert.strictEqual(cell(null), ''); assert.strictEqual(cell(undefined), '');
  assert.strictEqual(cell(0), '0'); assert.strictEqual(cell(-5), '-5'); // real numbers are never altered
  for (const evil of ['=1+1', '+1', '-1+1', '@SUM(A1)', '=HYPERLINK("http://x","y")', '\t=1', '\r=1']) assert.ok(cell(evil).replace(/^"/, '').startsWith("'"), JSON.stringify(evil)); // neutralised as text
  assert.strictEqual(cell(new Date('2026-01-02T03:04:05Z')), '2026-01-02T03:04:05.000Z');
  const csv = toCsv(['A', 'B'], [[1, 'x'], [2, 'y,z']]);
  assert.ok(csv.startsWith(BOM + 'A,B\r\n')); assert.ok(csv.endsWith('2,"y,z"\r\n'));
  assert.strictEqual(inr(49900), '499.00'); assert.strictEqual(inr(0), '0.00'); assert.strictEqual(inr(undefined), '0.00'); assert.strictEqual(inr(12345), '123.45');
  assert.strictEqual(safeFilename('a b/../c"d.csv'), 'a_b_.._c_d.csv');
});

test('validation: presets, custom ranges and filters', () => {
  assert.strictEqual(v.employerQuery.parse({}).range, '30d');
  for (const r of ['7d', '30d', '90d', '12m']) assert.ok(v.employerQuery.safeParse({ range: r }).success, r);
  assert.ok(v.employerQuery.safeParse({ range: 'custom', from: '2026-01-01', to: '2026-01-31' }).success);
  const bad = [{ range: 'custom' }, { range: 'custom', from: '2026-01-01' }, { range: 'custom', from: '2026-02-01', to: '2026-01-01' }, { range: 'custom', from: '2024-01-01', to: '2026-01-01' }, { range: 'custom', from: '2026-13-45', to: '2026-14-01' }, { range: 'custom', from: 'yesterday', to: 'today' }, { range: '1y' }, { range: 'all' }, { range: 'custom', from: '2999-01-01', to: '2999-01-05' }];
  for (const b of bad) assert.ok(!v.employerQuery.safeParse(b).success, JSON.stringify(b));
  assert.ok(v.employerJobQuery.safeParse({ range: 'all' }).success); // per-job view only
  assert.ok(v.platformQuery.safeParse({ range: '90d', category: 'AI/ML', jobStatus: 'closed', applicationStatus: 'Shortlisted' }).success);
  for (const b of [{ category: 'Plumbing' }, { jobStatus: 'paused' }, { applicationStatus: 'Hired' }]) assert.ok(!v.platformQuery.safeParse(b).success, JSON.stringify(b));
  assert.ok(!v.employerExportQuery.safeParse({ jobId: 'nope' }).success);
  assert.ok(v.adminExportQuery.safeParse({ paymentStatus: 'paid' }).success && !v.adminExportQuery.safeParse({ paymentStatus: 'refunded' }).success);
});

test('analytics endpoints: 401 anonymous, 403 wrong role', async () => {
  const jobId = 'd'.repeat(24);
  const employerOnly = ['/api/analytics/employer', `/api/analytics/employer/jobs/${jobId}`, '/api/analytics/employer/export/applications.csv', '/api/analytics/employer/export/jobs.csv'];
  const adminOnly = ['/api/admin/analytics/platform', '/api/admin/analytics/export/payments.csv', '/api/admin/analytics/export/summary.csv', '/api/admin/analytics/export/jobs.csv'];
  for (const p of employerOnly) {
    assert.strictEqual((await get(p)).status, 401, `anon ${p}`);
    for (const role of ['candidate', 'admin']) assert.strictEqual((await get(p, auth(role))).status, 403, `${role} ${p}`);
  }
  for (const p of adminOnly) {
    assert.strictEqual((await get(p)).status, 401, `anon ${p}`);
    for (const role of ['candidate', 'employer']) assert.strictEqual((await get(p, auth(role))).status, 403, `${role} ${p}`);
  }
  assert.strictEqual((await get('/api/analytics/candidate')).status, 401);
  for (const role of ['employer', 'admin']) assert.strictEqual((await get('/api/analytics/candidate', auth(role))).status, 403);
});

test('invalid date filters return 400 with a readable message (before touching the database)', async () => {
  for (const [p, role] of [['/api/analytics/employer?range=custom', 'employer'], ['/api/analytics/employer?range=forever', 'employer'], ['/api/analytics/candidate?range=custom&from=2026-02-01&to=2026-01-01', 'candidate'], ['/api/admin/analytics/platform?category=Plumbing', 'admin'], ['/api/analytics/employer/export/applications.csv?jobId=zzz', 'employer'], ['/api/analytics/employer/jobs/not-an-id', 'employer']]) {
    const r = await get(p, auth(role));
    assert.strictEqual(r.status, 400, p);
    assert.strictEqual((await r.json()).success, false);
  }
});
