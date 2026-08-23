const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    title: { type: String, required: true },
    category: { type: String, default: 'Biểu mẫu SV' },   // Nhãn phân loại hiển thị (VD: "Biểu mẫu SV", "Tài liệu kỹ thuật"...)
    target: { type: String, default: 'Tất cả nhóm hướng dẫn' }, // Đối tượng được chia sẻ (VD: "Tất cả nhóm hướng dẫn", "Nhóm N01"...)
    uploader_code: { type: String, required: true }, // Mã Giảng viên đã chia sẻ
    uploader_name: { type: String, default: '' },
    file_name: { type: String, required: true },      // Tên file lưu trên server
    original_name: { type: String, required: true },  // Tên file gốc do người dùng đặt
    file_path: { type: String, required: true },      // Đường dẫn public để tải xuống
    file_size: { type: Number, default: 0 },           // Dung lượng (byte)
    download_count: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
