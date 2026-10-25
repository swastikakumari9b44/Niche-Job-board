const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AppError = require('../utils/AppError');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const SAFE_NAME = /^[a-f0-9-]{36}\.pdf$/;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`), // client filename is never used on disk
});

const fileFilter = (_req, file, cb) => {
  const ok = file.mimetype === 'application/pdf' && path.extname(file.originalname).toLowerCase() === '.pdf';
  cb(ok ? null : new AppError('Only PDF files are allowed', 400), ok);
};

const uploadResume = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE, files: 1, fields: 10 } }).single('resume');

// The declared MIME type is client-controlled, so also check the real file signature ("%PDF-").
async function hasPdfSignature(filePath) {
  const fh = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(5);
    await fh.read(buf, 0, 5, 0);
    return buf.toString('latin1') === '%PDF-';
  } finally {
    await fh.close();
  }
}

const removeFile = (filePath) => (filePath ? fs.promises.unlink(filePath).catch(() => {}) : Promise.resolve());
const pathFor = (storedName) => (SAFE_NAME.test(storedName) ? path.join(UPLOAD_DIR, storedName) : null);

module.exports = { uploadResume, hasPdfSignature, removeFile, pathFor, UPLOAD_DIR, MAX_SIZE };
