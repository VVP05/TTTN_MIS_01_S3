const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const authMiddleware = require('../middlewares/authMiddleware'); //[cite: 6]

/**
 * Middleware phân quyền chuyên dụng cho Admin[cite: 6]
 */
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

/**
 * Middleware phân quyền chuyên dụng cho Giảng viên[cite: 6]
 */
const requireLecturerRole = (req, res, next) => {
    const userRole = req.user?.role ? String(req.user.role).toUpperCase() : '';
    const validLecturerRoles = ['LECTURER', 'GIANG_VIEN', 'GIANGVIEN', 'TEACHER', 'INSTRUCTOR'];

    if (validLecturerRoles.includes(userRole)) {
        return next();
    }

    return res.status(403).json({
        success: false,
        message: 'Quyền truy cập bị từ chối. Chức năng này chỉ dành cho Giảng viên!'
    });
};

// ==========================================
// 1. ROUTE DASHBOARD ADMIN[cite: 6]
// ==========================================
// Đường dẫn: GET /api/dashboard/admin
router.get('/admin', authMiddleware, requireAdminRole, dashboardController.getAdminDashboardStats);

// ==========================================
// 2. ROUTE DASHBOARD GIẢNG VIÊN[cite: 6]
// ==========================================
// Đường dẫn: GET /api/dashboard/lecturer
router.get('/lecturer', authMiddleware, requireLecturerRole, dashboardController.getLecturerDashboard);

// Đường dẫn phụ: GET /api/dashboard (Hỗ trợ truy vấn mặc định cho Giảng viên)
router.get('/', authMiddleware, requireLecturerRole, dashboardController.getLecturerDashboard);

module.exports = router;