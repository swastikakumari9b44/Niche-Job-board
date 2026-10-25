const router = require('express').Router();
const { getMe, updateMe } = require('../controllers/userController');
const { protect } = require('../middleware/authMiddleware');

router.get('/me', protect, getMe);
router.patch('/me', protect, updateMe);

module.exports = router;
