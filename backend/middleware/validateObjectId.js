const AppError = require('../utils/AppError');
const OBJECT_ID = /^[a-f\d]{24}$/i;

// Usage: validateObjectId('id') or validateObjectId('jobId')
module.exports = (...params) => (req, _res, next) => {
  for (const p of params) {
    if (!OBJECT_ID.test(req.params[p] || '')) return next(new AppError(`Invalid ${p}`, 400));
  }
  next();
};
