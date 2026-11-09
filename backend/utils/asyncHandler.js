// Wraps an async Express handler so a rejected promise reaches the error middleware (one shared copy).
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
