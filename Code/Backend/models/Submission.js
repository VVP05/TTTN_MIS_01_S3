const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
    topic_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Topic', 
        required: true 
    },
    student_id: { 
        type: String 
    },
    milestone: { 
        type: Number 
    },
    milestone_step: { 
        type: Number 
    },
    file_path: { 
        type: String, 
        required: true 
    },
    original_name: { 
        type: String 
    },
    file_name: { 
        type: String 
    },
    stored_filename: {
        type: String
    },
    file_size: { 
        type: Number 
    },
    cloudinary_url: {
        type: String,
        default: undefined
    },
    is_draft: {
        type: Boolean,
        default: false
    },
    attempt: {
        type: Number,
        min: 1
    },
    review_status: {
        type: String,
        enum: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REVISION_REQUESTED', 'WITHDRAWN', 'SUPERSEDED'],
        default: 'PENDING_REVIEW'
    },
    feedback: {
        type: String,
        default: '',
        maxlength: 2000
    },
    grade: {
        type: Number,
        min: 0,
        max: 10,
        default: null
    },
    reviewed_by: {
        type: String,
        default: null
    },
    reviewed_at: {
        type: Date,
        default: null
    },
    withdrawn_by: {
        type: String,
        default: null
    },
    withdrawn_at: {
        type: Date,
        default: null
    },
    submitted_at: { 
        type: Date, 
        default: Date.now 
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Submission', submissionSchema);