const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middlewares/authMiddleware');

const requireAdminRole = (req, res, next) => {
    const userRole = req.user?.role ? String(req.user.role).toUpperCase() : '';
    const validAdminRoles = ['ADMIN', 'ADMINISTRATOR', 'QUAN_TRI', 'QUAN_TRI_VIEN'];
    if (validAdminRoles.includes(userRole)) {
        return next();
    }
    return res.status(403).json({
        success: false,
        message: 'Quyền truy cập bị từ chối. Chức năng này chỉ dành cho Quản trị viên!'
    });
};

// Cấu hình thư mục lưu file tải lên (uploads/)
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 } // Giới hạn 25MB
});

// Import ĐẦY ĐỦ các hàm từ topicController
const { 
    // Các hàm cho Sinh viên
    registerTopic, 
    getMyTopic, 
    updateTopic,
    cancelTopic,
    uploadMilestone,
    getLecturerPoolTopics, 
    registerPoolTopic,
    getAllTopicsForAdmin,
    assignLecturerToTopic,

    // Admin
    getAdminLecturerPoolTopics,
    updateLecturerPoolTopicStatus,

    // Các hàm cho Giảng viên
    getLecturerTopics, 
    createLecturerTopic,
    createLecturerPoolTopic,
    updateTopicStatus,
    getLecturerProgressMatrix 
} = require('../controllers/topicController');


// ==========================================
// ROUTES CHO SINH VIÊN
// ==========================================

// Kho đề tài mẫu mở cho Sinh viên xem & chọn
router.get('/admin/all', getAllTopicsForAdmin);
router.patch('/admin/assign-lecturer/:topic_id', assignLecturerToTopic);

router.get('/pool', getLecturerPoolTopics);
router.get('/available', getLecturerPoolTopics);

// ==========================================
// ROUTES CHO ADMIN
// ==========================================
router.get('/admin/pool', authMiddleware, requireAdminRole, getAdminLecturerPoolTopics);
router.put('/admin/pool/:pool_topic_id/status', authMiddleware, requireAdminRole, updateLecturerPoolTopicStatus);

// Sinh viên chọn đăng ký 1 đề tài từ Kho
router.post('/register-pool', registerPoolTopic);

// Đăng ký đề tài mới (SV tự đề xuất) hoặc Cập nhật/Gửi lại đề tài
router.post('/register', registerTopic);

// Lấy đề tài của sinh viên
router.get('/my-topic/:user_code', getMyTopic);
router.get('/student/:user_code', getMyTopic); 

// Sinh viên chỉnh sửa đề tài theo ID
router.put('/update/:topic_id', updateTopic);

// Sinh viên hủy đăng ký đề tài
router.delete('/cancel/:user_code', cancelTopic);
router.delete('/delete/:topic_id', cancelTopic);

// Route nộp báo cáo mốc
router.post('/:topic_id/upload-milestone/:mIndex', upload.single('file'), uploadMilestone);
router.post('/:topic_id/upload-milestone', upload.single('file'), uploadMilestone);


// ==========================================
// ROUTES CHO GIẢNG VIÊN
// ==========================================

// Giảng viên xem danh sách đề tài
router.get('/lecturer/:lecturer_code', getLecturerTopics);

// Giảng viên lấy Ma Trận Tiến Độ 5 mốc
router.get('/lecturer-matrix/:lecturerCode', getLecturerProgressMatrix);

// Giảng viên thêm đề tài vào Kho đề tài của tôi
router.post('/lecturer/create', createLecturerTopic);

// Giảng viên thêm / lấy Kho đề tài gợi ý
router.post('/lecturer-pool', createLecturerPoolTopic);
router.get('/lecturer-pool', getLecturerPoolTopics);

// Giảng viên Phê duyệt / Yêu cầu sửa / Từ chối
router.put('/update-status/:topic_id', updateTopicStatus);

module.exports = router;