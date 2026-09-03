const Group = require('../models/Group');
const Topic = require('../models/Topic');

// API lấy danh sách nhóm do Giảng viên hướng dẫn
exports.getGroupsByLecturer = async (req, res) => {
    try {
        const { lecturerCode } = req.params;
        // Lấy danh sách nhóm và nối (populate) thông tin tên đề tài từ bảng Topic
        let groups = await Group.find({ 
            lecturer_code: lecturerCode,
            is_approved: true 
        }).populate('topic_id');

        // Fallback: nếu chưa có dữ liệu trong collection Group
        // nhưng đề tài đã được GV duyệt và gán cho giảng viên, vẫn hiển thị
        // như một nhóm đang hướng dẫn để tránh UI rỗng sai.
        if (!groups || groups.length === 0) {
            const approvedTopics = await Topic.find({
                lecturer_code: lecturerCode,
                status: 'APPROVED'
            }).lean();

            groups = approvedTopics.map((topic, index) => ({
                _id: topic._id,
                group_code: topic.topic_code || `N${String(index + 1).padStart(2, '0')}`,
                lecturer_code: topic.lecturer_code,
                leader_code: topic.leader_code,
                member2_code: topic.member2_code,
                progress: topic.progress || 0,
                is_approved: true,
                topic_id: topic
            }));
        }

        // Format lại dữ liệu trước khi gửi về cho Frontend
        const formattedGroups = groups.map(g => ({
            _id: g._id,
            group_code: g.group_code || (g.topic_id && g.topic_id.topic_code) || `N${String(1).padStart(2, '0')}`,
            title: g.topic_id ? (g.topic_id.title || "Đề tài chưa cập nhật") : (g.title || "Đề tài chưa cập nhật"),
            category: g.topic_id ? (g.topic_id.category || "Web / Ứng dụng") : (g.category || "Web / Ứng dụng"),
            leader_code: g.leader_code || (g.topic_id && g.topic_id.leader_code),
            member2_code: g.member2_code || (g.topic_id && g.topic_id.member2_code),
            progress: g.progress || (g.topic_id && g.topic_id.progress) || 0,
            topic: g.topic_id || g
        }));

        return res.status(200).json({
            success: true,
            data: formattedGroups
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Lỗi máy chủ: " + error.message
        });
    }
};