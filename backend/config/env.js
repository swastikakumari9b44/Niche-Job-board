const { SAMESITE_VALUES } = require('../utils/cookies');

const REQUIRED = ['MONGO_URI', 'JWT_SECRET'];
const KNOWN_WEAK_SECRETS = [
  'replace-with-a-long-random-secret', 'changeme', 'change-me', 'secret', 'jwt_secret', 'jwtsecret', 'your-secret', 'your_secret',
  'supersecret', 'password', 'test-secret', 'development', 'default',
];

// Strong = at least 32 characters, not a placeholder/sample value and not a trivially repetitive string.
function checkJwtSecret(secret) {
  const s = String(secret || '');
  if (s.length < 32) return 'JWT_SECRET must be at least 32 characters long. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"';
  const lower = s.toLowerCase();
  if (KNOWN_WEAK_SECRETS.some((w) => lower.includes(w))) return 'JWT_SECRET looks like a placeholder or common word. Generate a random one (see .env.example).';
  if (new Set(s).size < 10) return 'JWT_SECRET is too repetitive/low-entropy. Generate a random one (see .env.example).';
  return null;
}

// Called at startup (server.js). Throws ONE clear error listing every problem; returns non-fatal warnings.
function validateEnv(env = process.env) {
  const prod = env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  const missing = REQUIRED.filter((k) => !env[k] || !env[k].trim());
  if (missing.length) errors.push(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
  else {
    const weak = checkJwtSecret(env.JWT_SECRET);
    if (weak) errors.push(weak);
  }

  if (env.JWT_EXPIRES_IN && !/^\d+[dhm]$/.test(env.JWT_EXPIRES_IN)) {
    errors.push(`JWT_EXPIRES_IN="${env.JWT_EXPIRES_IN}" is invalid. Use a number plus d, h or m (for example 7d, 12h, 30m).`);
  }

  const ssRaw = String(env.COOKIE_SAMESITE ?? '').trim().replace(/^["']+|["']+$/g, '').toLowerCase();
  if (ssRaw && !SAMESITE_VALUES.includes(ssRaw)) {
    errors.push(`COOKIE_SAMESITE="${env.COOKIE_SAMESITE}" is invalid. Allowed values: lax, strict, none. (Invalid values make login look successful while the browser drops the cookie.)`);
  }
  if (ssRaw === 'none' && !prod) warnings.push('COOKIE_SAMESITE=none makes cookies Secure-only; on plain http://localhost some browsers will not store them. Use lax for local development.');
  if (prod && !ssRaw) warnings.push('COOKIE_SAMESITE is not set (defaults to lax). If the frontend and the API are on different sites (for example vercel.app and onrender.com) login will not stick: set COOKIE_SAMESITE=none.');

  if (prod) {
    const origins = (env.CORS_ORIGIN || '').split(',').map((o) => o.trim()).filter(Boolean);
    if (!origins.length) errors.push('CORS_ORIGIN must be set in production (the exact frontend origin, e.g. https://your-app.vercel.app).');
    if (origins.some((o) => o === '*' || !/^https:\/\//.test(o))) errors.push('CORS_ORIGIN in production must be a comma-separated list of exact https:// origins (no "*", no http://).');
    if (!env.FRONTEND_URL) warnings.push('FRONTEND_URL is not set; links in e-mails fall back to the first CORS origin.');
  }

  if (errors.length) throw new Error(errors.join('\n  - '));
  return warnings;
}

// Origins the browser may call the API from (credentials allowed). CORS_ORIGIN is a comma-separated list.
// Outside production the local Next.js dev origins are always allowed too, so a stale or duplicated
// CORS_ORIGIN line in .env cannot lock you out while developing.
function getAllowedOrigins() {
  const list = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (process.env.NODE_ENV !== 'production') list.push('http://localhost:3000', 'http://127.0.0.1:3000');
  return [...new Set(list)];
}

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Used by CORS and by the CSRF origin guard. In development any localhost port is accepted.
// A request with no Origin header at all is NOT decided here: callers decide (CORS allows it, the CSRF guard has extra rules).
function isAllowedOrigin(origin) {
  if (!origin) return true; // curl / server-to-server (no Origin header)
  if (getAllowedOrigins().includes(origin)) return true;
  return process.env.NODE_ENV !== 'production' && LOCAL_ORIGIN.test(origin);
}

module.exports = { validateEnv, checkJwtSecret, getAllowedOrigins, isAllowedOrigin };
