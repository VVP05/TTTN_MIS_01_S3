const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const chatController = require('../controllers/chatController');

router.get('/unread', verifyToken, chatController.getUnreadSummary);
router.get('/topics/:topicId', verifyToken, chatController.getMessages);
router.post('/topics/:topicId', verifyToken, chatController.sendMessage);

module.exports = router;
