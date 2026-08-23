const Topic = require('../models/Topic');
const Submission = require('../models/Submission');
const LecturerTopic = require('../models/LecturerTopic');
const User = require('../models/User');

// =========================================================================
// PHẦN 1: LOGIC DÀNH CHO SINH VIÊN
// =========================================================================

// 1. Đăng ký mới hoặc Cập nhật / Gửi lại đề tài
exports.registerTopic = async (req, res) => {
    try {
        const { leader_code, member2_code, member3_code, lecturer_code, title, description, category } = req.body;

        if (member2_code && member2_code.toUpperCase() === leader_code.toUpperCase()) {
            return res.status(400).json({ message: 'Mã thành viên 2 không được trùng với Trưởng nhóm!' });
        }
        if (member3_code && member3_code.toUpperCase() === leader_code.toUpperCase()) {
            return res.status(400).json({ message: 'Mã thành viên 3 không được trùng với Trưởng nhóm!' });
        }
        if (member2_code && member3_code && member2_code.toUpperCase() === member3_code.toUpperCase()) {
            return res.status(400).json({ message: 'Mã Thành viên 2 và Thành viên 3 không được trùng nhau!' });
        }

        let existingTopic = await Topic.findOne({ leader_code: leader_code });

        if (existingTopic) {
            if (existingTopic.status === 'APPROVED') {
                return res.status(400).json({ message: 'Đề tài đã được phê duyệt, bạn không thể chỉnh sửa nữa!' });
            }

            if (member2_code && member2_code !== existingTopic.member2_code) {
                const checkMember2 = await Topic.findOne({
                    $or: [{ leader_code: member2_code }, { member2_code: member2_code }, { member3_code: member2_code }]
                });

                if (checkMember2 && checkMember2._id.toString() !== existingTopic._id.toString()) {
                    return res.status(400).json({ message: `Sinh viên (${member2_code}) đã tham gia một đề tài khác!` });
                }
            }

            if (member3_code && member3_code !== existingTopic.member3_code) {
                const checkMember3 = await Topic.findOne({
                    $or: [{ leader_code: member3_code }, { member2_code: member3_code }, { member3_code: member3_code }]
                });

                if (checkMember3 && checkMember3._id.toString() !== existingTopic._id.toString()) {
                    return res.status(400).json({ message: `Sinh viên (${member3_code}) đã tham gia một đề tài khác!` });
                }
            }

            existingTopic.member2_code = member2_code || null;
            existingTopic.member3_code = member3_code || null;
            existingTopic.lecturer_code = lecturer_code;
            existingTopic.title = title;
            existingTopic.description = description;
            existingTopic.category = category || existingTopic.category || 'Web / Ứng dụng';
            existingTopic.status = 'PENDING';
            existingTopic.feedback = '';

            await existingTopic.save();

            return res.status(200).json({ 
                success: true,
                message: 'Cập nhật thông tin đề tài thành công! Đang chờ Giảng viên duyệt lại.',
                topic: existingTopic 
            });
        }

        const checkLeaderAsMember = await Topic.findOne({ 
            $or: [{ member2_code: leader_code }, { member3_code: leader_code }] 
        });
        if (checkLeaderAsMember) {
            return res.status(400).json({ message: `Bạn đang là Thành viên trong đề tài của Trưởng nhóm (${checkLeaderAsMember.leader_code})!` });
        }

        if (member2_code) {
            const checkMember2 = await Topic.findOne({
                $or: [{ leader_code: member2_code }, { member2_code: member2_code }, { member3_code: member2_code }]
            });
            if (checkMember2) {
                return res.status(400).json({ message: `Sinh viên (${member2_code}) đã tham gia một đề tài khác!` });
            }
        }

        if (member3_code) {
            const checkMember3 = await Topic.findOne({
                $or: [{ leader_code: member3_code }, { member2_code: member3_code }, { member3_code: member3_code }]
            });
            if (checkMember3) {
                return res.status(400).json({ message: `Sinh viên (${member3_code}) đã tham gia một đề tài khác!` });
            }
        }

        const newTopic = new Topic({
            leader_code,
            member2_code: member2_code || null,
            member3_code: member3_code || null,
            lecturer_code,
            title,
            description,
            category: category || 'Web / Ứng dụng',
            source: 'STUDENT',
            status: 'PENDING'
        });

        await newTopic.save();
        return res.status(201).json({ 
            success: true,
            message: 'Đăng ký đề tài thành công! Đang chờ duyệt.', 
            topic: newTopic 
        });

    } catch (error) {
        console.error("Lỗi đăng ký/cập nhật đề tài:", error);
        return res.status(500).json({ message: 'Lỗi máy chủ khi xử lý đề tài!' });
    }
};

