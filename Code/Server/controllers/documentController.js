const Document = require('../models/Document');
const Notification = require('../models/Notification');
const Topic = require('../models/Topic');
const Group = require('../models/Group');
const User = require('../models/User');
const fs = require('fs');

// 1. Lấy danh sách tài liệu do 1 Giảng viên đã chia sẻ (trang "Quản lý tài liệu" của GVHD)
exports.getLecturerDocuments = async (req, res) => {
    try {
        const lecturerCode = req.user.user_code;
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
        const studentCode = String(req.user?.user_code || '').trim().toUpperCase();
        const documents = await Document.find({
            $or: [
                { target: { $in: ['students', 'Tất cả sinh viên'] } },
                { recipient_codes: studentCode }
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
        const documents = await Document.find().sort({ createdAt: -1 }).lean();
        const uploaderCodes = [...new Set(documents.map(document => document.uploader_code).filter(Boolean))];
        const uploaders = await User.find({ user_code: { $in: uploaderCodes } }).select('user_code full_name role').lean();
        const uploaderMap = new Map(uploaders.map(uploader => [uploader.user_code, uploader]));
        const enrichedDocuments = documents.map(document => {
            const uploader = uploaderMap.get(document.uploader_code);
            return {
                ...document,
                uploader_name: document.uploader_name || uploader?.full_name || document.uploader_code,
                uploader_role: document.uploader_role || uploader?.role || (document.uploader_code === 'ADMIN' ? 'ADMIN' : 'LECTURER')
            };
        });
        res.status(200).json({ success: true, documents: enrichedDocuments });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tài liệu!', error: error.message });
    }
};

// 3. Tải lên & chia sẻ tài liệu mới
exports.uploadDocument = async (req, res) => {
    try {
        const { title, category } = req.body;
        const role = String(req.user?.role || '').toUpperCase();
        const uploaderCode = String(req.user?.user_code || '').trim();
        const file = req.file;
        const discardFile = () => {
            if (file?.path) fs.unlink(file.path, error => {
                if (error && error.code !== 'ENOENT') console.error('Lỗi xóa file tài liệu bị từ chối:', error);
            });
        };

        if (!file) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn file tài liệu trước khi chia sẻ!' });
        }

        if (!title || !uploaderCode) {
            discardFile();
            return res.status(400).json({ success: false, message: 'Thiếu tiêu đề tài liệu hoặc thông tin người chia sẻ!' });
        }

        const target = String(req.body.target || '').trim();
        let recipientCodes = [];
        let topics = [];
        if (role === 'LECTURER') {
            if (target === 'Tất cả nhóm hướng dẫn') {
                topics = await Topic.find({ lecturer_code: uploaderCode, status: 'APPROVED' })
                    .select('leader_code member2_code member3_code').lean();
            } else {
                let selectedTopic;
                const group = await Group.findOne({ group_code: target, lecturer_code: uploaderCode, is_approved: true })
                    .populate('topic_id')
                    .lean();
                if (group) {
                    selectedTopic = group.topic_id || group;
                    selectedTopic.leader_code ||= group.leader_code;
                    selectedTopic.member2_code ||= group.member2_code;
                } else {
                    selectedTopic = await Topic.findOne({
                        topic_code: target,
                        lecturer_code: uploaderCode,
                        status: 'APPROVED'
                    }).select('leader_code member2_code member3_code').lean();
                }
                if (!selectedTopic) {
                    discardFile();
                    return res.status(400).json({ success: false, message: 'Nhóm nhận tài liệu không hợp lệ hoặc không thuộc quyền hướng dẫn của bạn.' });
                }
                topics = [selectedTopic];
            }
            recipientCodes = [...new Set(topics.flatMap(topic => [topic.leader_code, topic.member2_code, topic.member3_code])
                .filter(Boolean).map(code => String(code).trim().toUpperCase()))];
            if (!recipientCodes.length) {
                discardFile();
                return res.status(400).json({ success: false, message: 'Không tìm thấy sinh viên thuộc nhóm nhận tài liệu.' });
            }
        } else if (role === 'ADMIN') {
            if (!['Tất cả sinh viên', 'Tất cả giảng viên'].includes(target)) {
                discardFile();
                return res.status(400).json({ success: false, message: 'Đối tượng nhận tài liệu không hợp lệ.' });
            }
        } else {
            discardFile();
            return res.status(403).json({ success: false, message: 'Bạn không có quyền chia sẻ tài liệu.' });
        }

        const uploader = await User.findOne({ user_code: uploaderCode }).select('full_name').lean();
        const uploaderName = uploader?.full_name || '';

        const document = new Document({
            title,
            category: category || 'OTHER',
            target,
            recipient_codes: recipientCodes,
            uploader_code: uploaderCode,
            uploader_name: uploaderName,
            uploader_role: role,
            file_name: file.filename,
            original_name: file.originalname,
            file_path: `/uploads/documents/${file.filename}`,
            file_size: file.size
        });

        await document.save();

            if (target) {
                const notificationBase = {
                    type: role === 'ADMIN' ? 'SYSTEM' : 'LECTURER',
                    title: `Tài liệu mới: ${title}`,
                    content: `Tài liệu "${title}" đã được chia sẻ cho nhóm hướng dẫn của bạn. Vui lòng mở mục Tài liệu & Biểu mẫu để xem và tải về.`,
                    priority: 'info', status: 'published', sender_name: uploaderName, is_read: false,
                    attachment: { name: file.originalname, url: `/uploads/documents/${file.filename}` }
                };
                if (role === 'LECTURER') {
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
        const document = await Document.findById(id);

        if (!document) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu để xóa!' });
        }

        const role = String(req.user?.role || '').toUpperCase();
        if (role !== 'ADMIN' && !(role === 'LECTURER' && document.uploader_code === req.user.user_code)) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể xóa tài liệu do mình chia sẻ.' });
        }

        await document.deleteOne();

        res.status(200).json({ success: true, message: 'Đã xóa tài liệu.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa tài liệu!', error: error.message });
    }
};

// 5. Tăng lượt tải xuống (gọi trước khi mở link file)
exports.incrementDownload = async (req, res) => {
    try {
        const { id } = req.params;
        const document = await Document.findById(id);

        if (!document) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài liệu!' });
        }

        const role = String(req.user?.role || '').toUpperCase();
        const userCode = String(req.user?.user_code || '').trim().toUpperCase();
        const canAccess = role === 'ADMIN'
            || (role === 'LECTURER' && (document.uploader_code === req.user.user_code || document.target === 'Tất cả giảng viên'))
            || (role === 'STUDENT' && (['students', 'Tất cả sinh viên'].includes(document.target) || document.recipient_codes.includes(userCode)));
        if (!canAccess) return res.status(403).json({ success: false, message: 'Bạn không có quyền tải tài liệu này.' });

        document.download_count += 1;
        await document.save();

        res.status(200).json({
            success: true,
            file_path: document.file_path,
            original_name: document.original_name
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi máy chủ!', error: error.message });
    }
};
