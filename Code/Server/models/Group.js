const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
    group_code: { type: String, required: true },
    topic_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic' },
    lecturer_code: { type: String, required: true },
    leader_code: { type: String, required: true },
    member2_code: { type: String, default: null },
    progress: { type: Number, default: 0 },
    is_approved: { type: Boolean, default: true }
});

module.exports = mongoose.model('Group', groupSchema);