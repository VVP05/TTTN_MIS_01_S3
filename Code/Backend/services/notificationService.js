const Notification = require('../models/Notification');
const Milestone = require('../models/Milestone');
const Topic = require('../models/Topic');
const Submission = require('../models/Submission');
const Semester = require('../models/Semester');

function normalizeRecipientCodes(codes) {
    return [...new Set(codes.filter(Boolean).map(code => String(code).trim().toUpperCase()))];
}

async function createEventNotification(recipientCode, {
    title,
    content,
    eventKey,
    priority = 'info',
    type = 'SYSTEM',
    senderName = 'Hệ thống',
    groupCode = null,
    senderCode = null
}) {
    const recipient = String(recipientCode || '').trim().toUpperCase();
    if (!recipient) return;

    try {
        await Notification.findOneAndUpdate(
            { event_key: `${eventKey}:${recipient}` },
            {
                $setOnInsert: {
                    recipient_code: recipient,
                    target: 'all',
                    type,
                    title,
                    content,
                    group_code: groupCode,
                    sender_code: senderCode,
                    priority,
                    status: 'published',
                    sender_name: senderName
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    } catch (error) {
        if (error.code === 11000) return;
        throw error;
    }
}

async function notifyUsers(codes, notification) {
    const recipients = normalizeRecipientCodes(codes);
    const results = await Promise.allSettled(
        recipients.map(code => createEventNotification(code, notification))
    );
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`Không thể tạo thông báo cho ${recipients[index]}:`, result.reason);
        }
    });
}

function getRegistrationWindow(semester) {
    if (!semester?.registration_start_date || !semester?.registration_end_date) return null;
    const storedStart = new Date(semester.registration_start_date);
    const storedEnd = new Date(semester.registration_end_date);
    if (semester.registration_window_has_time) {
        return { start: storedStart, end: storedEnd };
    }

    return {
        start: new Date(`${storedStart.toISOString().slice(0, 10)}T00:00:00+07:00`),
        end: new Date(`${storedEnd.toISOString().slice(0, 10)}T23:59:59.999+07:00`)
    };
}

async function notifyIfRegistrationIsOpen(semester) {
    if (!semester?.is_active) return;
    const window = getRegistrationWindow(semester);
    const now = new Date();
    if (!window || now < window.start || now > window.end) return;

    const eventKey = `semester-registration-open:${semester._id}:${window.start.toISOString()}:${window.end.toISOString()}`;
    const startText = window.start.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const endText = window.end.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    try {
        await Notification.findOneAndUpdate(
            { event_key: eventKey },
            {
                $setOnInsert: {
                    recipient_code: null,
                    target: 'students',
                    type: 'SYSTEM',
                    title: `Đã mở đăng ký đề tài — ${semester.name}`,
                    content: `Thời gian đăng ký đề tài cho ${semester.name} đang mở từ ${startText} đến ${endText}. Vào trang Đăng ký đề tài để đăng ký ngay.`,
                    priority: 'warning',
                    status: 'published',
                    sender_name: 'Hệ thống'
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    } catch (error) {
        if (error.code !== 11000) {
            console.error('Không thể tạo thông báo mở đăng ký học kỳ:', error);
        }
    }
}

function notifyTopicStudents(topic, notification) {
    return notifyUsers(
        [topic.leader_code, topic.member2_code, topic.member3_code],
        notification
    );
}

async function sendMilestoneDeadlineReminders() {
    const now = new Date();
    const reminderCutoff = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const milestones = await Milestone.find({
        topicId: null,
        startDate: { $lte: now },
        endDate: { $gt: now, $lte: reminderCutoff }
    }).lean();

    for (const milestone of milestones) {
        const topics = await Topic.find({
            lecturer_code: milestone.lecturerCode,
            status: 'APPROVED'
        }).select('_id title leader_code member2_code member3_code').lean();

        const hoursRemaining = Math.max(1, Math.ceil((milestone.endDate - now) / (60 * 60 * 1000)));
        const deadline = new Date(milestone.endDate).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
        for (const topic of topics) {
            const hasSubmitted = await Submission.exists({
                topic_id: topic._id,
                milestone: milestone.step,
                is_draft: { $ne: true }
            });
            if (hasSubmitted) continue;

            await notifyUsers(
                [topic.leader_code, topic.member2_code, topic.member3_code],
                {
                    title: `Nhắc hạn nộp: ${milestone.name || `Mốc ${milestone.step}`}`,
                    content: `Mốc "${milestone.name || milestone.step}" của đề tài "${topic.title}" sắp đến hạn nộp${hoursRemaining <= 24 ? ` trong khoảng ${hoursRemaining} giờ` : ` trong ${Math.ceil(hoursRemaining / 24)} ngày`}. Hạn nộp: ${deadline}.`,
                    eventKey: `milestone-deadline:${topic._id}:${milestone._id}:${new Date(milestone.endDate).toISOString()}`,
                    priority: hoursRemaining <= 24 ? 'warning' : 'info'
                }
            );
        }
    }
}

function startMilestoneReminderJob() {
    const run = () => sendMilestoneDeadlineReminders().catch(error => {
        console.error('Không thể chạy tác vụ nhắc hạn nộp:', error);
    });

    run();
    return setInterval(run, 6 * 60 * 60 * 1000);
}

function startSemesterRegistrationNotifier() {
    const run = async () => {
        try {
            const semester = await Semester.findOne({ is_active: true }).lean();
            await notifyIfRegistrationIsOpen(semester);
        } catch (error) {
            console.error('Không thể kiểm tra đợt đăng ký học kỳ đang mở:', error);
        }
    };

    run();
    return setInterval(run, 30 * 1000);
}

module.exports = {
    notifyUsers,
    notifyTopicStudents,
    notifyIfRegistrationIsOpen,
    startMilestoneReminderJob,
    startSemesterRegistrationNotifier
};
