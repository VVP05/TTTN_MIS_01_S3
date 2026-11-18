const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/authMiddleware');

const requireRole = (...roles) => (req, res, next) => {
    if (roles.includes(String(req.user?.role || '').toUpperCase())) return next();
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
};

const requireAdminRole = requireRole('ADMIN', 'ADMINISTRATOR', 'QUAN_TRI', 'QUAN_TRI_VIEN');

// Admin chỉ quản lý thông báo hệ thống
router.get('/admin/all', authMiddleware, requireAdminRole, notificationController.getAllNotifications);

// Lấy danh sách thông báo cho Giảng viên
router.get('/lecturer/:lecturerCode', authMiddleware, requireRole('LECTURER'), notificationController.getLecturerNotifications);

// Lấy danh sách thông báo cho sinh viên
router.get('/:studentCode', authMiddleware, requireRole('STUDENT'), notificationController.getNotifications);

// Tạo thông báo mới
router.post('/', authMiddleware, requireAdminRole, notificationController.createNotification);
router.post('/lecturer', authMiddleware, requireRole('LECTURER'), notificationController.createLecturerNotification);

// Cập nhật thông báo
router.put('/:id', authMiddleware, requireAdminRole, notificationController.updateNotification);

// Xóa thông báo
router.delete('/:id', authMiddleware, requireAdminRole, notificationController.deleteNotification);

// Đánh dấu 1 thông báo đã đọc
router.patch('/read/:id', authMiddleware, requireRole('STUDENT', 'LECTURER'), notificationController.markAsRead);

// Đánh dấu tất cả đã đọc
router.patch('/read-all/:studentCode', authMiddleware, requireRole('STUDENT', 'LECTURER'), notificationController.markAllAsRead);

module.exports = router;