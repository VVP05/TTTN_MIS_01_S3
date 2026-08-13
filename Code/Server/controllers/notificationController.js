const Notification = require('../models/Notification');

// 1. Lấy danh sách thông báo cho Sinh viên
exports.getNotifications = async (req, res) => {
    try {
        const { studentCode } = req.params;

        const notifications = await Notification.find({
            status: 'published',
            $or: [
                { recipient_code: studentCode },
                { recipient_code: null, target: { $in: ['all', 'students'] } }
            ]
        }).sort({ createdAt: -1 });

        const unreadCount = notifications.filter(n => !n.is_read).length;

        res.status(200).json({
            success: true,
            unread_count: unreadCount,
            notifications
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi máy chủ!", error: error.message });
    }
};

// 1b. Lấy danh sách thông báo cho Giảng viên
exports.getLecturerNotifications = async (req, res) => {
    try {
        const { lecturerCode } = req.params;

        const notifications = await Notification.find({
            status: 'published',
            type: { $in: ['SYSTEM', 'FACULTY'] },
            $or: [
                { recipient_code: lecturerCode },
                { recipient_code: null, target: { $in: ['all', 'lecturers'] } }
            ]
        }).sort({ createdAt: -1 });

        const unreadCount = notifications.filter(n => !n.is_read).length;

        res.status(200).json({
            success: true,
            unread_count: unreadCount,
            notifications
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi máy chủ!", error: error.message });
    }
};

// 1c. Lấy danh sách thông báo cho Admin quản lý
exports.getAllNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ message: "Lỗi máy chủ!", error: error.message });
    }
};

// 2. Tạo thông báo mới
exports.createNotification = async (req, res) => {
    try {
        const { title, content, target, priority, isPinned, status, recipient_code, type, sender_name } = req.body;

        if (!title || !content || !target || !status) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đủ Title, Nội dung, Đối tượng và Trạng thái.' });
        }

        const notification = new Notification({
            recipient_code: recipient_code || null,
            target,
            title,
            content,
            priority: priority || 'info',
            type: type || 'SYSTEM',
            status,
            sender_name: sender_name || 'Hệ thống',
            is_read: false,
            isPinned: Boolean(isPinned)
        });

        await notification.save();
        res.status(201).json({ success: true, message: 'Thông báo đã được lưu.', notification });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ!', error: error.message });
    }
};

// 3. Cập nhật thông báo
exports.updateNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, target, priority, isPinned, status } = req.body;

        const notification = await Notification.findByIdAndUpdate(
            id,
            {
                title,
                content,
                target,
                type: 'SYSTEM',
                status,
                sender_name: 'Admin Hệ thống',
                isPinned: Boolean(isPinned)
            },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo.' });
        }

        res.status(200).json({ success: true, message: 'Đã cập nhật thông báo.', notification });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ!', error: error.message });
    }
};

// 4. Xóa thông báo
exports.deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findByIdAndDelete(id);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo.' });
        }
        res.status(200).json({ success: true, message: 'Đã xóa thông báo.' });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ!', error: error.message });
    }
};

// 5. Đánh dấu 1 thông báo là ĐÃ ĐỌC
exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        await Notification.findByIdAndUpdate(id, { is_read: true });

        res.status(200).json({ success: true, message: "Đã đánh dấu đã đọc" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi cập nhật!", error: error.message });
    }
};

// 6. Đánh dấu TẤT CẢ thông báo là ĐÃ ĐỌC
exports.markAllAsRead = async (req, res) => {
    try {
        const { studentCode } = req.params;
        const role = (req.query.role || 'STUDENT').toUpperCase();

        const targetFilters = role === 'LECTURER'
            ? ['all', 'lecturers']
            : ['all', 'students'];

        await Notification.updateMany(
            {
                status: 'published',
                $or: [
                    { recipient_code: studentCode },
                    { recipient_code: null, target: { $in: targetFilters } }
                ],
                is_read: false
            },
            { $set: { is_read: true } }
        );

        res.status(200).json({ success: true, message: "Đã đánh dấu tất cả là đã đọc" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi cập nhật!", error: error.message });
    }
};