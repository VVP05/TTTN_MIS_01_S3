const User = require('../models/User');
const Topic = require('../models/Topic');
const Group = require('../models/Group');
const GroupJoinRequest = require('../models/GroupJoinRequest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const getJwtSecret = require('../utils/jwtSecret');
const passwordResetEmail = require('../services/passwordResetEmail');
const {
    AUTH_COOKIE_NAME,
    getAuthCookieName,
    getTabAuthCookieName,
    getTabSessionIdFromRequest,
    hasInvalidTabSessionId,
    getRoleFromRequest,
    authCookieOptions,
    authCookieClearOptions,
    clearAuthCookies
} = require('../utils/authCookie');
const { ACTIVE_TOPIC_STATUSES, getLecturerGroupCount } = require('../services/lecturerQuota');

const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const codeRegex = value => new RegExp(`^${escapeRegex(value)}$`, 'i');
const topicMemberFilter = userCode => ({
    $or: [
        { leader_code: codeRegex(userCode) },
        { member2_code: codeRegex(userCode) },
        { member3_code: codeRegex(userCode) }
    ]
});
const INITIAL_PASSWORD = '123456';
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;
const RESET_REQUEST_RESPONSE = {
    success: true,
    message: 'Nếu thông tin khớp với tài khoản, liên kết đặt lại mật khẩu sẽ được gửi đến email đã đăng ký.'
};

const getPasswordValidationMessage = password => {
    if (typeof password !== 'string' || password.length < 8) {
        return 'Mật khẩu mới phải có ít nhất 8 ký tự!';
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
        return 'Mật khẩu mới phải có chữ hoa, chữ thường, chữ số và ký tự đặc biệt!';
    }
    return null;
};

exports.login = async (req, res) => {
    try {
        if (hasInvalidTabSessionId(req)) {
            return res.status(400).json({ success: false, message: 'Mã phiên của tab không hợp lệ.' });
        }

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

        const mustChangePassword = Boolean(user.must_change_password) || password === INITIAL_PASSWORD;
        if (mustChangePassword && !user.must_change_password) {
            user.must_change_password = true;
            await user.save();
        }

        const token = jwt.sign(
            {
                id: user._id,
                role: user.role,
                user_code: user.user_code,
                must_change_password: mustChangePassword
            },
            getJwtSecret(),
            { expiresIn: '1d' }
        );

        const tabSessionId = getTabSessionIdFromRequest(req);
        const cookieName = tabSessionId
            ? getTabAuthCookieName(tabSessionId)
            : getAuthCookieName(user.role);
        res.cookie(cookieName, token, authCookieOptions);
        res.clearCookie(AUTH_COOKIE_NAME, authCookieClearOptions);
        res.json({
            success: true,
            user: {
                id: user._id,
                user_code: user.user_code,
                full_name: user.full_name,
                role: user.role,
                must_change_password: mustChangePassword
            }
        });

    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ!', error: error.message });
    }
};

exports.getSession = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('_id user_code full_name role must_change_password');
        if (!user) {
            clearAuthCookies(res, req.authRole, req.authSessionId);
            return res.status(401).json({ success: false, message: 'Phiên đăng nhập không hợp lệ.' });
        }

        return res.json({
            success: true,
            user: {
                id: user._id,
                user_code: user.user_code,
                full_name: user.full_name,
                role: user.role,
                must_change_password: Boolean(user.must_change_password || req.user.must_change_password)
            }
        });
    } catch (error) {
        console.error('Lỗi lấy phiên đăng nhập:', error);
        return res.status(500).json({ success: false, message: 'Không thể xác minh phiên đăng nhập.' });
    }
};

exports.logout = (req, res) => {
    clearAuthCookies(res, getRoleFromRequest(req), getTabSessionIdFromRequest(req));
    return res.json({ success: true });
};

