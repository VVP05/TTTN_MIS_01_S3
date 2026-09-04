const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const documentController = require('../controllers/documentController');

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

const upload = multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 } // Giới hạn 25MB, đồng bộ với giới hạn báo cáo tiến độ
});

// GET  /api/documents/lecturer/:lecturerCode  -> Danh sách tài liệu do 1 GVHD chia sẻ
router.get('/lecturer/:lecturerCode', documentController.getLecturerDocuments);

// GET /api/documents/admin/all -> Toàn bộ tài liệu cho Admin quản lý
router.get('/admin/all', documentController.getAllDocuments);

// GET  /api/documents/student  -> Danh sách tài liệu công khai cho Sinh viên xem
router.get('/student', documentController.getStudentDocuments);

// POST /api/documents/upload  -> Tải lên & chia sẻ tài liệu mới
router.post('/upload', upload.single('file'), documentController.uploadDocument);

// DELETE /api/documents/:id  -> Xóa tài liệu
router.delete('/:id', documentController.deleteDocument);

// PATCH /api/documents/download/:id  -> Tăng lượt tải xuống
router.patch('/download/:id', documentController.incrementDownload);

module.exports = router;
