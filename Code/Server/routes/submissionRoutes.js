const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Submission = require('../models/Submission');
const authMiddleware = require('../middlewares/authMiddleware');
const { uploadMilestone } = require('../controllers/topicController');

const requireStudentRole = (req, res, next) => {
    if (String(req.user?.role || '').toUpperCase() === 'STUDENT') return next();
    return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới được nộp báo cáo.' });
};

// Tạo thư mục uploads nếu chưa có
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình lưu file đĩa
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// API GET: /api/submissions/topic/:topic_id
router.get('/topic/:topic_id', async (req, res) => {
    try {
        const submissions = await Submission.find({ topic_id: req.params.topic_id })
            .sort({ milestone: 1, submitted_at: -1 })
            .lean();

        return res.status(200).json({ success: true, data: submissions });
    } catch (error) {
        console.error("Lỗi khi lấy bài nộp theo đề tài:", error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ: ' + error.message });
    }
});

router.post('/upload', authMiddleware, requireStudentRole, upload.single('file'), uploadMilestone);

module.exports = router;