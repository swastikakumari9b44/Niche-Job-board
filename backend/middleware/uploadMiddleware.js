const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AppError = require('../utils/AppError');

// Legacy folder: resumes uploaded before GridFS existed may still be here on a machine with a persistent disk.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const SAFE_NAME = /^[a-f0-9-]{36}\.pdf$/;

// Files are held in memory (max 5 MB, one file per request, upload rate-limited per user) and then written to GridFS,
// so nothing is ever written to the server's disk.
const fileFilter = (_req, file, cb) => {
  const ok = file.mimetype === 'application/pdf' && path.extname(file.originalname).toLowerCase() === '.pdf';
  cb(ok ? null : new AppError('Only PDF files are allowed', 400), ok);
};

const uploadResume = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: MAX_SIZE, files: 1, fields: 10, parts: 12 } }).single('resume');

// The declared MIME type is client-controlled, so also check the real file signature ("%PDF-").
const hasPdfSignature = (buffer) => Buffer.isBuffer(buffer) && buffer.length > 8 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';

// Legacy helpers (disk files from older deployments).
const removeFile = (filePath) => (filePath ? fs.promises.unlink(filePath).catch(() => {}) : Promise.resolve());
const pathFor = (storedName) => (SAFE_NAME.test(storedName) ? path.join(UPLOAD_DIR, storedName) : null);

module.exports = { uploadResume, hasPdfSignature, removeFile, pathFor, UPLOAD_DIR, MAX_SIZE };