// 2. Lấy đề tài của sinh viên
exports.getMyTopic = async (req, res) => {
    try {
        const userCode = req.params.user_code;

        const topic = await Topic.findOne({
            $or: [
                { leader_code: userCode },
                { member2_code: userCode },
                { member3_code: userCode }
            ]
        }).lean();

        if (!topic) {
            return res.status(404).json({ message: "Không tìm thấy đề tài nào!" });
        }

        const submissions = await Submission.find({ topic_id: topic._id }).lean();

        for (let i = 1; i <= 5; i++) {
            const sub = submissions.find(s => 
                s.milestone == i || 
                s.milestone_step == i || 
                s.milestone === `Mốc ${i}`
            );

            if (sub) {
                topic[`milestone${i}_file`] = {
                    name: sub.file_name || sub.original_name || `Bài nộp mốc ${i}`,
                    path: sub.file_path,
                    filename: sub.file_name || sub.original_name || 'file.pdf',
                    submittedAt: sub.submitted_at || sub.createdAt || new Date()
                };
            } 
            else if (topic[`milestone${i}_file`] && !topic[`milestone${i}_file`].name) {
                topic[`milestone${i}_file`] = {
                    name: `Bài nộp mốc ${i}`,
                    path: topic[`milestone${i}_file`].path || '',
                    submittedAt: topic[`milestone${i}_file`].submittedAt || topic.updatedAt || new Date()
                };
            }
        }

        return res.status(200).json(topic);
    } catch (error) {
        console.error("Lỗi khi lấy thông tin đề tài:", error);
        return res.status(500).json({ message: "Lỗi hệ thống phía Server!" });
    }
};

// 3. Cập nhật đề tài theo ID
exports.updateTopic = async (req, res) => {
    try {
        const { topic_id } = req.params;
        const { title, description, member2_code, member3_code, lecturer_code, category } = req.body;

        const topic = await Topic.findById(topic_id);
        if (!topic) {
            return res.status(404).json({ message: 'Không tìm thấy đề tài!' });
        }

        if (topic.status !== 'PENDING' && topic.status !== 'NEED_REVISION') {
            return res.status(400).json({ 
                message: 'Chỉ có thể chỉnh sửa đề tài khi đang ở trạng thái Chờ duyệt hoặc Yêu cầu sửa!' 
            });
        }

        if (member2_code && member2_code !== topic.member2_code) {
            const checkMember2 = await Topic.findOne({
                $or: [{ leader_code: member2_code }, { member2_code: member2_code }, { member3_code: member2_code }]
            });
            if (checkMember2) {
                return res.status(400).json({ message: `Sinh viên (${member2_code}) đã tham gia một đề tài khác!` });
            }
        }

        if (member3_code && member3_code !== topic.member3_code) {
            const checkMember3 = await Topic.findOne({
                $or: [{ leader_code: member3_code }, { member2_code: member3_code }, { member3_code: member3_code }]
            });
            if (checkMember3) {
                return res.status(400).json({ message: `Sinh viên (${member3_code}) đã tham gia một đề tài khác!` });
            }
        }

        topic.title = title || topic.title;
        topic.description = description || topic.description;
        topic.category = category || topic.category;
        topic.member2_code = member2_code !== undefined ? (member2_code || null) : topic.member2_code;
        topic.member3_code = member3_code !== undefined ? (member3_code || null) : topic.member3_code;
        topic.lecturer_code = lecturer_code || topic.lecturer_code;
        topic.status = 'PENDING';
        topic.feedback = '';

        await topic.save();

        res.json({ success: true, message: 'Cập nhật thông tin đề tài thành công!', topic });
    } catch (error) {
        console.error("Lỗi khi cập nhật đề tài:", error);
        res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật đề tài!' });
    }
};

