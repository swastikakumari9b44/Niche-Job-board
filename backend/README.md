# Niche Job Board + ATS — Backend (Day 1)

## 1. Overview
REST API for a niche job board with an applicant tracking system. Day 1 delivers the foundation: models, job APIs, application APIs, JWT/role middleware, validation, error handling, and tests that run without a database.

## 2. Technologies
Node.js, Express 5, MongoDB + Mongoose, JWT (jsonwebtoken) + bcryptjs, Zod, Multer, Nodemon (dev). JavaScript (CommonJS).

## 3. Folder structure
```
backend/
├── config/        db.js (Mongoose connection), env.js (env validation, CORS origins)
├── models/        User.js, Job.js, Application.js
├── controllers/   jobController.js, applicationController.js
├── routes/        jobRoutes.js, applicationRoutes.js
├── middleware/    authMiddleware.js, errorMiddleware.js, uploadMiddleware.js, validateObjectId.js
├── validators/    jobValidator.js (Zod + per-category custom fields)
├── utils/         AppError.js
├── tests/         api.test.js
├── uploads/       future resume storage (git-ignored, NOT served publicly)
├── app.js         Express app (importable for tests)
└── server.js      startup: validates env, connects DB, listens
```
(`app.js` and a few small helper files are additions to the requested structure so the app can be tested without starting a server.)

## 4. Installation
```bash
cd backend
npm install
cp .env.example .env     # Windows: copy .env.example .env
```

## 5. Environment variables
| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string (required) |
| `JWT_SECRET` | Secret for signing/verifying JWTs, 16+ chars (required) |
| `JWT_EXPIRES_IN` | Token lifetime, used from Day 2 (default `7d`) |
| `PORT` | Server port (default 5000) |
| `CORS_ORIGIN` | Comma-separated allowed frontend origins |
| `NODE_ENV` | `development` / `production` |

## 6. Connecting MongoDB Atlas yourself
1. Create a free account/cluster at https://cloud.mongodb.com.
2. **Database Access** → Add a database user (username + password). Avoid special characters or URL-encode them.
3. **Network Access** → Add your IP address (use `0.0.0.0/0` only for short-term development).
4. **Database** → Connect → Drivers → copy the `mongodb+srv://...` string.
5. Open `backend/.env` and paste it as `MONGO_URI`, replacing `<username>`, `<password>`, and putting a database name (e.g. `nicheJobBoard`) before the `?`.
6. Generate a secret and paste it as `JWT_SECRET`:
   `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

`.env` is git-ignored. Never commit it.

## 7. Starting the server
```bash
npm run dev     # nodemon, auto-restart
npm start       # plain node
```
Without a configured `.env` the server exits with a clear "Missing required environment variables" message.

## 8. API endpoints
All responses: `{ success, message, data }`. Errors: `{ success: false, message, errors?: [{ field, message }] }`.
Auth header: `Authorization: Bearer <token>` (token from register/login, payload `{ id, role }`).

| Method | Path | Auth | Success | Notes |
|---|---|---|---|---|
| GET | `/` , `/api/health` | none | 200 | health reports `database.connected` |
| POST | `/api/auth/register` | none | 201 | `{ name, email, password (8-72), role: candidate\|employer }`; 409 if email exists |
| POST | `/api/auth/login` | none | 200 | `{ email, password }`; 401 on bad credentials |
| GET | `/api/users/me` | any user | 200 | profile, never includes password hash |
| PATCH | `/api/users/me` | any user | 200 | `{ name }` only; sending `role` returns 403 |
| GET | `/api/jobs` | none | 200 | `?category=AI/ML&location=Bengaluru&search=python&page=1&limit=10` (`keyword` = alias of `search`); active jobs, newest first, limit max 50 |
| GET | `/api/jobs/:id` | none | 200 | 400 bad id, 404 not found |
| POST | `/api/jobs` | employer | 201 | employer id comes from the token; `employerId`/`promotion`/`status` in the body are rejected |
| PATCH | `/api/jobs/:id` | owner employer | 200 | custom fields re-validated against the category |
| DELETE | `/api/jobs/:id` | owner employer | 200 | soft delete (status becomes `closed`) |
| POST | `/api/applications` | candidate | 201 | see body below; 409 duplicate, 404 unknown job, 400 closed job |
| POST | `/api/apply` | candidate | 201 | legacy alias of the above |
| GET | `/api/applications/my` | candidate | 200 | own applications with job summary |
| GET | `/api/applications/job/:jobId` | owner employer | 200 | 403 if not the owner |
| PATCH | `/api/applications/:id/status` | owner employer | 200 | `{ status: Applied\|Shortlisted\|Rejected }` |

Example bodies
```json
// POST /api/auth/register
{ "name": "Test Employer", "email": "employer@example.com", "password": "password123", "role": "employer" }

// POST /api/jobs
{ "title": "Machine Learning Engineer", "company": "TechNova", "description": "Develop and deploy machine learning models.",
  "nicheCategory": "AI/ML", "location": "Bengaluru", "employmentType": "Full-time",
  "requiredSkills": ["Python", "PyTorch", "MongoDB"],
  "customFields": { "framework": "PyTorch", "experienceLevel": "Entry Level" } }

// POST /api/applications
{ "jobId": "<job _id>", "candidateName": "Test Candidate", "candidateEmail": "candidate@example.com", "resumeUrl": "test-resume-reference.pdf" }
```
`resumeUrl` is only an **unverified PDF file-name reference** (e.g. `resume.pdf`). URLs and paths are rejected, and nothing is fetched or served. `candidateEmail` must match the logged-in account. `employmentType` is case-insensitive and stored lowercase (`full-time`).

Custom fields per category (unknown keys rejected):
- **AI/ML**: framework, experienceLevel, modelFrameworks, researchExperienceRequired, gpuAccessProvided, publicationsPreferred
- **Nursing**: licenseType (RN/LPN/NP/CNA), licenseState, shiftType (day/night/rotating), yearsExperience, certifications
- **Web3**: blockchains, smartContractLanguages, auditExperienceRequired, tokenCompensation
- **Frontend**: frameworks, designSystemExperience, remotePolicy (remote/hybrid/onsite)
- **Other**: flat key/value (string/number/boolean), max 20 keys

## 9. Testing
```bash
npm test                          # 11 tests, no database needed; DB suite is skipped
MONGO_URI_TEST="<separate test DB uri>" npm test   # also runs the 12-step MongoDB integration suite
```
The integration suite refuses to run unless the database name contains `test`, and removes only the records it created (emails ending `@itest.example`). Do not point it at your development data.

Manual testing: import `postman/niche-job-board.postman_collection.json` into Postman or Thunder Client, set the `baseUrl` variable (default `http://localhost:5000`), then run the folders in order. Register/login requests store the tokens and ids automatically.

## 10. Planned for Days 2–7
- Day 2 (done): registration, login, JWT issuing, profile
- Day 3: resume PDF upload (middleware already prepared) and storage
- Day 4: resume text extraction / skill parsing
- Day 5: match scoring against required skills
- Day 6: promotions (pin/urgent) and payment flow
- Day 7: hardening, DB integration tests, deployment

(Days 4–7 are a suggested outline; adjust to your plan.)
