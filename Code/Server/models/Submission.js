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
    is_draft: {
        type: Boolean,
        default: false
    },
    submitted_at: { 
        type: Date, 
        default: Date.now 
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Submission', submissionSchema);