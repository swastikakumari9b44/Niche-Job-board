const AppError = require('../utils/AppError');
const { isAllowedOrigin } = require('../config/env');
const { COOKIE_NAME } = require('../utils/cookies');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const blocked = () => new AppError('Cross-origin request blocked', 403, 'CSRF_BLOCKED');

const originOf = (url) => { try { return new URL(url).origin; } catch { return null; } };

// CSRF / cross-origin protection for every state-changing request (POST, PUT, PATCH, DELETE).
// Browsers always attach an Origin header to cross-origin POSTs (including multipart/form-data forms), so we require it
// to be on the allow-list. This does not depend on SameSite, which must be "none" for a Vercel + Render setup.
//  1. Origin present        -> must be allow-listed ("null" and unknown origins are rejected).
//  2. No Origin             -> Sec-Fetch-Site (sent by modern browsers) must be same-origin/none; else Referer must be allow-listed.
//  3. Nothing at all        -> allowed only if the request carries no auth cookie (curl, server-to-server, API clients using a Bearer
//                              header). A cookie-bearing request with no provenance headers is refused in production.
function originGuard(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.headers.origin;
  if (origin !== undefined) return isAllowedOrigin(String(origin)) && origin !== '' ? next() : next(blocked());

  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin' || site === 'none' ? next() : next(blocked());

  const referer = req.headers.referer;
  if (referer) {
    const ro = originOf(referer);
    return ro && isAllowedOrigin(ro) ? next() : next(blocked());
  }

  const hasCookie = !!req.cookies?.[COOKIE_NAME];
  if (hasCookie && process.env.NODE_ENV === 'production') return next(blocked());
  next();
}

module.exports = { originGuard };