// Đổi mật khẩu (yêu cầu người dùng đã đăng nhập, xác minh mật khẩu hiện tại)
exports.changePassword = async (req, res) => {
    try {
        const user_code = String(req.user?.user_code || '').trim();
        const { currentPassword, newPassword } = req.body;

        if (!user_code) {
            return res.status(401).json({ success: false, message: 'Vui lòng đăng nhập lại.' });
        }
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ thông tin!' });
        }

        const passwordValidationMessage = getPasswordValidationMessage(newPassword);
        if (passwordValidationMessage) {
            return res.status(400).json({ success: false, message: passwordValidationMessage });
        }

        const user = await User.findOne({ user_code });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản!' });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng!' });
        }

        if (newPassword === currentPassword) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại!' });
        }

        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if (isSamePassword) {
            return res.status(400).json({ success: false, message: 'Mật khẩu mới không được trùng với mật khẩu hiện tại!' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.must_change_password = false;
        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Đổi mật khẩu thành công!',
            mustReauthenticate: Boolean(req.user.must_change_password)
        });
    } catch (error) {
        console.error('Lỗi đổi mật khẩu:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi đổi mật khẩu!', error: error.message });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const userCode = String(req.body?.user_code || '').trim();
        const email = String(req.body?.email || '').trim();

        if (!userCode || !email) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập đầy đủ Mã định danh và Email!' });
        }

        try {
            passwordResetEmail.getSettings();
        } catch (error) {
            console.error('Cấu hình gửi email đặt lại mật khẩu chưa sẵn sàng:', error.message);
            return res.status(503).json({
                success: false,
                message: 'Chức năng đặt lại mật khẩu chưa được cấu hình email. Vui lòng liên hệ quản trị viên.'
            });
        }

        const user = await User.findOne({ user_code: userCode });
        if (!user || !user.email || user.email.trim().toLowerCase() !== email.toLowerCase()) {
            return res.status(202).json(RESET_REQUEST_RESPONSE);
        }

        const now = Date.now();
        if (user.passwordResetRequestedAt &&
            now - new Date(user.passwordResetRequestedAt).getTime() < RESET_REQUEST_COOLDOWN_MS) {
            return res.status(202).json(RESET_REQUEST_RESPONSE);
        }

        const token = crypto.randomBytes(32).toString('hex');
        user.passwordResetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
        user.passwordResetExpiresAt = new Date(now + RESET_TOKEN_TTL_MS);
        user.passwordResetRequestedAt = new Date(now);
        await user.save();

        try {
            await passwordResetEmail.sendPasswordResetEmail({
                to: user.email,
                token,
                userName: user.full_name,
                userCode: user.user_code
            });
        } catch (error) {
            user.passwordResetTokenHash = undefined;
            user.passwordResetExpiresAt = undefined;
            user.passwordResetRequestedAt = undefined;
            await user.save();
            console.error('Không gửi được email đặt lại mật khẩu:', error);
            return res.status(503).json({
                success: false,
                message: 'Chưa gửi được email đặt lại mật khẩu. Vui lòng thử lại sau.'
            });
        }

        return res.status(202).json(RESET_REQUEST_RESPONSE);
    } catch (error) {
        console.error('Lỗi quên mật khẩu:', error);
        return res.status(500).json({ success: false, message: 'Không thể xử lý yêu cầu đặt lại mật khẩu.' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const token = String(req.body?.token || '').trim().toLowerCase();
        const newPassword = req.body?.new_password;
        if (!/^[a-f0-9]{64}$/.test(token)) {
            return res.status(400).json({ success: false, message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });
        }

        const passwordValidationMessage = getPasswordValidationMessage(newPassword);
        if (passwordValidationMessage) {
            return res.status(400).json({ success: false, message: passwordValidationMessage });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            passwordResetTokenHash: tokenHash,
            passwordResetExpiresAt: { $gt: new Date() }
        });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.' });
        }

        user.password = await bcrypt.hash(newPassword, 10);
        user.must_change_password = false;
        user.passwordResetTokenHash = undefined;
        user.passwordResetExpiresAt = undefined;
        user.passwordResetRequestedAt = undefined;
        await user.save();

        return res.json({ success: true, message: 'Đã đặt lại mật khẩu. Vui lòng đăng nhập bằng mật khẩu mới.' });
    } catch (error) {
        console.error('Lỗi đặt lại mật khẩu:', error);
        return res.status(500).json({ success: false, message: 'Không thể đặt lại mật khẩu lúc này.' });
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
            must_change_password: true,
            full_name,
            role: 'STUDENT',
            email,
            class: studentClass,
            major,
            status: 'NONE'
        });

        await student.save();
        return res.status(201).json({
            success: true,
            message: `Thêm sinh viên thành công. Mật khẩu ban đầu là ${INITIAL_PASSWORD} và sinh viên phải đổi mật khẩu ở lần đăng nhập đầu tiên.`,
            data: {
                user_code: student.user_code,
                full_name: student.full_name,
                role: student.role,
                email: student.email,
                class: student.class,
                major: student.major
            }
        });
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

