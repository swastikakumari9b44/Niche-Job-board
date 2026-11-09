const router = require('express').Router();
const { register, login, me, logout, logoutAll } = require('../controllers/authController');
const { forgotPassword, resetPassword } = require('../controllers/passwordController');
const { protect, requireActive } = require('../middleware/authMiddleware');
const { createAuthLimiter, createLoginAccountLimiter } = require('../middleware/rateLimiters');

const limiter = createAuthLimiter();
const accountLimiter = createLoginAccountLimiter();
router.post('/register', limiter, register);
router.post('/login', limiter, accountLimiter, login);
router.post('/forgot-password', limiter, forgotPassword);
router.post('/reset-password', limiter, resetPassword);
router.get('/me', protect, requireActive, me);
router.post('/logout', logout);
router.post('/logout-all', protect, requireActive, logoutAll);

module.exports = router;
