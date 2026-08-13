const ActivityLog = require('../models/ActivityLog');

exports.getActivityLogs = async (req, res) => {
    try {
        const { role, actionType, page = 1, limit = 100 } = req.query;
        const filter = {};

        if (role) filter.role = role;
        if (actionType) filter.actionType = actionType;

        const pageNumber = Number(page) > 0 ? Number(page) : 1;
        const pageSize = Number(limit) > 0 ? Number(limit) : 100;
        const skip = (pageNumber - 1) * pageSize;

        const [total, data] = await Promise.all([
            ActivityLog.countDocuments(filter),
            ActivityLog.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(pageSize)
                .lean()
        ]);

        return res.status(200).json({
            success: true,
            total,
            page: pageNumber,
            limit: pageSize,
            data
        });
    } catch (error) {
        console.error('Lỗi lấy nhật ký hoạt động:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy nhật ký hoạt động.' });
    }
};
