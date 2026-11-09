// Safe logging: never print whole error objects (they can carry connection strings, request data, tokens, e-mail addresses).
// We log only the error's name/code/status and a redacted, truncated message. Stack traces are printed only outside production.
const PATTERNS = [
  [/mongodb(\+srv)?:\/\/[^\s"']+/gi, 'mongodb://[redacted]'],
  [/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[jwt-redacted]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]'],
  [/\b(re|rzp_(?:test|live))_[A-Za-z0-9_]{6,}/g, '[key-redacted]'],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email-redacted]'],
  [/\b(password|secret|token|authorization|cookie)\b\s*[:=]\s*\S+/gi, '$1=[redacted]'],
];

function redact(text, max = 300) {
  let s = String(text ?? '');
  for (const [re, to] of PATTERNS) s = s.replace(re, to);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

function describe(err) {
  if (!err || typeof err !== 'object') return redact(err);
  const parts = [err.name || 'Error'];
  if (err.code !== undefined) parts.push(`code=${redact(err.code, 40)}`);
  if (err.statusCode !== undefined) parts.push(`status=${err.statusCode}`);
  parts.push(`message="${redact(err.message)}"`);
  return parts.join(' ');
}

function logError(context, err) {
  console.error(`[error] ${context}: ${describe(err)}`);
  if (process.env.NODE_ENV !== 'production' && err?.stack && process.env.NODE_ENV !== 'test') {
    console.error(redact(err.stack, 1500));
  }
}

function logWarn(context, err) {
  console.warn(`[warn] ${context}${err ? `: ${describe(err)}` : ''}`);
}

module.exports = { redact, describe, logError, logWarn };
