// Every route below requires a signed-in, non-suspended account whose STORED role is "admin".
const router = require('express').Router();
const ctrl = require('../controllers/adminController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

router.use(protect, requireRole('admin'));
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.get('/stats', ctrl.getStats);
router.get('/users', ctrl.listUsers);
router.get('/users/:id', validateObjectId('id'), ctrl.getUser);
router.patch('/users/:id/status', validateObjectId('id'), ctrl.setUserStatus);
router.get('/jobs', ctrl.listJobs);
router.patch('/jobs/:id/moderation', validateObjectId('id'), ctrl.moderateJob);
router.get('/analytics/applications', ctrl.applicationAnalytics);
router.get('/audit-logs', ctrl.listAuditLogs);

module.exports = router;
