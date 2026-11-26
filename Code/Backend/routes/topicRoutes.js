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

const requireStudentRole = (req, res, next) => {
    if (String(req.user?.role || '').toUpperCase() === 'STUDENT') return next();
    return res.status(403).json({ success: false, message: 'Chức năng này chỉ dành cho sinh viên.' });
};

const requireStudentOwnCode = (req, res, next) => {
    const userCode = String(req.user?.user_code || '').trim().toUpperCase();
    const requestedCode = String(req.params.user_code || req.params.leader_code || '').trim().toUpperCase();
    if (String(req.user?.role || '').toUpperCase() === 'STUDENT' &&
        userCode && userCode === requestedCode) return next();
    return res.status(403).json({ success: false, message: 'Bạn chỉ có thể thao tác với nhóm của mình.' });
};

const requireLecturerRole = (req, res, next) => {
    if (String(req.user?.role || '').toUpperCase() === 'LECTURER') return next();
    return res.status(403).json({ success: false, message: 'Chức năng này chỉ dành cho giảng viên.' });
};

const requireLecturerOwnCode = (req, res, next) => {
    const userRole = String(req.user?.role || '').toUpperCase();
    const userCode = String(req.user?.user_code || '').toUpperCase();
    const requestedCode = String(req.params.lecturer_code || req.params.lecturerCode || '').toUpperCase();

    if (userRole !== 'LECTURER' || userCode !== requestedCode) {
        return res.status(403).json({ success: false, message: 'Bạn không có quyền xem dữ liệu giảng viên này.' });
    }
    return next();
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

const ALLOWED_MILESTONE_EXTENSIONS = ['.pdf', '.doc', '.docx', '.zip', '.rar', '.7z', '.ppt', '.pptx'];

const milestoneFileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_MILESTONE_EXTENSIONS.includes(ext)) {
        return cb(new Error('Định dạng tệp không được hỗ trợ! Chỉ chấp nhận: PDF, Word (.doc, .docx), Nén (.zip, .rar, .7z), PowerPoint (.ppt, .pptx).'), false);
    }
    cb(null, true);
};

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 }, // Giới hạn 25MB
    fileFilter: milestoneFileFilter,
    defParamCharset: 'utf8'
});

const handleMilestoneUpload = (req, res, next) => {
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

// Import ĐẦY ĐỦ các hàm từ topicController
const { 
    // Các hàm cho Sinh viên
    registerTopic, 
    getGroupJoinRequests,
    updateGroupJoinRequest,
    getMyTopic, 
    publishGroupRecruitment,
    closeGroupRecruitment,
    updateTopic,
    cancelTopic,
    uploadMilestone,
    getLecturerPoolTopics, 
    getStudentTopicMarketplace,
    registerPoolTopic,
    getAllTopicsForAdmin,
    assignLecturerToTopic,

    // Các hàm cho Giảng viên
    getLecturerPendingReviewStatus,
    getLecturerTopics, 
    createLecturerTopic,
    createLecturerPoolTopic,
    updateLecturerPoolTopic,
    updateTopicStatus,
    getLecturerProgressMatrix,
    deleteMilestoneSubmission,
    submitMilestoneDraft,
    withdrawMilestoneSubmission
} = require('../controllers/topicController');
const lecturerTopicImportController = require('../controllers/lecturerTopicImportController');
const lecturerTopicUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: lecturerTopicImportController.MAX_LECTURER_TOPIC_IMPORT_FILE_SIZE },
    fileFilter: (req, file, callback) => {
        if (path.extname(file.originalname || '').toLowerCase() !== '.xlsx') {
            return callback(new Error('Chỉ hỗ trợ file Excel .xlsx.'));
        }
        return callback(null, true);
    }
}).single('file');
const handleLecturerTopicUpload = (req, res, next) => {
    lecturerTopicUpload(req, res, error => {
        if (error) {
            const message = error.code === 'LIMIT_FILE_SIZE'
                ? 'File Excel không được vượt quá 2 MB.'
                : error.message || 'Không thể nhận file Excel.';
            return res.status(400).json({ success: false, message });
        }
        return next();
    });
};


// ==========================================
// ROUTES CHO SINH VIÊN
// ==========================================

// Kho đề tài mẫu mở cho Sinh viên xem & chọn
router.get('/admin/all', authMiddleware, requireAdminRole, getAllTopicsForAdmin);
router.patch('/admin/assign-lecturer/:topic_id', authMiddleware, requireAdminRole, assignLecturerToTopic);

