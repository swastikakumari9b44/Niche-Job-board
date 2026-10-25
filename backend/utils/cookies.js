const COOKIE_NAME = 'token';

function cookieOptions() {
  const prod = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true, // not readable by JavaScript => not stealable via XSS
    secure: prod, // HTTPS only in production
    // Use COOKIE_SAMESITE=none (requires HTTPS) only if the frontend and API are on different sites in production.
    sameSite: process.env.COOKIE_SAMESITE || 'lax',
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

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie };
