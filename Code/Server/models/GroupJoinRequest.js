const mongoose = require('mongoose');

const groupJoinRequestSchema = new mongoose.Schema({
    leader_code: { type: String, required: true },
    member_code: { type: String, required: true },
    status: {
        type: String,
        enum: ['PENDING', 'ACCEPTED', 'REJECTED'],
        default: 'PENDING'
    }
}, { timestamps: true });

groupJoinRequestSchema.index({ leader_code: 1, member_code: 1, status: 1 });

module.exports = mongoose.model('GroupJoinRequest', groupJoinRequestSchema);
