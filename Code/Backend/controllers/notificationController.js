const Notification = require('../models/Notification');
const Topic = require('../models/Topic');
const User = require('../models/User');

function getUserCode(req) {
    return String(req.user?.user_code || '').trim().toUpperCase();
}

function isOwnNotificationsRequest(req, requestedCode, expectedRole) {
    return String(req.user?.role || '').toUpperCase() === expectedRole &&
        getUserCode(req) === String(requestedCode || '').trim().toUpperCase();
}

// 1. Lấy danh sách thông báo cho Sinh viên
exports.getNotifications = async (req, res) => {
    try {
        const studentCode = getUserCode(req);
        if (!isOwnNotificationsRequest(req, req.params.studentCode, 'STUDENT')) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông báo này.' });
        }

        const notifications = await Notification.find({
            status: 'published',
            $or: [
                { recipient_code: studentCode },
                { recipient_code: null, target: { $in: ['all', 'students'] } }
            ]
        }).sort({ createdAt: -1 });
        const result = notifications.map(notification => {
            const item = notification.toObject();
            item.is_read = item.read_by.includes(studentCode);
            if (item.target === 'students' && ['Quản Trị Viên', 'Admin Hệ thống'].includes(item.sender_name)) {
                item.type = 'SYSTEM';
            }
            return item;
        });
        const unreadCount = result.filter(n => !n.is_read).length;

        res.status(200).json({
            success: true,
            unread_count: unreadCount,
            notifications: result
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi máy chủ!", error: error.message });
    }
};

// 1b. Lấy danh sách thông báo cho Giảng viên
exports.getLecturerNotifications = async (req, res) => {
    try {
        const lecturerCode = getUserCode(req);
        if (!isOwnNotificationsRequest(req, req.params.lecturerCode, 'LECTURER')) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xem thông báo này.' });
        }

        const notifications = await Notification.find({
            status: 'published',
            type: { $in: ['SYSTEM', 'FACULTY', 'LECTURER'] },
            $or: [
                { recipient_code: lecturerCode },
                { recipient_code: null, target: { $in: ['all', 'lecturers'] } }
            ]
        }).sort({ createdAt: -1 });

        const result = notifications.map(notification => {
            const item = notification.toObject();
            item.is_read = item.read_by.includes(lecturerCode);
            if (item.target === 'lecturers' && ['Quản Trị Viên', 'Admin Hệ thống'].includes(item.sender_name)) {
                item.type = 'SYSTEM';
                item.sender_name = 'Hệ thống';
            }
            return item;
        });
        const unreadCount = result.filter(n => !n.is_read).length;

        res.status(200).json({
            success: true,
            unread_count: unreadCount,
            notifications: result
        });
    } catch (error) {
        res.status(500).json({ message: "Lỗi máy chủ!", error: error.message });
    }
};

// 1c. Lấy danh sách thông báo cho Admin quản lý
exports.getAllNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({
            event_key: { $exists: false },
            type: { $in: ['SYSTEM', null] }
        }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, notifications });
    } catch (error) {
        res.status(500).json({ message: "Lỗi máy chủ!", error: error.message });
    }
};

// 2. Tạo thông báo mới
exports.createNotification = async (req, res) => {
    try {
        const { title, content, target, priority, isPinned, status, recipient_code } = req.body;

        if (!title || !content || !target || !status) {
            return res.status(400).json({ success: false, message: 'Vui lòng cung cấp đủ Title, Nội dung, Đối tượng và Trạng thái.' });
        }

        const notification = new Notification({
            recipient_code: recipient_code || null,
            target,
            title,
            content,
            priority: priority || 'info',
            type: 'SYSTEM',
            status,
            sender_name: 'Admin Hệ thống',
            is_read: false,
            isPinned: Boolean(isPinned)
        });

        await notification.save();
        res.status(201).json({ success: true, message: 'Thông báo đã được lưu.', notification });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ!', error: error.message });
    }
};

