const { Meeting, Todo, AvailabilitySlot } = require("../models/Schedule");
const Topic = require("../models/Topic");
const Semester = require("../models/Semester"); // Import Model Semester để lấy cấu hình từ Admin

// =========================================================
// A. CÁC HÀM DÀNH CHO PHÍA SINH VIÊN (STUDENT)
// =========================================================

// 1. Lấy dữ liệu tổng quan cho trang Lịch làm việc của Sinh viên
exports.getScheduleData = async (req, res) => {
    try {
        const { studentCode } = req.params;
        const studentCodePattern = new RegExp(`^${String(studentCode).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

        // Tìm đề tài của sinh viên
        const topic = await Topic.findOne({
            $or: [
                { leader_code: studentCodePattern },
                { member2_code: studentCodePattern },
                { member3_code: studentCodePattern }
            ]
        }).sort({ updatedAt: -1 });

        if (!topic) {
            return res.status(404).json({ message: "Bạn chưa đăng ký đề tài!" });
        }

        // Lấy lịch họp
        const meetings = await Meeting.find({ topic_id: topic._id }).sort({ meeting_date: 1 });
        
        const memberCodes = [topic.leader_code, topic.member2_code, topic.member3_code]
            .filter(Boolean);

        // Lấy danh sách việc chung; hỗ trợ cả việc cũ chưa có topic_id.
        const todos = await Todo.find({
            $or: [
                { topic_id: topic._id },
                { topic_id: null, student_code: { $in: memberCodes } }
            ]
        }).sort({ createdAt: -1 });

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
                lecturer_code: topic.lecturer_code,
                leader_code: topic.leader_code,
                member2_code: topic.member2_code,
                member3_code: topic.member3_code
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
        const { topic_id, student_code, lecturer_code, title, meeting_date, time_start, time_end, type, location, availability_id } = req.body;

        let slot = null;
        if (availability_id) {
            slot = await AvailabilitySlot.findOneAndUpdate(
                { _id: availability_id, lecturer_code, status: "OPEN", $expr: { $lt: [{ $ifNull: ["$booked_count", 0] }, { $ifNull: ["$max_bookings", 3] }] } },
                [{ $set: { booked_count: { $add: [{ $ifNull: ["$booked_count", 0] }, 1] }, status: { $cond: [{ $gte: [{ $add: [{ $ifNull: ["$booked_count", 0] }, 1] }, { $ifNull: ["$max_bookings", 3] }] }, "FULL", "OPEN"] } } }],
                { new: true }
            );
            if (!slot) return res.status(409).json({ message: "Khung giờ này đã đủ số nhóm hoặc không còn mở!" });
        }

        const meetingDate = slot ? slot.available_date : meeting_date;
        const meetingStart = slot ? slot.time_start : time_start;
        const meetingEnd = slot ? slot.time_end : time_end;
        const meetingType = slot ? slot.type : type;
        const meetingLocation = slot?.location || location;

        const newMeeting = new Meeting({
            topic_id,
            student_code,
            lecturer_code,
            title,
            meeting_date: meetingDate,
            time_start: meetingStart,
            time_end: meetingEnd,
            type: meetingType,
            location: meetingLocation || (meetingType === "ONLINE" ? "Google Meet (Sẽ cập nhật)" : "Văn phòng Khoa"),
            availability_id: slot?._id || null,
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

exports.getAvailabilitySlots = async (req, res) => {
    try {
        const slots = await AvailabilitySlot.find({
            lecturer_code: req.params.lecturerCode,
            status: { $in: ["OPEN", "FULL"] }
        }).sort({ available_date: 1, time_start: 1 }).lean();
        res.json({ success: true, data: slots });
    } catch (error) {
        res.status(500).json({ success: false, message: "Không thể tải khung giờ rảnh!" });
    }
};

exports.createAvailabilitySlot = async (req, res) => {
    try {
        const { lecturer_code, available_date, time_start, time_end, type, location, max_bookings } = req.body;
        if (!lecturer_code || !available_date || !time_start || !time_end) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập đủ ngày và giờ rảnh!" });
        }

        const todayInVietnam = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date());
        if (available_date <= todayInVietnam) {
            return res.status(400).json({ success: false, message: "Chỉ được mở khung giờ từ ngày mai trở đi!" });
        }

        if (time_end <= time_start) {
            return res.status(400).json({ success: false, message: "Giờ kết thúc phải sau giờ bắt đầu!" });
        }

        const slot = await AvailabilitySlot.create({
            lecturer_code,
            available_date: new Date(`${available_date}T00:00:00`),
            time_start,
            time_end,
            type: type || "ONLINE",
            location: location || "",
            max_bookings: Math.max(1, Math.min(20, Number(max_bookings) || 3))
        });
        res.status(201).json({ success: true, data: slot, message: "Đã công khai khung giờ rảnh!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Không thể tạo khung giờ rảnh!" });
    }
};

exports.deleteAvailabilitySlot = async (req, res) => {
    try {
        const slot = await AvailabilitySlot.findOneAndUpdate(
            { _id: req.params.id, lecturer_code: req.body.lecturer_code, status: "OPEN" },
            { status: "CLOSED" },
            { new: true }
        );
        if (!slot) return res.status(404).json({ success: false, message: "Không tìm thấy khung giờ đang mở!" });
        res.json({ success: true, message: "Đã đóng khung giờ!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Không thể đóng khung giờ!" });
    }
};

// 3. Thêm công việc mới vào To-do List
exports.addTodo = async (req, res) => {
    try {
        const { student_code, topic_id, title, assigned_to, due_date } = req.body;
        if (!title) return res.status(400).json({ message: "Tên công việc không được để trống!" });

        if (!topic_id) return res.status(400).json({ message: "Thiếu thông tin đề tài của nhóm!" });

        const topic = await Topic.findOne({
            _id: topic_id,
            $or: [
                { leader_code: student_code },
                { member2_code: student_code },
                { member3_code: student_code }
            ],
            status: "APPROVED"
        });

        if (!topic) return res.status(403).json({ message: "Bạn không thuộc đề tài được chọn hoặc đề tài chưa được duyệt!" });

        const parsedDueDate = due_date ? new Date(`${due_date}T23:59:59`) : null;
        if (due_date && Number.isNaN(parsedDueDate.getTime())) {
            return res.status(400).json({ message: "Ngày hạn không hợp lệ!" });
        }

        const newTodo = new Todo({
            topic_id: topic._id,
            student_code,
            created_by: student_code,
            assigned_to: assigned_to || "",
            title: title.trim(),
            due_date: parsedDueDate,
            is_completed: false
        });
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

        todo.is_completed = todo.is_completed !== true;
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