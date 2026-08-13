const Group = require('../models/Group');

// API lấy danh sách nhóm do Giảng viên hướng dẫn
exports.getGroupsByLecturer = async (req, res) => {
    try {
        const { lecturerCode } = req.params;
        // Lấy danh sách nhóm và nối (populate) thông tin tên đề tài từ bảng Topic
        const groups = await Group.find({ 
            lecturer_code: lecturerCode,
            is_approved: true 
        }).populate('topic_id');

        // Format lại dữ liệu trước khi gửi về cho Frontend
        const formattedGroups = groups.map(g => ({
            _id: g._id,
            group_code: g.group_code,
            title: g.topic_id ? g.topic_id.title : "Đề tài chưa cập nhật",
            category: g.topic_id ? g.topic_id.category : "Web / Ứng dụng",
            leader_code: g.leader_code,
            member2_code: g.member2_code,
            progress: g.progress,
            topic: g.topic_id
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