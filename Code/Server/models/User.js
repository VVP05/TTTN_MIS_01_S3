const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    user_code: { type: String, required: true, unique: true }, // MSSV hoặc Mã GV
    password: { type: String, required: true },
    full_name: { type: String, required: true },
    email: { type: String, default: '' },
    phone: { type: String, default: '' },
    class: { type: String, default: '' },
    major: { type: String, default: '' },
    dept: { type: String, default: '' },
    degree: { type: String, default: '' },
    status: { type: String, enum: ['NONE', 'PENDING', 'APPROVED'], default: 'NONE' },
    role: { 
        type: String, 
        enum: ['STUDENT', 'LECTURER', 'ADMIN'], 
        default: 'STUDENT' 
    },
    max_quota: { type: Number, default: 5 } // Dành riêng cho Giảng viên
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);