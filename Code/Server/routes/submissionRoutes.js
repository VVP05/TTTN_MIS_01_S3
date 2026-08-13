const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Submission = require('../models/Submission');

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

// API POST: /api/submissions/upload
router.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { topic_id, student_id, milestone } = req.body;

        // 1. Kiểm tra file đính kèm
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn file để nộp!' });
        }

        if (!topic_id || !milestone) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin đề tài hoặc mốc báo cáo!' });
        }

        const milestoneNum = parseInt(milestone);

        // 2. Lưu hoặc Cập nhật (Upsert) vào MongoDB
        // Nếu đã nộp mốc này rồi thì đè file mới, chưa thì tạo mới
        const submission = await Submission.findOneAndUpdate(
            { topic_id: topic_id, milestone: milestoneNum },
            {
                topic_id: topic_id,
                student_id: student_id || '',
                milestone: milestoneNum,
                milestone_step: milestoneNum,
                file_path: req.file.path.replace(/\\/g, "/"), // Chuẩn hóa đường dẫn file Windows/Linux
                original_name: req.file.originalname,
                file_name: req.file.filename,
                file_size: req.file.size,
                submitted_at: new Date()
            },
            { new: true, upsert: true }
        );

        return res.status(200).json({
            success: true,
            message: `Nộp bài mốc ${milestoneNum} thành công!`,
            data: submission
        });

    } catch (error) {
        console.error("Lỗi khi lưu bài nộp:", error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ: ' + error.message });
    }
});

module.exports = router;