const User = require('../models/User');
const Topic = require('../models/Topic');
const Group = require('../models/Group');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    try {
        const { user_code, password } = req.body;

        // 1. Kiểm tra tài khoản có tồn tại
        const user = await User.findOne({ user_code });
        if (!user) {
            return res.status(400).json({ message: 'Mã định danh hoặc mật khẩu không đúng!' });
        }

        // 2. Kiểm tra mật khẩu
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Mã định danh hoặc mật khẩu không đúng!' });
        }

        // 3. Tạo JWT Token
        const token = jwt.sign(
            { id: user._id, role: user.role, user_code: user.user_code },
            process.env.JWT_SECRET,
            { expiresIn: '1d' }
        );

        // 4. Trả về kết quả
        res.json({
            token,
            user: {
                id: user._id,
                user_code: user.user_code,
                full_name: user.full_name,
                role: user.role
            }
        });

    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ!', error: error.message });
    }
};

// Đổi mật khẩu (yêu cầu người dùng đã đăng nhập, xác minh mật khẩu hiện tại)
exports.changePassword = async (req, res) => {
    try {
        const { user_code, currentPassword, newPassword } = req.body;

        if (!user_code || !currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin!' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới phải có ít nhất 8 ký tự!' });
        }

        const user = await User.findOne({ user_code });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản!' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng!' });
        }

        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại!' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        return res.status(200).json({ success: true, message: 'Đổi mật khẩu thành công!' });
    } catch (error) {
        console.error('Lỗi đổi mật khẩu:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đổi mật khẩu!', error: error.message });
    }
};

// Quên mật khẩu — xác thực bằng Mã định danh + Email đã đăng ký, reset về mật khẩu tạm thời
exports.forgotPassword = async (req, res) => {
    try {
        const { user_code, email } = req.body;

        if (!user_code || !email) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ Mã định danh và Email!' });
        }

        const user = await User.findOne({ user_code });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản với mã định danh này!' });
        }

        if (!user.email || user.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
            return res.status(400).json({ success: false, message: 'Email không khớp với email đã đăng ký của tài khoản này!' });
        }

        const tempPassword = '123456';
        user.password = await bcrypt.hash(tempPassword, 10);
        await user.save();

        return res.status(200).json({
            success: true,
            message: `Đã đặt lại mật khẩu thành công! Vui lòng đăng nhập bằng mật khẩu tạm thời "${tempPassword}" rồi đổi lại mật khẩu ngay trong mục Đổi mật khẩu.`
        });
    } catch (error) {
        console.error('Lỗi quên mật khẩu:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ!', error: error.message });
    }
};

// Tạo sinh viên mới
exports.createStudent = async (req, res) => {
    try {
        const { user_code, full_name, class: studentClass, major, email } = req.body;

        if (!user_code || !full_name || !studentClass || !email) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ Mã SV, Họ tên, Lớp và Email.' });
        }

        const existingUser = await User.findOne({ user_code });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Mã sinh viên đã tồn tại trong hệ thống.' });
        }

        const hashedPassword = await bcrypt.hash('123456', 10);
        const student = new User({
            user_code,
            password: hashedPassword,
            full_name,
            role: 'STUDENT',
            email,
            class: studentClass,
            major,
            status: 'NONE'
        });

        await student.save();
        return res.status(201).json({ success: true, message: 'Thêm sinh viên thành công!', data: student });
    } catch (error) {
        console.error('Lỗi tạo sinh viên:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo sinh viên!', error: error.message });
    }
};

// Cập nhật sinh viên
exports.updateStudent = async (req, res) => {
    try {
        const { user_code } = req.params;
        const { full_name, class: studentClass, major, email } = req.body;

        const student = await User.findOne({ user_code, role: 'STUDENT' });
        if (!student) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên.' });
        }

        student.full_name = full_name || student.full_name;
        student.class = studentClass || student.class;
        student.major = major || student.major;
        student.email = email || student.email;

        await student.save();
        return res.status(200).json({ success: true, message: 'Cập nhật sinh viên thành công!', data: student });
    } catch (error) {
        console.error('Lỗi cập nhật sinh viên:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật sinh viên!', error: error.message });
    }
};

// Tạo giảng viên mới
exports.createLecturer = async (req, res) => {
    try {
        const { user_code, full_name, degree, dept, email } = req.body;

        if (!user_code || !full_name || !degree || !dept || !email) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ Mã GV, Họ tên, Học vị, Bộ môn và Email.' });
        }

        const existingUser = await User.findOne({ user_code });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Mã giảng viên đã tồn tại trong hệ thống.' });
        }

        const hashedPassword = await bcrypt.hash('123456', 10);
        const lecturer = new User({
            user_code,
            password: hashedPassword,
            full_name,
            role: 'LECTURER',
            email,
            degree,
            dept
        });

        await lecturer.save();
        return res.status(201).json({ success: true, message: 'Thêm giảng viên thành công!', data: lecturer });
    } catch (error) {
        console.error('Lỗi tạo giảng viên:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi tạo giảng viên!', error: error.message });
    }
};

