const COOKIE_NAME = 'token';
const SAMESITE_VALUES = ['lax', 'strict', 'none'];

// Returns 'lax' | 'strict' | 'none'. Unset => 'lax'. Anything else is invalid (validateEnv stops the server at startup;
// here we fall back to 'lax' so a bad value can never silently produce a broken Set-Cookie header).
function sameSite() {
  const raw = String(process.env.COOKIE_SAMESITE ?? '').trim().replace(/^["']+|["']+$/g, '').toLowerCase();
  if (!raw) return 'lax';
  return SAMESITE_VALUES.includes(raw) ? raw : 'lax';
}

function cookieOptions() {
  const prod = process.env.NODE_ENV === 'production';
  const ss = sameSite();
  return {
    httpOnly: true, // not readable by JavaScript => not stealable via XSS
    secure: prod || ss === 'none', // browsers reject SameSite=None cookies that are not Secure
    // Use COOKIE_SAMESITE=none only when the frontend and API are on different sites (e.g. vercel.app + onrender.com).
    sameSite: ss,
    path: '/',
  };
}

const maxAgeMs = () => {
  const m = /^(\d+)([dhm])$/.exec(process.env.JWT_EXPIRES_IN || '7d');
  if (!m) return 7 * 864e5;
  return Number(m[1]) * { d: 864e5, h: 36e5, m: 6e4 }[m[2]];
};

const setAuthCookie = (res, token) => res.cookie(COOKIE_NAME, token, { ...cookieOptions(), maxAge: maxAgeMs() });
const clearAuthCookie = (res) => res.clearCookie(COOKIE_NAME, cookieOptions());

module.exports = { COOKIE_NAME, SAMESITE_VALUES, sameSite, cookieOptions, maxAgeMs, setAuthCookie, clearAuthCookie };
