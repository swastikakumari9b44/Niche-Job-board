# Admin panel: setup, testing and deployment

## What it adds
- Role `admin` (in addition to candidate and employer), using the same JWT HttpOnly-cookie login.
- `/admin` (overview), `/admin/users`, `/admin/jobs` (moderation), `/admin/analytics`, `/admin/audit-log`.
- API under `/api/admin/*`; every route requires a signed-in, non-suspended account whose **stored** role is `admin`.
- Suspension: a suspended user's existing cookie stops working on the very next request, and they cannot log in.
- Job moderation: flag / clear flag / remove / restore, each with a mandatory reason. A removed job is closed, hidden from the public, and locked for its employer (who sees the reason on their dashboard).
- Audit log (`AuditLog` collection): admin id, action, target, reason, timestamp. Append-only: no edit/delete endpoints.

## Security rules enforced
- Registration accepts only `candidate` / `employer`; `admin` or any extra field returns 400. Profile update can only change `name` (sending `role` returns 403).
- The only way to get an admin is the manual script below (no API route).
- Admins cannot suspend themselves or other admins. Admins cannot open resumes or applicant lists (analytics are aggregates only).
- A forged token claiming `admin` is useless: the database role is checked on every request.

## Create the first admin (manual bootstrap)
Existing accounts need no migration (a missing `status` counts as active).

```bash
cd backend
npm run create-admin
# prompts for name, email, password (min 12 chars, hidden while typing)

npm run create-admin -- --promote     # upgrade an EXISTING account to admin instead
```
It uses `MONGO_URI` from the environment/`.env`, so it targets whichever database that points to.
Non-interactive (e.g. a hosting shell), for that one command only:
```bash
ADMIN_NAME="Your Name" ADMIN_EMAIL="you@example.com" ADMIN_PASSWORD="a-long-password" npm run create-admin
```
Do not store the admin password in `.env` or commit it.

## Test locally
```bash
cd backend && npm install
npm test                                              # unit tests, no database
MONGO_URI_TEST="<separate DB whose name contains test>" npm test   # + database integration tests (incl. admin panel)
npm run dev
cd ../frontend && npm install && npm run lint && npm run build && npm run dev
```
Then: create an admin, open http://localhost:3000/login, sign in, you land on `/admin`.
Try: suspend a test candidate (log in as them in another browser: their next click fails and the red banner appears; reactivate to restore), flag/remove/restore a test job, check the audit log.

## Production (MongoDB Atlas + Render + Vercel)
Render (backend) environment:
- `NODE_ENV=production`
- `MONGO_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN` (unchanged)
- `CORS_ORIGIN=https://<your-app>.vercel.app` (exact origin, no trailing slash; comma-separate several)
- `COOKIE_SAMESITE=none` (frontend and API are on different sites, so the cookie must be `SameSite=None; Secure`)

Vercel (frontend): `NEXT_PUBLIC_API_URL=https://<your-service>.onrender.com` (unchanged).

The backend now sets `trust proxy` in production (needed behind Render for secure cookies and per-client rate limiting).
Create the production admin once, from your computer, by running the script with the production `MONGO_URI` for that single command, or from the Render Shell.
Browsers that block third-party cookies (Safari, Brave) can break cross-site login; if that appears, serve the API from the same site (custom domain for both, e.g. `app.example.com` and `api.example.com`) or proxy `/api` through Vercel.

## Git and redeploy
```bash
git status
git checkout -b feature/admin-panel
git add backend frontend ADMIN_PANEL.md
git commit -m "Add admin panel: user management, job moderation, analytics, audit log"
git push -u origin feature/admin-panel        # open a pull request, review, merge to main
```
Render and Vercel redeploy automatically when `main` (or your connected branch) updates. After both finish: check `https://<render>/api/health`, run `create-admin`, log in at your Vercel URL.
