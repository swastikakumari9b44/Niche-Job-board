const router = require('express').Router();
const { getEmployerJobs } = require('../controllers/jobController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.get('/jobs', protect, requireRole('employer'), getEmployerJobs);

module.exports = router;
