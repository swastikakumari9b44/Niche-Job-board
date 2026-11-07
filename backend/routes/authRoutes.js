const router = require('express').Router();
const { register, login, me, logout } = require('../controllers/authController');
const { forgotPassword, resetPassword } = require('../controllers/passwordController');
const { protect, requireActive } = require('../middleware/authMiddleware');
const { createAuthLimiter } = require('../middleware/rateLimiters');

const limiter = createAuthLimiter();
router.post('/register', limiter, register);
router.post('/login', limiter, login);
router.post('/forgot-password', limiter, forgotPassword);
router.post('/reset-password', limiter, resetPassword);
router.get('/me', protect, requireActive, me);
router.post('/logout', logout);

module.exports = router;