exports.createLecturerNotification = async (req, res) => {
    try {
        const title = String(req.body.title || '').trim();
        const content = String(req.body.content || '').trim();
        const lecturerCode = getUserCode(req);
        const rawRecipientCodes = req.body.recipient_codes;

        if (!title || !content || !Array.isArray(rawRecipientCodes) || rawRecipientCodes.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập tiêu đề, nội dung và ít nhất một sinh viên nhận thông báo.'
            });
        }
        if (title.length > 200 || content.length > 5000) {
            return res.status(400).json({
                success: false,
                message: 'Tiêu đề tối đa 200 ký tự và nội dung tối đa 5000 ký tự.'
            });
        }

        const recipientCodes = [...new Set(rawRecipientCodes
            .map(code => String(code || '').trim().toUpperCase())
            .filter(Boolean))];
        if (!recipientCodes.length || recipientCodes.length > 500) {
            return res.status(400).json({
                success: false,
                message: 'Danh sách người nhận không hợp lệ hoặc vượt quá 500 sinh viên.'
            });
        }

        const escapedLecturerCode = lecturerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lecturerPattern = new RegExp(`^${escapedLecturerCode}$`, 'i');
        const [lecturer, topics] = await Promise.all([
            User.findOne({ user_code: lecturerPattern, role: 'LECTURER' }).select('full_name').lean(),
            Topic.find({ lecturer_code: lecturerPattern, status: 'APPROVED' })
                .select('leader_code member2_code member3_code')
                .lean()
        ]);
        if (!lecturer) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản giảng viên.' });
        }

        const eligibleRecipients = new Set(topics.flatMap(topic =>
            [topic.leader_code, topic.member2_code, topic.member3_code]
                .filter(Boolean)
                .map(code => String(code).trim().toUpperCase())
        ));
        const unauthorizedRecipients = recipientCodes.filter(code => !eligibleRecipients.has(code));
        if (unauthorizedRecipients.length) {
            return res.status(403).json({
                success: false,
                message: 'Chỉ có thể gửi thông báo cho sinh viên thuộc đề tài đã được duyệt do bạn hướng dẫn.'
            });
        }

        const notifications = await Notification.insertMany(recipientCodes.map(recipientCode => ({
            recipient_code: recipientCode,
            target: 'students',
            type: 'LECTURER',
            title,
            content,
            priority: 'info',
            status: 'published',
            sender_name: lecturer.full_name || 'Giảng viên',
            is_read: false,
            read_by: []
        })));

        return res.status(201).json({
            success: true,
            message: `Đã gửi thông báo đến ${notifications.length} sinh viên.`,
            sent_count: notifications.length
        });
    } catch (error) {
        console.error('Lỗi giảng viên gửi thông báo:', error);
        return res.status(500).json({ success: false, message: 'Không thể gửi thông báo lúc này.' });
    }
};

// 3. Cập nhật thông báo
exports.updateNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content, target, priority, isPinned, status } = req.body;

        const notification = await Notification.findOneAndUpdate(
            { _id: id, event_key: { $exists: false }, type: { $in: ['SYSTEM', null] } },
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
        const notification = await Notification.findOneAndDelete({
            _id: id,
            event_key: { $exists: false },
            type: { $in: ['SYSTEM', null] }
        });
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
        const userCode = getUserCode(req);
        const role = String(req.user?.role || '').toUpperCase();
        if (!['STUDENT', 'LECTURER'].includes(role)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật thông báo.' });
        }
        const targets = role === 'LECTURER' ? ['all', 'lecturers'] : ['all', 'students'];
        const notification = await Notification.findOneAndUpdate(
            {
                _id: id,
                status: 'published',
                $or: [
                    { recipient_code: userCode },
                    { recipient_code: null, target: { $in: targets } }
                ]
            },
            { $addToSet: { read_by: userCode } }
        );
        if (!notification) return res.status(404).json({ success: false, message: 'Không tìm thấy thông báo.' });

        res.status(200).json({ success: true, message: "Đã đánh dấu đã đọc" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi cập nhật!", error: error.message });
    }
};

// 6. Đánh dấu TẤT CẢ thông báo là ĐÃ ĐỌC
exports.markAllAsRead = async (req, res) => {
    try {
        const studentCode = getUserCode(req);
        const role = String(req.user?.role || '').toUpperCase();
        if (!['STUDENT', 'LECTURER'].includes(role) ||
            !isOwnNotificationsRequest(req, req.params.studentCode, role)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật các thông báo này.' });
        }

        const targetFilters = role === 'LECTURER'
            ? ['all', 'lecturers']
            : ['all', 'students'];

        await Notification.updateMany(
            {
                status: 'published',
                $or: [
                    { recipient_code: studentCode },
                    { recipient_code: null, target: { $in: targetFilters } }
                ]
            },
            { $addToSet: { read_by: studentCode } }
        );

        res.status(200).json({ success: true, message: "Đã đánh dấu tất cả là đã đọc" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi cập nhật!", error: error.message });
    }
};