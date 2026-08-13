const mongoose = require("mongoose");

// Schema Lịch họp / Báo cáo với GVHD
const MeetingSchema = new mongoose.Schema({
    topic_id: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required: true },
    student_code: { type: String, required: true },
    lecturer_code: { type: String, required: true },
    title: { type: String, required: true },
    meeting_date: { type: Date, required: true },
    time_start: { type: String, required: true }, // VD: "09:30"
    time_end: { type: String, required: true },   // VD: "10:30"
    type: { type: String, enum: ["ONLINE", "OFFLINE"], default: "ONLINE" },
    location: { type: String, required: true },   // Link Google Meet hoặc Số phòng
    source: { type: String, enum: ["STUDENT", "LECTURER"], default: "STUDENT" },
    status: { 
        type: String, 
        enum: ["PENDING", "APPROVED", "COMPLETED", "CANCELLED"], 
        default: "PENDING" 
    },
    notes: { type: String, default: "" }          // Ghi chú sau họp của Giảng viên
}, { timestamps: true });

// Schema Công việc cá nhân (To-do List)
const TodoSchema = new mongoose.Schema({
    student_code: { type: String, required: true },
    title: { type: String, required: true },
    is_completed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = {
    Meeting: mongoose.model("Meeting", MeetingSchema),
    Todo: mongoose.model("Todo", TodoSchema)
};