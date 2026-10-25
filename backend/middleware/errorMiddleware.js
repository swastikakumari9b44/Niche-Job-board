const { ZodError } = require('zod');
const multer = require('multer');
const AppError = require('../utils/AppError');

const notFound = (req, _res, next) => next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404));

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (err instanceof ZodError) {
    status = 400;
    message = 'Validation failed';
    details = err.issues.map((i) => ({ field: i.path.join('.') || undefined, message: i.message }));
  } else if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
  } else if (err instanceof multer.MulterError) {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : 'Invalid file upload';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid identifier';
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.code === 11000) {
    status = 409;
    message = 'Duplicate record';
  } else if (err.statusCode && err.statusCode < 500) {
    status = err.statusCode;
    message = err.expose ? err.message : message;
  }

  if (status >= 500) console.error(err); // log server-side only, never send internals

  res.status(status).json({ success: false, message, ...(details && { errors: details }) });
}

module.exports = { notFound, errorHandler };
