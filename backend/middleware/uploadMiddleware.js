// Foundation for Day 3 resume uploads. Not wired to any route yet.
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const AppError = require('../utils/AppError');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  // Random name; the client-supplied filename is never used.
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
});

const fileFilter = (_req, file, cb) => {
  const isPdf = file.mimetype === 'application/pdf' && path.extname(file.originalname).toLowerCase() === '.pdf';
  cb(isPdf ? null : new AppError('Only PDF files are allowed', 400), isPdf);
};

const uploadResume = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE, files: 1 } });

module.exports = { uploadResume, UPLOAD_DIR, MAX_SIZE };
