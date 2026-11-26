const ExcelJS = require('exceljs');
const Topic = require('../models/Topic');
const User = require('../models/User');
const Submission = require('../models/Submission');

async function sendWorkbook(res, { filename, sheetName, columns, rows }) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QUẢN LÝ TTTN';
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = columns;
    worksheet.addRows(rows);
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
        from: 'A1',
        to: `${worksheet.getColumn(columns.length).letter}${rows.length + 1}`
    };

    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    header.alignment = { vertical: 'middle' };
    header.height = 24;

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(buffer));
}

exports.exportStudents = async (req, res) => {
    try {
        const students = await User.find({ role: 'STUDENT' })
            .select('user_code full_name class major email')
            .sort({ createdAt: -1 })
            .lean();
        const topics = await Topic.find({
            $or: [
                { leader_code: { $exists: true, $ne: null } },
                { member2_code: { $exists: true, $ne: null } },
                { member3_code: { $exists: true, $ne: null } }
            ]
        }).select('leader_code member2_code member3_code status').lean();

        const topicStatusByStudent = new Map();
        topics.forEach(topic => {
            [topic.leader_code, topic.member2_code, topic.member3_code].filter(Boolean).forEach(code => {
                const current = topicStatusByStudent.get(code);
                if (!current || (current !== 'APPROVED' && topic.status === 'APPROVED')) {
                    topicStatusByStudent.set(code, topic.status || 'PENDING');
                }
            });
        });

        const rows = students.map(student => {
            const topicStatus = topicStatusByStudent.get(student.user_code) || 'NONE';
            const status = topicStatus === 'APPROVED'
                ? 'Đã có đề tài'
                : ['PENDING', 'NEED_REVISION'].includes(topicStatus)
                    ? 'Chờ phê duyệt'
                    : 'Chưa có nhóm';
            return {
                user_code: student.user_code,
                full_name: student.full_name,
                class: student.class || '',
                major: student.major || '',
                email: student.email || '',
                status
            };
        });

        return await sendWorkbook(res, {
            filename: 'danh-sach-sinh-vien.xlsx',
            sheetName: 'Sinh viên',
            columns: [
                { header: 'MSSV', key: 'user_code', width: 18 },
                { header: 'Họ và tên', key: 'full_name', width: 28 },
                { header: 'Lớp', key: 'class', width: 16 },
                { header: 'Chuyên ngành', key: 'major', width: 30 },
                { header: 'Email', key: 'email', width: 32 },
                { header: 'Trạng thái đề tài', key: 'status', width: 22 }
            ],
            rows
        });
    } catch (error) {
        console.error('Lỗi xuất danh sách sinh viên:', error);
        return res.status(500).json({ success: false, message: 'Không thể xuất danh sách sinh viên.' });
    }
};

exports.exportLecturers = async (req, res) => {
    try {
        const lecturers = await User.find({ role: 'LECTURER' })
            .select('user_code full_name degree dept email')
            .sort({ createdAt: -1 })
            .lean();
        const lecturerCodes = lecturers.map(lecturer => lecturer.user_code);

        const [groupCounts, topicCounts] = await Promise.all([
            Topic.aggregate([
                {
                    $match: {
                        lecturer_code: { $in: lecturerCodes },
                        leader_code: { $exists: true, $ne: null },
                        status: { $ne: 'REJECTED' }
                    }
                },
                { $group: { _id: '$lecturer_code', count: { $sum: 1 } } }
            ]),
            Topic.aggregate([
                {
                    $match: {
                        lecturer_code: { $in: lecturerCodes },
                        status: { $in: ['APPROVED', 'PENDING', 'NEED_REVISION', 'OPEN'] }
                    }
                },
                { $group: { _id: '$lecturer_code', count: { $sum: 1 } } }
            ])
        ]);
        const groupsByLecturer = new Map(groupCounts.map(item => [item._id, item.count]));
        const topicsByLecturer = new Map(topicCounts.map(item => [item._id, item.count]));
        const rows = lecturers.map(lecturer => ({
            user_code: lecturer.user_code,
            full_name: lecturer.full_name,
            degree: lecturer.degree || '',
            dept: lecturer.dept || '',
            email: lecturer.email || '',
            groups_count: groupsByLecturer.get(lecturer.user_code) || 0,
            topics_count: topicsByLecturer.get(lecturer.user_code) || 0
        }));

        return await sendWorkbook(res, {
            filename: 'danh-sach-giang-vien.xlsx',
            sheetName: 'Giảng viên',
            columns: [
                { header: 'MSGV', key: 'user_code', width: 18 },
                { header: 'Họ và tên', key: 'full_name', width: 28 },
                { header: 'Học hàm / Học vị', key: 'degree', width: 22 },
                { header: 'Bộ môn', key: 'dept', width: 30 },
                { header: 'Email', key: 'email', width: 32 },
                { header: 'Số nhóm hướng dẫn', key: 'groups_count', width: 22 },
                { header: 'Số đề tài hướng dẫn', key: 'topics_count', width: 24 }
            ],
            rows
        });
    } catch (error) {
        console.error('Lỗi xuất danh sách giảng viên:', error);
        return res.status(500).json({ success: false, message: 'Không thể xuất danh sách giảng viên.' });
    }
};

