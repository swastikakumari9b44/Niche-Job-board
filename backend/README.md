# Backend (Express + MongoDB)

See the root `README.md` for the full guide, API reference, authentication workflow, Vertical-Switcher and skill matching.

```bash
npm install
cp .env.example .env     # fill in MONGO_URI and JWT_SECRET
npm run dev              # nodemon, http://localhost:5000
npm test                 # unit tests (no DB); set MONGO_URI_TEST to a separate "*test*" database for the integration suite
```

Layout: `config/` (db, env, categories.json), `models/`, `controllers/`, `routes/`, `middleware/` (auth, errors, uploads, rate limiting, ObjectId checks), `validators/`, `services/` (resume parser, skill matcher), `tests/`, `uploads/` (private, git-ignored).
