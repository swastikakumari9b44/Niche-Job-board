// Mounted at /api/analytics. Employer and candidate analytics (admin analytics lives under /api/admin).
const router = require('express').Router();
const ctrl = require('../controllers/analyticsController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

router.get('/employer', protect, requireRole('employer'), ctrl.employerOverview);
router.get('/employer/jobs/:id', protect, requireRole('employer'), validateObjectId('id'), ctrl.employerJob);
router.get('/employer/export/applications.csv', protect, requireRole('employer'), ctrl.employerApplicationsCsv);
router.get('/employer/export/jobs.csv', protect, requireRole('employer'), ctrl.employerJobsCsv);
router.get('/candidate', protect, requireRole('candidate'), ctrl.candidateInsights);

module.exports = router;
