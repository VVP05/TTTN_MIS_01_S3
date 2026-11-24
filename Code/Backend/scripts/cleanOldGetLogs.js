/**
 * Script dọn dẹp các bản ghi log GET thông thường cũ trong cơ sở dữ liệu.
 * Chỉ xóa các bản ghi có method: 'GET' không phải là export hoặc download.
 *
 * Cách chạy:
 *   Xem trước số lượng (dry-run):
 *     node Code/Backend/scripts/cleanOldGetLogs.js
 *
 *   Xác nhận xóa:
 *     node Code/Backend/scripts/cleanOldGetLogs.js --confirm
 */

const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');

async function run() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/TTTN_MIS';
    console.log('🔄 Đang kết nối MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Đã kết nối cơ sở dữ liệu.');

    const filter = {
        method: 'GET',
        url: {
            $not: /export|download/i
        }
    };

    const count = await ActivityLog.countDocuments(filter);
    console.log(`📊 Tìm thấy tổng cộng: ${count} bản ghi log GET thông thường.`);

    const isConfirmed = process.argv.includes('--confirm');

    if (!isConfirmed) {
        console.log('\n⚠️  ĐÂY LÀ CHẾ ĐỘ XEM TRƯỚC (DRY-RUN). Chưa có dữ liệu nào bị xóa.');
        console.log('👉 Để thực hiện dọn dẹp thật, vui lòng chạy lệnh kèm cờ --confirm:');
        console.log('   node Code/Backend/scripts/cleanOldGetLogs.js --confirm\n');
    } else {
        if (count === 0) {
            console.log('✨ Không có bản ghi GET thừa nào cần dọn dẹp.');
        } else {
            console.log(`🗑️ Đang tiến hành xóa ${count} bản ghi GET thông thường...`);
            const result = await ActivityLog.deleteMany(filter);
            console.log(`✅ Hoàn tất! Đã xóa thành công ${result.deletedCount} bản ghi.`);
        }
    }

    await mongoose.disconnect();
    console.log('🔒 Đã đóng kết nối CSDL.');
    process.exit(0);
}

run().catch((err) => {
    console.error('❌ Lỗi khi thực hiện dọn dẹp log:', err);
    process.exit(1);
});
