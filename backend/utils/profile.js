// Profile-completion guidance (not a hard requirement).
const CANDIDATE = [['name', 'Your name'], ['headline', 'A short professional headline'], ['location', 'Your location'], ['phone', 'A phone number']];
const EMPLOYER = [['name', 'Your name'], ['companyName', 'Company name'], ['location', 'Company location'], ['phone', 'A contact phone number'], ['headline', 'A short company description']];

function profileCompletion(user) {
  if (!user || user.role === 'admin') return null;
  const fields = user.role === 'employer' ? EMPLOYER : CANDIDATE;
  const missing = fields.filter(([k]) => !String(user[k] ?? '').trim()).map(([, label]) => label);
  return { percent: Math.round(((fields.length - missing.length) / fields.length) * 100), missing };
}

module.exports = { profileCompletion };
