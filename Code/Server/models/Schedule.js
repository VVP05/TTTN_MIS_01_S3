const mongoose = require("mongoose");

// Schema Lịch họp / Báo cáo với GVHD
const MeetingSchema = new mongoose.Schema({
    topic_id: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required: true },
    availability_id: { type: mongoose.Schema.Types.ObjectId, ref: "AvailabilitySlot", default: null },
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

// Schema Công việc chung của nhóm (To-do List)
const TodoSchema = new mongoose.Schema({
    topic_id: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", default: null },
    student_code: { type: String, required: true },
    created_by: { type: String, default: "" },
    assigned_to: { type: String, default: "" },
    title: { type: String, required: true },
    due_date: { type: Date, default: null },
    is_completed: { type: Boolean, default: false }
}, { timestamps: true });

const AvailabilitySlotSchema = new mongoose.Schema({
    lecturer_code: { type: String, required: true },
    available_date: { type: Date, required: true },
    time_start: { type: String, required: true },
    time_end: { type: String, required: true },
    type: { type: String, enum: ["ONLINE", "OFFLINE"], default: "ONLINE" },
    location: { type: String, default: "" },
    max_bookings: { type: Number, default: 3, min: 1, max: 20 },
    booked_count: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["OPEN", "FULL", "CLOSED"], default: "OPEN" }
}, { timestamps: true });

module.exports = {
    Meeting: mongoose.model("Meeting", MeetingSchema),
    Todo: mongoose.model("Todo", TodoSchema),
    AvailabilitySlot: mongoose.model("AvailabilitySlot", AvailabilitySlotSchema)
};