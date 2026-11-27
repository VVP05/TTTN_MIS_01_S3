const Submission = require('../models/Submission');
const Topic = require('../models/Topic');
const mongoose = require('mongoose');
const path = require('path');
const { notifyTopicStudents } = require('../services/notificationService');

function getStudentCodePattern(userCode) {
    const escaped = String(userCode || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}$`, 'i');
}

exports.listTopicSubmissions = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.topic_id)) {
            return res.status(400).json({ success: false, message: 'Mã đề tài không hợp lệ.' });
        }

        const topic = await Topic.findById(req.params.topic_id)
            .select('lecturer_code leader_code member2_code member3_code')
            .lean();
        if (!topic) return res.status(404).json({ success: false, message: 'Không tìm thấy đề tài.' });

        const role = String(req.user?.role || '').toUpperCase();
        const userCode = String(req.user?.user_code || '');
        const isStudent = role === 'STUDENT' &&
            [topic.leader_code, topic.member2_code, topic.member3_code]
                .some(code => code && getStudentCodePattern(code).test(userCode));
        const isLecturer = role === 'LECTURER' &&
            getStudentCodePattern(topic.lecturer_code).test(userCode);

        if (!isStudent && !isLecturer) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền xem bài nộp của đề tài này.' });
        }

        const query = { topic_id: topic._id };
        if (isLecturer) query.is_draft = { $ne: true };
        const submissions = await Submission.find(query)
            .sort({ milestone: 1, attempt: -1, submitted_at: -1, createdAt: -1 })
            .lean();

        return res.json({
            success: true,
            data: submissions.map(submission => ({
                ...submission,
                review_status: submission.review_status ||
                    (submission.is_draft ? 'DRAFT' : 'PENDING_REVIEW')
            }))
        });
    } catch (error) {
        console.error('Lỗi lấy lịch sử bài nộp:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải lịch sử bài nộp.' });
    }
};

exports.reviewSubmission = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.topic_id) || !mongoose.isValidObjectId(req.params.submissionId)) {
            return res.status(400).json({ success: false, message: 'Mã đề tài hoặc mã bài nộp không hợp lệ.' });
        }
        const reviewStatus = String(req.body.status || '').toUpperCase();
        const feedback = String(req.body.feedback || '').trim();
        let grade = null;
        if (req.body.grade !== undefined && req.body.grade !== null && req.body.grade !== '') {
            const parsedGrade = Number(req.body.grade);
            if (Number.isNaN(parsedGrade) || parsedGrade < 0 || parsedGrade > 10) {
                return res.status(400).json({ success: false, message: 'Điểm số không hợp lệ! Vui lòng nhập số từ 0 đến 10.' });
            }
            grade = Math.round(parsedGrade * 10) / 10; // Làm tròn 1 chữ số thập phân
        }
        if (!['APPROVED', 'REVISION_REQUESTED'].includes(reviewStatus)) {
            return res.status(400).json({ success: false, message: 'Trạng thái nhận xét không hợp lệ.' });
        }
        if (reviewStatus === 'REVISION_REQUESTED' && !feedback) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập nhận xét khi yêu cầu sinh viên nộp lại.' });
        }
        if (feedback.length > 2000) {
            return res.status(400).json({ success: false, message: 'Nhận xét không được vượt quá 2000 ký tự.' });
        }

        const submission = await Submission.findOne({
            _id: req.params.submissionId,
            topic_id: req.params.topic_id
        });
        if (!submission || submission.is_draft) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bài nộp cần nhận xét.' });
        }
        const topic = await Topic.findOne({
            _id: submission.topic_id,
            lecturer_code: getStudentCodePattern(req.user?.user_code)
        }).select('_id title leader_code member2_code member3_code');
        if (!topic) {
            return res.status(403).json({ success: false, message: 'Bạn không được phân công hướng dẫn đề tài này.' });
        }
        const reviewedSubmission = await Submission.findOneAndUpdate(
            {
                _id: submission._id,
                topic_id: submission.topic_id,
                is_draft: { $ne: true },
                review_status: 'PENDING_REVIEW'
            },
            {
                $set: {
                    review_status: reviewStatus,
                    feedback,
                    grade,
                    reviewed_by: req.user.user_code,
                    reviewed_at: new Date()
                }
            },
            { new: true }
        );
        if (!reviewedSubmission) {
            return res.status(409).json({ success: false, message: 'Bài nộp này vừa được xử lý. Vui lòng tải lại trang.' });
        }

        // Gửi thông báo đến toàn bộ thành viên nhóm đề tài
        try {
            const milestoneLabel = `Mốc ${reviewedSubmission.milestone || ''}`.trim();
            const gradeText = (grade !== null && grade !== undefined) ? ` [Điểm: ${grade}/10]` : '';
            const notiTitle = reviewStatus === 'APPROVED'
                ? `Bài nộp ${milestoneLabel} đã được duyệt${gradeText}`
                : `Yêu cầu nộp lại bài ${milestoneLabel}`;
            const notiContent = reviewStatus === 'APPROVED'
                ? `Giảng viên đã duyệt bài nộp ${milestoneLabel} của đề tài.${gradeText}${feedback ? ` Nhận xét: "${feedback}"` : ''}`
                : `Giảng viên yêu cầu nộp lại bài ${milestoneLabel}.${feedback ? ` Nhận xét: "${feedback}"` : ''}`;

            const eventKey = `submission-review:${reviewedSubmission._id}:${reviewStatus}:${Date.now()}`;
            await notifyTopicStudents(topic, {
                title: notiTitle,
                content: notiContent,
                eventKey: eventKey,
                priority: reviewStatus === 'APPROVED' ? 'info' : 'warning',
                type: 'LECTURER',
                senderName: req.user?.full_name || 'Giảng viên hướng dẫn'
            });
        } catch (notiErr) {
            console.error('Lỗi gửi thông báo cho sinh viên khi review bài nộp:', notiErr);
        }

        return res.json({ success: true, message: reviewStatus === 'APPROVED' ? 'Đã duyệt bài nộp.' : 'Đã gửi yêu cầu nộp lại.', data: reviewedSubmission });
    } catch (error) {
        console.error('Lỗi nhận xét bài nộp:', error);
        return res.status(500).json({ success: false, message: 'Không thể lưu nhận xét bài nộp.' });
    }
};

exports.downloadTopicSubmissionFile = async (req, res) => {
    try {
        const filename = String(req.params.filename || '');
        if (!filename || path.basename(filename) !== filename) {
            return res.status(400).json({ success: false, message: 'Tên tệp không hợp lệ.' });
        }

        const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const submission = await Submission.findOne({
            $or: [
                { stored_filename: filename },
                { file_path: { $regex: `[\\\\/]${escapedFilename}$`, $options: 'i' } }
            ]
        }).select('topic_id file_path cloudinary_url');
        if (!submission) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tệp báo cáo.' });
        }

        const role = String(req.user?.role || '').toUpperCase();
        const userCode = String(req.user?.user_code || '').trim();
        const escapedUserCode = userCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const topicFilter = {
            _id: submission.topic_id,
            ...(role === 'STUDENT'
                ? { $or: [
                    { leader_code: new RegExp(`^${escapedUserCode}$`, 'i') },
                    { member2_code: new RegExp(`^${escapedUserCode}$`, 'i') },
                    { member3_code: new RegExp(`^${escapedUserCode}$`, 'i') }
                ] }
                : role === 'LECTURER'
                    ? { lecturer_code: new RegExp(`^${escapedUserCode}$`, 'i') }
                    : { _id: null })
        };
        const authorizedTopic = await Topic.exists(topicFilter);
        if (!authorizedTopic) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền tải tệp báo cáo này.' });
        }

        // Nếu tệp được lưu trên Cloudinary hoặc URL từ xa -> Chuyển hướng trực tiếp
        if (submission.cloudinary_url || submission.file_path?.startsWith('http://') || submission.file_path?.startsWith('https://')) {
            return res.redirect(submission.cloudinary_url || submission.file_path);
        }

        const uploadRoot = path.resolve(__dirname, '../uploads');
        const filePath = path.resolve(uploadRoot, filename);
        if (!filePath.startsWith(`${uploadRoot}${path.sep}`)) {
            return res.status(400).json({ success: false, message: 'Đường dẫn tệp không hợp lệ.' });
        }

        const ext = path.extname(filename).toLowerCase();
        if (ext === '.pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(path.basename(submission.file_path || filename)) + '"');
        }

        return res.sendFile(filePath, error => {
            if (error && !res.headersSent) {
                res.status(error.statusCode || 404).json({ success: false, message: 'Không thể tải tệp báo cáo.' });
            }
        });
    } catch (error) {
        console.error('Lỗi tải tệp báo cáo:', error);
        return res.status(500).json({ success: false, message: 'Không thể tải tệp báo cáo.' });
    }
};

/**
 * @desc    Lấy thông tin các bài nộp của đề tài hiện tại
 * @route   GET /api/v1/submissions/topic
 * @access  Private (Sinh viên)
 */
exports.getTopicSubmissions = async (req, res) => {
    try {
        const studentId = req.user.id; // Lấy từ middleware auth
        
        // Tìm đề tài của sinh viên
        const topic = await Topic.findByStudentId(studentId);
        if (!topic) {
            return res.status(404).json({ 
                success: false, 
                message: 'Không tìm thấy thông tin đề tài' 
            });
        }

        // Lấy danh sách bài nộp của 3 mốc
        const [sub1, sub2, sub3] = await Promise.all([
            Submission.findByTopicAndMilestone(topic.id, 1),
            Submission.findByTopicAndMilestone(topic.id, 2),
            Submission.findByTopicAndMilestone(topic.id, 3)
        ]);

        return res.json({
            success: true,
            topicId: topic.id,
            submissions: { 
                m1: sub1 || null, 
                m2: sub2 || null, 
                m3: sub3 || null 
            }
        });
    } catch (error) {
        console.error("Lỗi getTopicSubmissions:", error);
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};

/**
 * @desc    Xử lý Upload Báo cáo theo Mốc (Milestone) & Tự động cập nhật Dashboard Giảng viên
 * @route   POST /api/v1/submissions/upload-milestone
 * @access  Private (Sinh viên)
 */
exports.uploadMilestone = async (req, res) => {
    try {
        const { topicId, milestoneStep } = req.body;
        const studentId = req.user.id;
        const file = req.file;

        // 1. Kiểm tra file đầu vào
        if (!file) {
            return res.status(400).json({ 
                success: false, 
                message: 'Vui lòng chọn file báo cáo!' 
            });
        }

        if (!topicId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Thiếu ID đề tài (topicId)!' 
            });
        }

        // 2. Chuẩn hóa số Mốc (Tránh trường hợp frontend gửi chuỗi "Mốc 2" hay "2" bị lỗi)
        const stepNumber = Number(String(milestoneStep).replace(/\D/g, '')) || 1;

        // 3. Lưu thông tin bài nộp vào bảng Submissions
        await Submission.save({
            topicId,
            studentId,
            milestoneStep: stepNumber,
            filePath: `/uploads/reports/${file.filename}`,
            originalName: file.originalname,
            fileSize: file.size
        });

        // =========================================================================
        // 4. TỰ ĐỘNG CẬP NHẬT TOPIC ĐỂ DASHBOARD GIẢNG VIÊN NHẢY SỐ NGAY LẬP TỨC
        // =========================================================================
        // Khi sinh viên nộp bài cho mốc nào -> Đề tài tự nhảy lên mốc đó và đổi trạng thái
        await Topic.findByIdAndUpdate(
            topicId,
            {
                $set: {
                    milestone: stepNumber,             // Cập nhật Mốc hiện tại (1, 2, 3...)
                    milestone_step: stepNumber,        // Lưu thêm trường phụ phòng hờ
                    progress_status: "hoan_thanh",     // Đổi sang trạng thái Hoàn thành (Màu xanh dương)
                    updatedAt: new Date()              // Cập nhật thời gian mới nhất
                }
            },
            { new: true }
        );

        return res.json({
            success: true,
            message: `Nộp báo cáo Mốc ${stepNumber} thành công! Tiến độ đã được cập nhật đến Giảng viên.`,
            file: {
                name: file.originalname,
                path: `/uploads/reports/${file.filename}`,
                milestone: stepNumber
            }
        });
    } catch (error) {
        console.error("Lỗi uploadMilestone:", error);
        return res.status(500).json({ 
            success: false, 
            message: error.message 
        });
    }
};