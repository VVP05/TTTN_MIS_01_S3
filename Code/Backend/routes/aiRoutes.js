const express = require('express');
const rateLimit = require('express-rate-limit');
const authMiddleware = require('../middlewares/authMiddleware');
const { chatWithStudentAdvisor } = require('../controllers/aiController');

const router = express.Router();
const requireStudentRole = (req, res, next) => {
    if (String(req.user?.role || '').toUpperCase() === 'STUDENT') return next();
    return res.status(403).json({ success: false, message: 'Trợ lý này chỉ dành cho sinh viên.' });
};
const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Bạn gửi câu hỏi quá nhanh. Vui lòng thử lại sau một phút.' }
});

router.post('/student-advisor/chat', authMiddleware, requireStudentRole, chatLimiter, chatWithStudentAdvisor);

module.exports = router;
