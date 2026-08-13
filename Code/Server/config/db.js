const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Đồng bộ tuyệt đối dùng 127.0.0.1
        const conn = await mongoose.connect(
            process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/tttn_db'
        );
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ Lỗi kết nối MongoDB: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;