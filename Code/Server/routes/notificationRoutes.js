const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Lấy danh sách tất cả thông báo (Admin quản lý)
router.get('/admin/all', notificationController.getAllNotifications);

// Lấy danh sách thông báo cho Giảng viên
router.get('/lecturer/:lecturerCode', notificationController.getLecturerNotifications);

// Lấy danh sách thông báo cho sinh viên
router.get('/:studentCode', notificationController.getNotifications);

// Tạo thông báo mới
router.post('/', notificationController.createNotification);

// Cập nhật thông báo
router.put('/:id', notificationController.updateNotification);

// Xóa thông báo
router.delete('/:id', notificationController.deleteNotification);

// Đánh dấu 1 thông báo đã đọc
router.patch('/read/:id', notificationController.markAsRead);

// Đánh dấu tất cả đã đọc
router.patch('/read-all/:studentCode', notificationController.markAllAsRead);

module.exports = router;