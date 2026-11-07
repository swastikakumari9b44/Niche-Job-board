const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { protect, requireActive } = require('../middleware/authMiddleware');
const validateObjectId = require('../middleware/validateObjectId');

router.use(protect, requireActive); // any signed-in, non-suspended user (candidate, employer or admin)
router.get('/', ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:id/read', validateObjectId('id'), ctrl.markRead);

module.exports = router;
