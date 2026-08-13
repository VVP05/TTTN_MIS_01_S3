const mongoose = require('mongoose');
const User = require('../models/User');
const Topic = require('../models/Topic');
const LecturerTopic = require('../models/LecturerTopic');
const Submission = require('../models/Submission');
const Notification = require('../models/Notification');

// Kết nối linh hoạt vào Collection 'meetings'
const MeetingModel = mongoose.models.Meeting || 
                     mongoose.models.meeting || 
                     mongoose.model('Meeting', new mongoose.Schema({}, { strict: false, collection: 'meetings' }));

/**
 * ==========================================
 * 1. API DASHBOARD DÀNH CHO ADMIN
 * ==========================================
 * @desc    Lấy dữ liệu thống kê Dashboard Admin (KPI, Biểu đồ, Đề tài chờ duyệt)
 * @route   GET /api/dashboard/admin
 * @access  Private (Chỉ ADMIN)
 */
const normalizeStatus = (value) => {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '')
        .replace(/_/g, '');
};

const matchesStatus = (value, patterns) => {
    const normalized = normalizeStatus(value);
    return patterns.some(pattern => {
        if (pattern instanceof RegExp) return pattern.test(normalized);
        return normalized === pattern || normalized.includes(pattern);
    });
};

exports.getAdminDashboardStats = async (req, res) => {
    try {
        const { semester } = req.query;

        // Bộ lọc học kỳ (nếu có) chỉ áp dụng khi Topic collection thực sự có trường semester
        const topicFilter = {};
        if (semester) {
            const hasSemesterField = await Topic.exists({ semester: { $exists: true, $ne: null } });
            if (hasSemesterField) {
                topicFilter.semester = semester;
            } else {
                console.warn("Dashboard Admin: semester query được bỏ qua vì Topic collection không có trường semester.");
            }
        }

        const pendingStatusRegex = /^(pending|cho_duyet|cho phe duyet|chờ duyệt|chờ phe duyet|0)$/i;
        const approvedStatusRegex = /^(approved|da_duyet|da phe duyet|đã duyệt|đã phê duyệt|registered|1)$/i;
        const rejectedStatusRegex = /^(rejected|tu_choi|từ chối|3)$/i;
        const revisionStatusRegex = /^(need_revision|revision|yeu_cau_sua|yêu cầu sửa|2)$/i;

        // 1. Thống kê KPI cơ bản
        const [
            totalStudents,
            totalLecturers,
            totalTopics,
            approvedTopicsFromTopic,
            pendingTopicsFromTopic,
            rejectedTopicsFromTopic,
            needRevisionTopicsFromTopic,
            approvedTopicsFromPool,
            pendingTopicsFromPool,
            rejectedTopicsFromPool,
            pendingPoolList,
            allTopics,
            allPoolTopics
        ] = await Promise.all([
            User.countDocuments({ role: 'STUDENT' }),
            User.countDocuments({ role: 'LECTURER' }),
            Topic.countDocuments(topicFilter),
            Topic.countDocuments({ ...topicFilter, status: { $regex: approvedStatusRegex } }),
            Topic.countDocuments({ ...topicFilter, status: { $regex: pendingStatusRegex } }),
            Topic.countDocuments({ ...topicFilter, status: { $regex: rejectedStatusRegex } }),
            Topic.countDocuments({ ...topicFilter, status: { $regex: revisionStatusRegex } }),
            LecturerTopic.countDocuments({ status: { $regex: approvedStatusRegex } }),
            LecturerTopic.countDocuments({ status: { $regex: pendingStatusRegex } }),
            LecturerTopic.countDocuments({ status: { $regex: rejectedStatusRegex } }),
            LecturerTopic.find({ status: { $regex: pendingStatusRegex } })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean(),
            Topic.find(topicFilter).lean(),
            LecturerTopic.find({}).lean()
        ]);

        const totalPendingFromTopic = allTopics.filter(item => matchesStatus(item.status, [pendingStatusRegex, 'pending', 'chờ duyệt', 'cho duyet', 'cho_duyet', 'chờ phe duyet', 'cho phe duyet'])).length;
        const totalPendingFromPool = allPoolTopics.filter(item => matchesStatus(item.status, [pendingStatusRegex, 'pending', 'chờ duyệt', 'cho duyet', 'cho_duyet', 'chờ phe duyet', 'cho phe duyet'])).length;
        const totalApprovedFromTopic = allTopics.filter(item => matchesStatus(item.status, [approvedStatusRegex, 'approved', 'registered', 'da phe duyet', 'đã phê duyệt', 'đã duyệt'])).length;
        const totalApprovedFromPool = allPoolTopics.filter(item => matchesStatus(item.status, [approvedStatusRegex, 'approved', 'registered', 'da phe duyet', 'đã phê duyệt', 'đã duyệt'])).length;

        const approvedTopics = totalApprovedFromTopic + totalApprovedFromPool;
        const pendingTopics = totalPendingFromTopic + totalPendingFromPool;
        const rejectedTopics = rejectedTopicsFromTopic + rejectedTopicsFromPool;
        const needRevisionTopics = needRevisionTopicsFromTopic;

        // Đề tài đang thực hiện = Đã duyệt
        const inProgressTopics = approvedTopics;

        // 2. Lấy danh sách 5 đề tài chờ duyệt mới nhất (gồm cả sinh viên và giảng viên gửi lên kho)
        const [pendingListFromTopic, pendingListFromPool] = await Promise.all([
            Topic.find({
                ...topicFilter,
                status: { $regex: pendingStatusRegex }
            })
                .sort({ createdAt: -1 })
                .limit(5)
                .lean(),
            pendingPoolList
        ]);

        const pendingList = [...pendingListFromTopic, ...pendingListFromPool]
            .map(item => ({
                ...item,
                source: item.source || (item.lecturer_code ? 'LECTURER' : 'STUDENT'),
                topic_code: item.topic_code || (item._id ? `POOL-${String(item._id).slice(-6).toUpperCase()}` : 'N/A'),
                lecturer_name: item.lecturer_name || item.lecturer_code || 'Chưa xác định',
                leader_code: item.leader_code || 'N/A'
            }))
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
            .slice(0, 5);

        // 3. Thống kê số lượng đăng ký theo 6 tháng gần nhất (Cho Line Chart)
        const monthlyRegistrations = [0, 0, 0, 0, 0, 0];
        const now = new Date();
        
        const monthlyData = await Topic.aggregate([
            { $match: topicFilter },
            {
                $group: {
                    _id: { $month: "$createdAt" },
                    count: { $sum: 1 }
                }
            }
        ]);

        const monthLabels = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthNum = d.getMonth() + 1;
            monthLabels.push(`Tháng ${monthNum}`);

            const found = monthlyData.find(m => m._id === monthNum);
            monthlyRegistrations[5 - i] = found ? found.count : 0;
        }

        return res.status(200).json({
            success: true,
            kpi: {
                totalStudents,
                totalLecturers,
                totalTopics,
                approvedTopics,
                pendingTopics,
                rejectedTopics,
                needRevisionTopics,
                inProgressTopics,
                approvedBySource: {
                    lecturer: approvedTopicsFromPool,
                    student: approvedTopicsFromTopic
                },
                pendingBySource: {
                    lecturer: pendingTopicsFromPool,
                    student: pendingTopicsFromTopic
                }
            },
            chart: {
                monthLabels,
                monthlyRegistrations
            },
            pendingTopicsList: pendingList
        });

    } catch (error) {
        console.error("Lỗi getAdminDashboardStats:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Lỗi máy chủ nội bộ khi lấy dữ liệu Dashboard Admin." 
        });
    }
};

