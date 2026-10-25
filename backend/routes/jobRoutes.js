const router = require('express').Router();
const ctrl = require('../controllers/jobController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

router.get('/', ctrl.getJobs);
router.get('/:id', validateObjectId('id'), ctrl.getJobById);
router.post('/', protect, requireRole('employer'), ctrl.createJob);
router.patch('/:id', protect, requireRole('employer'), validateObjectId('id'), ctrl.updateJob);
router.delete('/:id', protect, requireRole('employer'), validateObjectId('id'), ctrl.closeJob);

module.exports = router;