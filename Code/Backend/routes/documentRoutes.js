const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const documentController = require('../controllers/documentController');
const authMiddleware = require('../middlewares/authMiddleware');

const requireRole = (...roles) => (req, res, next) => {
    const role = String(req.user?.role || '').toUpperCase();
    if (roles.includes(role)) return next();
    return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập tài liệu này.' });
};

// Tạo thư mục uploads/documents nếu chưa có
const uploadDir = path.join(__dirname, '../uploads/documents');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Cấu hình lưu file tài liệu lên đĩa
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.7z', '.txt'];
const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return cb(new Error('Định dạng tệp không được hỗ trợ! Chỉ chấp nhận: PDF, Word (.doc, .docx), Excel (.xls, .xlsx), PowerPoint (.ppt, .pptx), File nén (.zip, .rar, .7z) và Text (.txt).'), false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    defParamCharset: 'utf8',
    fileFilter,
    limits: { fileSize: 25 * 1024 * 1024 } // Giới hạn 25MB
});

const handleDocumentUploadError = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, message: 'Dung lượng tệp vượt quá giới hạn (tối đa 25MB).' });
            }
            return res.status(400).json({ success: false, message: err.message || 'Lỗi khi tải tệp lên.' });
        }
        next();
    });
};

// GET  /api/documents/lecturer/:lecturerCode  -> Danh sách tài liệu do 1 GVHD chia sẻ
router.get('/lecturer/:lecturerCode', authMiddleware, requireRole('LECTURER'), documentController.getLecturerDocuments);

// GET /api/documents/admin/all -> Tài liệu do Admin chia sẻ
router.get('/admin/all', authMiddleware, requireRole('ADMIN'), documentController.getAllDocuments);

// GET  /api/documents/student  -> Danh sách tài liệu công khai cho Sinh viên xem
router.get('/student', authMiddleware, requireRole('STUDENT'), documentController.getStudentDocuments);

// POST /api/documents/upload  -> Tải lên & chia sẻ tài liệu mới
router.post('/upload', authMiddleware, requireRole('ADMIN', 'LECTURER'), handleDocumentUploadError, documentController.uploadDocument);

// DELETE /api/documents/:id  -> Xóa tài liệu
router.delete('/:id', authMiddleware, requireRole('ADMIN', 'LECTURER'), documentController.deleteDocument);

// PATCH /api/documents/download/:id  -> Tăng lượt tải xuống
router.patch('/download/:id', authMiddleware, requireRole('ADMIN', 'LECTURER', 'STUDENT'), documentController.incrementDownload);

module.exports = router;