exports.exportFinalGrades = async (req, res) => {
    try {
        const topics = await Topic.find({
            leader_code: { $exists: true, $ne: null },
            status: { $ne: 'REJECTED' }
        }).sort({ topic_code: 1 }).lean();

        // Lấy tất cả user liên quan (sinh viên + giảng viên)
        const userCodes = new Set();
        topics.forEach(t => {
            if (t.leader_code) userCodes.add(t.leader_code);
            if (t.member2_code) userCodes.add(t.member2_code);
            if (t.member3_code) userCodes.add(t.member3_code);
            if (t.lecturer_code) userCodes.add(t.lecturer_code);
        });

        const users = await User.find({ user_code: { $in: Array.from(userCodes) } })
            .select('user_code full_name class email')
            .lean();
        const userMap = new Map(users.map(u => [u.user_code, u]));

        // Lấy tất cả bài nộp đã được chấm điểm hoặc đã duyệt
        const topicIds = topics.map(t => t._id);
        const submissions = await Submission.find({
            topic_id: { $in: topicIds },
            $or: [
                { grade: { $ne: null } },
                { review_status: 'APPROVED' }
            ]
        }).sort({ submitted_at: 1, createdAt: 1 }).lean();

        // Gom điểm theo topic_id -> milestone -> grade
        // (lấy điểm của bài nộp mới nhất cho từng mốc)
        const gradesByTopic = new Map();
        submissions.forEach(sub => {
            const tId = sub.topic_id.toString();
            if (!gradesByTopic.has(tId)) {
                gradesByTopic.set(tId, {});
            }
            const mStep = sub.milestone || sub.milestone_step || 1;
            if (sub.grade !== null && sub.grade !== undefined) {
                gradesByTopic.get(tId)[mStep] = sub.grade;
            }
        });

        // Tạo danh sách dòng cho Excel: mỗi sinh viên 1 dòng
        const rows = [];
        let stt = 1;

        topics.forEach(topic => {
            const tId = topic._id.toString();
            const topicGrades = gradesByTopic.get(tId) || {};
            const g1 = topicGrades[1] !== undefined ? topicGrades[1] : '';
            const g2 = topicGrades[2] !== undefined ? topicGrades[2] : '';
            const g3 = topicGrades[3] !== undefined ? topicGrades[3] : '';

            const validGrades = [g1, g2, g3].filter(g => typeof g === 'number');
            const avgGrade = validGrades.length > 0 
                ? Math.round((validGrades.reduce((a, b) => a + b, 0) / validGrades.length) * 10) / 10 
                : '';

            const lecturer = userMap.get(topic.lecturer_code);
            const lecturerName = lecturer ? `${lecturer.full_name} (${topic.lecturer_code})` : (topic.lecturer_code || '');

            const members = [
                { code: topic.leader_code, role: 'Trưởng nhóm' },
                { code: topic.member2_code, role: 'Thành viên' },
                { code: topic.member3_code, role: 'Thành viên' }
            ].filter(m => Boolean(m.code));

            members.forEach(member => {
                const sv = userMap.get(member.code);
                rows.push({
                    stt: stt++,
                    user_code: member.code,
                    full_name: sv ? sv.full_name : '',
                    class_name: sv ? (sv.class || '') : '',
                    role_in_team: member.role,
                    topic_code: topic.topic_code || '',
                    topic_title: topic.title || '',
                    lecturer_name: lecturerName,
                    grade_m1: g1 !== '' ? g1 : '-',
                    grade_m2: g2 !== '' ? g2 : '-',
                    grade_m3: g3 !== '' ? g3 : '-',
                    grade_avg: avgGrade !== '' ? avgGrade : '-',
                    status: avgGrade !== '' ? (avgGrade >= 5 ? 'Đạt' : 'Chưa đạt') : 'Đang thực hiện'
                });
            });
        });

        const dateStr = new Date().toISOString().slice(0, 10);
        return await sendWorkbook(res, {
            filename: `bang-diem-tong-ket-${dateStr}.xlsx`,
            sheetName: 'Bảng điểm TTTN',
            columns: [
                { header: 'STT', key: 'stt', width: 8 },
                { header: 'MSSV', key: 'user_code', width: 16 },
                { header: 'Họ và tên', key: 'full_name', width: 28 },
                { header: 'Lớp', key: 'class_name', width: 14 },
                { header: 'Vai trò', key: 'role_in_team', width: 16 },
                { header: 'Mã nhóm', key: 'topic_code', width: 14 },
                { header: 'Tên đề tài', key: 'topic_title', width: 42 },
                { header: 'Cán bộ hướng dẫn', key: 'lecturer_name', width: 28 },
                { header: 'Mốc 1', key: 'grade_m1', width: 12 },
                { header: 'Mốc 2', key: 'grade_m2', width: 12 },
                { header: 'Mốc 3', key: 'grade_m3', width: 12 },
                { header: 'Điểm TB', key: 'grade_avg', width: 12 },
                { header: 'Kết quả', key: 'status', width: 18 }
            ],
            rows
        });
    } catch (error) {
        console.error('Lỗi xuất bảng điểm tổng kết:', error);
        return res.status(500).json({ success: false, message: 'Không thể xuất bảng điểm tổng kết.' });
    }
};
