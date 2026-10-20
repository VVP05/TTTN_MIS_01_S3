const express = require('express');
const router = express.Router();
const {
    login,
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
    deleteLecturer,
    changePassword,
    forgotPassword
} = require('../controllers/authController');
const authMiddleware = require('../middlewares/authMiddleware');

const requireRole = (...roles) => (req, res, next) => {
    const role = String(req.user?.role || '').toUpperCase();
    if (roles.includes(role)) return next();
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
};

router.post('/login', login);
router.put('/change-password', changePassword);
router.post('/forgot-password', forgotPassword);
router.get('/admins', getAdmins);
router.get('/lecturers', getLecturers);
router.post('/lecturers', createLecturer);
router.put('/lecturers/:user_code', updateLecturer);
router.delete('/lecturers/:user_code', authMiddleware, requireRole('ADMIN'), deleteLecturer);
router.get('/students', getStudents);
router.post('/students', createStudent);
router.put('/students/:user_code', updateStudent);
router.delete('/students/:user_code', authMiddleware, requireRole('ADMIN'), deleteStudent);
router.put('/students/:user_code/profile', updateStudentProfile);
router.get('/users/:user_code', getUserByCode); // Route mới lấy thông tin sinh viên theo MSSV

module.exports = router;