# NicheHire: Niche Job Board + ATS

A full-stack MERN project: employers post niche-specific jobs, candidates apply with a PDF resume, and employers review applicants (with an explainable skill-coverage score) and move them through Applied, Shortlisted or Rejected.

**Stack:** Next.js (App Router) + Tailwind CSS + Lucide, Node.js + Express, MongoDB Atlas + Mongoose, JWT in HttpOnly cookies, bcryptjs, Zod, Multer, pdf-parse.

```
niche-job-board/
├── backend/    Express API (config, models, controllers, routes, middleware, validators, services, tests, uploads)
└── frontend/   Next.js app (app/, components/, hooks/, lib/)
```

## Quick start
```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # keep your existing .env if you have one; it needs MONGO_URI, JWT_SECRET
npm run dev                   # http://localhost:5000

# 2. Frontend (new terminal)
cd frontend
npm install
cp .env.local.example .env.local
npm run dev                   # http://localhost:3000
```
Backend `.env` must contain `CORS_ORIGIN=http://localhost:3000` so the browser may send the login cookie. Never commit `.env`.

## Features
- Register/login as **candidate** or **employer**; session in an HttpOnly cookie (no tokens in localStorage); login/register rate limited.
- **Vertical-Switcher:** the job form changes its fields per niche category (7 categories), driven by one config file used by both backend validation and frontend rendering.
- Job board with search, category/location/type filters, pagination, skeletons, empty and error states.
- PDF resume upload (5 MB, type + file-signature check, random file names, private storage, authorized download only).
- **Skill coverage score**: deterministic keyword matching of resume text against the job's required skills; matched and missing skills shown to employers; never auto-rejects or auto-shortlists.
- Employer dashboard (stats, job management, applicant table with status dropdown) and candidate dashboard.
- Promotion fields (`pinnedUntil`, `urgentUntil`) exist on jobs but can only be set by the server. Payments are not implemented.

## Vertical-Switcher
`backend/config/categories.json` defines each category's fields (`select`, `multiselect`, `tags`, `boolean`, `text`), options, and which are required.
- **Backend:** `validators/jobValidator.js` builds a strict Zod schema per category from that file. Unknown keys are rejected, so no arbitrary field injection.
- **Frontend:** `GET /api/categories` returns the same config; `DynamicFields.jsx` renders inputs from it and `CustomFieldsView.jsx` shows saved values on the job page.
- Switching category in the form discards fields that do not belong to the new category (and restores saved ones if you switch back while editing). The API re-validates against the merged category on every PATCH.
- To add or change a niche, edit `categories.json` only (restart the API).

Categories: AI/ML, Frontend Development, Web3 / Blockchain, Nursing / Healthcare, Data Science, Cybersecurity, Other.
> Jobs saved earlier under the old Day 1 names (`Frontend`, `Web3`, `Nursing`) stay readable but must be re-categorised when edited.

## Resume skill matching
1. The PDF is parsed with `pdf-parse` (Mozilla pdf.js); text is lower-cased and whitespace-normalised.
2. Each required skill of the job is looked up in a built-in alias dictionary (`js` = JavaScript, `k8s` = Kubernetes, `sklearn` = Scikit-learn...). Skills not in the dictionary are matched as plain words.
3. Matching is whole-word (`java` does not match `javascript`, `sql` does not match `mysql`).
4. Score = matched required skills / total required skills x 100 (Python, PyTorch, SQL, AWS of 5 required = 80%). Matched and missing lists are stored on the application.
5. If the PDF has almost no extractable text (scanned image) or the job lists no required skills, status is `unavailable` and the dashboard shows "Not available" instead of a misleading 0%.

Limits: keyword matching, not semantic AI; no OCR for scanned resumes; synonyms outside the dictionary are missed. The score assists human review only.

## Authentication workflow
1. `POST /api/auth/register` or `/login` validates input (Zod), checks the bcrypt hash, and sets a signed JWT (id and role) in an `HttpOnly; SameSite=Lax` cookie (`Secure` in production). The response body contains the user only.
2. The browser sends the cookie automatically (`credentials: "include"`); the frontend learns who is logged in via `GET /api/auth/me`.
3. Middleware verifies the JWT; role checks and ownership checks follow. Wrong role or not the owner = 403; missing or expired token = 401.
4. `POST /api/auth/logout` clears the cookie.

