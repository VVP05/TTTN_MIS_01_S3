const jwt = require('jsonwebtoken');
const ActivityLog = require('../models/ActivityLog');

const secretKey = process.env.JWT_SECRET || 'secret_key_tttn_2026';

const getActionType = (method) => {
    switch (method) {
        case 'POST': return 'CREATE';
        case 'PUT':
        case 'PATCH': return 'UPDATE';
        case 'DELETE': return 'DELETE';
        case 'GET': return 'READ';
        default: return 'OTHER';
    }
};

const parseUserFromToken = (req) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

    const token = authHeader.split(' ')[1];
    try {
        return jwt.verify(token, secretKey);
    } catch (error) {
        return null;
    }
};

const getActionText = (req) => {
    const normalized = `${req.method} ${req.originalUrl}`;
    if (req.originalUrl.startsWith('/api/auth/login')) {
        return 'Đăng nhập hệ thống';
    }
    if (req.originalUrl.startsWith('/api/auth/lecturers')) {
        return 'Xem danh sách Giảng viên';
    }
    if (req.originalUrl.startsWith('/api/topics/admin/assign-lecturer')) {
        return 'Phân công Giảng viên cho đề tài';
    }
    return normalized;
};

module.exports = (req, res, next) => {
    if (!req.path.startsWith('/api/') || req.path.startsWith('/api/activity-logs')) {
        return next();
    }

    const decodedUser = parseUserFromToken(req);
    const userCode = decodedUser?.user_code || req.body?.user_code || req.body?.user?.user_code || null;
    const userName = decodedUser?.full_name || decodedUser?.fullname || decodedUser?.name || req.body?.full_name || req.body?.user?.full_name || 'Khách';
    const userEmail = decodedUser?.email || req.body?.email || null;
    const userRole = decodedUser?.role ? String(decodedUser.role).toUpperCase() : 'GUEST';

    res.on('finish', async () => {
        try {
            const log = new ActivityLog({
                user_code: userCode,
                user_name: userName,
                email: userEmail,
                role: userRole,
                actionType: getActionType(req.method),
                actionText: getActionText(req),
                method: req.method,
                url: req.originalUrl,
                statusCode: res.statusCode,
                ip: req.ip || req.connection?.remoteAddress || null,
                userAgent: req.headers['user-agent'] || null,
                metadata: {
                    query: req.query || {},
                    body: req.method !== 'GET' ? req.body || {} : {}
                }
            });
            await log.save();
        } catch (error) {
            console.error('Lỗi lưu nhật ký hoạt động:', error);
        }
    });

    next();
};
