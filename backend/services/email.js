// Email delivery through Resend's HTTPS API (works on Render's free tier, which blocks SMTP ports).
// Contract: send() NEVER throws. Callers get { ok, id } | { ok:false, skipped } | { ok:false, error }.
// The API key lives only in backend environment variables and is never logged or returned.
const clean = (v) => String(v ?? '').trim().replace(/^["']+|["']+$/g, '').trim();
const apiKey = () => clean(process.env.RESEND_API_KEY);
const from = () => clean(process.env.EMAIL_FROM);
const isConfigured = () => !!(apiKey() && from());

// The site URL used in email links: FRONTEND_URL, else the first non-local CORS origin, else localhost.
function frontendUrl() {
  const direct = clean(process.env.FRONTEND_URL);
  const cors = clean(process.env.CORS_ORIGIN).split(',').map((s) => s.trim()).find((o) => o && !/localhost|127\.0\.0\.1/.test(o));
  return (direct || cors || 'http://localhost:3000').replace(/\/+$/, '');
}

const TIMEOUT_MS = 8000;

async function resendTransport({ to, subject, html, text }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from(), to: [to], subject, html, text }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `Provider returned HTTP ${res.status}` }; // body not logged: may echo the address
    const body = await res.json().catch(() => ({}));
    return { ok: true, id: body.id };
  } catch (err) {
    return { ok: false, error: err.name === 'AbortError' ? 'Timed out' : 'Network error' };
  } finally {
    clearTimeout(timer);
  }
}

let warned = false;
async function send(message) {
  try {
    if (!message?.to || !message?.subject) return { ok: false, error: 'Missing recipient or subject' };
    if (!isConfigured()) {
      if (!warned) { warned = true; console.warn('Email: not configured (RESEND_API_KEY / EMAIL_FROM missing). Emails are skipped.'); }
      return { ok: false, skipped: true };
    }
    const result = await module.exports.transport(message); // replaceable in tests
    if (!result?.ok) console.error(`Email to a user failed: ${result?.error || 'unknown error'}`);
    return result?.ok ? result : { ok: false, error: result?.error || 'Send failed' };
  } catch (err) {
    console.error(`Email to a user failed: ${err?.message || 'unexpected error'}`);
    return { ok: false, error: 'Send failed' };
  }
}

function logConfigStatus() {
  if (!isConfigured()) return console.warn('Email: DISABLED (set RESEND_API_KEY and EMAIL_FROM to enable). In-app notifications still work.');
  console.log(`Email: enabled, sender "${from().replace(/<.*>/, '').trim() || from()}", links point to ${frontendUrl()}`);
}

module.exports = { send, isConfigured, frontendUrl, logConfigStatus, transport: resendTransport };
