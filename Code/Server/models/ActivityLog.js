const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
    user_code: { type: String, default: null },
    user_name: { type: String, default: 'Khách' },
    email: { type: String, default: null },
    role: { type: String, default: 'GUEST' },
    actionType: { type: String, default: 'UNKNOWN' },
    actionText: { type: String, required: true },
    method: { type: String, required: true },
    url: { type: String, required: true },
    statusCode: { type: Number, required: true },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