exports.deleteStudent = async (req, res) => {
    try {
        const userCode = String(req.params.user_code || '').trim();
        const student = await User.findOneAndDelete({ user_code: userCode, role: 'STUDENT' });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy sinh viên.' });
        }

        return res.status(200).json({ success: true, message: 'Xóa sinh viên thành công!' });
    } catch (error) {
        console.error('Lỗi xóa sinh viên:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa sinh viên!', error: error.message });
    }
};

// Tạo giảng viên mới
exports.createLecturer = async (req, res) => {
    try {
        const { user_code, full_name, degree, dept, email } = req.body;
        const quotaInput = req.body.max_quota;
        const maxQuota = quotaInput === undefined ? 5 : Number(quotaInput);

        if (!user_code || !full_name || !degree || !dept || !email) {
            return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ Mã GV, Họ tên, Học vị, Bộ môn và Email.' });
        }
        if (quotaInput === null || (typeof quotaInput === 'string' && !quotaInput.trim()) ||
            !Number.isInteger(maxQuota) || maxQuota < 0) {
            return res.status(400).json({ success: false, message: 'Số nhóm tối đa phải là số nguyên không âm.' });
        }

        const existingUser = await User.findOne({ user_code });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Mã giảng viên đã tồn tại trong hệ thống.' });
        }

        const hashedPassword = await bcrypt.hash('123456', 10);
        const lecturer = new User({
            user_code,
            password: hashedPassword,
            must_change_password: true,
            full_name,
            role: 'LECTURER',
            email,
            degree,
            dept,
            max_quota: maxQuota
        });

        await lecturer.save();
        return res.status(201).json({
            success: true,
            message: `Thêm giảng viên thành công. Mật khẩu ban đầu là ${INITIAL_PASSWORD} và giảng viên phải đổi mật khẩu ở lần đăng nhập đầu tiên.`,
            data: {
                user_code: lecturer.user_code,
                full_name: lecturer.full_name,
                role: lecturer.role,
                email: lecturer.email,
                degree: lecturer.degree,
                dept: lecturer.dept,
                max_quota: lecturer.max_quota
            }
        });
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
        const quotaInput = req.body.max_quota;
        const maxQuota = quotaInput === undefined ? null : Number(quotaInput);
        if (quotaInput === null || (typeof quotaInput === 'string' && !quotaInput.trim()) ||
            (maxQuota !== null && (!Number.isInteger(maxQuota) || maxQuota < 0))) {
            return res.status(400).json({ success: false, message: 'Số nhóm tối đa phải là số nguyên không âm.' });
        }

        const lecturer = await User.findOne({ user_code, role: 'LECTURER' });
        if (!lecturer) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên.' });
        }
        if (maxQuota !== null) {
            const assignedGroups = await getLecturerGroupCount(lecturer.user_code);
            if (maxQuota < assignedGroups) {
                return res.status(409).json({
                    success: false,
                    message: `Không thể giảm chỉ tiêu thấp hơn số nhóm đang được hướng dẫn (${assignedGroups}).`,
                    assigned: assignedGroups,
                    quota: maxQuota
                });
            }
            lecturer.max_quota = maxQuota;
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

exports.updateLecturerQuotas = async (req, res) => {
    try {
        const requestedCodes = Array.isArray(req.body.user_codes)
            ? [...new Set(req.body.user_codes.map(code => String(code || '').trim()).filter(Boolean))]
            : [];
        const quotaInput = req.body.max_quota;
        const maxQuota = quotaInput === null || (typeof quotaInput === 'string' && !quotaInput.trim())
            ? NaN
            : Number(quotaInput);

        if (requestedCodes.length === 0) {
            return res.status(400).json({ success: false, message: 'Hãy chọn ít nhất một giảng viên.' });
        }
        if (!Number.isInteger(maxQuota) || maxQuota < 0) {
            return res.status(400).json({ success: false, message: 'Số nhóm tối đa phải là số nguyên không âm.' });
        }

        const lecturers = await User.find({
            user_code: { $in: requestedCodes },
            role: 'LECTURER'
        }).select('user_code full_name');
        if (lecturers.length !== requestedCodes.length) {
            return res.status(404).json({
                success: false,
                message: 'Một hoặc nhiều giảng viên đã chọn không còn tồn tại. Vui lòng tải lại danh sách.'
            });
        }

        const lecturerCodes = lecturers.map(lecturer => lecturer.user_code);
        const groupCounts = await Topic.aggregate([
            {
                $match: {
                    $or: lecturerCodes.map(userCode => ({ lecturer_code: codeRegex(userCode) })),
                    leader_code: { $exists: true, $nin: [null, ''] },
                    status: { $in: ACTIVE_TOPIC_STATUSES }
                }
            },
            { $group: { _id: '$lecturer_code', groupsCount: { $sum: 1 } } }
        ]);
        const groupCountByLecturer = new Map(groupCounts.map(item => [
            String(item._id || '').toUpperCase(),
            item.groupsCount
        ]));
        const overLimitLecturers = lecturers
            .map(lecturer => ({
                user_code: lecturer.user_code,
                full_name: lecturer.full_name,
                groupsCount: groupCountByLecturer.get(String(lecturer.user_code).toUpperCase()) || 0
            }))
            .filter(lecturer => lecturer.groupsCount > maxQuota);

        if (overLimitLecturers.length > 0) {
            const details = overLimitLecturers
                .map(lecturer => `${lecturer.user_code}: ${lecturer.groupsCount} nhóm`)
                .join(', ');
            return res.status(409).json({
                success: false,
                message: `Không thể đặt chỉ tiêu ${maxQuota} vì thấp hơn số nhóm đang hướng dẫn của: ${details}.`,
                data: { lecturers: overLimitLecturers }
            });
        }

        await User.updateMany(
            { _id: { $in: lecturers.map(lecturer => lecturer._id) }, role: 'LECTURER' },
            { $set: { max_quota: maxQuota } }
        );

        return res.status(200).json({
            success: true,
            message: `Đã cập nhật chỉ tiêu cho ${lecturers.length} giảng viên.`,
            data: {
                max_quota: maxQuota,
                user_codes: lecturerCodes
            }
        });
    } catch (error) {
        console.error('Lỗi cập nhật chỉ tiêu hàng loạt:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật chỉ tiêu hàng loạt.' });
    }
};