CSRF: the cookie is SameSite=Lax, CORS only allows configured origins, and state changes use POST/PATCH/DELETE with JSON or multipart bodies.

## API reference
Responses: `{ success, message, data }`; errors: `{ success: false, message, errors?: [{ field, message }] }`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/api/health` | none | works without DB; reports database state |
| GET | `/api/categories` | none | Vertical-Switcher config |
| POST | `/api/auth/register` | none | `{ name, email, password (8-72), role }`; 201; 409 duplicate email |
| POST | `/api/auth/login` | none | `{ email, password }`; sets cookie |
| GET | `/api/auth/me` | any | current user |
| POST | `/api/auth/logout` | none | clears cookie |
| GET / PATCH | `/api/users/me` | any | PATCH accepts `{ name }` only; `role` returns 403 |
| GET | `/api/jobs` | none | `?search=&category=&location=&employmentType=&page=&limit=`; active jobs, newest first |
| GET | `/api/jobs/:id` | none | |
| POST | `/api/jobs` | employer | owner from the cookie; `employerId`, `promotion`, `status` in the body are rejected |
| PATCH | `/api/jobs/:id` | owner | custom fields re-validated |
| DELETE | `/api/jobs/:id` | owner | soft delete (`closed`); applications kept |
| GET | `/api/employer/jobs` | employer | all your jobs |
| POST | `/api/apply` (alias `/api/applications`) | candidate | `multipart/form-data`: `jobId`, `resume` (PDF), optional `candidateName`, `candidateEmail` |
| GET | `/api/applications/my` | candidate | your applications (no match data) |
| GET | `/api/applications/job/:jobId` | owner | applicants with score, matched and missing skills |
| GET | `/api/applications/:id/resume` | owner employer or the applicant | streams the PDF |
| PATCH | `/api/applications/:id/status` | owner | `{ status: "Applied" \| "Shortlisted" \| "Rejected" }` |

Example job body:
```json
{ "title": "Machine Learning Engineer", "company": "TechNova", "description": "Develop and deploy ML models.",
  "nicheCategory": "AI/ML", "location": "Bengaluru", "employmentType": "Full-time",
  "salaryRange": { "min": 800000, "max": 1500000, "currency": "INR" },
  "requiredSkills": ["Python", "PyTorch", "SQL"],
  "customFields": { "programmingLanguages": ["Python"], "mlFrameworks": ["PyTorch"], "experienceLevel": "Entry Level" } }
```

## Database models
- **User:** name, email (unique, lowercase), password (bcrypt, `select: false`, stripped from JSON), role, timestamps.
- **Job:** title, company, description, nicheCategory, location, employmentType, salaryRange, requiredSkills, customFields, status, employerId (ref User, indexed), promotion {pinnedUntil, urgentUntil}, timestamps.
- **Application:** jobId (ref Job), candidateId (ref User), candidate name/email, resume reference + original name + size, extractedSkills, matchStatus, matchScore (0-100), matchedSkills, missingSkills, status, timestamps; **unique index (jobId, candidateId)**.

## Testing
```bash
cd backend
npm test                                          # 20 tests, no DB needed (DB suite skipped)
MONGO_URI_TEST="<separate test DB uri>" npm test  # plus 16 MongoDB integration tests
cd ../frontend && npm run lint && npm run build
```
`MONGO_URI_TEST` must be a **separate database whose name contains `test`** (e.g. `.../nicheJobBoard_test`). The suite refuses other names and deletes only records it created (emails ending `@itest.example`, plus their uploaded files).

## Manual test of the whole app
1. Start backend and frontend; open http://localhost:3000.
2. Sign up as **Employer**. Open **Post a job**, pick *AI/ML*, note its fields, switch to *Nursing / Healthcare* and watch them change. Add required skills (e.g. Python, PyTorch, SQL, Docker, AWS) and submit.
3. **Browse jobs**: find it with search and the category/location/type filters; open it to see the niche details.
4. Log out, sign up as **Candidate**, open the job, upload a PDF resume mentioning some of those skills, submit. Applying again shows a duplicate error.
5. **My applications** shows the status.
6. Log in as the employer: the dashboard shows counts, the applicant with score, matched and missing skills, **View PDF**, and a status dropdown. Set Shortlisted, then log in as the candidate to see it.
7. Edit the job, then **Close** it: it leaves the public board but stays on the dashboard.

## Planned next
Server-verified payments and promotion checkout, email notifications, OCR for scanned resumes, semantic matching, deployment.
