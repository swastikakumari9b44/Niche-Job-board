const router = require('express').Router();
const { getMe, updateMe } = require('../controllers/userController');
const { protect, requireActive } = require('../middleware/authMiddleware');

router.get('/me', protect, requireActive, getMe);
router.patch('/me', protect, requireActive, updateMe);

module.exports = router;