exports.deleteLecturer = async (req, res) => {
    try {
        const userCode = String(req.params.user_code || '').trim();
        const lecturer = await User.findOneAndDelete({ user_code: userCode, role: 'LECTURER' });

        if (!lecturer) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên.' });
        }

        return res.status(200).json({ success: true, message: 'Xóa giảng viên thành công!' });
    } catch (error) {
        console.error('Lỗi xóa giảng viên:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi xóa giảng viên!', error: error.message });
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
            .select('user_code full_name degree dept email max_quota createdAt')
            .sort({ createdAt: -1 });

        const lecturerCodes = lecturers.map(item => item.user_code);

        const groupCounts = await Topic.aggregate([
            {
                $match: {
                    lecturer_code: { $in: lecturerCodes },
                    leader_code: { $exists: true, $nin: [null, ''] },
                    status: { $in: ACTIVE_TOPIC_STATUSES }
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
        const requesterRole = String(req.user?.role || '').toUpperCase();

        const formatted = lecturers.map(item => ({
            user_code: item.user_code,
            full_name: item.full_name,
            degree: item.degree || 'Chưa cập nhật',
            dept: item.dept || 'Chưa cập nhật',
            ...(String(req.user?.role || '').toUpperCase() === 'ADMIN'
                ? { email: item.email || 'Chưa cập nhật' }
                : {}),
            groupsCount: groupMap[item.user_code] || 0,
            topicsCount: topicMap[item.user_code] || 0,
            ...(requesterRole === 'ADMIN' || requesterRole === 'STUDENT'
                ? { max_quota: item.max_quota ?? 5 }
                : {})
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
        const user = await User.findOne({ user_code }).select('user_code full_name role email phone class major degree dept max_quota');

        if (!user) {
            return res.status(404).json({ message: 'Không tìm thấy người dùng!' });
        }

        const requesterCode = String(req.user?.user_code || '').trim();
        const requesterRole = String(req.user?.role || '').toUpperCase();
        const isAdmin = requesterRole === 'ADMIN';
        const isOwner = requesterCode.toUpperCase() === user.user_code.toUpperCase();

        if (!isAdmin && !isOwner) {
            const userCodePattern = codeRegex(user.user_code);
            let related = false;

            if (requesterRole === 'STUDENT' && user.role === 'STUDENT') {
                related = Boolean(await Topic.exists({
                    $and: [
                        topicMemberFilter(requesterCode),
                        topicMemberFilter(user.user_code)
                    ]
                })) || Boolean(await GroupJoinRequest.exists({
                    status: { $in: ['PENDING', 'ACCEPTED'] },
                    $or: [
                        { leader_code: codeRegex(requesterCode), member_code: userCodePattern },
                        { leader_code: userCodePattern, member_code: codeRegex(requesterCode) }
                    ]
                }));
            } else if (requesterRole === 'STUDENT' && user.role === 'LECTURER') {
                related = Boolean(await Topic.exists({
                    lecturer_code: userCodePattern,
                    ...topicMemberFilter(requesterCode)
                }));
            } else if (requesterRole === 'LECTURER' && user.role === 'STUDENT') {
                related = Boolean(await Topic.exists({
                    lecturer_code: codeRegex(requesterCode),
                    ...topicMemberFilter(user.user_code)
                }));
            }

            if (!related) {
                return res.status(403).json({ success: false, message: 'Bạn không có quyền xem hồ sơ người dùng này.' });
            }

            return res.json({
                user_code: user.user_code,
                full_name: user.full_name,
                role: user.role
            });
        }

        return res.json({
            user_code: user.user_code,
            full_name: user.full_name,
            role: user.role,
            email: user.email || '',
            phone: user.phone || '',
            class: user.class || '',
            major: user.major || '',
            degree: user.degree || '',
            dept: user.dept || '',
            max_quota: Number.isInteger(user.max_quota) ? user.max_quota : (user.max_quota ?? 10)
        });
    } catch (error) {
        res.status(500).json({ message: 'Lỗi máy chủ khi tìm người dùng!', error: error.message });
    }
};

// Sinh viên tự cập nhật email và số điện thoại của tài khoản
exports.updateStudentProfile = async (req, res) => {
    try {
        const user_code = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'STUDENT' || !user_code ||
            user_code.toUpperCase() !== String(req.params.user_code || '').trim().toUpperCase()) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể cập nhật hồ sơ của mình.' });
        }
        const { email, phone, class: studentClass, major } = req.body;
        const student = await User.findOne({ user_code, role: 'STUDENT' });

        if (!student) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản sinh viên.' });
        }
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập email hợp lệ.' });
        }

        student.email = email.trim();
        student.phone = (phone || '').trim();
        student.class = (studentClass || '').trim();
        student.major = (major || '').trim();
        await student.save();

        return res.status(200).json({
            success: true,
            message: 'Cập nhật thông tin liên hệ thành công!',
            data: { user_code: student.user_code, full_name: student.full_name, email: student.email, phone: student.phone }
        });
    } catch (error) {
        console.error('Lỗi cập nhật hồ sơ sinh viên:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật hồ sơ.' });
    }
};

