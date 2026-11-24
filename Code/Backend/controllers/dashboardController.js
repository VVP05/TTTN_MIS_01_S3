const mongoose = require('mongoose');
const User = require('../models/User');
const Topic = require('../models/Topic');
const LecturerTopic = require('../models/LecturerTopic');
const Submission = require('../models/Submission');
const Notification = require('../models/Notification');
const Semester = require('../models/Semester');
const Milestone = require('../models/Milestone');
const { getTopicMilestoneProgress, getMilestoneProgressSeries } = require('../services/milestoneProgress');
const { getLecturerGroupCount } = require('../services/lecturerQuota');
const getSemesterRegistrationRange = require('../utils/semesterRegistrationRange');

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

const getVietnamMonthParts = date => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
        month: '2-digit'
    }).formatToParts(date);
    return {
        year: Number(parts.find(part => part.type === 'year').value),
        month: Number(parts.find(part => part.type === 'month').value)
    };
};

exports.getAdminDashboardStats = async (req, res) => {
    try {
        const semesterId = typeof req.query.semester === 'string' ? req.query.semester : '';
        let selectedSemester = null;
        let registrationRange = null;
        const topicFilter = {};

        if (semesterId && semesterId !== 'all') {
            if (!mongoose.Types.ObjectId.isValid(semesterId)) {
                return res.status(400).json({ success: false, message: 'Học kỳ được chọn không hợp lệ.' });
            }

            selectedSemester = await Semester.findById(semesterId).lean();
            if (!selectedSemester) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy học kỳ được chọn.' });
            }

            registrationRange = getSemesterRegistrationRange(selectedSemester);
            if (!registrationRange) {
                return res.status(400).json({
                    success: false,
                    message: 'Học kỳ này chưa được cấu hình thời hạn đăng ký hợp lệ.'
                });
            }
            topicFilter.createdAt = { $gte: registrationRange.start, $lte: registrationRange.end };
        }

        const pendingStatusRegex = /^(pending|cho_duyet|cho phe duyet|chờ duyệt|chờ phe duyet|0)$/i;
        const approvedStatusRegex = /^(approved|da_duyet|da phe duyet|đã duyệt|đã phê duyệt|registered|1)$/i;
        const rejectedStatusRegex = /^(rejected|tu_choi|từ chối|3)$/i;
        const revisionStatusRegex = /^(need_revision|revision|yeu_cau_sua|yêu cầu sửa|2)$/i;

        // 1. Thống kê KPI cơ bản
        const includeGlobalPool = !registrationRange;
        const [
            totalStudents,
            totalLecturers,
            totalTopics,
            approvedTopicsFromTopic,
            pendingTopicsFromTopic,
            rejectedTopicsFromTopic,
            needRevisionTopicsFromTopic,
            approvedTopicsFromPool,
            rejectedTopicsFromPool,
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
            includeGlobalPool ? LecturerTopic.countDocuments({
                $or: [
                    { status: { $regex: approvedStatusRegex } },
                    { status: 'PENDING' }
                ]
            }) : 0,
            includeGlobalPool ? LecturerTopic.countDocuments({ status: { $regex: rejectedStatusRegex } }) : 0,
            Topic.find(topicFilter).lean(),
            includeGlobalPool ? LecturerTopic.find({}).lean() : []
        ]);

        const totalPendingFromTopic = allTopics.filter(item => matchesStatus(item.status, [pendingStatusRegex, 'pending', 'chờ duyệt', 'cho duyet', 'cho_duyet', 'chờ phe duyet', 'cho phe duyet'])).length;
        const totalApprovedFromTopic = allTopics.filter(item => matchesStatus(item.status, [approvedStatusRegex, 'approved', 'registered', 'da phe duyet', 'đã phê duyệt', 'đã duyệt'])).length;
        const totalApprovedFromPool = allPoolTopics.filter(item =>
            matchesStatus(item.status, [approvedStatusRegex, 'approved', 'registered', 'da phe duyet', 'đã phê duyệt', 'đã duyệt']) || item.status === 'PENDING'
        ).length;
        const approvedTopicsBySource = source => allTopics.filter(item =>
            String(item.source || 'STUDENT').trim().toUpperCase() === source &&
            matchesStatus(item.status, [approvedStatusRegex])
        ).length;

        const approvedTopics = totalApprovedFromTopic + totalApprovedFromPool;
        const pendingTopics = totalPendingFromTopic;
        const rejectedTopics = rejectedTopicsFromTopic + rejectedTopicsFromPool;
        const needRevisionTopics = needRevisionTopicsFromTopic;

        // Đề tài đang thực hiện = Đã duyệt
        const inProgressTopics = approvedTopics;

        // 2. Lấy danh sách đề tài nhóm đang chờ giảng viên xử lý.
        const pendingTopicsList = await Topic.find({
            ...topicFilter,
            status: { $regex: pendingStatusRegex }
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();
        const pendingUserCodes = [...new Set(pendingTopicsList
            .flatMap(item => [item.leader_code, item.lecturer_code])
            .map(code => String(code || '').trim())
            .filter(Boolean))];
        const pendingUsers = pendingUserCodes.length
            ? await User.find({ user_code: { $in: pendingUserCodes } }).select('user_code full_name').lean()
            : [];
        const pendingUserNames = new Map(pendingUsers.map(user => [
            String(user.user_code || '').trim().toUpperCase(),
            user.full_name
        ]));
        const getPendingUserName = code => pendingUserNames.get(String(code || '').trim().toUpperCase());

        const pendingList = pendingTopicsList.map(item => ({
                ...item,
                topic_code: item.topic_code || (item._id ? `DT-${String(item._id).slice(-6).toUpperCase()}` : 'N/A'),
                leader_name: getPendingUserName(item.leader_code) || item.leader_name || '',
                leader_code: item.leader_code || 'N/A',
                lecturer_name: getPendingUserName(item.lecturer_code) || item.lecturer_name || item.lecturer_code || 'Chưa xác định'
            }))
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

        const monthlyData = await Topic.aggregate([
            { $match: topicFilter },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m',
                            date: '$createdAt',
                            timezone: 'Asia/Ho_Chi_Minh'
                        }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        const now = new Date();
        const lastMonth = getVietnamMonthParts(now);
        const firstMonth = registrationRange
            ? getVietnamMonthParts(registrationRange.start)
            : { year: lastMonth.year, month: lastMonth.month - 5 };
        const firstMonthIndex = firstMonth.year * 12 + firstMonth.month - 1;
        const registrationEndMonth = registrationRange
            ? getVietnamMonthParts(registrationRange.end)
            : lastMonth;
        const lastMonthIndex = registrationEndMonth.year * 12 + registrationEndMonth.month - 1;
        const chartEndIndex = registrationRange
            ? Math.min(lastMonthIndex, firstMonthIndex + 5)
            : lastMonthIndex;
        const chartStartYear = Math.floor(firstMonthIndex / 12);
        const chartEndYear = Math.floor(chartEndIndex / 12);
        const monthlyCountByKey = new Map(monthlyData.map(item => [item._id, item.count]));
        const monthLabels = [];
        const monthlyRegistrations = [];
        for (let monthIndex = firstMonthIndex; monthIndex <= chartEndIndex; monthIndex++) {
            const year = Math.floor(monthIndex / 12);
            const month = monthIndex % 12 + 1;
            const key = `${year}-${String(month).padStart(2, '0')}`;
            monthLabels.push(`Tháng ${month}${chartStartYear !== chartEndYear ? `/${year}` : ''}`);
            monthlyRegistrations.push(monthlyCountByKey.get(key) || 0);
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
                    lecturer: approvedTopicsBySource('LECTURER'),
                    student: approvedTopicsBySource('STUDENT')
                },
                pendingBySource: {
                    lecturer: 0,
                    student: pendingTopicsFromTopic
                }
            },
            chart: {
                monthLabels,
                monthlyRegistrations
            },
            pendingTopicsList: pendingList,
            selectedSemester: selectedSemester
                ? { _id: selectedSemester._id, name: selectedSemester.name }
                : null
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

            getLecturerGroupCount(lecturerCode),

            Notification.countDocuments({
                status: 'published',
                is_read: false,
                $or: [
                    { recipient_code: lecturerCode },
                    { recipient_code: null, target: { $in: ['all', 'lecturers'] } }
                ],
                type: { $in: ['SYSTEM', 'FACULTY', 'LECTURER'] }
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
                    { status: { $regex: /^(approved|da_duyet|đã duyệt|đã phê duyệt|1)$/i } },
                    { leader_code: { $exists: true, $nin: [null, ''] } }
                ]
            })
                .lean()
                .catch(() => [])
        ]);

        const progressMilestones = await Milestone.find({
            lecturerCode,
            topicId: null
        }).sort({ step: 1 }).lean();
        const progressSubmissions = await Submission.find({
            topic_id: { $in: (activeTopicsForProgress || []).map(topic => topic._id) },
            is_draft: { $ne: true }
        }).lean();
        const progressByTopic = getTopicMilestoneProgress(
            activeTopicsForProgress || [],
            progressMilestones,
            progressSubmissions,
            now
        );
        const milestoneProgress = getMilestoneProgressSeries(
            activeTopicsForProgress || [],
            progressByTopic,
            progressMilestones.map(milestone => milestone.step)
        );
        const lateGroups = [...progressByTopic.values()].filter(progress => progress.is_late).length;

        const stats = {
            assignedGroups: assignedGroups || 0,
            approvedTopics: approvedTopics || 0,
            pendingTopics: pendingTopics || 0,
            revisionTopics: revisionTopics || 0,
            lateGroups,
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

        const recentTopicList = recentTopics || [];
        const recentLeaderCodes = [...new Set(recentTopicList
            .map(topic => String(topic.leader_code || topic.student_code || '').trim())
            .filter(Boolean))];
        const recentLeaders = recentLeaderCodes.length
            ? await User.find({
                role: 'STUDENT',
                user_code: { $in: recentLeaderCodes }
            }).select('user_code full_name').lean()
            : [];
        const recentLeadersByCode = new Map(recentLeaders.map(student => [
            String(student.user_code || '').trim().toUpperCase(),
            student.full_name
        ]));

        const recentRegistrations = recentTopicList.map(topic => {
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

            const leaderCode = String(topic.leader_code || topic.student_code || '').trim();
            return {
                id: topic._id,
                groupCode: topic.topic_code || topic.group_code || topic.groupCode || "Chưa xếp",
                topicTitle: topic.title || "Chưa có tiêu đề",
                leaderInfo: leaderCode
                    ? recentLeadersByCode.get(leaderCode.toUpperCase()) || `SV: ${leaderCode}`
                    : "Chưa đăng ký",
                leaderCode,
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