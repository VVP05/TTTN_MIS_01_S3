const mongoose = require('mongoose');

const lecturerTopicSchema = new mongoose.Schema({
    lecturer_code: { type: String, required: true }, 
    title: { type: String, required: true },         
    description: { type: String, default: '' }, // Bỏ required: true
    category: { type: String, default: 'Web / Ứng dụng' },
    max_groups: { type: Number, default: 1 },
    status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'REGISTERED'],
        default: 'PENDING'
    },
    feedback: { type: String, default: '' },
    is_active: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('LecturerTopic', lecturerTopicSchema, 'lecturer_topics');