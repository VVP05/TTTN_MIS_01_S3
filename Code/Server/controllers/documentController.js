const Document = require('../models/Document');
const Notification = require('../models/Notification');
const Topic = require('../models/Topic');

// 1. Lấy danh sách tài liệu do 1 Giảng viên đã chia sẻ (trang "Quản lý tài liệu" của GVHD)
exports.getLecturerDocuments = async (req, res) => {
    try {
        const { lecturerCode } = req.params;
        const documents = await Document.find({
            $or: [
                { uploader_code: lecturerCode },
                { target: 'Tất cả giảng viên' }
            ]
        }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, documents });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tài liệu!', error: error.message });
    }
};

// 2. Lấy danh sách tài liệu công khai cho Sinh viên xem (trang "Tài liệu hướng dẫn")
exports.getStudentDocuments = async (req, res) => {
    try {
        const studentCode = String(req.query.user_code || '').trim().toUpperCase();
        const documents = await Document.find({
            target: { $ne: 'Tất cả giảng viên' },
            $or: [
                { target: { $in: ['students', 'Tất cả sinh viên'] } },
                ...(studentCode ? [{ recipient_codes: studentCode }] : [])
            ]
        }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, documents });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tài liệu!', error: error.message });
    }
};

// 2b. Lấy toàn bộ tài liệu cho màn hình quản trị
exports.getAllDocuments = async (req, res) => {
    try {
        const documents = await Document.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, documents });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tài liệu!', error: error.message });
    }
};

// 3. Tải lên & chia sẻ tài liệu mới
exports.uploadDocument = async (req, res) => {
    try {
        const { title, category, target, uploader_code, uploader_name } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn file tài liệu trước khi chia sẻ!' });
        }

        if (!title || !uploader_code) {
            return res.status(400).json({ success: false, message: 'Thiếu tiêu đề tài liệu hoặc thông tin người chia sẻ!' });
        }

        let recipientCodes = [];
        if (uploader_code !== 'ADMIN' && target === 'Tất cả nhóm hướng dẫn') {
            const topics = await Topic.find({ lecturer_code: uploader_code, status: 'APPROVED' })
                .select('leader_code member2_code member3_code').lean();
            recipientCodes = [...new Set(topics.flatMap(topic => [topic.leader_code, topic.member2_code, topic.member3_code])
                .filter(Boolean).map(code => String(code).trim().toUpperCase()))];
        }

        const document = new Document({
            title,
            category: category || 'OTHER',
            target: target || 'students',
            recipient_codes: recipientCodes,
            uploader_code,
            uploader_name: uploader_name || '',
            file_name: file.filename,
            original_name: file.originalname,
            file_path: `/uploads/documents/${file.filename}`,
            file_size: file.size
        });

        await document.save();

            if (target) {
                const notificationBase = {
                    type: uploader_code === 'ADMIN' ? 'SYSTEM' : 'LECTURER',
                    title: `Tài liệu mới: ${title}`,
                    content: `Tài liệu "${title}" đã được chia sẻ cho nhóm hướng dẫn của bạn. Vui lòng mở mục Tài liệu & Biểu mẫu để xem và tải về.`,
                    priority: 'info', status: 'published', sender_name: uploader_name || 'Admin Hệ thống', is_read: false,
                    attachment: { name: file.originalname, url: `/uploads/documents/${file.filename}` }
                };
                if (uploader_code !== 'ADMIN' && target === 'Tất cả nhóm hướng dẫn') {
                    await Notification.insertMany(recipientCodes.map(recipient_code => ({ ...notificationBase, recipient_code })));
                } else {
                    const notificationTarget = target === 'Tất cả giảng viên' ? 'lecturers' : 'students';
                    await Notification.create({ ...notificationBase, target: notificationTarget });
                }
        }

        res.status(201).json({ success: true, message: 'Đã chia sẻ tài liệu thành công!', document });
    } catch (error) {
        console.error('Lỗi tải lên tài liệu:', error);
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tải lên tài liệu!', error: error.message });
    }
};

// 4. Xóa tài liệu
exports.deleteDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const document = await Document.findByIdAndDelete(id);

        if (!document) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu để xóa!' });
        }

        res.status(200).json({ success: true, message: 'Đã xóa tài liệu.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa tài liệu!', error: error.message });
    }
};

// 5. Tăng lượt tải xuống (gọi trước khi mở link file)
exports.incrementDownload = async (req, res) => {
    try {
        const { id } = req.params;
        const document = await Document.findByIdAndUpdate(
            id,
            { $inc: { download_count: 1 } },
            { new: true }
        );

        if (!document) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu!' });
        }

        res.status(200).json({
            success: true,
            file_path: document.file_path,
            original_name: document.original_name
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi máy chủ!', error: error.message });
    }
};
