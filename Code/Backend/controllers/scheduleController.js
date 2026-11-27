const { Meeting, Todo, AvailabilitySlot } = require("../models/Schedule");
const Topic = require("../models/Topic");
const User = require("../models/User");
const Semester = require("../models/Semester"); // Import Model Semester để lấy cấu hình từ Admin
const { notifyUsers, notifyTopicStudents } = require("../services/notificationService");
const isValidDateOnly = value => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};
const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const userCodePattern = userCode => new RegExp(`^${escapeRegex(userCode)}$`, 'i');
const getTopicMemberCodes = topic => [
    topic?.leader_code,
    topic?.member2_code,
    topic?.member3_code
].filter(Boolean);
const isGroupMember = (topic, userCode) => getTopicMemberCodes(topic)
    .some(code => String(code).trim().toUpperCase() === String(userCode).trim().toUpperCase());
async function getApprovedTodoTopic(todo, studentCode) {
    const membershipQuery = {
        status: "APPROVED",
        $or: [
            { leader_code: userCodePattern(studentCode) },
            { member2_code: userCodePattern(studentCode) },
            { member3_code: userCodePattern(studentCode) }
        ]
    };
    if (todo.topic_id) {
        return Topic.findOne({ _id: todo.topic_id, ...membershipQuery });
    }

    const topic = await Topic.findOne(membershipQuery);
    return topic && isGroupMember(topic, todo.student_code) ? topic : null;
}

// =========================================================
// A. CÁC HÀM DÀNH CHO PHÍA SINH VIÊN (STUDENT)
// =========================================================

