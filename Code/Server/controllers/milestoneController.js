const Milestone = require('../models/Milestone');
const Topic = require('../models/Topic');
const Submission = require('../models/Submission');

const getStatus = (milestone) => {
    const now = new Date();
    if (now < milestone.startDate) return 'upcoming';
    if (now <= milestone.endDate) return 'active';
    return 'closed';
};

const serializeMilestone = (milestone) => ({
    _id: milestone._id,
    step: milestone.step,
    name: milestone.name,
    desc: milestone.desc,
    startDate: milestone.startDate,
    endDate: milestone.endDate,
    allowLate: milestone.allowLate,
    status: getStatus(milestone)
});

const validateMilestone = (body) => {
    const name = String(body.name || '').trim();
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);

    if (!name || !body.startDate || !body.endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return { error: 'Vui lòng nhập tên, thời gian bắt đầu và hạn nộp hợp lệ.' };
    }
    if (endDate <= startDate) {
        return { error: 'Hạn nộp phải sau thời gian bắt đầu.' };
    }

    return {
        value: {
            name,
            desc: String(body.desc || '').trim(),
            startDate,
            endDate,
            allowLate: body.allowLate === true
        }
    };
};

exports.getLecturerMilestones = async (req, res) => {
    try {
        const milestones = await Milestone.find({ lecturerCode: req.user.user_code, topicId: null })
            .sort({ step: 1 })
            .lean();
        return res.json({ success: true, data: milestones.map(serializeMilestone) });
    } catch (error) {
        console.error('Lỗi lấy milestone giảng viên:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải danh sách milestone.' });
    }
};

exports.getStudentMilestones = async (req, res) => {
    try {
        const userCode = String(req.user.user_code || '').trim();
        const codePattern = new RegExp(`^${userCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const topic = await Topic.findOne({
            status: 'APPROVED',
            $or: [
                { leader_code: codePattern },
                { member2_code: codePattern },
                { member3_code: codePattern }
            ]
        }).select('lecturer_code').lean();

        if (!topic?.lecturer_code) {
            return res.json({ success: true, data: [] });
        }

        const milestones = await Milestone.find({ lecturerCode: topic.lecturer_code, topicId: null })
            .sort({ step: 1 })
            .lean();
        return res.json({ success: true, data: milestones.map(serializeMilestone) });
    } catch (error) {
        console.error('Lỗi lấy milestone sinh viên:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải hạn nộp bài.' });
    }
};

exports.createMilestone = async (req, res) => {
    try {
        const validation = validateMilestone(req.body);
        if (validation.error) return res.status(400).json({ success: false, message: validation.error });

        const existingSteps = await Milestone.find({ lecturerCode: req.user.user_code, topicId: null })
            .select('step')
            .lean();
        const usedSteps = new Set(existingSteps.map(item => item.step));
        let step = 1;
        while (usedSteps.has(step)) step++;

        const milestone = await Milestone.create({
            ...validation.value,
            lecturerCode: req.user.user_code,
            topicId: null,
            step
        });
        return res.status(201).json({ success: true, data: serializeMilestone(milestone) });
    } catch (error) {
        console.error('Lỗi tạo milestone:', error);
        return res.status(500).json({ success: false, message: 'Không thể tạo milestone.' });
    }
};

exports.updateMilestone = async (req, res) => {
    try {
        const validation = validateMilestone(req.body);
        if (validation.error) return res.status(400).json({ success: false, message: validation.error });

        const milestone = await Milestone.findOneAndUpdate(
            { _id: req.params.milestoneId, lecturerCode: req.user.user_code, topicId: null },
            validation.value,
            { new: true, runValidators: true }
        );
        if (!milestone) return res.status(404).json({ success: false, message: 'Không tìm thấy milestone.' });
        return res.json({ success: true, data: serializeMilestone(milestone) });
    } catch (error) {
        console.error('Lỗi cập nhật milestone:', error);
        return res.status(500).json({ success: false, message: 'Không thể cập nhật milestone.' });
    }
};

exports.deleteMilestone = async (req, res) => {
    try {
        const milestone = await Milestone.findOne({ _id: req.params.milestoneId, lecturerCode: req.user.user_code, topicId: null });
        if (!milestone) return res.status(404).json({ success: false, message: 'Không tìm thấy milestone.' });

        const topics = await Topic.find({ lecturer_code: req.user.user_code, status: 'APPROVED' })
            .select(`_id milestone${milestone.step}_file`)
            .lean();
        const hasTopicSubmission = topics.some(topic => {
            const file = topic[`milestone${milestone.step}_file`];
            return file && (file.name || file.path || file.filename);
        });
        const hasSubmission = topics.length > 0 && await Submission.exists({
            topic_id: { $in: topics.map(topic => topic._id) },
            milestone: milestone.step
        });

        if (hasTopicSubmission || hasSubmission) {
            return res.status(409).json({ success: false, message: 'Không thể xóa milestone đã có sinh viên nộp bài.' });
        }

        await milestone.deleteOne();
        return res.json({ success: true, message: 'Đã xóa milestone.' });
    } catch (error) {
        console.error('Lỗi xóa milestone:', error);
        return res.status(500).json({ success: false, message: 'Không thể xóa milestone.' });
    }
};