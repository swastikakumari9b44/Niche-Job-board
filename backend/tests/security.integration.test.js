// Milestone 10 regression tests against a real MongoDB: session revocation, CSRF, persistent resume storage,
// upload validation, employer dashboard query count, cookie flags.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-integration-0123456789abcdef';
process.env.CORS_ORIGIN = 'https://app.example.com,http://localhost:3000';
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { URI, skip, makeClient, pdfForm, jobBody, sha256, makePdf } = require('./helpers/itest');

const GOOD_ORIGIN = 'https://app.example.com';
const EVIL = { origin: 'https://evil.example' };

describe('Milestone 10 security (MongoDB)', { skip }, () => {
  const run = Date.now();
  const E = (n) => `${n}-${run}@sec.example`;
  let server, base, User, Job, Application, Session, PasswordReset, UPLOAD_DIR;
  const { jar, call, signIn } = makeClient(() => base);
  let jobId, jobs = [];
  const files = () => mongoose.connection.db.collection('resumes.files');

  before(async () => {
    await mongoose.connect(URI, { serverSelectionTimeoutMS: 10000 });
    const app = require('../app');
    User = require('../models/User'); Job = require('../models/Job'); Application = require('../models/Application');
    Session = require('../models/Session'); PasswordReset = require('../models/PasswordReset');
    ({ UPLOAD_DIR } = require('../middleware/uploadMiddleware'));
    await Promise.all([User.init(), Job.init(), Application.init(), Session.init()]);
    await new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); });
  });
  after(async () => {
    const users = await User.find({ email: /@sec\.example$/ }).select('_id');
    const ids = users.map((u) => u._id);
    const js = await Job.find({ employerId: { $in: ids } }).select('_id');
    const apps = await Application.find({ $or: [{ candidateId: { $in: ids } }, { jobId: { $in: js.map((j) => j._id) } }] });
    const { deleteResume } = require('../services/resumeStorage');
    for (const a of apps) await deleteResume(a.resumeUrl);
    await Application.deleteMany({ _id: { $in: apps.map((a) => a._id) } });
    await Job.deleteMany({ _id: { $in: js.map((j) => j._id) } });
    await Session.deleteMany({ userId: { $in: ids } });
    await PasswordReset.deleteMany({ userId: { $in: ids } });
    await User.deleteMany({ _id: { $in: ids } });
    server.close(); await mongoose.disconnect();
  });

  test('setup: employer, two candidates, a job', async () => {
    assert.strictEqual((await signIn('emp', '/api/auth/register', { name: 'Emp', email: E('emp'), password: 'password123', role: 'employer' })).status, 201);
    assert.strictEqual((await signIn('cand', '/api/auth/register', { name: 'Cand', email: E('cand'), password: 'password123', role: 'candidate' })).status, 201);
    assert.strictEqual((await signIn('cand2', '/api/auth/register', { name: 'Cand Two', email: E('cand2'), password: 'password123', role: 'candidate' })).status, 201);
    const j = await call('/api/jobs', { method: 'POST', who: 'emp', body: jobBody });
    assert.strictEqual(j.status, 201); jobId = j.body.data._id;
  });

  describe('server-side session revocation', () => {
    test('logging in creates a Session row; the JWT carries its id', async () => {
      const token = jar.cand.split('=')[1];
      const p = jwt.decode(token);
      assert.ok(p.jti);
      assert.ok(await Session.exists({ jti: p.jti, userId: p.id }));
    });

    test('a COPIED cookie stops working after logout (the reported High finding)', async () => {
      await signIn('victim', '/api/auth/login', { email: E('cand'), password: 'password123' });
      const copied = jar.victim; // attacker copies the cookie value
      assert.strictEqual((await call('/api/auth/me', { cookie: copied })).status, 200);
      assert.strictEqual((await call('/api/auth/me', { cookie: copied })).body.data.user.email, E('cand'));
      const out = await call('/api/auth/logout', { method: 'POST', who: 'victim' });
      assert.strictEqual(out.status, 200);
      assert.match(out.res.headers.get('set-cookie'), /token=;/); // browser cookie cleared too
      assert.strictEqual((await call('/api/auth/me', { cookie: copied })).status, 401); // the copy is dead
      assert.strictEqual((await call('/api/jobs/saved/ids', { cookie: copied })).status === 200, false);
      assert.strictEqual((await call('/api/dashboard/candidate', { cookie: copied })).status, 401);
      assert.strictEqual((await call('/api/applications/my', { cookie: copied })).status, 401);
    });

    test('logout only ends THAT session; another device stays signed in; logout is idempotent and never errors', async () => {
      await signIn('devA', '/api/auth/login', { email: E('cand2'), password: 'password123' });
      await signIn('devB', '/api/auth/login', { email: E('cand2'), password: 'password123' });
      assert.notStrictEqual(jar.devA, jar.devB);
      assert.strictEqual((await call('/api/auth/logout', { method: 'POST', who: 'devA' })).status, 200);
      assert.strictEqual((await call('/api/auth/me', { who: 'devA' })).status, 401);
      assert.strictEqual((await call('/api/auth/me', { who: 'devB' })).status, 200);
      assert.strictEqual((await call('/api/auth/logout', { method: 'POST', who: 'devA' })).status, 200); // again
      assert.strictEqual((await call('/api/auth/logout', { method: 'POST' })).status, 200); // no cookie at all
      assert.strictEqual((await call('/api/auth/logout', { method: 'POST', cookie: 'token=garbage' })).status, 200);
    });

    test('logout-all signs out every device; requires a valid session', async () => {
      await signIn('devC', '/api/auth/login', { email: E('cand2'), password: 'password123' });
      assert.strictEqual((await call('/api/auth/logout-all', { method: 'POST' })).status, 401);
      assert.strictEqual((await call('/api/auth/logout-all', { method: 'POST', who: 'devC' })).status, 200);
      for (const w of ['devB', 'devC', 'cand2']) assert.strictEqual((await call('/api/auth/me', { who: w })).status, 401, w);
      await signIn('cand2', '/api/auth/login', { email: E('cand2'), password: 'password123' }); // can sign in again afterwards
      assert.strictEqual((await call('/api/auth/me', { who: 'cand2' })).status, 200);
    });

    test('tokens without a session id, with an unknown session id, or signed with another secret are refused', async () => {
      const user = await User.findOne({ email: E('cand') });
      const mk = (claims, secret = process.env.JWT_SECRET) => `token=${jwt.sign({ id: String(user._id), role: 'candidate', ...claims }, secret, { expiresIn: '1h' })}`;
      assert.strictEqual((await call('/api/auth/me', { cookie: mk({}) })).status, 401); // legacy token, no jti
      assert.strictEqual((await call('/api/auth/me', { cookie: mk({ jti: crypto.randomUUID() }) })).status, 401); // never issued
      assert.strictEqual((await call('/api/auth/me', { cookie: mk({ jti: 'x' }, 'another-secret-another-secret-12345') })).status, 401);
      const other = await User.findOne({ email: E('emp') });
      const realJti = jwt.decode(jar.cand.split('=')[1]).jti;
      const stolenJti = `token=${jwt.sign({ id: String(other._id), role: 'employer', jti: realJti }, process.env.JWT_SECRET, { expiresIn: '1h' })}`;
      assert.strictEqual((await call('/api/auth/me', { cookie: stolenJti })).status, 401); // a session id only works for its own user
    });

    test('a Bearer header token is revoked by logout too', async () => {
      const r = await call('/api/auth/login', { method: 'POST', body: { email: E('cand'), password: 'password123' } });
      const token = r.res.headers.get('set-cookie').split(';')[0].split('=')[1];
      const bearer = { authorization: `Bearer ${token}` };
      assert.strictEqual((await call('/api/auth/me', { headers: bearer })).status, 200);
      assert.strictEqual((await call('/api/auth/logout', { method: 'POST', headers: bearer })).status, 200);
      assert.strictEqual((await call('/api/auth/me', { headers: bearer })).status, 401);
    });

    test('a password reset signs out every existing session', async () => {
      await signIn('r1', '/api/auth/login', { email: E('cand2'), password: 'password123' });
      const user = await User.findOne({ email: E('cand2') });
      const token = crypto.randomBytes(32).toString('hex');
      await PasswordReset.create({ userId: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 600000) });
      assert.strictEqual((await call('/api/auth/me', { who: 'r1' })).status, 200);
      const reset = await call('/api/auth/reset-password', { method: 'POST', body: { token, password: 'new-password-456' } });
      assert.strictEqual(reset.status, 200);
      assert.strictEqual((await call('/api/auth/me', { who: 'r1' })).status, 401);
      assert.strictEqual(await Session.countDocuments({ userId: user._id }), 0);
      assert.strictEqual((await signIn('cand2', '/api/auth/login', { email: E('cand2'), password: 'new-password-456' })).status, 200);
    });

    test('sessions carry an expiry (TTL index) so the collection cannot grow forever', async () => {
      const idx = await Session.collection.indexes();
      assert.ok(idx.some((i) => i.key.expiresAt === 1 && i.expireAfterSeconds === 0));
      const s = await Session.findOne({ userId: (await User.findOne({ email: E('cand') }))._id });
      assert.ok(s.expiresAt > new Date());
    });
  });

  describe('CSRF / cross-origin protection with real cookies', () => {
    test('cross-origin multipart POST /api/apply with a VALID cookie is blocked: nothing saved, nothing stored', async () => {
      const apps = await Application.countDocuments(); const stored = await files().countDocuments();
      for (const p of ['/api/apply', '/api/applications']) {
        const r = await call(p, { method: 'POST', who: 'cand', headers: EVIL, form: pdfForm({ jobId }) });
        assert.strictEqual(r.status, 403, p); assert.strictEqual(r.body.code, 'CSRF_BLOCKED');
      }
      const nullOrigin = await call('/api/apply', { method: 'POST', who: 'cand', headers: { origin: 'null' }, form: pdfForm({ jobId }) });
      assert.strictEqual(nullOrigin.status, 403);
      assert.strictEqual(await Application.countDocuments(), apps); assert.strictEqual(await files().countDocuments(), stored);
    });
    test('cross-site requests identified only by Sec-Fetch-Site / Referer are blocked too', async () => {
      assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', headers: { 'sec-fetch-site': 'cross-site' }, form: pdfForm({ jobId }) })).status, 403);
      assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand', headers: { referer: 'https://evil.example/attack.html' }, form: pdfForm({ jobId }) })).status, 403);
    });
    test('cross-origin logout cannot sign a user out; cross-origin status change / job delete are blocked', async () => {
      await signIn('csrfv', '/api/auth/login', { email: E('cand'), password: 'password123' });
      assert.strictEqual((await call('/api/auth/logout', { method: 'POST', who: 'csrfv', headers: EVIL })).status, 403);
      assert.strictEqual((await call('/api/auth/me', { who: 'csrfv' })).status, 200); // still signed in
      assert.strictEqual((await call(`/api/jobs/${jobId}`, { method: 'DELETE', who: 'emp', headers: EVIL })).status, 403);
      assert.strictEqual((await Job.findById(jobId)).status, 'active');
      assert.strictEqual((await call(`/api/applications/${'a'.repeat(24)}/status`, { method: 'PATCH', who: 'emp', headers: EVIL, body: { status: 'Rejected' } })).status, 403);
    });
    test('login CSRF: a cross-origin login attempt never sets a cookie', async () => {
      const r = await call('/api/auth/login', { method: 'POST', headers: EVIL, body: { email: E('cand'), password: 'password123' } });
      assert.strictEqual(r.status, 403); assert.strictEqual(r.res.headers.get('set-cookie'), null);
    });
    test('the real frontend origin still works end to end (apply succeeds)', async () => {
      const r = await call('/api/apply', { method: 'POST', who: 'cand', headers: { origin: GOOD_ORIGIN }, form: pdfForm({ jobId }) });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    });
    test('CORS: only allow-listed origins get Access-Control-Allow-Origin + credentials', async () => {
      const ok = await call('/api/health', { headers: { origin: GOOD_ORIGIN } });
      assert.strictEqual(ok.res.headers.get('access-control-allow-origin'), GOOD_ORIGIN);
      assert.strictEqual(ok.res.headers.get('access-control-allow-credentials'), 'true');
      const bad = await call('/api/health', { headers: { origin: 'https://evil.example' } });
      assert.strictEqual(bad.res.headers.get('access-control-allow-origin'), null);
    });
  });

  describe('cookie flags on real responses', () => {
    const attrs = (r) => r.res.headers.get('set-cookie');
    test('HttpOnly + SameSite=Lax + Path=/ by default; no token in the JSON body', async () => {
      const r = await call('/api/auth/login', { method: 'POST', body: { email: E('cand'), password: 'password123' } });
      assert.match(attrs(r), /HttpOnly/i); assert.match(attrs(r), /SameSite=Lax/i); assert.match(attrs(r), /Path=\//); assert.doesNotMatch(attrs(r), /;\s*Secure/i);
      assert.doesNotMatch(r.text, /eyJ/);
    });
    test('COOKIE_SAMESITE=none (Vercel + Render) yields SameSite=None; Secure; any casing works', async () => {
      const old = process.env.COOKIE_SAMESITE; process.env.COOKIE_SAMESITE = 'None';
      try {
        const r = await call('/api/auth/login', { method: 'POST', body: { email: E('cand'), password: 'password123' } });
        assert.match(attrs(r), /SameSite=None/i); assert.match(attrs(r), /;\s*Secure/i); assert.match(attrs(r), /HttpOnly/i);
      } finally { if (old === undefined) delete process.env.COOKIE_SAMESITE; else process.env.COOKIE_SAMESITE = old; }
    });
    test('an invalid COOKIE_SAMESITE can no longer break login: it falls back to Lax', async () => {
      const old = process.env.COOKIE_SAMESITE; process.env.COOKIE_SAMESITE = 'nope';
      try {
        const r = await call('/api/auth/login', { method: 'POST', body: { email: E('cand'), password: 'password123' } });
        assert.strictEqual(r.status, 200); assert.match(attrs(r), /SameSite=Lax/i);
      } finally { if (old === undefined) delete process.env.COOKIE_SAMESITE; else process.env.COOKIE_SAMESITE = old; }
    });
    test('logout clears the cookie with the same flags', async () => {
      const r = await call('/api/auth/logout', { method: 'POST' });
      assert.match(attrs(r), /token=;/); assert.match(attrs(r), /Expires=Thu, 01 Jan 1970/); assert.match(attrs(r), /HttpOnly/i);
    });
  });

  describe('persistent resume storage and upload validation', () => {
    const pdf = makePdf(['Ada Lovelace - Machine Learning Engineer', 'Skills: Python, PyTorch, SQL']);
    let storedApp, cand3Jar;
    test('a resume goes to MongoDB GridFS, never to the local uploads folder', async () => {
      await signIn('cand3', '/api/auth/register', { name: 'Cand Three', email: E('cand3'), password: 'password123', role: 'candidate' });
      const diskBefore = fs.readdirSync(UPLOAD_DIR).filter((f) => f !== '.gitkeep').length;
      const r = await call('/api/apply', { method: 'POST', who: 'cand3', form: pdfForm({ jobId }, pdf) });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      storedApp = await Application.findById(r.body.data._id);
      assert.match(storedApp.resumeUrl, /^gridfs:[a-f0-9]{24}$/);
      assert.strictEqual(fs.readdirSync(UPLOAD_DIR).filter((f) => f !== '.gitkeep').length, diskBefore);
      const meta = await files().findOne({ _id: new mongoose.Types.ObjectId(storedApp.resumeUrl.slice(7)) });
      assert.strictEqual(meta.length, pdf.length); assert.strictEqual(meta.metadata.contentType, 'application/pdf');
      assert.strictEqual(storedApp.matchStatus, 'scored'); // parsing from memory still works
      assert.strictEqual(r.body.data.resumeUrl, undefined); cand3Jar = jar.cand3;
    });
    test('the stored file is byte-identical when the employer or the candidate downloads it', async () => {
      for (const who of ['emp', 'cand3']) {
        const r = await fetch(`${base}/api/applications/${storedApp._id}/resume`, { headers: { cookie: jar[who] } });
        assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get('content-type'), 'application/pdf');
        assert.strictEqual(r.headers.get('x-content-type-options'), 'nosniff'); assert.match(r.headers.get('cache-control'), /no-store/);
        assert.ok(Buffer.from(await r.arrayBuffer()).equals(pdf), who);
      }
    });
    test('it survives a "redeploy": a brand-new connection/bucket (empty disk) still serves it', async () => {
      const storage = require('../services/resumeStorage');
      const stream = await storage.openResume(storedApp.resumeUrl);
      const chunks = []; for await (const c of stream) chunks.push(c);
      assert.ok(Buffer.concat(chunks).equals(pdf));
    });
    test('access control is unchanged: strangers and other candidates get 403, anonymous 401', async () => {
      assert.strictEqual((await call(`/api/applications/${storedApp._id}/resume`, { who: 'cand' })).status, 403);
      assert.strictEqual((await call(`/api/applications/${storedApp._id}/resume`)).status, 401);
      await signIn('emp2', '/api/auth/register', { name: 'Emp Two', email: E('emp2'), password: 'password123', role: 'employer' });
      assert.strictEqual((await call(`/api/applications/${storedApp._id}/resume`, { who: 'emp2' })).status, 403);
    });
    test('missing GridFS file -> clean 404 (no crash, no path leak)', async () => {
      const a = await Application.create({ jobId, candidateId: new mongoose.Types.ObjectId(), candidateName: 'Ghost', candidateEmail: E('ghost'), resumeUrl: `gridfs:${'a'.repeat(24)}` });
      const r = await call(`/api/applications/${a._id}/resume`, { who: 'emp' });
      assert.strictEqual(r.status, 404); assert.doesNotMatch(r.text, /gridfs|\/home|uploads/i);
      const bad = await Application.create({ jobId, candidateId: new mongoose.Types.ObjectId(), candidateName: 'Ghost2', candidateEmail: E('ghost2'), resumeUrl: 'gridfs:../../etc/passwd' });
      assert.strictEqual((await call(`/api/applications/${bad._id}/resume`, { who: 'emp' })).status, 404);
    });
    test('legacy applications whose PDF is still on local disk keep working; if the disk was wiped they get a clean 404', async () => {
      const name = `${crypto.randomUUID()}.pdf`;
      fs.writeFileSync(path.join(UPLOAD_DIR, name), pdf);
      try {
        const a = await Application.create({ jobId, candidateId: new mongoose.Types.ObjectId(), candidateName: 'Legacy', candidateEmail: E('legacy'), resumeUrl: name });
        const ok = await fetch(`${base}/api/applications/${a._id}/resume`, { headers: { cookie: jar.emp } });
        assert.strictEqual(ok.status, 200); assert.ok(Buffer.from(await ok.arrayBuffer()).equals(pdf));
        fs.rmSync(path.join(UPLOAD_DIR, name));
        assert.strictEqual((await call(`/api/applications/${a._id}/resume`, { who: 'emp' })).status, 404);
      } finally { fs.rmSync(path.join(UPLOAD_DIR, name), { force: true }); }
    });
    test('a duplicate application leaves no orphan file in storage', async () => {
      const before = await files().countDocuments();
      assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand3', form: pdfForm({ jobId }, pdf) })).status, 409);
      assert.strictEqual(await files().countDocuments(), before);
    });
    test('validation: non-PDF bytes with a .pdf name and PDF mimetype are refused; wrong type, missing file, oversized file, extra fields', async () => {
      await signIn('cand4', '/api/auth/register', { name: 'Cand Four', email: E('cand4'), password: 'password123', role: 'candidate' });
      const before = await files().countDocuments();
      const html = Buffer.from('<html><script>alert(1)</script></html>' + ' '.repeat(50));
      assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand4', form: pdfForm({ jobId }, html) })).status, 400); // signature check
      assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand4', form: pdfForm({ jobId }, pdf, 'resume.html', 'text/html') })).status, 400);
      assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand4', form: pdfForm({ jobId }, pdf, 'resume.pdf', 'image/png') })).status, 400);
      assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand4', form: pdfForm({ jobId }, null) })).status, 400);
      const big = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024 + 10, 0x20)]);
      const tooBig = await call('/api/apply', { method: 'POST', who: 'cand4', form: pdfForm({ jobId }, big) });
      assert.strictEqual(tooBig.status, 400); assert.strictEqual(tooBig.body.message, 'File too large');
      assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand4', form: pdfForm({ jobId, matchScore: '100', status: 'Shortlisted' }, pdf) })).status, 400);
      assert.strictEqual(await files().countDocuments(), before, 'no rejected upload is ever stored');
      assert.strictEqual(await Application.countDocuments({ candidateEmail: E('cand4') }), 0);
    });
    test('a PDF with many pages is accepted and only the first pages are parsed (limit does not break applying)', async () => {
      const lines = Array.from({ length: 40 }, (_, i) => `Line ${i}`);
      const r = await call('/api/apply', { method: 'POST', who: 'cand4', form: pdfForm({ jobId }, makePdf(lines)) });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    });
    test('an unparseable-but-valid-signature PDF is stored with matchStatus "unavailable" (parsing failure never fails the application)', async () => {
      await signIn('cand5', '/api/auth/register', { name: 'Cand Five', email: E('cand5'), password: 'password123', role: 'candidate' });
      const broken = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.from('this is not a real pdf body at all'.repeat(5))]);
      const r = await call('/api/apply', { method: 'POST', who: 'cand5', form: pdfForm({ jobId }, broken) });
      assert.strictEqual(r.status, 201);
      assert.strictEqual((await Application.findById(r.body.data._id)).matchStatus, 'unavailable');
    });
    test('uploads folder is still not served publicly', async () => {
      assert.strictEqual((await call(`/uploads/${crypto.randomUUID()}.pdf`)).status, 404);
    });
  });

  describe('employer dashboard data (N+1 removed)', () => {
    test('GET /api/employer/applications: all applications across jobs in one call, with titles and counts, no storage names', async () => {
      const mk = async (title) => (await call('/api/jobs', { method: 'POST', who: 'emp', body: { ...jobBody, title } })).body.data._id;
      jobs = [jobId, await mk('Second role'), await mk('Third role'), await mk('Fourth role'), await mk('Fifth role')];
      await signIn('cand6', '/api/auth/register', { name: 'Cand Six', email: E('cand6'), password: 'password123', role: 'candidate' });
      for (const j of jobs.slice(1, 4)) assert.strictEqual((await call('/api/apply', { method: 'POST', who: 'cand6', form: pdfForm({ jobId: j }) })).status, 201);
      const r = await call('/api/employer/applications', { who: 'emp' });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.data.length >= 3);
      for (const a of r.body.data) { assert.strictEqual(a.resumeUrl, undefined); assert.ok(a.jobTitle); assert.ok(a.candidateName); }
      assert.strictEqual(r.body.meta.countsByJob[jobs[1]], 1);
      assert.strictEqual(r.body.meta.countsByJob[jobs[4]], undefined);
      assert.strictEqual(r.body.meta.total, r.body.data.length); assert.strictEqual(r.body.meta.truncated, false);
      assert.strictEqual(r.body.data.find((a) => String(a.jobId) === jobs[2]).jobTitle, 'Third role');
    });
    test('it returns ONLY the signed-in employer\'s data; roles and auth are enforced', async () => {
      const other = await call('/api/employer/applications', { who: 'emp2' });
      assert.strictEqual(other.status, 200); assert.deepStrictEqual(other.body.data, []); assert.strictEqual(other.body.meta.total, 0);
      assert.strictEqual((await call('/api/employer/applications')).status, 401);
      assert.strictEqual((await call('/api/employer/applications', { who: 'cand' })).status, 403);
    });
    test('the number of database operations is constant no matter how many jobs the employer has', async () => {
      const ops = [];
      mongoose.set('debug', (_c, method) => ops.push(method));
      try { await call('/api/employer/applications', { who: 'emp' }); } finally { mongoose.set('debug', false); }
      const reads = ops.filter((m) => ['find', 'aggregate', 'exists', 'findOne', 'countDocuments'].includes(m));
      assert.ok(reads.length <= 6, `expected a small constant number of queries for 5 jobs, saw ${reads.length}: ${ops.join(',')}`); // auth: user + session; data: jobs, applications, counts
    });
    test('the per-job endpoint used elsewhere still works', async () => {
      assert.strictEqual((await call(`/api/applications/job/${jobId}`, { who: 'emp' })).status, 200);
    });
  });
});
