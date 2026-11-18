const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');

// Import toàn bộ Model
const User = require('./models/User');
const Topic = require('./models/Topic');
const Group = require('./models/Group');
const Document = require('./models/Document');
const { Meeting, Todo } = require('./models/Schedule');

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tttn_db'; 

const seedCollections = [
    { name: 'users', model: User },
    { name: 'topics', model: Topic },
    { name: 'groups', model: Group },
    { name: 'documents', model: Document },
    { name: 'meetings', model: Meeting },
    { name: 'todos', model: Todo }
];

const assertDevelopmentSeedEnvironment = (nodeEnv = process.env.NODE_ENV) => {
    if (nodeEnv !== 'development') {
        throw new Error('Lệnh seed chỉ được chạy khi NODE_ENV=development.');
    }
};

const assertCollectionsEmpty = async (collections) => {
    const counts = await Promise.all(collections.map(async ({ name, model }) => ({
        name,
        count: await model.countDocuments({})
    })));
    const populatedCollections = counts.filter(collection => collection.count > 0);

    if (populatedCollections.length > 0) {
        const names = populatedCollections.map(collection => collection.name).join(', ');
        throw new Error(`Từ chối chạy seed vì các collection đã có dữ liệu: ${names}. Chỉ chạy seed trên cơ sở dữ liệu trống.`);
    }
};

const seedData = async () => {
    try {
        assertDevelopmentSeedEnvironment();
        await mongoose.connect(MONGO_URI);
        console.log('✅ Đã kết nối MongoDB thành công!');

        await assertCollectionsEmpty(seedCollections);
        console.log('✅ Các collection liên quan đang trống.');

        // 2. KHỞI TẠO TÀI KHOẢN MẪU
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('123456', salt);

        const users = [
            { user_code: 'ADMIN01', password: hashedPassword, full_name: 'Quản Trị Viên', role: 'ADMIN', email: 'admin01@tttn.edu.vn' },
            { user_code: 'GV01', password: hashedPassword, full_name: 'TS. Nguyễn Văn An', role: 'LECTURER', max_quota: 5, email: 'gv01@tttn.edu.vn' },
            { user_code: 'GV02', password: hashedPassword, full_name: 'TS. Lê Thị Bình', role: 'LECTURER', max_quota: 5, email: 'gv02@tttn.edu.vn' },
            { user_code: 'GV03', password: hashedPassword, full_name: 'TS. Trần Thị Ngọc', role: 'LECTURER', max_quota: 5, email: 'gv03@tttn.edu.vn' },
            { user_code: 'SV01', password: hashedPassword, full_name: 'Trần Văn Bảo', role: 'STUDENT', email: 'sv01@tttn.edu.vn' },
            { user_code: 'SV02', password: hashedPassword, full_name: 'Trần Văn Khải', role: 'STUDENT', email: 'sv02@tttn.edu.vn' },
            { user_code: 'SV03', password: hashedPassword, full_name: 'Nguyễn Thị Chung', role: 'STUDENT', email: 'sv03@tttn.edu.vn' },
            { user_code: 'SV04', password: hashedPassword, full_name: 'Võ Văn Phụng', role: 'STUDENT', email: 'sv04@tttn.edu.vn' },
            { user_code: 'SV05', password: hashedPassword, full_name: 'Võ Văn Huy', role: 'STUDENT', email: 'sv05@tttn.edu.vn' },
            { user_code: 'SV06', password: hashedPassword, full_name: 'Nguyễn Văn Hoàng', role: 'STUDENT', email: 'sv06@tttn.edu.vn' },
            { user_code: 'SV07', password: hashedPassword, full_name: 'Nguyễn Minh Hoàng', role: 'STUDENT', email: 'sv07@tttn.edu.vn' },
             { user_code: 'SV08', password: hashedPassword, full_name: 'Võ Văn Hoàng', role: 'STUDENT', email: 'sv08@tttn.edu.vn' },
        ];

        await User.insertMany(users.map(user => ({ ...user, must_change_password: true })));
        console.log('👤 Khởi tạo tài khoản mẫu thành công!');

        // 3. Không tạo dữ liệu mẫu / demo nữa.
        // Hệ thống ở trạng thái trống để người dùng upload file thật để test luồng.
        console.log('📌 Chế độ trống: không tạo dữ liệu demo, nhóm demo hoặc tài liệu demo.');

        console.log('\n🎉 SEED CHẠY THÀNH CÔNG, HỆ THỐNG ĐANG Ở TRẠNG THÁI TRỐNG SẠCH CHO TEST THẬT!');
        process.exit();
    } catch (error) {
        console.error('❌ Lỗi seed data:', error);
        process.exit(1);
    }
};

if (require.main === module) {
    seedData();
}

module.exports = { assertCollectionsEmpty, assertDevelopmentSeedEnvironment };