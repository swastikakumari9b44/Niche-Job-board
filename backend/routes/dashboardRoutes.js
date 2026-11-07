const router = require('express').Router();
const ctrl = require('../controllers/dashboardController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.get('/candidate', protect, requireRole('candidate'), ctrl.candidate);
router.get('/employer', protect, requireRole('employer'), ctrl.employer);

module.exports = router;
