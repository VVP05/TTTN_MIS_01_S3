const mongoose = require('mongoose');

const groupRecruitmentSchema = new mongoose.Schema({
    leader_code: { type: String, required: true, uppercase: true, trim: true, unique: true },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' }
}, { timestamps: true });

groupRecruitmentSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('GroupRecruitment', groupRecruitmentSchema);
