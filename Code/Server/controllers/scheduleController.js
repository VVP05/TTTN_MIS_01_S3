const { Meeting, Todo } = require("../models/Schedule");
const Topic = require("../models/Topic");
const Semester = require("../models/Semester"); // Import Model Semester để lấy cấu hình từ Admin

// =========================================================
// A. CÁC HÀM DÀNH CHO PHÍA SINH VIÊN (STUDENT)
// =========================================================

// 1. Lấy dữ liệu tổng quan cho trang Lịch làm việc của Sinh viên
exports.getScheduleData = async (req, res) => {
    try {
        const { studentCode } = req.params;

        // Tìm đề tài của sinh viên
        const topic = await Topic.findOne({
            $or: [{ leader_code: studentCode }, { member2_code: studentCode }]
        });

        if (!topic) {
            return res.status(404).json({ message: "Bạn chưa đăng ký đề tài!" });
        }

        // Lấy lịch họp
        const meetings = await Meeting.find({ topic_id: topic._id }).sort({ meeting_date: 1 });
        
        // Lấy danh sách việc cần làm (To-do)
        const todos = await Todo.find({ student_code: studentCode }).sort({ createdAt: -1 });

        // Tính số buổi họp sắp tới (chưa diễn ra và chưa bị hủy)
        const now = new Date();
        const upcomingMeetings = meetings.filter(
            m => new Date(m.meeting_date) >= now && m.status !== "CANCELLED"
        ).length;

        // --- TÍNH TOÁN TUẦN HỌC ĐỘNG TỪ DATABASE DƯỚI SỰ QUẢN LÝ CỦA ADMIN ---
        const activeSemester = await Semester.findOne({ is_active: true });
        
        let currentWeek = 1;
        let totalWeeks = 15;

        if (activeSemester && activeSemester.start_date) {
            totalWeeks = activeSemester.total_weeks || 15;
            
            const startDate = new Date(activeSemester.start_date);
            const today = new Date();

            // Đưa thời gian về mốc 00:00:00 để tính khoảng cách số ngày chính xác
            startDate.setHours(0, 0, 0, 0);
            today.setHours(0, 0, 0, 0);

            if (today >= startDate) {
                const diffTime = Math.abs(today - startDate);
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                currentWeek = Math.floor(diffDays / 7) + 1;
            }

            // Đảm bảo không vượt quá tổng số tuần cấu hình
            if (currentWeek > totalWeeks) {
                currentWeek = totalWeeks;
            }
        }

        res.status(200).json({
            success: true,
            topic: {
                id: topic._id,
                title: topic.title,
                status: topic.status,
                lecturer_code: topic.lecturer_code
            },
            stats: {
                upcoming_meetings: upcomingMeetings,
                current_week: currentWeek, // Tuần hiện tại tính động từ ngày Admin chọn
                total_weeks: totalWeeks   // Tổng số tuần từ cấu hình Admin
            },
            meetings,
            todos
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi máy chủ!", error: error.message });
    }
};

// 2. Sinh viên đăng ký lịch hẹn mới với GVHD (Mặc định PENDING)
exports.createMeeting = async (req, res) => {
    try {
        const { topic_id, student_code, lecturer_code, title, meeting_date, time_start, time_end, type, location } = req.body;

        const newMeeting = new Meeting({
            topic_id,
            student_code,
            lecturer_code,
            title,
            meeting_date,
            time_start,
            time_end,
            type,
            location,
            source: "STUDENT"
        });

        await newMeeting.save();
        res.status(201).json({ 
            success: true,
            message: "Đăng ký lịch hẹn thành công! Đang chờ giảng viên duyệt.", 
            meeting: newMeeting 
        });
    } catch (error) {
        res.status(500).json({ message: "Không thể tạo lịch hẹn!", error: error.message });
    }
};

// 3. Thêm công việc mới vào To-do List
exports.addTodo = async (req, res) => {
    try {
        const { student_code, title } = req.body;
        if (!title) return res.status(400).json({ message: "Tên công việc không được để trống!" });

        const newTodo = new Todo({ student_code, title });
        await newTodo.save();

        res.status(201).json({ success: true, message: "Thêm việc thành công!", todo: newTodo });
    } catch (error) {
        res.status(500).json({ message: "Lỗi thêm việc!", error: error.message });
    }
};

// 4. Đánh dấu hoàn thành / chưa hoàn thành công việc
exports.toggleTodo = async (req, res) => {
    try {
        const { todoId } = req.params;
        const todo = await Todo.findById(todoId);
        
        if (!todo) return res.status(404).json({ message: "Không tìm thấy công việc!" });

        todo.is_completed = !todo.is_completed;
        await todo.save();

        res.status(200).json({ success: true, message: "Đã cập nhật trạng thái!", is_completed: todo.is_completed });
    } catch (error) {
        res.status(500).json({ message: "Lỗi cập nhật!", error: error.message });
    }
};

// =========================================================
// B. CÁC HÀM DÀNH CHO PHÍA GIẢNG VIÊN (LECTURER)
// =========================================================

// 5. Giảng viên lấy danh sách tất cả các buổi hẹn (populate thông tin Đề tài/Nhóm)
exports.getLecturerMeetings = async (req, res) => {
    try {
        const { lecturerCode } = req.params; // Hoặc lấy từ query: req.query.lecturer_code

        const meetings = await Meeting.find({ 
            lecturer_code: lecturerCode,
            status: { $ne: "CANCELLED" },
            source: { $ne: "LECTURER" } // Chỉ hiển thị các yêu cầu đặt lịch từ sinh viên
        })
        .populate("topic_id", "title group_code") // Lấy thêm Tên đề tài & Mã nhóm từ bảng Topic
        .sort({ meeting_date: 1, time_start: 1 });

        res.status(200).json({ success: true, data: meetings });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi lấy danh sách lịch hẹn!", error: error.message });
    }
};

// 6. Giảng viên chủ động tạo lịch họp với nhóm (Tự động APPROVED)
exports.createMeetingByLecturer = async (req, res) => {
    try {
        const { topic_id, student_code, lecturer_code, title, meeting_date, time_start, time_end, type, location, notes } = req.body;

        const newMeeting = new Meeting({
            topic_id,
            student_code,
            lecturer_code,
            title,
            meeting_date,
            time_start,
            time_end,
            type: type || "ONLINE",
            location,
            source: "LECTURER",
            status: "APPROVED", // Do GV lên lịch nên tự động duyệt
            notes: notes || ""
        });

        await newMeeting.save();
        await newMeeting.populate("topic_id", "title group_code");

        res.status(201).json({
            success: true,
            message: "Tạo lịch hướng dẫn thành công!",
            meeting: newMeeting
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Không thể tạo lịch hẹn!", error: error.message });
    }
};

// 7. Giảng viên cập nhật trạng thái lịch (Duyệt / Từ chối / Hoàn thành)
exports.updateMeetingStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, notes } = req.body; // status: "APPROVED" | "CANCELLED" | "COMPLETED"

        const updatedMeeting = await Meeting.findByIdAndUpdate(
            id,
            { 
                status,
                ...(notes !== undefined && { notes }) // Nếu từ chối/báo bận có gửi kèm lý do thì lưu vào notes
            },
            { new: true }
        ).populate("topic_id", "title group_code");

        if (!updatedMeeting) {
            return res.status(404).json({ success: false, message: "Không tìm thấy buổi họp!" });
        }

        let msg = "Đã cập nhật trạng thái lịch họp!";
        if (status === "APPROVED") msg = "Đã đồng ý lịch hẹn!";
        if (status === "CANCELLED") msg = "Đã hủy / từ chối lịch hẹn!";
        if (status === "COMPLETED") msg = "Đã đánh dấu hoàn thành buổi họp!";

        res.status(200).json({ success: true, message: msg, data: updatedMeeting });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi cập nhật trạng thái!", error: error.message });
    }
};

// 8. Giảng viên xóa vĩnh viễn lịch hẹn khỏi hệ thống
exports.deleteMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedMeeting = await Meeting.findByIdAndDelete(id);

        if (!deletedMeeting) {
            return res.status(404).json({ success: false, message: "Không tìm thấy lịch họp để xóa!" });
        }

        res.status(200).json({ success: true, message: "Đã xóa lịch họp khỏi hệ thống!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi khi xóa lịch họp!", error: error.message });
    }
};