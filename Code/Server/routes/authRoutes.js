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
    createLecturer,
    updateLecturer,
    changePassword,
    forgotPassword
} = require('../controllers/authController');

router.post('/login', login);
router.put('/change-password', changePassword);
router.post('/forgot-password', forgotPassword);
router.get('/admins', getAdmins);
router.get('/lecturers', getLecturers);
router.post('/lecturers', createLecturer);
router.put('/lecturers/:user_code', updateLecturer);
router.get('/students', getStudents);
router.post('/students', createStudent);
router.put('/students/:user_code', updateStudent);
router.get('/users/:user_code', getUserByCode); // Route mới lấy thông tin sinh viên theo MSSV

module.exports = router;