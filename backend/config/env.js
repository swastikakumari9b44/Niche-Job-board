const REQUIRED = ['MONGO_URI', 'JWT_SECRET'];

// Called at startup (server.js). Throws a clear error listing missing variables.
function validateEnv() {
  const missing = REQUIRED.filter((k) => !process.env[k] || !process.env[k].trim());
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`
    );
  }
  if (process.env.JWT_SECRET.length < 16) {
    throw new Error('JWT_SECRET must be at least 16 characters long.');
  }
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

// Used by CORS. In development any localhost port is accepted (Next.js falls back to 3001, 3002... when 3000 is busy).
function isAllowedOrigin(origin) {
  if (!origin) return true; // curl / server-to-server (no Origin header)
  if (getAllowedOrigins().includes(origin)) return true;
  return process.env.NODE_ENV !== 'production' && LOCAL_ORIGIN.test(origin);
}

module.exports = { validateEnv, getAllowedOrigins, isAllowedOrigin };
