const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
    lecturerCode: { type: String, required: true, uppercase: true, trim: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null },
    step: { type: Number, required: true, min: 1 },
    name: { type: String, required: true, trim: true },
    desc: { type: String, default: '', trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    allowLate: { type: Boolean, default: false }
}, { timestamps: true });

milestoneSchema.index({ lecturerCode: 1, topicId: 1, step: 1 }, { unique: true });

module.exports = mongoose.model('Milestone', milestoneSchema);