// 4. Hủy đăng ký đề tài theo Mã sinh viên
exports.cancelTopic = async (req, res) => {
    try {
        const userCode = req.params.user_code || req.params.topic_id;

        const topic = await Topic.findOne({
            $or: [
                { _id: userCode.match(/^[0-9a-fA-F]{24}$/) ? userCode : null },
                { leader_code: userCode },
                { member2_code: userCode },
                { member3_code: userCode }
            ]
        });

        if (!topic) {
            return res.status(404).json({ message: "Không tìm thấy đề tài để hủy!" });
        }

        if (topic.status === 'APPROVED') {
            return res.status(400).json({ message: "Đề tài đã được phê duyệt, không thể hủy!" });
        }

        await Topic.findByIdAndDelete(topic._id);

        return res.status(200).json({ success: true, message: "Đã hủy đăng ký đề tài thành công!" });
    } catch (error) {
        console.error("Lỗi khi hủy đề tài:", error);
        return res.status(500).json({ message: "Lỗi máy chủ khi hủy đề tài!" });
    }
};

// 5. Nộp báo cáo Mốc tiến độ
exports.uploadMilestone = async (req, res) => {
    try {
        const { topic_id } = req.params;
        const mIndex = req.params.mIndex || req.body.milestoneIndex || req.body.milestone;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: "Vui lòng chọn file tải lên!" });
        }

        if (!mIndex) {
            return res.status(400).json({ success: false, message: "Thiếu thông tin cột mốc cần nộp!" });
        }

        const fileInfo = {
            name: file.originalname,
            path: file.path,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            submittedAt: new Date()
        };

        const updateData = {};
        updateData[`milestone${mIndex}_file`] = fileInfo;

        const updatedTopic = await Topic.findByIdAndUpdate(
            topic_id,
            { $set: updateData },
            { new: true }
        );

        if (!updatedTopic) {
            return res.status(404).json({ success: false, message: "Không tìm thấy đề tài trong hệ thống!" });
        }

        await Submission.findOneAndUpdate(
            { topic_id: topic_id, milestone: mIndex },
            {
                topic_id: topic_id,
                milestone: mIndex,
                file_name: file.originalname,
                file_path: file.path,
                submitted_at: new Date()
            },
            { upsert: true, new: true }
        );

        return res.status(200).json({
            success: true,
            message: `Đã nộp thành công báo cáo Mốc ${mIndex}!`,
            data: updatedTopic
        });

    } catch (error) {
        console.error("Lỗi upload milestone:", error);
        return res.status(500).json({ success: false, message: "Lỗi Server: " + error.message });
    }
};

