const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
    // 1. MÃ ĐỀ TÀI / MÃ NHÓM (VD: "N09", "DT-GV01")
    topic_code: { 
        type: String, 
        unique: true, 
        uppercase: true 
    },

    // 2. THÔNG TIN NHÓM SINH VIÊN (Không bắt buộc required để GV có thể đăng đề tài lên kho trước)
    leader_code: { 
        type: String, 
        default: null 
    },    // MSSV Trưởng nhóm
    member2_code: { 
        type: String, 
        default: null 
    },   // MSSV Thành viên 2 (nếu có)
    member3_code: { 
        type: String, 
        default: null 
    },   // MSSV Thành viên 3 (nếu có - dự phòng)

    // 3. GIẢNG VIÊN HƯỚNG DẪN
    lecturer_code: { 
        type: String, 
        required: true 
    },  // Mã Giảng viên (VD: "GV01")

    // 4. NỘI DUNG ĐỀ TÀI
    title: { 
        type: String, 
        required: true,
        trim: true 
    },          // Tên đề tài
    description: { 
        type: String, 
        required: true 
    },    // Mô tả chi tiết / Mục tiêu
    category: { 
        type: String, 
        enum: ['Web / Ứng dụng', 'AI / ML', 'Dữ liệu / Phân tích', 'Khác'],
        default: 'Web / Ứng dụng'
    },                    // Lĩnh vực chuyên môn (Phục vụ Filter)
    requirements: { 
        type: String, 
        default: '' 
    },     // Yêu cầu kiến thức/công nghệ đầu vào
    max_groups: { 
        type: Number, 
        default: 1,
        min: 1,
        max: 3 
    },       // Số nhóm tối đa được đăng ký (Cho kho đề tài GV)

    // 5. PHÂN LOẠI & TRẠNG THÁI
    source: {
        type: String,
        enum: ['STUDENT', 'LECTURER'],
        default: 'STUDENT'
    },                    // Nguồn: SV tự đề xuất hay GV tạo kho
    status: { 
        type: String, 
        enum: ['OPEN', 'PENDING', 'APPROVED', 'NEED_REVISION', 'REJECTED'], 
        default: 'PENDING' 
    },
    // Giải thích status:
    // - OPEN: Đề tài trong kho GV đang mở cho SV đăng ký
    // - PENDING: SV gửi đề xuất, chờ GV phê duyệt
    // - APPROVED: GV đã duyệt (Đang hướng dẫn)
    // - NEED_REVISION: GV yêu cầu SV sửa lại nội dung
    // - REJECTED: GV từ chối

    // 6. PHẢN HỒI CỦA GIẢNG VIÊN
    feedback: { 
        type: String, 
        default: '' 
    }             // Nhận xét của GV khi duyệt/yêu cầu sửa/từ chối

}, { timestamps: true });

// Tự động phát sinh topic_code ngẫu nhiên nếu chưa truyền vào khi tạo mới
topicSchema.pre('save', function(next) {
    if (!this.topic_code) {
        const prefix = this.source === 'LECTURER' ? 'DT-' : 'N-';
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        this.topic_code = `${prefix}${randomNum}`;
    }
    next();
});

module.exports = mongoose.model('Topic', topicSchema);