router.get('/pool', authMiddleware, requireStudentRole, getLecturerPoolTopics);
router.get('/available', authMiddleware, requireStudentRole, getLecturerPoolTopics);
router.get('/marketplace', authMiddleware, requireStudentRole, getStudentTopicMarketplace);
router.post('/group-recruitment', authMiddleware, requireStudentRole, publishGroupRecruitment);
router.delete('/group-recruitment/:leader_code', authMiddleware, requireStudentOwnCode, closeGroupRecruitment);

// Sinh viên chọn đăng ký 1 đề tài từ Kho
router.post('/register-pool', authMiddleware, requireStudentRole, registerPoolTopic);

// Đăng ký đề tài mới (SV tự đề xuất) hoặc Cập nhật/Gửi lại đề tài
router.post('/register', authMiddleware, requireStudentRole, registerTopic);
router.get('/join-requests/:leader_code', authMiddleware, requireStudentOwnCode, getGroupJoinRequests);
router.patch('/join-requests/:leader_code/:request_id', authMiddleware, requireStudentOwnCode, updateGroupJoinRequest);

// Lấy đề tài của sinh viên
router.get('/my-topic/:user_code', authMiddleware, requireStudentOwnCode, getMyTopic);
router.get('/student/:user_code', authMiddleware, requireStudentOwnCode, getMyTopic);

// Sinh viên chỉnh sửa đề tài theo ID
router.put('/update/:topic_id', authMiddleware, requireStudentRole, updateTopic);

// Sinh viên hủy đăng ký đề tài
router.delete('/cancel/:user_code', authMiddleware, requireStudentOwnCode, cancelTopic);
router.delete('/delete/:topic_id', authMiddleware, requireStudentRole, cancelTopic);

// Route nộp báo cáo mốc
router.delete('/:topic_id/milestone/:mIndex/submission', authMiddleware, requireStudentRole, deleteMilestoneSubmission);
router.post('/:topic_id/milestone/:mIndex/submit', authMiddleware, requireStudentRole, submitMilestoneDraft);
router.post('/:topic_id/milestone/:mIndex/withdraw', authMiddleware, requireStudentRole, withdrawMilestoneSubmission);
router.post('/:topic_id/upload-milestone/:mIndex', authMiddleware, requireStudentRole, handleMilestoneUpload, uploadMilestone);
router.post('/:topic_id/upload-milestone', authMiddleware, requireStudentRole, handleMilestoneUpload, uploadMilestone);


// ==========================================
// ROUTES CHO GIẢNG VIÊN
// ==========================================

// Giảng viên xem danh sách đề tài
router.get('/lecturer/:lecturer_code/pending-review', authMiddleware, requireLecturerOwnCode, getLecturerPendingReviewStatus);
router.get('/lecturer/:lecturer_code', authMiddleware, requireLecturerOwnCode, getLecturerTopics);

// Giảng viên lấy Ma Trận Tiến Độ 5 mốc
router.get('/lecturer-matrix/:lecturerCode', authMiddleware, requireLecturerOwnCode, getLecturerProgressMatrix);

// Giảng viên thêm đề tài vào Kho đề tài của tôi
router.post('/lecturer/create', authMiddleware, requireLecturerRole, createLecturerTopic);

// Giảng viên thêm / lấy Kho đề tài gợi ý
router.post('/lecturer-pool', authMiddleware, requireLecturerRole, createLecturerPoolTopic);
router.get('/lecturer-pool/import/template', authMiddleware, requireLecturerRole, lecturerTopicImportController.downloadLecturerTopicTemplate);
router.post('/lecturer-pool/import/preview', authMiddleware, requireLecturerRole, handleLecturerTopicUpload, lecturerTopicImportController.previewLecturerTopicImport);
router.post('/lecturer-pool/import', authMiddleware, requireLecturerRole, handleLecturerTopicUpload, lecturerTopicImportController.importLecturerTopics);
router.get('/lecturer-pool', authMiddleware, (req, res, next) => {
    const role = String(req.user?.role || '').toUpperCase();
    if (['STUDENT', 'LECTURER'].includes(role)) return next();
    return res.status(403).json({ success: false, message: 'Bạn không có quyền xem kho đề tài.' });
}, getLecturerPoolTopics);
router.put('/lecturer-pool/:lecturer_code/:pool_topic_id', authMiddleware, requireLecturerOwnCode, updateLecturerPoolTopic);

// Giảng viên Phê duyệt / Yêu cầu sửa / Từ chối
router.put('/update-status/:topic_id', authMiddleware, requireLecturerRole, updateTopicStatus);

module.exports = router;