/**
 * ==========================================
 * 2. API DASHBOARD DÀNH CHO GIẢNG VIÊN
 * ==========================================
 * @desc    Lấy toàn bộ dữ liệu thống kê Dashboard cho Giảng viên
 * @route   GET /api/dashboard/lecturer
 * @access  Private (Chỉ LECTURER)
 */
exports.getLecturerDashboard = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ success: false, message: "Chưa xác thực người dùng" });
        }

        console.log("\n================ [DEBUG DASHBOARD LECTURER] ================");
        console.log("1. User đăng nhập (req.user):", req.user);

        // Lấy thông tin ID và Mã từ req.user
        const rawLecturerId = req.user._id || req.user.id || req.user.user_id || req.user.userId;
        const lecturerCode = req.user.user_code || req.user.userCode || req.user.code || req.user.username || req.user.email;
        const now = new Date();

        // 1. TÁCH BIỆT DANH SÁCH OBJECT ID HỢP LỆ
        const validObjectIds = [];
        if (rawLecturerId) {
            if (mongoose.Types.ObjectId.isValid(rawLecturerId)) {
                validObjectIds.push(new mongoose.Types.ObjectId(rawLecturerId));
            } else {
                validObjectIds.push(rawLecturerId);
            }
        }

        // 2. XÂY DỰNG ĐIỀU KIỆN LỌC CHÍNH XÁC THEO KIỂU DỮ LIỆU
        const lecturerConditions = [];

        if (validObjectIds.length > 0) {
            lecturerConditions.push(
                { lecturer: { $in: validObjectIds } },
                { lecturerId: { $in: validObjectIds } },
                { lecturer_id: { $in: validObjectIds } },
                { createdBy: { $in: validObjectIds } },
                { instructor: { $in: validObjectIds } },
                { advisor: { $in: validObjectIds } },
                { teacher: { $in: validObjectIds } },
                { teacher_id: { $in: validObjectIds } }
            );
        }

        if (lecturerCode) {
            const codeRegex = new RegExp(`^${String(lecturerCode).trim()}$`, 'i');
            lecturerConditions.push(
                { lecturer_code: codeRegex },
                { lecturerCode: codeRegex },
                { instructor_code: codeRegex },
                { advisor_code: codeRegex },
                { teacher_code: codeRegex },
                { lecturer_name: codeRegex }
            );
        }

        const lecturerFilter = lecturerConditions.length > 0 ? { $or: lecturerConditions } : { _id: null };

        const sampleTopic = await Topic.findOne(lecturerFilter).lean() || await Topic.findOne().lean();
        console.log("2. Sample Topic tìm thấy:", sampleTopic);
        console.log("===================================================\n");

        const excludeCancelledStatus = {
            status: { $not: { $regex: /^(cancelled|rejected|da_huy|bi_tu_choi|đã hủy|bị từ chối|3|4)$/i } }
        };

        // TRUY VẤN SONG SONG BẰNG PROMISE.ALL
        const [
            dbUserInfo,
            approvedTopics,
            pendingTopics,
            revisionTopics,
            assignedGroups,
            unreadNotifications,
            categoryStats,
            recentTopics,
            upcomingSubmissions,
            upcomingSchedules,
            activeTopicsForProgress
        ] = await Promise.all([
            validObjectIds.length > 0 
                ? User.findById(validObjectIds[0]).select('fullName full_name fullname lecturer_name name username user_code').lean().catch(() => null)
                : Promise.resolve(null),

            Topic.countDocuments({
                $and: [
                    lecturerFilter,
                    { status: { $regex: /^(approved|da_duyet|đã duyệt|đã phê duyệt|1)$/i } }
                ]
            }).catch(err => { console.error("Lỗi đếm approvedTopics:", err.message); return 0; }),

            Topic.countDocuments({
                $and: [
                    lecturerFilter,
                    { status: { $regex: /^(pending|cho_duyet|chờ duyệt|0)$/i } }
                ]
            }).catch(err => { console.error("Lỗi đếm pendingTopics:", err.message); return 0; }),

            Topic.countDocuments({
                $and: [
                    lecturerFilter,
                    { status: { $regex: /^(need_revision|revision|yeu_cau_sua|yêu cầu sửa|2)$/i } }
                ]
            }).catch(err => { console.error("Lỗi đếm revisionTopics:", err.message); return 0; }),

            Topic.countDocuments({
                $and: [
                    lecturerFilter,
                    excludeCancelledStatus
                ]
            }).catch(err => { console.error("Lỗi đếm assignedGroups:", err.message); return 0; }),

            Notification.countDocuments({
                status: 'published',
                is_read: false,
                $or: [
                    { recipient_code: lecturerCode },
                    { recipient_code: null, target: { $in: ['all', 'lecturers'] } }
                ]
            }).catch(() => 0),

            Topic.aggregate([
                { $match: lecturerFilter },
                { $group: { _id: "$category", count: { $sum: 1 } } }
            ]).catch(() => []),

            Topic.find(lecturerFilter)
                .sort({ createdAt: -1 })
                .limit(5)
                .lean()
                .catch(() => []),

            Submission.find({
                $and: [
                    lecturerFilter,
                    { $or: [{ due_date: { $gte: now } }, { dueDate: { $gte: now } }] }
                ]
            })
                .sort({ due_date: 1, dueDate: 1 })
                .limit(5)
                .lean()
                .catch(() => []),

            MeetingModel.find({
                $and: [
                    lecturerFilter,
                    {
                        $or: [
                            { meeting_date: { $gte: now } },
                            { meetingDate: { $gte: now } },
                            { date: { $gte: now } },
                            { time: { $gte: now } },
                            { start_time: { $gte: now } },
                            { meeting_time: { $gte: now } }
                        ]
                    },
                    { status: { $ne: "CANCELLED" } }
                ]
            })
                .sort({ meeting_date: 1, date: 1, time: 1 })
                .limit(5)
                .lean()
                .catch(() => []),

            Topic.find({
                $and: [
                    lecturerFilter,
                    excludeCancelledStatus
                ]
            })
                .lean()
                .catch(() => [])
        ]);

        // CHUẨN HÓA DỮ LIỆU BIỂU ĐỒ CỘT
        const completedData = [0, 0, 0, 0];
        const onTimeData = [0, 0, 0, 0];
        const inProgressData = [0, 0, 0, 0];
        const lateData = [0, 0, 0, 0];

        (activeTopicsForProgress || []).forEach(topic => {
            const mStr = String(
                topic.milestone || topic.milestone_step || topic.current_milestone || topic.currentMilestone || topic.step || "1"
            );

            let mIndex = 0;
            if (mStr.includes("2") || mStr === "2") mIndex = 1;
            else if (mStr.includes("3") || mStr === "3") mIndex = 2;
            else if (mStr.includes("4") || mStr.includes("5") || mStr >= "4") mIndex = 3;

            const progStatus = String(
                topic.progress_status || topic.progressStatus || topic.progress || topic.milestone_status || topic.status || ""
            ).toLowerCase();

            const dueDateValue = topic.due_date || topic.dueDate || topic.deadline || new Date(Date.now() + 86400000 * 7);
            const dueDate = new Date(dueDateValue);
            const isOverdue = now > dueDate;

            if (progStatus.includes("hoan_thanh") || progStatus.includes("completed") || progStatus.includes("hoàn thành") || progStatus.includes("đã nộp")) {
                completedData[mIndex]++;
            } else if (progStatus.includes("tre") || progStatus.includes("trễ") || progStatus.includes("late") || progStatus.includes("overdue") || (isOverdue && !progStatus.includes("approved"))) {
                lateData[mIndex]++;
            } else if (progStatus.includes("dang") || progStatus.includes("đang") || progStatus.includes("in_progress") || progStatus.includes("doing")) {
                inProgressData[mIndex]++;
            } else {
                onTimeData[mIndex]++;
            }
        });

        const milestoneProgress = {
            labels: ["Mốc 1", "Mốc 2", "Mốc 3", "Mốc 4"],
            series: [
                { name: "Hoàn thành", data: completedData },
                { name: "Đúng hạn", data: onTimeData },
                { name: "Đang thực hiện", data: inProgressData },
                { name: "Trễ hạn", data: lateData }
            ]
        };

        const stats = {
            assignedGroups: assignedGroups || 0,
            approvedTopics: approvedTopics || 0,
            pendingTopics: pendingTopics || 0,
            revisionTopics: revisionTopics || 0,
            totalTopics: (approvedTopics || 0) + (pendingTopics || 0) + (revisionTopics || 0)
        };

        let topicDistribution = [];
        if (stats.totalTopics > 0 && Array.isArray(categoryStats) && categoryStats.length > 0) {
            topicDistribution = categoryStats.map(item => ({
                field: item._id || "Chưa phân loại",
                count: item.count || 0,
                percentage: Number(((item.count / stats.totalTopics) * 100).toFixed(1))
            }));
        }

        const recentRegistrations = (recentTopics || []).map(topic => {
            let badgeClass = 'badge-warning';
            let statusText = 'Chờ phê duyệt';

            const statusUpper = String(topic.status || '').toUpperCase();
            if (statusUpper.includes('APPROVED') || statusUpper.includes('DUYET')) {
                badgeClass = 'badge-success';
                statusText = 'Đã phê duyệt';
            } else if (statusUpper.includes('REVISION') || statusUpper.includes('SUA')) {
                badgeClass = 'badge-danger';
                statusText = 'Yêu cầu chỉnh sửa';
            }

            return {
                id: topic._id,
                groupCode: topic.topic_code || topic.group_code || topic.groupCode || "Chưa xếp",
                topicTitle: topic.title || "Chưa có tiêu đề",
                leaderInfo: topic.leader_code ? `SV: ${topic.leader_code}` : (topic.student_code ? `SV: ${topic.student_code}` : "Chưa đăng ký"),
                createdDate: topic.createdAt ? new Date(topic.createdAt).toLocaleDateString('vi-VN') : "N/A",
                statusText,
                badgeClass
            };
        });

        const formattedSubmissions = (upcomingSubmissions || []).map(sub => {
            const dueDateValue = sub.due_date || sub.dueDate || now;
            const dueDate = new Date(dueDateValue);
            const diffDays = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

            return {
                id: sub._id,
                title: sub.title || "Nộp báo cáo tiến độ",
                subtitle: `Mốc ${sub.milestone_step || 1}`,
                dueDate: dueDate.toLocaleDateString('vi-VN'),
                rawDate: dueDate,
                daysLeft: diffDays > 0 ? `Còn ${diffDays} ngày` : "Hôm nay",
                colorClass: diffDays <= 2 ? "red" : (diffDays <= 5 ? "orange" : "blue"),
                iconClass: "fa-file-arrow-up",
                type: "SUBMISSION"
            };
        });

        const formattedSchedules = (upcomingSchedules || []).map(sch => {
            const meetingDateValue = sch.meeting_date || sch.meetingDate || sch.date || sch.time || sch.start_time || sch.meeting_time || now;
            const meetingDate = new Date(meetingDateValue);
            const diffDays = Math.ceil((meetingDate - now) / (1000 * 60 * 60 * 24));

            return {
                id: sch._id,
                title: `Lịch họp: ${sch.title || sch.content || sch.purpose || "Gặp mặt nhóm"}`,
                subtitle: sch.location ? `Địa điểm: ${sch.location}` : (sch.room ? `Phòng: ${sch.room}` : "Họp trực tuyến"),
                dueDate: meetingDate.toLocaleDateString('vi-VN'),
                rawDate: meetingDate,
                daysLeft: diffDays > 0 ? `Còn ${diffDays} ngày` : (diffDays === 0 ? "Hôm nay" : "Đã qua"),
                colorClass: diffDays <= 2 ? "red" : "blue",
                iconClass: "fa-users",
                type: "MEETING"
            };
        });

        const upcomingDeadlines = [...formattedSubmissions, ...formattedSchedules]
            .sort((a, b) => a.rawDate - b.rawDate)
            .slice(0, 5)
            .map(({ rawDate, ...rest }) => rest);

        const userDb = dbUserInfo || {};
        const jwtUser = req.user.user || req.user.data || req.user;

        const currentFullName = userDb.fullName 
            || userDb.full_name 
            || userDb.fullname 
            || userDb.lecturer_name 
            || userDb.name 
            || userDb.username
            || jwtUser.fullName 
            || jwtUser.full_name 
            || jwtUser.fullname 
            || jwtUser.lecturer_name 
            || jwtUser.lecturerName 
            || jwtUser.fullNameLecturer 
            || jwtUser.name 
            || jwtUser.user_name 
            || jwtUser.username 
            || "Giảng viên";

        const currentCode = userDb.user_code || lecturerCode || "GV";

        return res.status(200).json({
            success: true,
            data: {
                user: {
                    fullName: currentFullName,
                    userCode: currentCode,
                    unreadNotifications
                },
                stats,
                milestoneProgress,
                topicDistribution,
                recentRegistrations,
                upcomingDeadlines
            }
        });

    } catch (error) {
        console.error("Lỗi getLecturerDashboard Fatal:", error);
        return res.status(500).json({
            success: false,
            message: "Lỗi máy chủ khi tải dữ liệu Dashboard giảng viên",
            error: error.message
        });
    }
};