// Cập nhật giảng viên
exports.updateLecturer = async (req, res) => {
    try {
        const { user_code } = req.params;
        const { full_name, degree, dept, email } = req.body;

        const lecturer = await User.findOne({ user_code, role: 'LECTURER' });
        if (!lecturer) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên.' });
        }

        lecturer.full_name = full_name || lecturer.full_name;
        lecturer.degree = degree || lecturer.degree;
        lecturer.dept = dept || lecturer.dept;
        lecturer.email = email || lecturer.email;

        await lecturer.save();
        return res.status(200).json({ success: true, message: 'Cập nhật giảng viên thành công!', data: lecturer });
    } catch (error) {
        console.error('Lỗi cập nhật giảng viên:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật giảng viên!', error: error.message });
    }
};

// Lấy danh sách tất cả Admin
exports.getAdmins = async (req, res) => {
    try {
        const admins = await User.find({ role: 'ADMIN' })
            .select('user_code full_name email createdAt status')
            .sort({ createdAt: -1 });

        const formatted = admins.map(item => ({
            username: item.user_code || 'admin',
            fullname: item.full_name || 'Quản trị viên',
            email: item.email || 'Chưa cập nhật',
            role: 'Quản trị hệ thống',
            lastLogin: item.updatedAt ? new Date(item.updatedAt).toLocaleString('vi-VN') : 'Chưa từng',
            status: item.status === 'ACTIVE' ? 'active' : 'active'
        }));

        res.json({
            success: true,
            total: formatted.length,
            data: formatted
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy danh sách admin!', error: error.message });
    }
};

// Lấy danh sách tất cả Giảng viên
exports.getLecturers = async (req, res) => {
    try {
        const lecturers = await User.find({ role: 'LECTURER' })
            .select('user_code full_name degree dept email createdAt')
            .sort({ createdAt: -1 });

        const lecturerCodes = lecturers.map(item => item.user_code);

        const groupCounts = await Topic.aggregate([
            {
                $match: {
                    lecturer_code: { $in: lecturerCodes },
                    leader_code: { $exists: true, $ne: null },
                    status: { $ne: 'REJECTED' }
                }
            },
            { $group: { _id: '$lecturer_code', groupsCount: { $sum: 1 } } }
        ]);

        const topics = await Topic.aggregate([
            { $match: { lecturer_code: { $in: lecturerCodes }, status: { $in: ['APPROVED', 'PENDING', 'NEED_REVISION', 'OPEN'] } } },
            { $group: { _id: '$lecturer_code', topicsCount: { $sum: 1 } } }
        ]);

        const groupMap = groupCounts.reduce((acc, cur) => {
            acc[cur._id] = cur.groupsCount;
            return acc;
        }, {});

        const topicMap = topics.reduce((acc, cur) => {
            acc[cur._id] = cur.topicsCount;
            return acc;
        }, {});

        const formatted = lecturers.map(item => ({
            user_code: item.user_code,
            full_name: item.full_name,
            degree: item.degree || 'Chưa cập nhật',
            dept: item.dept || 'Chưa cập nhật',
            email: item.email || 'Chưa cập nhật',
            groupsCount: groupMap[item.user_code] || 0,
            topicsCount: topicMap[item.user_code] || 0
        }));

        res.json({
            success: true,
            total: formatted.length,
            data: formatted
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy danh sách giảng viên!', error: error.message });
    }
};

// Lấy danh sách tất cả Sinh viên
exports.getStudents = async (req, res) => {
    try {
        const students = await User.find({ role: 'STUDENT' })
            .select('user_code full_name class major email status createdAt')
            .sort({ createdAt: -1 });

        const topics = await Topic.find({
            $or: [
                { leader_code: { $exists: true, $ne: null } },
                { member2_code: { $exists: true, $ne: null } },
                { member3_code: { $exists: true, $ne: null } }
            ]
        }).select('leader_code member2_code member3_code status').lean();

        const topicStatusByStudent = new Map();

        topics.forEach(topic => {
            const memberCodes = [
                topic.leader_code,
                topic.member2_code,
                topic.member3_code
            ].filter(Boolean);

            memberCodes.forEach(code => {
                const current = topicStatusByStudent.get(code);
                if (!current || (current !== 'APPROVED' && topic.status === 'APPROVED')) {
                    topicStatusByStudent.set(code, topic.status || 'PENDING');
                }
            });
        });

        const formatted = students.map(student => {
            const studentStatus = topicStatusByStudent.get(student.user_code) || 'NONE';

            return {
                id: student.user_code,
                name: student.full_name,
                class: student.class || 'Chưa cập nhật',
                major: student.major || 'Chưa cập nhật',
                email: student.email || 'Chưa cập nhật',
                status: studentStatus === 'APPROVED' ? 'APPROVED' : (studentStatus === 'PENDING' || studentStatus === 'NEED_REVISION' ? 'PENDING' : 'NONE')
            };
        });

        res.json({
            success: true,
            total: formatted.length,
            data: formatted
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi lấy danh sách sinh viên!', error: error.message });
    }
};

// Lấy thông tin 1 người dùng theo user_code (Sinh viên / Giảng viên)
exports.getUserByCode = async (req, res) => {
    try {
        const { user_code } = req.params;
        const user = await User.findOne({ user_code }).select('user_code full_name role');

        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng!' });
        }

        res.json({
            user_code: user.user_code,
            full_name: user.full_name,
            role: user.role
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ khi tìm người dùng!', error: error.message });
    }
};