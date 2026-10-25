// Mounted at /api/applications (POST /api/apply is kept as a backward-compatible alias in app.js)
const router = require('express').Router();
const ctrl = require('../controllers/applicationController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

router.post('/', protect, requireRole('candidate'), ctrl.applyToJob);
router.get('/my', protect, requireRole('candidate'), ctrl.getMyApplications);
router.get('/job/:jobId', protect, requireRole('employer'), validateObjectId('jobId'), ctrl.getJobApplications);
router.patch('/:id/status', protect, requireRole('employer'), validateObjectId('id'), ctrl.updateApplicationStatus);

module.exports = router;
