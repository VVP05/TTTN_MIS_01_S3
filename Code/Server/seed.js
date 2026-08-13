const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

// Import toàn bộ Model
const User = require('./models/User');
const Topic = require('./models/Topic');
const { Meeting, Todo } = require('./models/Schedule');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tttn_db'; 

const seedData = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Đã kết nối MongoDB thành công!');

        // 1. DỌN SẠCH DỮ LIỆU CŨ TẤT CẢ CÁC BẢNG
        await User.deleteMany({});
        await Topic.deleteMany({});
        await Meeting.deleteMany({});
        await Todo.deleteMany({});
        console.log('🧹 Đã xóa sạch dữ liệu cũ!');

        // 2. KHỞI TẠO TÀI KHOẢN MẪU
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123456', salt);

        const users = [
            { user_code: 'ADMIN01', password: hashedPassword, full_name: 'Quản Trị Viên', role: 'ADMIN' },
            { user_code: 'GV01', password: hashedPassword, full_name: 'TS. Nguyễn Văn An', role: 'LECTURER', max_quota: 5 },
            { user_code: 'GV02', password: hashedPassword, full_name: 'TS. Lê Thị Bình', role: 'LECTURER', max_quota: 5 },
            { user_code: 'GV03', password: hashedPassword, full_name: 'TS. Trần Thị Ngọc', role: 'LECTURER', max_quota: 5 },
            { user_code: 'SV01', password: hashedPassword, full_name: 'Trần Văn Bảo', role: 'STUDENT' },
            { user_code: 'SV02', password: hashedPassword, full_name: 'Trần Văn Khải', role: 'STUDENT' },
            { user_code: 'SV03', password: hashedPassword, full_name: 'Nguyễn Thị Chung', role: 'STUDENT' },
            { user_code: 'SV04', password: hashedPassword, full_name: 'Võ Văn Phụng', role: 'STUDENT' },
            { user_code: 'SV05', password: hashedPassword, full_name: 'Võ Văn Huy', role: 'STUDENT' },
            { user_code: 'SV06', password: hashedPassword, full_name: 'Nguyễn Văn Hoàng', role: 'STUDENT' },
            { user_code: 'SV07', password: hashedPassword, full_name: 'Nguyễn Minh Hoàng', role: 'STUDENT' },
             { user_code: 'SV08', password: hashedPassword, full_name: 'Võ Văn Hoàng', role: 'STUDENT' },
        ];

        await User.insertMany(users);
        console.log('👤 Khởi tạo tài khoản mẫu thành công!');

        // 3. TẠO ĐỀ TÀI MẪU CHO SV01 (Trần Văn B)
        const topicSV01 = await Topic.create({
            title: "Xây dựng Hệ thống Quản lý Thực tập Tốt nghiệp",
            description: "Nghiên cứu ứng dụng Web theo mô hình Client-Server để hỗ trợ Quản lý Tiến độ Đồ án.",
            topic_code: "DT-TTTN01",
            leader_code: "SV01",
            member2_code: "SV02",
            lecturer_code: "GV01",
            status: "APPROVED"
        });
        console.log('📚 Tạo đề tài mẫu cho sinh viên thành công!');

        // 4. TẠO LỊCH HỌP MẪU KHỚP VỚI GIAO DIỆN DEMO
        const meetings = [
            {
                topic_id: topicSV01._id,
                student_code: 'SV01',
                lecturer_code: 'GV01',
                title: 'Báo cáo tiến độ Giữa kỳ & Demo sơ bộ giao diện',
                meeting_date: new Date('2026-08-10T09:30:00.000Z'),
                time_start: '09:30',
                time_end: '10:30',
                type: 'ONLINE',
                location: 'https://meet.google.com/abc-defg-hij',
                status: 'APPROVED',
                source: 'STUDENT'
            },
            {
                topic_id: topicSV01._id,
                student_code: 'SV01',
                lecturer_code: 'GV01',
                title: 'Họp rà soát kiến trúc Database & Xử lý API',
                meeting_date: new Date('2026-08-18T14:00:00.000Z'),
                time_start: '14:00',
                time_end: '15:00',
                type: 'OFFLINE',
                location: 'Trực tiếp - Phòng B5-201',
                status: 'PENDING',
                source: 'STUDENT'
            },
            {
                topic_id: topicSV01._id,
                student_code: 'SV01',
                lecturer_code: 'GV01',
                title: 'Duyệt Đề cương chi tiết & Chốt hướng công nghệ',
                meeting_date: new Date('2026-06-25T08:00:00.000Z'),
                time_start: '08:00',
                time_end: '09:30',
                type: 'OFFLINE',
                location: 'Trực tiếp - Văn phòng Khoa',
                status: 'COMPLETED',
                notes: 'Giảng viên đồng ý sử dụng MongoDB. Yêu cầu nộp lại biểu đồ Entity trước ngày 01/07.',
                source: 'STUDENT'
            }
        ];

        await Meeting.insertMany(meetings);
        console.log('📅 Tạo danh sách lịch họp mẫu thành công!');

        // 5. TẠO CÔNG VIỆC CẦN LÀM (TO-DO LIST) MẪU
        const todos = [
            { student_code: 'SV01', title: 'Hoàn thành trang my-topic.html', is_completed: true },
            { student_code: 'SV01', title: 'Viết API đăng nhập cho Student', is_completed: true },
            { student_code: 'SV01', title: 'Chuẩn bị slide demo giữa kỳ cho GVHD', is_completed: false },
            { student_code: 'SV01', title: 'Thiết kế responsive cho màn hình Mobile', is_completed: false }
        ];

        await Todo.insertMany(todos);
        console.log('✅ Tạo danh sách To-do list thành công!');

        console.log('\n🎉 NẠP TOÀN BỘ DỮ LIỆU SEED TỰ ĐỘNG THÀNH CÔNG!');
        process.exit();
    } catch (error) {
        console.error('❌ Lỗi seed data:', error);
        process.exit(1);
    }
};

seedData();