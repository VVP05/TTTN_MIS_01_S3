const Document = require('../models/Document');

// 1. Lấy danh sách tài liệu do 1 Giảng viên đã chia sẻ (trang "Quản lý tài liệu" của GVHD)
exports.getLecturerDocuments = async (req, res) => {
    try {
        const { lecturerCode } = req.params;
        const documents = await Document.find({ uploader_code: lecturerCode }).sort({ createdAt: -1 });
        res.status(200).json({ success: true, documents });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy danh sách tài liệu!', error: error.message });
    }
};

// 2. Lấy danh sách tài liệu công khai cho Sinh viên xem (trang "Tài liệu hướng dẫn")
exports.getStudentDocuments = async (req, res) => {
    try {
        // Trả về toàn bộ tài liệu đã được Giảng viên chia sẻ (lọc theo nhóm cụ thể sẽ bổ sung sau)
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

        const document = new Document({
            title,
            category: category || 'OTHER',
            target: target || 'students',
            uploader_code,
            uploader_name: uploader_name || '',
            file_name: file.filename,
            original_name: file.originalname,
            file_path: `/uploads/documents/${file.filename}`,
            file_size: file.size
        });

        await document.save();
        res.status(201).json({ success: true, message: 'Đã chia sẻ tài liệu đến sinh viên thành công!', document });
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
