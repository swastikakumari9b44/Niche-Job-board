# Milestone 8: emails, password recovery, notifications, better UX

## New environment variables (backend only)
| Variable | Required | Example / meaning |
|---|---|---|
| `RESEND_API_KEY` | for email | API key from https://resend.com (API Keys). Backend only, never in Vercel/frontend. |
| `EMAIL_FROM` | for email | `NicheHire <noreply@yourdomain.com>` (a sender on a domain you verified in Resend) |
| `FRONTEND_URL` | recommended | `https://your-app.vercel.app` (used for links inside emails; falls back to the first non-localhost `CORS_ORIGIN`) |

Without `RESEND_API_KEY`/`EMAIL_FROM` everything still works: emails are skipped (logged once at startup as "Email: DISABLED") and in-app notifications continue.
**Resend sender note:** for first tests you can use `EMAIL_FROM="NicheHire <onboarding@resend.dev>"`, but Resend then only delivers to your own Resend account email. To email real users, verify a domain in Resend (add the DNS records they show) and use an address on it.

## Render (backend)
Dashboard > your service > Environment > add the three variables above > Save > the service redeploys. Check the Render log after start: `Email: enabled, sender "NicheHire", links point to https://...`.

## Vercel (frontend)
No change. Redeploy happens when you push. (`NEXT_PUBLIC_API_URL` stays as it is.)

## MongoDB Atlas
No manual change. New collections (`notifications`, `passwordresets`, `savedjobs`) and their indexes are created automatically on first start. Existing users, jobs and applications keep working: new profile fields are optional, and `notifyByEmail` defaults to on.

## What was added
- **Emails** (Resend over HTTPS, branded HTML + plain text, all user values escaped): welcome; application confirmation (candidate); new application (employer); status change (candidate); payment success (employer); payment needs review (admins); job removed; account suspended/reactivated; password reset; password changed.
- **Never breaks the main action:** emails and notifications run in the background; failures are recorded on the notification (`emailStatus`) and never fail registration, applications or payments.
- **No duplicates:** each event has a unique key; the email is only sent when its in-app notification was newly created. Status emails go out only on a real change (double clicks notify once).
- **Not unnecessary:** users can switch off non-essential emails on /profile. Receipts, security and account notices always send. Flagging a job (internal review) does not notify the employer.
- **Forgot/reset password:** 256-bit random token, only its SHA-256 hash stored, 30-minute expiry, single use (atomic), same answer whether or not the email exists, one email per minute per account, older links replaced, all older sessions signed out after a reset.
- **In-app notifications:** bell with unread count, dropdown, /notifications page, mark one/all read, links to the relevant page. Users only ever access their own.
- **Toasts, confirm dialogs, friendly errors** across the app; technical wording never shown.
- **Dashboards:** candidate summary + profile guidance; employer summary (jobs, applications, awaiting review, featured expiry, recent applicants).
- **Profile page** and **Saved jobs**.

## Test email delivery
1. Add the variables on Render (or in `backend/.env` locally), restart.
2. Register a new account using your own inbox (with `onboarding@resend.dev` it must be the email of your Resend account). You should receive the welcome email within a minute.
3. As a candidate apply to a job: the candidate gets a confirmation; the employer gets "New application". Change the status in the employer dashboard: the candidate gets an update email.
4. If nothing arrives: check Render logs for `Email to a user failed: ...`, check Resend dashboard > Logs, and spam folder. Each notification's `emailStatus` (`sent`/`failed`/`skipped`) is visible in MongoDB `notifications`.

## Test password recovery
1. /login > **Forgot password?** > enter a registered email. The page always says a link was sent.
2. Open the email, click the button (link looks like `https://<site>/reset-password?token=...`), choose a new password.
3. Try the same link again: it says it is invalid or expired. Log in with the new password. An old logged-in browser is signed out on its next request.

## Deploy safely
```bash
git checkout -b feature/milestone8
git add backend frontend MILESTONE8_GUIDE.md
git commit -m "Add emails, password recovery, in-app notifications, profile, saved jobs and dashboard improvements"
git push -u origin feature/milestone8     # open a PR, check that CI/Vercel preview builds, merge to main
```
1. Add the Render variables first (they are optional, so the deploy is safe even before they exist).
2. Merge: Render and Vercel redeploy automatically.
3. Check `/api/health`, log in, trigger one email as above.
4. Never commit `.env` or the Resend key.

## Run the tests
```bash
cd backend
npm test                                                   # unit tests (no DB)
MONGO_URI_TEST="<separate DB with 'test' in its name>" npm test   # + database tests
cd ../frontend && npm run lint && npm run build
```
