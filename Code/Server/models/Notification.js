const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient_code: { type: String, default: null },
    target: { type: String, enum: ['all', 'students', 'lecturers'], default: 'all' },
    type: { 
        type: String, 
        enum: ['LECTURER', 'FACULTY', 'SYSTEM'], 
        required: true,
        default: 'SYSTEM'
    },
    title: { type: String, required: true },
    content: { type: String, required: true },
    attachment: {
        name: { type: String, default: null },
        url: { type: String, default: null }
    },
    priority: { type: String, enum: ['info', 'warning', 'danger'], default: 'info' },
    isPinned: { type: Boolean, default: false },
    status: { type: String, enum: ['draft', 'published'], default: 'published' },
    is_read: { type: Boolean, default: false },
    read_by: { type: [String], default: [] },
    sender_name: { type: String, default: "Hệ thống" }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);