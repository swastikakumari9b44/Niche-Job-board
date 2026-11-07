const router = require('express').Router();
const ctrl = require('../controllers/savedJobController');
const { protect, requireRole } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

router.use(protect, requireRole('candidate'));
router.get('/', ctrl.list);
router.get('/ids', ctrl.ids);
router.put('/:jobId', validateObjectId('jobId'), ctrl.save);
router.delete('/:jobId', validateObjectId('jobId'), ctrl.remove);

module.exports = router;
