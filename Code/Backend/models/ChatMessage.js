const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    topic_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true, index: true },
    room_type: { type: String, enum: ['INTERNAL', 'LECTURER'], required: true },
    sender_code: { type: String, required: true, uppercase: true, trim: true },
    sender_name: { type: String, default: '' },
    content: { type: String, required: true, trim: true, maxlength: 2000 }
}, { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } });

chatMessageSchema.index({ topic_id: 1, room_type: 1, created_at: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
