const express = require("express");
const router = express.Router();
const scheduleController = require("../controllers/scheduleController");
const verifyToken = require("../middlewares/authMiddleware");

// ==========================================
// 1. CÁC ROUTE DÀNH CHO SINH VIÊN (STUDENT)
// ==========================================

// Lấy toàn bộ dữ liệu lịch làm việc
router.get("/my-schedule/:studentCode", verifyToken, scheduleController.getScheduleData);

// Đăng ký lịch hẹn GVHD
router.post("/meetings/create", verifyToken, scheduleController.createMeeting);

// Quản lý To-do List
router.post("/todos/add", verifyToken, scheduleController.addTodo);
router.patch("/todos/toggle/:todoId", verifyToken, scheduleController.toggleTodo);

// ==========================================
// 2. CÁC ROUTE DÀNH CHO GIẢNG VIÊN (LECTURER)
// ==========================================

// Lấy danh sách lịch họp của giảng viên (hỗ trợ cả dạng params và query string)
router.get("/lecturer/meetings/:lecturerCode", verifyToken, scheduleController.getLecturerMeetings);
router.get("/meetings", verifyToken, scheduleController.getLecturerMeetings);

// Giảng viên chủ động tạo lịch họp mới
router.post("/lecturer/meetings/create", verifyToken, scheduleController.createMeetingByLecturer);
router.post("/meetings", verifyToken, scheduleController.createMeetingByLecturer);

// Cập nhật trạng thái lịch (Duyệt / Từ chối / Hoàn thành)
router.patch("/lecturer/meetings/status/:id", verifyToken, scheduleController.updateMeetingStatus);
router.patch("/meetings/:id/status", verifyToken, scheduleController.updateMeetingStatus);

// Xóa lịch họp
router.delete("/lecturer/meetings/:id", verifyToken, scheduleController.deleteMeeting);
router.delete("/meetings/:id", verifyToken, scheduleController.deleteMeeting);

module.exports = router;