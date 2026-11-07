# Milestone 9: Advanced analytics and reporting

## What already existed (reused, not duplicated)
`/api/admin/stats`, `/api/admin/analytics/applications` (7/30/90-day trend), `/api/admin/payments/summary`, `/api/dashboard/employer|candidate` (summary cards) and the dependency-free `Charts.jsx` (bar list, bar trend). All still work unchanged. No chart library was added: new charts (line, stacked bars, donut) are plain SVG in `components/analytics/Charts.jsx`.

## New API endpoints
All responses use `{ success, message, data }`. Date filters: `range=7d|30d|90d|12m|custom` (+ `from`/`to` as `YYYY-MM-DD`, max 366 days, not in the future). Invalid input returns `400`.

| Endpoint | Who | Purpose |
|---|---|---|
| `GET /api/analytics/employer?range=` | employer | Totals, period charts, per-job table, featured vs regular |
| `GET /api/analytics/employer/jobs/:id?range=` | owner | One job (also `range=all` = since published): status mix, series, comparison, promotions |
| `GET /api/analytics/employer/export/applications.csv?range=&jobId=` | employer | Application report |
| `GET /api/analytics/employer/export/jobs.csv?range=` | employer | Job performance report |
| `GET /api/analytics/candidate?range=` | candidate | Personal insights |
| `GET /api/admin/analytics/platform?range=&category=&jobStatus=&applicationStatus=` | admin | Platform totals, trends, categories, revenue, featured stats |
| `GET /api/admin/analytics/export/payments.csv?range=&category=&paymentStatus=` | admin | Payment report (all statuses; revenue column only "Yes" for paid) |
| `GET /api/admin/analytics/export/summary.csv`, `.../jobs.csv` | admin | Per-period numbers behind the charts; jobs report |

Wrong role = 403, signed out = 401. An employer asking for another employer's job gets 404.

## How the numbers are calculated
- **Scope:** employer queries start from `Job.find({ employerId })` and only count applications of those jobs; candidate queries filter by `candidateId`. Nothing is taken from the request.
- **Time series:** one MongoDB `$group` on `$dateToString` (UTC). Missing days/months are filled with zeros in code, so charts never skip periods. Up to ~92 days the buckets are days, longer ranges are months.
- **Revenue / spend:** only payments with `status = "paid"`, dated by `verifiedAt` (when Razorpay confirmed). Pending, failed and created payments are never counted.
- **Featured jobs:** "ever featured" = jobs with a paid payment that was activated. "Featured now" uses the same rule as search (payment id + future expiry + active + not moderated).
- **Featured vs regular:** average applications per job for each group (all-time). Observational: those jobs differ in other ways too.
- **Rates:** shortlist rate = shortlisted / all applications. Average match score uses only resumes that could be read; it shows `n/a` when none could be, never a fake 0.
- **Candidate status trend:** status history is not recorded, so the chart shows the CURRENT status of applications submitted in each period.
- **Admin filters:** category / job status select a set of jobs; applications, featured stats and revenue are limited to those jobs. User counts and registrations are not tied to a category. In NicheHire a niche is a job category, so one filter covers both.
- Empty data returns zeros and empty lists (no errors).

## Exports (CSV)
- Opens in Excel and Google Sheets (UTF-8 with BOM, CRLF). Excel `.xlsx` is **not** built: CSV avoids a new dependency and opens directly in Excel.
- **Safety:** cells starting with `=`, `+`, `-`, `@` are prefixed with an apostrophe so spreadsheets cannot execute them as formulas.
- **Privacy:** employer application report has candidate name, status and skill match only (no email, phone, resume or ids). Admin payment report has the employer's name, order/payment ids, amounts and status; no emails, passwords or tokens.
- Limited to 10,000 rows; the header `X-Export-Truncated: true` tells the app to warn the user. Files are produced per request by the authorized API and are never stored.

## Not built (on purpose)
- **Job views and clicks:** no reliable tracking exists (and no history), so nothing is shown. Adding it would need de-duplicated, bot-filtered event tracking.
- **"Accepted" applications:** the status system has Applied, Shortlisted and Rejected only.
- **Time zone:** everything is UTC.

## Database changes
No manual MongoDB work. These indexes are declared in the models and Mongoose builds them automatically on the next start: Application `{candidateId, createdAt}`, `{jobId, createdAt}`, `{createdAt}`; Job `{nicheCategory, createdAt}`, `{createdAt}`; User `{createdAt}`; Payment `{status, verifiedAt}`, `{employerId, status}`. Building them on a large collection takes a moment; the app stays online.

## Measured performance
Local test with 50 jobs and 20,000 applications: employer overview about 0.5 s, per-job 0.3 s, applications CSV 0.2 s (870 KB), admin platform 0.5 s (one category) to 1.0 s (all data, 12 months). Real Atlas latency will add network time.

## Tests
```bash
cd backend
npm test                                                   # unit tests (no DB)
MONGO_URI_TEST="<separate DB with 'test' in its name>" npm test   # + database tests
cd ../frontend && npm run lint && npm run build
```
The analytics database tests build a dataset with known dates and check exact numbers (period filters, revenue, statuses, exports, isolation between employers, empty data).

## Deploy
No new environment variables and no new dependencies.
```bash
git checkout -b feature/analytics
git add backend frontend ANALYTICS_GUIDE.md
git commit -m "Add employer, candidate and platform analytics with CSV exports"
git push -u origin feature/analytics     # open a PR, check previews, merge to main
```
Render and Vercel redeploy on merge. After deploy: open **Analytics** as an employer, **Platform analytics** in the Admin panel, and download one CSV.
