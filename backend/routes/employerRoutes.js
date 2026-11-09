const router = require('express').Router();
const { getEmployerJobs } = require('../controllers/jobController');
const { getEmployerApplications } = require('../controllers/applicationController');
const { protect, requireRole } = require('../middleware/authMiddleware');

router.get('/jobs', protect, requireRole('employer'), getEmployerJobs);
router.get('/applications', protect, requireRole('employer'), getEmployerApplications);

module.exports = router;
