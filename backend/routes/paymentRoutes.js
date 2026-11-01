// Mounted at /api/payments. (The webhook is mounted separately in app.js because it needs the raw body.)
const router = require('express').Router();
const ctrl = require('../controllers/paymentController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');
const { createPaymentLimiter } = require('../middleware/rateLimiters');

const limiter = createPaymentLimiter();
router.use(protect, requireRole('employer')); // only logged-in, active employers

router.get('/config', ctrl.getConfig);
router.get('/my', ctrl.myPayments);
router.post('/create-order', limiter, ctrl.createOrder);
router.post('/verify', limiter, ctrl.verifyPayment);
router.get('/:id', validateObjectId('id'), ctrl.getPayment);

module.exports = router;
