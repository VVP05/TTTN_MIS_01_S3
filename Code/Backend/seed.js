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

        // 2. KHỞI TẠO TÀI KHOẢN ADMIN
        const adminPassword = process.env.ADMIN_DEFAULT_PASSWORD;
        if (!adminPassword) {
            throw new Error('Thiếu biến ADMIN_DEFAULT_PASSWORD trong file .env');
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(adminPassword, salt);

        const adminEmail = String(process.env.ADMIN_DEFAULT_EMAIL || process.env.SMTP_USER || '').trim();

        // Chỉ tạo tài khoản Admin duy nhất — GV & SV sẽ được Admin import từ file Excel sau khi deploy
        const users = [
            {
                user_code: 'ADMIN01',
                password: hashedPassword,
                full_name: 'Quản Trị Viên',
                role: 'ADMIN',
                ...(adminEmail ? { email: adminEmail } : {})
            },
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