// 1. Lấy dữ liệu tổng quan cho trang Lịch làm việc của Sinh viên
exports.getScheduleData = async (req, res) => {
    try {
        const studentCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'STUDENT' || !studentCode) {
            return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới được xem lịch nhóm.' });
        }
        if (String(req.params.studentCode || '').trim().toUpperCase() !== studentCode.toUpperCase()) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể xem lịch của nhóm mình.' });
        }

        // Tìm đề tài của sinh viên
        const topic = await Topic.findOne({
            $or: [
                { leader_code: userCodePattern(studentCode) },
                { member2_code: userCodePattern(studentCode) },
                { member3_code: userCodePattern(studentCode) }
            ]
        }).sort({ updatedAt: -1 });

        if (!topic) {
            return res.status(404).json({ message: "Bạn chưa đăng ký đề tài!" });
        }

        // Lấy lịch họp
        const meetings = await Meeting.find({ topic_id: topic._id }).sort({ meeting_date: 1 });
        
        const memberCodes = [topic.leader_code, topic.member2_code, topic.member3_code]
            .filter(Boolean);

        const memberUsers = memberCodes.length > 0 ? await User.find({
            $or: memberCodes.map(code => ({ user_code: userCodePattern(code) }))
        }).select('user_code full_name') : [];

        const memberNameMap = new Map(memberUsers.map(u => [String(u.user_code).toUpperCase(), u.full_name]));

        // Lấy danh sách việc chung; hỗ trợ cả việc cũ chưa có topic_id.
        const rawTodos = await Todo.find({
            $or: [
                { topic_id: topic._id },
                { topic_id: null, student_code: { $in: memberCodes } }
            ]
        }).sort({ createdAt: -1 });

        const todos = rawTodos.map(todo => {
            const obj = todo.toObject();
            if (obj.assigned_to) {
                obj.assigned_to_name = memberNameMap.get(String(obj.assigned_to).toUpperCase()) || obj.assigned_to;
            }
            return obj;
        });

        // Tính số buổi họp sắp tới (chưa diễn ra và chưa bị hủy)
        const now = new Date();
        const upcomingMeetings = meetings.filter(
            m => new Date(m.meeting_date) >= now && m.status !== "CANCELLED"
        ).length;

        // --- TÍNH TOÁN TUẦN HỌC ĐỘNG TỪ DATABASE DƯỚI SỰ QUẢN LÝ CỦA ADMIN ---
        const activeSemester = await Semester.findOne({ is_active: true });
        
        let currentWeek = 0;
        let totalWeeks = 0;

        if (activeSemester && activeSemester.start_date) {
            totalWeeks = activeSemester.total_weeks || 15;
            currentWeek = 1;
            
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
                _id: topic._id,
                title: topic.title,
                status: topic.status,
                lecturer_code: topic.lecturer_code,
                leader_code: topic.leader_code,
                member2_code: topic.member2_code,
                member3_code: topic.member3_code,
                members: memberUsers.map(u => ({
                    user_code: u.user_code,
                    full_name: u.full_name
                }))
            },
            stats: {
                upcoming_meetings: upcomingMeetings,
                current_week: currentWeek, // Tuần hiện tại tính động từ ngày Admin chọn
                total_weeks: totalWeeks,   // Tổng số tuần từ cấu hình Admin
                semester_name: activeSemester?.name || null
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
        const { topic_id, title, location, availability_id } = req.body;
        const studentCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'STUDENT' || !studentCode) {
            return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới được đăng ký lịch hẹn.' });
        }
        if (!availability_id) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn khung giờ rảnh do giảng viên công khai.' });
        }
        const escapedStudentCode = studentCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const topic = await Topic.findOne({
            _id: topic_id,
            status: 'APPROVED',
            $or: [
                { leader_code: new RegExp(`^${escapedStudentCode}$`, 'i') },
                { member2_code: new RegExp(`^${escapedStudentCode}$`, 'i') },
                { member3_code: new RegExp(`^${escapedStudentCode}$`, 'i') }
            ]
        }).select('lecturer_code leader_code member2_code member3_code title');
        if (!topic) return res.status(403).json({ success: false, message: 'Bạn không có quyền đặt lịch cho đề tài này.' });
        if (String(topic.leader_code || '').trim().toUpperCase() !== studentCode.toUpperCase()) {
            return res.status(403).json({ success: false, message: 'Chỉ trưởng nhóm mới được đăng ký lịch hẹn với giảng viên.' });
        }
        const lecturer_code = topic.lecturer_code;

        const slot = await AvailabilitySlot.findOneAndUpdate(
            { _id: availability_id, lecturer_code, status: "OPEN", $expr: { $lt: [{ $ifNull: ["$booked_count", 0] }, { $ifNull: ["$max_bookings", 3] }] } },
            [{ $set: { booked_count: { $add: [{ $ifNull: ["$booked_count", 0] }, 1] }, status: { $cond: [{ $gte: [{ $add: [{ $ifNull: ["$booked_count", 0] }, 1] }, { $ifNull: ["$max_bookings", 3] }] }, "FULL", "OPEN"] } } }],
            { new: true }
        );
        if (!slot) return res.status(409).json({ message: "Khung giờ này đã đủ số nhóm hoặc không còn mở!" });

        const meetingDate = slot.available_date;
        const meetingStart = slot.time_start;
        const meetingEnd = slot.time_end;
        const meetingType = slot.type;
        const meetingLocation = slot.location || location;
        const student = req.user?.full_name
            ? null
            : await User.findOne({ user_code: studentCode, role: 'STUDENT' })
                .select('full_name')
                .lean();
        const studentName = String(req.user?.full_name || student?.full_name || studentCode).trim();

        const newMeeting = new Meeting({
            topic_id,
            student_code: studentCode,
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
        await notifyUsers([lecturer_code], {
            title: 'Yêu cầu lịch hẹn mới',
            content: `Sinh viên ${studentName} (${studentCode}) thuộc nhóm đề tài "${topic.title}" đã gửi yêu cầu lịch hẹn "${title}" vào ${new Date(meetingDate).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}, ${meetingStart}-${meetingEnd}.`,
            eventKey: `meeting-request:${newMeeting._id}`,
            type: 'STUDENT',
            senderName: studentName
        });
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
        const studentCode = String(req.user?.user_code || '').trim();
        const lecturerCode = String(req.params.lecturerCode || '').trim();
        const role = String(req.user?.role || '').toUpperCase();
        if (!studentCode || !lecturerCode) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xem khung giờ này.' });
        }

        if (role === 'LECTURER') {
            if (lecturerCode.toUpperCase() !== studentCode.toUpperCase()) {
                return res.status(403).json({ success: false, message: 'Bạn chỉ có thể xem khung giờ của mình.' });
            }
        } else if (role === 'STUDENT') {
            const topic = await Topic.findOne({
                status: 'APPROVED',
                lecturer_code: userCodePattern(lecturerCode),
                $or: [
                    { leader_code: userCodePattern(studentCode) },
                    { member2_code: userCodePattern(studentCode) },
                    { member3_code: userCodePattern(studentCode) }
                ]
            }).select('_id');
            if (!topic) {
                return res.status(403).json({ success: false, message: 'Bạn chỉ có thể xem khung giờ của giảng viên hướng dẫn nhóm mình.' });
            }
        } else {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xem khung giờ này.' });
        }

        const slots = await AvailabilitySlot.find({
            lecturer_code: userCodePattern(role === 'LECTURER' ? studentCode : lecturerCode),
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
        const requesterCode = String(req.user?.user_code || "").trim();
        if (String(req.user?.role || "").toUpperCase() !== "LECTURER" ||
            requesterCode.toUpperCase() !== String(lecturer_code || "").trim().toUpperCase()) {
            return res.status(403).json({ success: false, message: "Bạn không có quyền công khai khung giờ này!" });
        }
        if (!lecturer_code || !available_date || !time_start || !time_end) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập đủ ngày và giờ rảnh!" });
        }
        if (!isValidDateOnly(available_date)) {
            return res.status(400).json({ success: false, message: "Ngày rảnh không hợp lệ!" });
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

exports.updateAvailabilitySlot = async (req, res) => {
    try {
        const requesterCode = String(req.user?.user_code || "").trim();
        if (String(req.user?.role || "").toUpperCase() !== "LECTURER" || !requesterCode) {
            return res.status(403).json({ success: false, message: "Chỉ giảng viên mới được chỉnh sửa khung giờ!" });
        }

        const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const slot = await AvailabilitySlot.findOne({
            _id: req.params.id,
            lecturer_code: new RegExp(`^${escapeRegex(requesterCode)}$`, "i"),
            status: { $in: ["OPEN", "FULL"] }
        });
        if (!slot) return res.status(404).json({ success: false, message: "Không tìm thấy khung giờ đang mở!" });

        const { available_date, time_start, time_end, type, location, max_bookings } = req.body;
        if (!available_date || !time_start || !time_end) {
            return res.status(400).json({ success: false, message: "Vui lòng nhập đủ ngày và giờ rảnh!" });
        }
        if (!isValidDateOnly(available_date)) {
            return res.status(400).json({ success: false, message: "Ngày rảnh không hợp lệ!" });
        }
        if (time_end <= time_start) {
            return res.status(400).json({ success: false, message: "Giờ kết thúc phải sau giờ bắt đầu!" });
        }
        if (!["ONLINE", "OFFLINE"].includes(type)) {
            return res.status(400).json({ success: false, message: "Hình thức khung giờ không hợp lệ!" });
        }

        const capacity = Number(max_bookings);
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 20) {
            return res.status(400).json({ success: false, message: "Số nhóm tối đa phải từ 1 đến 20!" });
        }
        if (capacity < slot.booked_count) {
            return res.status(400).json({
                success: false,
                message: `Số nhóm tối đa không được thấp hơn số nhóm đã đặt (${slot.booked_count})!`
            });
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

        const currentDate = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(slot.available_date);
        if (slot.booked_count > 0 && (
            available_date !== currentDate ||
            time_start !== slot.time_start ||
            time_end !== slot.time_end ||
            type !== slot.type ||
            (location || "") !== slot.location
        )) {
            return res.status(400).json({
                success: false,
                message: "Khung giờ đã có nhóm đặt; chỉ có thể chỉnh sửa số nhóm tối đa để không ảnh hưởng lịch hẹn!"
            });
        }

        slot.available_date = new Date(`${available_date}T00:00:00`);
        slot.time_start = time_start;
        slot.time_end = time_end;
        slot.type = type;
        slot.location = location || "";
        slot.max_bookings = capacity;
        slot.status = slot.booked_count >= capacity ? "FULL" : "OPEN";
        await slot.save();

        return res.json({ success: true, data: slot, message: "Đã cập nhật khung giờ rảnh!" });
    } catch (error) {
        console.error("Lỗi cập nhật khung giờ rảnh:", error);
        return res.status(500).json({ success: false, message: "Không thể cập nhật khung giờ rảnh!" });
    }
};

exports.deleteAvailabilitySlot = async (req, res) => {
    try {
        const requesterCode = String(req.user?.user_code || "").trim();
        if (String(req.user?.role || "").toUpperCase() !== "LECTURER" || !requesterCode) {
            return res.status(403).json({ success: false, message: "Chỉ giảng viên mới được đóng khung giờ!" });
        }
        const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const slot = await AvailabilitySlot.findOneAndUpdate(
            {
                _id: req.params.id,
                lecturer_code: new RegExp(`^${escapeRegex(requesterCode)}$`, "i"),
                status: { $in: ["OPEN", "FULL"] }
            },
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
        const studentCode = String(req.user?.user_code || '').trim();
        const { topic_id, title, assigned_to, due_date } = req.body;
        const cleanTitle = String(title || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'STUDENT' || !studentCode) {
            return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới được thêm công việc.' });
        }
        if (!cleanTitle) return res.status(400).json({ success: false, message: "Tên công việc không được để trống!" });
        if (!topic_id) return res.status(400).json({ message: "Thiếu thông tin đề tài của nhóm!" });

        const topic = await Topic.findOne({
            _id: topic_id,
            status: "APPROVED",
            $or: [
                { leader_code: userCodePattern(studentCode) },
                { member2_code: userCodePattern(studentCode) },
                { member3_code: userCodePattern(studentCode) }
            ]
        });
        if (!topic) return res.status(403).json({ success: false, message: "Bạn không thuộc đề tài được chọn hoặc đề tài chưa được duyệt!" });
        if (String(topic.leader_code || '').trim().toUpperCase() !== studentCode.toUpperCase()) {
            return res.status(403).json({ success: false, message: "Chỉ trưởng nhóm mới được giao công việc." });
        }

        const groupMembers = getTopicMemberCodes(topic);
        const assignedCode = String(assigned_to || '').trim();
        const assignedMember = assignedCode
            ? groupMembers.find(code => String(code).toUpperCase() === assignedCode.toUpperCase())
            : '';
        if (assignedCode && !assignedMember) {
            return res.status(400).json({ success: false, message: "Người được giao phải thuộc cùng nhóm." });
        }

        const parsedDueDate = due_date ? new Date(`${due_date}T23:59:59`) : null;
        if (due_date && Number.isNaN(parsedDueDate.getTime())) {
            return res.status(400).json({ success: false, message: "Ngày hạn không hợp lệ!" });
        }

        const newTodo = new Todo({
            topic_id: topic._id,
            student_code: studentCode,
            created_by: studentCode,
            assigned_to: assignedMember || "",
            title: cleanTitle,
            due_date: parsedDueDate,
            status: "NOT_STARTED",
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
        const studentCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'STUDENT' || !studentCode) {
            return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới được cập nhật công việc.' });
        }

        const { todoId } = req.params;
        const todo = await Todo.findById(todoId);
        if (!todo) return res.status(404).json({ message: "Không tìm thấy công việc!" });

        const topic = await getApprovedTodoTopic(todo, studentCode);
        if (!topic) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể cập nhật công việc của nhóm mình.' });
        }

        const validStatuses = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"];
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "status")) {
            const requestedStatus = String(req.body.status || "").trim().toUpperCase();
            if (!validStatuses.includes(requestedStatus)) {
                return res.status(400).json({ success: false, message: "Trạng thái công việc không hợp lệ." });
            }
            todo.status = requestedStatus;
        } else {
            const currentStatus = validStatuses.includes(todo.status)
                ? todo.status
                : todo.is_completed === true ? "COMPLETED" : "NOT_STARTED";
            todo.status = currentStatus === "COMPLETED" ? "NOT_STARTED" : "COMPLETED";
        }
        todo.is_completed = todo.status === "COMPLETED";
        await todo.save();

        res.status(200).json({
            success: true,
            message: "Đã cập nhật trạng thái!",
            status: todo.status,
            is_completed: todo.is_completed
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi cập nhật!", error: error.message });
    }
};

exports.deleteTodo = async (req, res) => {
    try {
        const studentCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'STUDENT' || !studentCode) {
            return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới được xóa công việc.' });
        }

        const todo = await Todo.findById(req.params.todoId);
        if (!todo) return res.status(404).json({ success: false, message: 'Không tìm thấy công việc.' });

        const topic = await getApprovedTodoTopic(todo, studentCode);
        if (!topic) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể xóa công việc của nhóm mình.' });
        }

        const requesterCode = studentCode.toUpperCase();
        const creatorCode = String(todo.created_by || todo.student_code || '').trim().toUpperCase();
        const leaderCode = String(topic.leader_code || '').trim().toUpperCase();
        if (requesterCode !== creatorCode && requesterCode !== leaderCode) {
            return res.status(403).json({ success: false, message: 'Chỉ người tạo việc hoặc trưởng nhóm mới được xóa.' });
        }

        await todo.deleteOne();
        return res.status(200).json({ success: true, message: 'Đã xóa công việc.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Không thể xóa công việc.', error: error.message });
    }
};

// =========================================================
// B. CÁC HÀM DÀNH CHO PHÍA GIẢNG VIÊN (LECTURER)
// =========================================================

// 5. Giảng viên lấy danh sách tất cả các buổi hẹn (populate thông tin Đề tài/Nhóm)
exports.getLecturerMeetings = async (req, res) => {
    try {
        const lecturerCode = String(req.user?.user_code || '').trim();
        const requestedCode = String(req.params.lecturerCode || req.query.lecturer_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'LECTURER' || !lecturerCode) {
            return res.status(403).json({ success: false, message: 'Chỉ giảng viên mới được xem lịch hướng dẫn.' });
        }
        if (requestedCode && requestedCode.toUpperCase() !== lecturerCode.toUpperCase()) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể xem lịch hướng dẫn của mình.' });
        }

        const meetings = await Meeting.find({ 
            lecturer_code: userCodePattern(lecturerCode),
            status: { $ne: "CANCELLED" },
            source: { $ne: "LECTURER" } // Chỉ hiển thị các yêu cầu đặt lịch từ sinh viên
        })
        .populate("topic_id", "title group_code") // Lấy thêm Tên đề tài & Mã nhóm từ bảng Topic
        .sort({ meeting_date: 1, time_start: 1 });

        const studentCodes = [...new Set(meetings.map(m => m.student_code).filter(Boolean))];
        const studentUsers = studentCodes.length > 0 ? await User.find({
            $or: studentCodes.map(code => ({ user_code: userCodePattern(code) }))
        }).select('user_code full_name') : [];

        const studentNameMap = new Map(studentUsers.map(u => [String(u.user_code).toUpperCase(), u.full_name]));

        const enrichedMeetings = meetings.map(m => {
            const obj = m.toObject();
            const sCode = String(obj.student_code || '').trim().toUpperCase();
            obj.student_name = studentNameMap.get(sCode) || obj.student_code || '';
            return obj;
        });

        res.status(200).json({ success: true, data: enrichedMeetings });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi lấy danh sách lịch hẹn!", error: error.message });
    }
};

// 6. Giảng viên chủ động tạo lịch họp với nhóm (Tự động APPROVED)
exports.createMeetingByLecturer = async (req, res) => {
    try {
        const { topic_id, title, meeting_date, time_start, time_end, type, location, notes } = req.body;
        const lecturerCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'LECTURER' || !lecturerCode) {
            return res.status(403).json({ success: false, message: 'Chỉ giảng viên mới được tạo lịch hẹn.' });
        }
        const escapedLecturerCode = lecturerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const topic = await Topic.findOne({
            _id: topic_id,
            lecturer_code: new RegExp(`^${escapedLecturerCode}$`, 'i'),
            status: 'APPROVED'
        }).select('lecturer_code leader_code member2_code member3_code title');
        if (!topic) return res.status(403).json({ success: false, message: 'Bạn không được phân công hướng dẫn đề tài này.' });

        const newMeeting = new Meeting({
            topic_id,
            student_code: topic.leader_code,
            lecturer_code: lecturerCode,
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
        await notifyTopicStudents(topic, {
            title: 'Giảng viên đã tạo lịch hẹn',
            content: `Giảng viên đã tạo lịch "${title}" cho đề tài "${topic.title}" vào ${new Date(meeting_date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}, ${time_start}-${time_end}.`,
            eventKey: `meeting-created:${newMeeting._id}`
        });

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
        const lecturerCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'LECTURER' ||
            !['APPROVED', 'CANCELLED', 'COMPLETED'].includes(status)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật lịch hẹn này.' });
        }

        const updatedMeeting = await Meeting.findOne({
            _id: id,
            lecturer_code: new RegExp(`^${lecturerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        });

        if (!updatedMeeting) {
            return res.status(404).json({ success: false, message: "Không tìm thấy buổi họp!" });
        }
        const previousStatus = updatedMeeting.status;
        updatedMeeting.status = status;
        if (notes !== undefined) updatedMeeting.notes = notes;
        await updatedMeeting.save();
        await updatedMeeting.populate("topic_id", "title group_code");

        let msg = "Đã cập nhật trạng thái lịch họp!";
        if (status === "APPROVED") msg = "Đã đồng ý lịch hẹn!";
        if (status === "CANCELLED") msg = "Đã hủy / từ chối lịch hẹn!";
        if (status === "COMPLETED") msg = "Đã đánh dấu hoàn thành buổi họp!";
        if (previousStatus !== status) {
            const lecturer = await User.findOne({
                user_code: new RegExp(`^${lecturerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                role: 'LECTURER'
            }).select('full_name').lean();
            const topic = updatedMeeting.topic_id?._id
                ? await Topic.findById(updatedMeeting.topic_id._id)
                    .select('leader_code member2_code member3_code title')
                    .lean()
                : null;
            const statusText = status === 'APPROVED' ? 'đã được xác nhận' :
                status === 'CANCELLED' ? 'đã bị hủy hoặc từ chối' : 'đã hoàn thành';
            await notifyTopicStudents(topic || { leader_code: updatedMeeting.student_code }, {
                title: status === 'APPROVED' ? 'Lịch hẹn đã được xác nhận' :
                    status === 'CANCELLED' ? 'Lịch hẹn đã thay đổi' : 'Buổi hẹn đã hoàn thành',
                content: `Lịch "${updatedMeeting.title}" ${statusText} (${new Date(updatedMeeting.meeting_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}, ${updatedMeeting.time_start}-${updatedMeeting.time_end}).${updatedMeeting.notes ? ` Ghi chú: ${updatedMeeting.notes}` : ''}`,
                eventKey: `meeting-status:${updatedMeeting._id}:${previousStatus}:${status}:${updatedMeeting.updatedAt.getTime()}`,
                priority: status === 'CANCELLED' ? 'warning' : 'info',
                type: 'LECTURER',
                senderName: lecturer?.full_name || `Giảng viên ${lecturerCode}`
            });
        }

        res.status(200).json({ success: true, message: msg, data: updatedMeeting });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi cập nhật trạng thái!", error: error.message });
    }
};

// 8. Giảng viên xóa vĩnh viễn lịch hẹn khỏi hệ thống
exports.deleteMeeting = async (req, res) => {
    try {
        const { id } = req.params;
        const lecturerCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'LECTURER' || !lecturerCode) {
            return res.status(403).json({ success: false, message: 'Chỉ giảng viên mới được xóa lịch hẹn.' });
        }
        const deletedMeeting = await Meeting.findOneAndDelete({
            _id: id,
            lecturer_code: new RegExp(`^${lecturerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
        });

        if (!deletedMeeting) {
            return res.status(404).json({ success: false, message: "Không tìm thấy lịch họp để xóa!" });
        }
        const topic = await Topic.findById(deletedMeeting.topic_id)
            .select('leader_code member2_code member3_code title')
            .lean();
        await notifyTopicStudents(topic || { leader_code: deletedMeeting.student_code }, {
            title: 'Lịch hẹn đã bị xóa',
            content: `Lịch "${deletedMeeting.title}" vào ${new Date(deletedMeeting.meeting_date).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}, ${deletedMeeting.time_start}-${deletedMeeting.time_end} đã bị giảng viên xóa.`,
            eventKey: `meeting-deleted:${deletedMeeting._id}`,
            priority: 'warning'
        });

        res.status(200).json({ success: true, message: "Đã xóa lịch họp khỏi hệ thống!" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Lỗi khi xóa lịch họp!", error: error.message });
    }
};