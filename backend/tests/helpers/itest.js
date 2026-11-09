// Shared helpers for the Milestone 10 database integration tests. Skipped unless MONGO_URI_TEST names a "...test..." database.
const crypto = require('crypto');
const makePdf = require('./makePdf');

const URI = process.env.MONGO_URI_TEST;
const dbName = URI ? new URL(URI.replace('mongodb+srv://', 'mongodb://')).pathname.replace('/', '') : '';
const skip = !URI ? 'MONGO_URI_TEST not set' : !/test/i.test(dbName) ? 'database name must contain "test"' : false;

function makeClient(getBase) {
  const jar = {};
  const call = async (p, { method = 'GET', body, who, form, headers = {}, cookie } = {}) => {
    const res = await fetch(getBase() + p, {
      method, body: form || (body === undefined ? undefined : JSON.stringify(body)),
      headers: { ...(!form && body !== undefined && { 'content-type': 'application/json' }), ...((cookie || (who && jar[who])) && { cookie: cookie || jar[who] }), ...headers },
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: res.status, body: json, res, text };
  };
  const signIn = async (who, path, payload, headers) => {
    const r = await call(path, { method: 'POST', body: payload, headers });
    const sc = r.res.headers.get('set-cookie');
    if (sc) jar[who] = sc.split(';')[0];
    return r;
  };
  return { jar, call, signIn };
}

const pdfForm = (fields, pdf = makePdf(['Jane Doe - Machine Learning Engineer', 'Skills: Python, PyTorch, SQL, AWS']), name = 'resume.pdf', type = 'application/pdf') => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  if (pdf) f.append('resume', new Blob([pdf], { type }), name);
  return f;
};

const jobBody = {
  title: 'Machine Learning Engineer', company: 'TechNova', description: 'Develop and deploy machine learning models.',
  nicheCategory: 'AI/ML', location: 'Bengaluru', employmentType: 'Full-time',
  salaryRange: { min: 800000, max: 1500000, currency: 'inr' },
  requiredSkills: ['Python', 'PyTorch', 'SQL', 'Docker', 'AWS'],
  customFields: { programmingLanguages: ['Python'], mlFrameworks: ['PyTorch', 'TensorFlow'], modelDeploymentExperience: true, experienceLevel: 'Entry Level' },
};

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
module.exports = { URI, skip, makeClient, pdfForm, jobBody, sha256, makePdf };
