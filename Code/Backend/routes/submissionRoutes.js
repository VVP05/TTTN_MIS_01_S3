const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middlewares/authMiddleware');
const { uploadMilestone } = require('../controllers/topicController');
const submissionController = require('../controllers/submissionController');

const requireSubmissionRole = (...roles) => (req, res, next) => {
    if (roles.includes(String(req.user?.role || '').toUpperCase())) return next();
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
};

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
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.zip', '.rar', '.7z', '.ppt', '.pptx'];
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed',
    'application/vnd.rar',
    'application/x-7z-compressed',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/octet-stream'
];

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return cb(new Error('Định dạng tệp không được hỗ trợ! Chỉ chấp nhận: PDF, Word (.doc, .docx), Nén (.zip, .rar, .7z), PowerPoint (.ppt, .pptx).'), false);
    }
    cb(null, true);
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // Giới hạn 25MB
    fileFilter: fileFilter,
    defParamCharset: 'utf8'
});

const handleUploadError = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    return res.status(400).json({ success: false, message: 'Dung lượng tệp vượt quá giới hạn cho phép (tối đa 25MB).' });
                }
                return res.status(400).json({ success: false, message: `Lỗi tải tệp: ${err.message}` });
            }
            return res.status(400).json({ success: false, message: err.message });
        }
        next();
    });
};

router.get('/topic/:topic_id', authMiddleware, requireSubmissionRole('STUDENT', 'LECTURER'), submissionController.listTopicSubmissions);
router.get('/file/:filename', authMiddleware, requireSubmissionRole('STUDENT', 'LECTURER'), submissionController.downloadTopicSubmissionFile);
router.patch('/topic/:topic_id/:submissionId/review', authMiddleware, requireSubmissionRole('LECTURER'), submissionController.reviewSubmission);
router.post('/upload', authMiddleware, requireStudentRole, handleUploadError, uploadMilestone);

module.exports = router;