// 6. Lấy danh sách đề tài gợi ý trong Kho (Cho SV & GV xem)
exports.getLecturerPoolTopics = async (req, res) => {
    try {
        const pool = await LecturerTopic.find({ is_active: true }).sort({ createdAt: -1 });
        return res.status(200).json({ success: true, data: pool });
    } catch (error) {
        console.error("Lỗi lấy kho đề tài giảng viên:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// Admin: lấy toàn bộ nhóm đề tài thật từ hệ thống
exports.getAllTopicsForAdmin = async (req, res) => {
    try {
        const topics = await Topic.find({}).sort({ createdAt: -1 }).lean();

        const memberCodes = topics.flatMap(topic => [
            topic.leader_code,
            topic.member2_code,
            topic.member3_code
        ].filter(Boolean));

        const users = await User.find({ user_code: { $in: memberCodes } }).select('user_code full_name role');
        const userMap = new Map(users.map(user => [user.user_code, user]));

        const lecturerCodes = topics.map(topic => topic.lecturer_code).filter(Boolean);
        const lecturers = await User.find({
            role: 'LECTURER',
            user_code: { $in: lecturerCodes }
        }).select('user_code full_name');
        const lecturerMap = new Map(lecturers.map(lecturer => [lecturer.user_code, lecturer]));

        const data = topics.map(topic => {
            const members = [
                { code: topic.leader_code, isLeader: true },
                { code: topic.member2_code, isLeader: false },
                { code: topic.member3_code, isLeader: false }
            ].filter(item => item.code);

            const students = members.map(member => {
                const user = userMap.get(member.code);
                return {
                    name: user ? user.full_name : member.code,
                    code: member.code,
                    isLeader: member.isLeader
                };
            });

            return {
                _id: topic._id,
                id: topic.topic_code || topic._id,
                topicTitle: topic.title,
                lecturerHD: topic.lecturer_code
                    ? (lecturerMap.get(topic.lecturer_code)?.full_name || topic.lecturer_code)
                    : null,
                lecturer_code: topic.lecturer_code || null,
                students,
                status: topic.lecturer_code ? 'assigned' : 'unassigned'
            };
        });

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Lỗi lấy danh sách nhóm admin:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.assignLecturerToTopic = async (req, res) => {
    try {
        const { topic_id } = req.params;
        const { lecturer_code } = req.body;

        if (!lecturer_code) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn giảng viên hướng dẫn!' });
        }

        const lecturer = await User.findOne({ user_code: lecturer_code, role: 'LECTURER' });
        if (!lecturer) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên phù hợp!' });
        }

        const topic = await Topic.findById(topic_id);
        if (!topic) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm / đề tài!' });
        }

        topic.lecturer_code = lecturer_code;
        topic.status = topic.status === 'PENDING' ? 'PENDING' : topic.status;
        await topic.save();

        return res.status(200).json({
            success: true,
            message: `Đã phân công giảng viên ${lecturer.full_name} cho đề tài thành công!`,
            data: topic
        });
    } catch (error) {
        console.error('Lỗi phân công giảng viên cho đề tài:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 7. Sinh viên đăng ký đề tài từ Kho đề tài (Bổ sung lưu pool_topic_id)
exports.registerPoolTopic = async (req, res) => {
    try {
        const { pool_topic_id, leader_code, member2_code, member3_code } = req.body;

        const poolTopic = await LecturerTopic.findById(pool_topic_id);
        if (!poolTopic) {
            return res.status(404).json({ message: "Không tìm thấy đề tài mẫu trong kho!" });
        }

        const newTopic = new Topic({
            leader_code,
            member2_code: member2_code || null,
            member3_code: member3_code || null,
            lecturer_code: poolTopic.lecturer_code,
            title: poolTopic.title,
            description: poolTopic.description,
            category: poolTopic.category || 'Web / Ứng dụng',
            source: 'LECTURER',
            pool_topic_id: pool_topic_id, // Bổ sung ID liên kết kho
            status: 'PENDING'
        });

        await newTopic.save();
        return res.status(201).json({
            success: true,
            message: "Đã đăng ký đề tài thành công! Đang chờ Giảng viên phê duyệt.",
            topic: newTopic
        });
    } catch (error) {
        console.error("Lỗi đăng ký đề tài từ Kho:", error);
        return res.status(500).json({ message: "Lỗi máy chủ khi chọn đề tài từ Kho!" });
    }
};

// =========================================================================
// PHẦN 2: LOGIC DÀNH CHO GIẢNG VIÊN (QUẢN LÝ & DUYỆT ĐỀ TÀI)
// =========================================================================

// 1. Lấy danh sách đề tài sinh viên nộp + Kho đề tài gợi ý của giảng viên (Bổ sung gán trạng thái Đã đăng ký)
exports.getLecturerTopics = async (req, res) => {
    try {
        const { lecturer_code } = req.params;
        
        // Lấy đề tài Sinh viên đăng ký
        const topics = await Topic.find({ lecturer_code }).sort({ createdAt: -1 }).lean();

        // Lấy đề tài Giảng viên đã tạo trong Kho (lecturer_topics)
        const lecturerPool = await LecturerTopic.find({ lecturer_code }).sort({ createdAt: -1 }).lean();

        const topicIds = topics.map(t => t._id);
        const submissions = await Submission.find({ 
            topic_id: { $in: topicIds } 
        }).lean();

        const enrichedTopics = topics.map(topic => {
            const topicSubmissions = submissions.filter(
                s => s.topic_id && s.topic_id.toString() === topic._id.toString()
            );

            let completedMilestones = 0;

            for (let i = 1; i <= 5; i++) {
                const sub = topicSubmissions.find(s => 
                    s.milestone == i || 
                    s.milestone_step == i || 
                    s.milestone === `Mốc ${i}`
                );

                const directFile = topic[`milestone${i}_file`];

                if (sub || (directFile && (directFile.name || directFile.path))) {
                    completedMilestones++;
                }
            }

            const progressPercentage = completedMilestones * 20;
            const isOnSchedule = completedMilestones > 0;

            return {
                ...topic,
                progress_percentage: progressPercentage,
                milestone_progress: progressPercentage,
                completed_milestones: completedMilestones,
                progress_status: isOnSchedule ? 'Đúng tiến độ' : 'Chậm tiến độ',
                status_text: isOnSchedule ? 'Đang đúng tiến độ' : 'Chậm tiến độ',
                is_late: !isOnSchedule
            };
        });

        const pendingTopics = enrichedTopics.filter(t => t.status === 'PENDING' || t.status === 'NEED_REVISION');
        const approvedTopics = enrichedTopics.filter(t => t.status === 'APPROVED');

        // BỔ SUNG: Tự động đánh dấu trạng thái 'REGISTERED' cho danh sách trong Kho nếu đã được Duyệt
        const approvedTitles = approvedTopics.map(t => (t.title || "").trim().toLowerCase());
        const approvedPoolIds = approvedTopics.map(t => t.pool_topic_id ? t.pool_topic_id.toString() : null).filter(Boolean);

        const enrichedLecturerPool = lecturerPool.map(poolItem => {
            const itemTitle = (poolItem.title || "").trim().toLowerCase();
            const itemId = poolItem._id.toString();

            const isApproved = approvedTitles.includes(itemTitle) || 
                               approvedPoolIds.includes(itemId) || 
                               poolItem.status === 'REGISTERED' || 
                               poolItem.is_registered === true;

            return {
                ...poolItem,
                status: isApproved ? 'REGISTERED' : (poolItem.status || 'OPEN'),
                is_registered: isApproved
            };
        });

        res.json({
            success: true,
            data: {
                pending: pendingTopics,
                approved: approvedTopics,
                myPool: enrichedLecturerPool, // Trả về kho đề tài đã gán trạng thái đối soát
                all: enrichedTopics
            }
        });
    } catch (error) {
        console.error("Lỗi lấy danh sách đề tài:", error);
        res.status(500).json({ message: 'Lỗi lấy danh sách đề tài!' });
    }
};

// 2. Tạo đề tài trực tiếp vào bảng Topic
exports.createLecturerTopic = async (req, res) => {
    try {
        const { lecturer_code, title, category, description, requirements, max_groups } = req.body;

        const newTopic = new Topic({
            lecturer_code,
            title,
            category: category || 'Web / Ứng dụng',
            description,
            requirements: requirements || '',
            max_groups: max_groups || 1,
            source: 'LECTURER',
            status: 'OPEN'
        });

        await newTopic.save();

        res.status(201).json({
            success: true,
            message: 'Đã thêm đề tài mới vào kho hướng dẫn!',
            topic: newTopic
        });
    } catch (error) {
        console.error("Lỗi khi GV thêm đề tài kho:", error);
        res.status(500).json({ message: 'Lỗi khi tạo đề tài vào kho!' });
    }
};

// 3. Giảng viên thêm đề tài gợi ý vào Collection 'lecturer_topics'
exports.createLecturerPoolTopic = async (req, res) => {
    try {
        const { lecturer_code, title, description, category, max_groups } = req.body;

        const newTopic = new LecturerTopic({
            lecturer_code,
            title,
            description,
            category: category || 'Web / Ứng dụng',
            max_groups: Number(max_groups) || 1,
            status: 'PENDING',
            is_active: false,
            feedback: ''
        });

        await newTopic.save();

        return res.status(201).json({
            success: true,
            message: "Đã lưu đề tài vào Kho gợi ý thành công! Đang chờ xét duyệt Admin.",
            data: newTopic
        });
    } catch (error) {
        console.error("Lỗi thêm đề tài vào kho lecturer_topics:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 4. Admin lấy danh sách đề tài Giảng viên đã đề xuất vào kho để duyệt
exports.getAdminLecturerPoolTopics = async (req, res) => {
    try {
        const poolTopics = await LecturerTopic.find({}).sort({ createdAt: -1 }).lean();

        const lecturerCodes = poolTopics.map(item => item.lecturer_code).filter(Boolean);
        const lecturers = await User.find({ role: 'LECTURER', user_code: { $in: lecturerCodes } })
            .select('user_code full_name')
            .lean();

        const lecturerMap = new Map(lecturers.map(l => [l.user_code, l.full_name]));

        const enrichedTopics = poolTopics.map(item => ({
            ...item,
            lecturer_name: lecturerMap.get(item.lecturer_code) || item.lecturer_code || 'Chưa xác định'
        }));

        return res.status(200).json({ success: true, data: enrichedTopics });
    } catch (error) {
        console.error('Lỗi lấy danh sách đề tài kho để admin duyệt:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách đề tài kho!' });
    }
};

// 5. Admin phê duyệt / từ chối đề tài Giảng viên gửi lên Kho
exports.updateLecturerPoolTopicStatus = async (req, res) => {
    try {
        const { pool_topic_id } = req.params;
        const { status, feedback } = req.body;
        const normalizedStatus = String(status || '').toUpperCase();

        const validStatuses = ['PENDING', 'APPROVED', 'REJECTED'];
        if (!validStatuses.includes(normalizedStatus)) {
            return res.status(400).json({ success: false, message: 'Trạng thái không hợp lệ. Vui lòng gửi PENDING / APPROVED / REJECTED.' });
        }

        const updateData = {
            status: normalizedStatus,
            feedback: feedback || ''
        };

        if (normalizedStatus === 'APPROVED') {
            updateData.is_active = true;
        } else {
            updateData.is_active = false;
        }

        const poolTopic = await LecturerTopic.findByIdAndUpdate(
            pool_topic_id,
            updateData,
            { new: true }
        ).lean();

        if (!poolTopic) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đề tài trong kho để cập nhật!' });
        }

        const message = normalizedStatus === 'APPROVED'
            ? 'Đã phê duyệt đề tài và mở trạng thái hiển thị.'
            : normalizedStatus === 'REJECTED'
            ? 'Đã từ chối đề tài.'
            : 'Đã cập nhật trạng thái đề tài.';

        return res.status(200).json({ success: true, message, data: poolTopic });
    } catch (error) {
        console.error('Lỗi cập nhật trạng thái đề tài kho:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật trạng thái đề tài kho!' });
    }
};

// 6. Cập nhật trạng thái duyệt/yêu cầu sửa/từ chối đề tài (Bổ sung tự đổi status Kho khi Phê duyệt)
exports.updateTopicStatus = async (req, res) => {
    try {
        const { topic_id } = req.params;
        const { status, feedback } = req.body; 

        const topic = await Topic.findByIdAndUpdate(
            topic_id,
            { 
                status, 
                feedback: feedback || '' 
            },
            { new: true }
        );

        if (!topic) {
            return res.status(404).json({ message: 'Không tìm thấy đề tài!' });
        }

        // BỔ SUNG: Khi duyệt đề tài, tự động cập nhật bản ghi tương ứng trong Kho (LecturerTopic)
        if (status === 'APPROVED') {
            if (topic.pool_topic_id) {
                await LecturerTopic.findByIdAndUpdate(topic.pool_topic_id, {
                    status: 'REGISTERED',
                    is_registered: true
                });
            } else {
                await LecturerTopic.findOneAndUpdate(
                    { lecturer_code: topic.lecturer_code, title: topic.title },
                    { status: 'REGISTERED', is_registered: true }
                );
            }
        }

        let messageText = 'Cập nhật trạng thái đề tài thành công!';
        if (status === 'APPROVED') messageText = 'Đã phê duyệt đề tài cho nhóm!';
        if (status === 'NEED_REVISION') messageText = 'Đã gửi yêu cầu chỉnh sửa đến nhóm sinh viên!';
        if (status === 'REJECTED') messageText = 'Đã từ chối đề tài!';

        res.json({ 
            success: true,
            message: messageText, 
            topic 
        });
    } catch (error) {
        console.error("Lỗi cập nhật trạng thái đề tài:", error);
        res.status(500).json({ message: 'Lỗi cập nhật trạng thái đề tài!' });
    }
};

// 5. Lấy Ma trận Tiến độ báo cáo
exports.getLecturerProgressMatrix = async (req, res) => {
    try {
        const { lecturerCode } = req.params;

        const topics = await Topic.find({ 
            lecturer_code: lecturerCode,
            status: 'APPROVED' 
        }).lean();

        if (!topics || topics.length === 0) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }

        const topicIds = topics.map(t => t._id);

        const submissions = await Submission.find({ 
            topic_id: { $in: topicIds } 
        }).lean();

        const matrixData = topics.map(topic => {
            const topicSubmissions = submissions.filter(
                s => s.topic_id && s.topic_id.toString() === topic._id.toString()
            );

            const milestones = {};
            for (let i = 1; i <= 5; i++) {
                const sub = topicSubmissions.find(s => 
                    s.milestone == i || 
                    s.milestone_step == i || 
                    s.milestone === `Mốc ${i}`
                );

                const directFile = topic[`milestone${i}_file`];

                if (sub) {
                    milestones[`milestone${i}`] = {
                        submitted: true,
                        file_name: sub.file_name || sub.original_name || 'Bài nộp',
                        file_path: sub.file_path,
                        submitted_at: sub.submitted_at || sub.createdAt
                    };
                } else if (directFile && (directFile.name || directFile.path)) {
                    milestones[`milestone${i}`] = {
                        submitted: true,
                        file_name: directFile.name || 'Bài nộp',
                        file_path: directFile.path,
                        submitted_at: directFile.uploadedAt || directFile.submittedAt || topic.updatedAt
                    };
                } else {
                    milestones[`milestone${i}`] = null;
                }
            }

            return {
                _id: topic._id,
                topic_code: topic.topic_code || `DT-${topic._id.toString().slice(-5).toUpperCase()}`,
                title: topic.title,
                student_code: topic.student_code || topic.leader_code || "N/A",
                milestones
            };
        });

        return res.status(200).json({
            success: true,
            data: matrixData
        });

    } catch (error) {
        console.error("Lỗi getLecturerProgressMatrix:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Lỗi kết nối máy chủ khi lấy ma trận tiến độ: " + error.message 
        });
    }
};