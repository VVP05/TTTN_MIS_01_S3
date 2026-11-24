const express = require('express');
const router = express.Router();
const {
    login,
    getSession,
    logout,
    getAdmins,
    getLecturers,
    getStudents,
    getUserByCode,
    createStudent,
    updateStudent,
    deleteStudent,
    updateStudentProfile,
    createLecturer,
    updateLecturer,
    updateLecturerProfile,
    updateLecturerQuotas,
    deleteLecturer,
    changePassword,
    forgotPassword,
    resetPassword
} = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');
const {
    loginIpRateLimit,
    loginAccountRateLimit,
    passwordResetRequestRateLimit,
    passwordResetSubmitRateLimit
} = require('../middlewares/authRateLimit');
const multer = require('multer');
const userImportController = require('../controllers/userImportController');
const userExportController = require('../controllers/userExportController');

const excelUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
}).single('file');

const handleExcelUpload = (req, res, next) => {
    excelUpload(req, res, error => {
        if (error) {
            const message = error.code === 'LIMIT_FILE_SIZE'
                ? 'File Excel không được vượt quá 5 MB.'
                : 'Không thể nhận file Excel.';
            return res.status(400).json({ success: false, message });
        }
        return next();
    });
};

const requireRole = (...roles) => (req, res, next) => {
    const role = String(req.user?.role || '').toUpperCase();
    if (roles.includes(role)) return next();
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
};

const requireSelfCode = (req, res, next) => {
    const userCode = String(req.user?.user_code || '').trim().toUpperCase();
    const requestedCode = String(req.params.user_code || '').trim().toUpperCase();
    if (userCode && userCode === requestedCode) return next();
    return res.status(403).json({ success: false, message: 'Bạn chỉ có thể cập nhật hồ sơ của tài khoản mình.' });
};

router.post('/login', loginIpRateLimit, loginAccountRateLimit, login);
router.get('/session', authMiddleware, getSession);
router.post('/logout', (req, res, next) => {
    if (req.get('X-CSRF-Protection') !== '1') {
        return res.status(403).json({ success: false, message: 'Yêu cầu không hợp lệ.' });
    }
    return next();
}, logout);
router.put('/change-password', authMiddleware, changePassword);
router.post('/forgot-password', passwordResetRequestRateLimit, forgotPassword);
router.post('/reset-password', passwordResetSubmitRateLimit, resetPassword);
router.get('/admins', authMiddleware, requireRole('ADMIN'), getAdmins);
router.get('/lecturers/export', authMiddleware, requireRole('ADMIN'), userExportController.exportLecturers);
router.get('/lecturers', authMiddleware, requireRole('ADMIN', 'STUDENT'), getLecturers);
router.post('/lecturers', authMiddleware, requireRole('ADMIN'), createLecturer);
router.put('/lecturers/bulk-quota', authMiddleware, requireRole('ADMIN'), updateLecturerQuotas);
router.put('/lecturers/:user_code', authMiddleware, requireRole('ADMIN'), updateLecturer);
router.put('/lecturers/:user_code/profile', authMiddleware, requireRole('LECTURER'), requireSelfCode, updateLecturerProfile);
router.delete('/lecturers/:user_code', authMiddleware, requireRole('ADMIN'), deleteLecturer);
router.get('/students/export', authMiddleware, requireRole('ADMIN'), userExportController.exportStudents);
router.get('/students', authMiddleware, requireRole('ADMIN'), getStudents);
router.post('/students', authMiddleware, requireRole('ADMIN'), createStudent);
router.put('/students/:user_code', authMiddleware, requireRole('ADMIN'), updateStudent);
router.delete('/students/:user_code', authMiddleware, requireRole('ADMIN'), deleteStudent);
router.put('/students/:user_code/profile', authMiddleware, requireRole('STUDENT'), requireSelfCode, updateStudentProfile);
router.get('/users/:user_code', authMiddleware, getUserByCode);
router.get('/import/:role/template', authMiddleware, requireRole('ADMIN'), userImportController.getRole, userImportController.downloadTemplate);
router.post('/import/:role/preview', authMiddleware, requireRole('ADMIN'), userImportController.getRole, handleExcelUpload, userImportController.validateImportFile);
router.post('/import/:role', authMiddleware, requireRole('ADMIN'), userImportController.getRole, handleExcelUpload, userImportController.importUsers);

module.exports = router;