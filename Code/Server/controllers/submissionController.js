const Submission = require('../models/Submission');
const Topic = require('../models/Topic');

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