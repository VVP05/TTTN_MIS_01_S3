const mongoose = require('mongoose');

const chatReadStateSchema = new mongoose.Schema({
    topic_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', required: true },
    room_type: { type: String, enum: ['INTERNAL', 'LECTURER'], required: true },
    user_code: { type: String, required: true, uppercase: true, trim: true },
    last_read_at: { type: Date, required: true }
}, { timestamps: true });

chatReadStateSchema.index(
    { topic_id: 1, room_type: 1, user_code: 1 },
    { unique: true }
);

module.exports = mongoose.model('ChatReadState', chatReadStateSchema);
