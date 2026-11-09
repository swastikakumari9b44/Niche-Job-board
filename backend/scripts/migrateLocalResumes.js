// One-off helper: copies resumes that still sit in backend/uploads (older deployments) into MongoDB GridFS
// and updates each Application to point at the new copy. Safe to re-run. Run with: npm run migrate-resumes
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Application = require('../models/Application');
const { saveResume, isStoredInGridFs } = require('../services/resumeStorage');
const { pathFor } = require('../middleware/uploadMiddleware');

(async () => {
  await connectDB();
  let moved = 0, missing = 0;
  for await (const app of Application.find({ resumeUrl: { $not: /^gridfs:/ } }).select('resumeUrl resumeOriginalName candidateId')) {
    if (isStoredInGridFs(app.resumeUrl)) continue;
    const file = pathFor(app.resumeUrl);
    if (!file || !fs.existsSync(file)) { missing++; continue; }
    const marker = await saveResume(fs.readFileSync(file), { originalName: app.resumeOriginalName, userId: app.candidateId });
    await Application.updateOne({ _id: app._id }, { $set: { resumeUrl: marker } });
    moved++;
  }
  console.log(`Migrated ${moved} resume(s). ${missing} application(s) had no file on this machine (already lost, nothing to migrate).`);
  await mongoose.disconnect();
})().catch((err) => { console.error('Migration failed:', require('../utils/logger').describe(err)); process.exit(1); });
