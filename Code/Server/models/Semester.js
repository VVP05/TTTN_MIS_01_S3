// File: Server/models/Semester.js
const mongoose = require('mongoose');

const semesterSchema = new mongoose.Schema({
    name: { type: String, required: true }, // VD: Học kỳ II 2025-2026
    start_date: { type: Date, required: true }, // Ngày bắt đầu đợt thực tập
    total_weeks: { type: Number, default: 15 },
    is_active: { type: Boolean, default: true } // Đợt hiện tại
}, { timestamps: true });

module.exports = mongoose.model('Semester', semesterSchema);