// Giảng viên tự cập nhật email và số điện thoại của tài khoản
exports.updateLecturerProfile = async (req, res) => {
    try {
        const user_code = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'LECTURER' || !user_code ||
            user_code.toUpperCase() !== String(req.params.user_code || '').trim().toUpperCase()) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể cập nhật hồ sơ của mình.' });
        }
        const { email, phone } = req.body;
        const lecturer = await User.findOne({ user_code, role: 'LECTURER' });

        if (!lecturer) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản giảng viên.' });
        }
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập email hợp lệ.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (lecturer.email && lecturer.email.toLowerCase() !== normalizedEmail) {
            const existingUser = await User.findOne({
                email: normalizedEmail,
                user_code: { $ne: user_code }
            });
            if (existingUser) {
                return res.status(400).json({ success: false, message: 'Email này đã được sử dụng bởi một tài khoản khác.' });
            }
        }

        lecturer.email = email.trim();
        lecturer.phone = (phone || '').trim();
        await lecturer.save();

        return res.status(200).json({
            success: true,
            message: 'Cập nhật thông tin liên hệ thành công!',
            data: {
                user_code: lecturer.user_code,
                full_name: lecturer.full_name,
                email: lecturer.email,
                phone: lecturer.phone,
                role: lecturer.role
            }
        });
    } catch (error) {
        console.error('Lỗi cập nhật hồ sơ giảng viên:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi cập nhật hồ sơ.' });
    }
};