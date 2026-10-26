class AppError extends Error {
  constructor(message, statusCode = 500, errorCode) {
    super(message);
    this.errorCode = errorCode; // optional machine-readable code, e.g. ACCOUNT_SUSPENDED
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}
module.exports = AppError;
