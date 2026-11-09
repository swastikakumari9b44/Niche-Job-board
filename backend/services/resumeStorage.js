// Persistent resume storage in MongoDB GridFS (collection "resumes.files" / "resumes.chunks").
// Why: Render's web-service disk is wiped on every deploy/restart, so files written to backend/uploads would vanish.
// The database already persists, is backed up with the rest of the data and needs no extra paid service or secret.
const mongoose = require('mongoose');

const PREFIX = 'gridfs:';
let cached = { db: null, bucket: null };

function bucket() {
  const db = mongoose.connection.db;
  if (!db) throw Object.assign(new Error('Database not connected'), { name: 'MongoNotConnectedError' });
  if (cached.db !== db) cached = { db, bucket: new mongoose.mongo.GridFSBucket(db, { bucketName: 'resumes' }) };
  return cached.bucket;
}

const isStoredInGridFs = (value) => typeof value === 'string' && value.startsWith(PREFIX);
const toObjectId = (value) => {
  const hex = String(value).slice(PREFIX.length);
  return /^[a-f0-9]{24}$/i.test(hex) ? new mongoose.Types.ObjectId(hex) : null;
};

// Saves a Buffer; resolves with the marker string kept on the Application ("gridfs:<id>").
function saveResume(buffer, { originalName, userId } = {}) {
  return new Promise((resolve, reject) => {
    const up = bucket().openUploadStream('resume.pdf', { metadata: { contentType: 'application/pdf', originalName: String(originalName || '').slice(0, 200), userId: String(userId || '') } });
    up.on('error', reject);
    up.on('finish', () => resolve(`${PREFIX}${up.id}`));
    up.end(buffer);
  });
}

// Returns a readable stream, or null when the stored value is malformed or the file no longer exists.
async function openResume(value) {
  const id = toObjectId(value);
  if (!id) return null;
  const exists = await bucket().find({ _id: id }, { limit: 1 }).hasNext();
  return exists ? bucket().openDownloadStream(id) : null;
}

// Best effort: never throws (used for cleanup after a failed request).
async function deleteResume(value) {
  try {
    const id = toObjectId(value);
    if (id) await bucket().delete(id);
  } catch { /* already gone */ }
}

module.exports = { saveResume, openResume, deleteResume, isStoredInGridFs, PREFIX };
