const jwt = require('jsonwebtoken');
const getJwtSecret = require('../utils/jwtSecret');
const ActivityLog = require('../models/ActivityLog');
const {
    getRoleFromRequest,
    getTabSessionIdFromRequest,
    getTokenFromRequest
} = require('../utils/authCookie');

const ignoredPollingPaths = [
    /^\/api\/notifications\/(?:lecturer\/)?[^/]+$/,
    /^\/api\/topics\/lecturer\/[^/]+\/pending-review$/
];

// Các endpoint GET đặc thù mang tính nghiệp vụ cần ghi nhận
const isBusinessGetRequest = (path) => {
    if (path.includes('/export')) return true;
    if (path.includes('/download')) return true;
    return false;
};

const shouldIgnoreRequest = (req) => {
    // Chỉ ghi nhận các API của hệ thống
    if (!req.path.startsWith('/api/')) return true;

    // Không ghi log chính trang đọc/xuất nhật ký để tránh vòng lặp
    if (req.path.startsWith('/api/activity-logs')) return true;

    // Bỏ qua kiểm tra session /auth/session
    if (req.path.startsWith('/api/auth/session')) return true;

    const path = req.originalUrl.split('?')[0];

    // Bỏ qua polling định kỳ
    if (ignoredPollingPaths.some(pattern => pattern.test(path))) return true;

    // QUAN TRỌNG: Bỏ qua tất cả các request GET thông thường (chỉ giữ lại export và download)
    if (req.method === 'GET' && !isBusinessGetRequest(path)) {
        return true;
    }

    return false;
};

const getActionType = (req) => {
    const path = req.originalUrl.split('?')[0];
    if (['/api/auth/login', '/api/auth/logout', '/api/auth/forgot-password'].includes(path)) return 'AUTH';
    if (path === '/api/auth/change-password') return 'UPDATE';
    if (path.includes('/export') || path.includes('/download')) return 'READ';

    switch (req.method) {
        case 'POST': return 'CREATE';
        case 'PUT':
        case 'PATCH': return 'UPDATE';
        case 'DELETE': return 'DELETE';
        case 'GET': return 'READ';
        default: return 'OTHER';
    }
};

const parseUserFromToken = (req) => {
    const token = getTokenFromRequest(
        req,
        getRoleFromRequest(req),
        getTabSessionIdFromRequest(req)
    );
    if (!token) return null;
    try {
        return jwt.verify(token, getJwtSecret());
    } catch (error) {
        return null;
    }
};

const normalizeIp = (rawIp) => {
    if (!rawIp) return '127.0.0.1';
    let ip = String(rawIp).trim();
    if (ip.startsWith('::ffff:')) {
        ip = ip.replace('::ffff:', '');
    }
    if (ip === '::1' || ip === 'localhost') {
        ip = '127.0.0.1';
    }
    return ip;
};

const getActionText = (req) => {
    const path = req.originalUrl.split('?')[0];
    const method = req.method;

    // Auth
    if (path === '/api/auth/login') return 'Đăng nhập hệ thống';
    if (path === '/api/auth/logout') return 'Đăng xuất khỏi hệ thống';
    if (path === '/api/auth/forgot-password') return 'Yêu cầu đặt lại mật khẩu';
    if (path === '/api/auth/change-password') return 'Đổi mật khẩu tài khoản';
    if (path === '/api/auth/reset-password') return 'Đặt lại mật khẩu tài khoản';

    // Export
    if (path.includes('/api/auth/students/export')) return 'Xuất danh sách sinh viên (.CSV)';
    if (path.includes('/api/auth/lecturers/export')) return 'Xuất danh sách giảng viên (.CSV)';
    if (path.includes('/api/topics/export')) return 'Xuất danh sách đề tài (.CSV)';
    if (path.includes('/api/activity-logs/export')) return 'Xuất nhật ký hoạt động (.CSV)';

    // Import
    if (path.includes('/api/auth/students/import')) return 'Import danh sách sinh viên từ file Excel';
    if (path.includes('/api/auth/lecturers/import')) return 'Import danh sách giảng viên từ file Excel';

    // Students & Lecturers CRUD
    if (path === '/api/auth/students' && method === 'POST') return 'Thêm sinh viên mới';
    if (/^\/api\/auth\/students\/[^/]+$/.test(path) && (method === 'PUT' || method === 'PATCH')) return 'Cập nhật thông tin sinh viên';
    if (/^\/api\/auth\/students\/[^/]+$/.test(path) && method === 'DELETE') return 'Xóa tài khoản sinh viên';

    if (path === '/api/auth/lecturers' && method === 'POST') return 'Thêm giảng viên mới';
    if (/^\/api\/auth\/lecturers\/[^/]+$/.test(path) && (method === 'PUT' || method === 'PATCH')) return 'Cập nhật thông tin giảng viên';
    if (/^\/api\/auth\/lecturers\/[^/]+$/.test(path) && method === 'DELETE') return 'Xóa tài khoản giảng viên';

    // Topics & Groups
    if (path.includes('/assign-lecturer') || path.includes('/assign')) return 'Phân công Giảng viên hướng dẫn';
    if (path.includes('/approve')) return 'Duyệt đề tài thực tập';
    if (path.includes('/reject')) return 'Từ chối đề tài thực tập';
    if (path === '/api/topics' && method === 'POST') return 'Đăng ký / Tạo đề tài mới';
    if (/^\/api\/topics\/[^/]+$/.test(path) && (method === 'PUT' || method === 'PATCH')) return 'Cập nhật thông tin đề tài';
    if (/^\/api\/topics\/[^/]+$/.test(path) && method === 'DELETE') return 'Xóa đề tài';

    // Documents
    if (path.includes('/download')) return 'Tải xuống tài liệu hệ thống';
    if (path === '/api/documents' && method === 'POST') return 'Tải lên tài liệu biểu mẫu mới';
    if (/^\/api\/documents\/[^/]+$/.test(path) && method === 'DELETE') return 'Xóa tài liệu biểu mẫu';
    if (/^\/api\/documents\/[^/]+$/.test(path) && (method === 'PUT' || method === 'PATCH')) return 'Cập nhật tài liệu biểu mẫu';

    // Notifications
    if (path === '/api/notifications' && method === 'POST') return 'Tạo và phát hành thông báo mới';
    if (/^\/api\/notifications\/[^/]+$/.test(path) && (method === 'PUT' || method === 'PATCH')) return 'Cập nhật thông báo hệ thống';
    if (/^\/api\/notifications\/[^/]+$/.test(path) && method === 'DELETE') return 'Xóa thông báo hệ thống';
    if (path.includes('/pin')) return 'Ghim / Bỏ ghim thông báo';

    // Semesters
    if (path === '/api/semesters' && method === 'POST') return 'Tạo học kỳ mới';
    if (/^\/api\/semesters\/[^/]+$/.test(path) && (method === 'PUT' || method === 'PATCH')) return 'Cập nhật thông tin học kỳ';
    if (/^\/api\/semesters\/[^/]+$/.test(path) && method === 'DELETE') return 'Xóa học kỳ';
    if (path.includes('/activate')) return 'Kích hoạt học kỳ áp dụng';

    // Submissions
    if (path.includes('/submissions') && method === 'POST') return 'Nộp báo cáo thực tập';
    if (path.includes('/submissions') && method === 'DELETE') return 'Hủy nộp báo cáo thực tập';

    // Fallbacks based on method
    if (method === 'POST') return `Tạo mới dữ liệu (${path})`;
    if (method === 'PUT' || method === 'PATCH') return `Cập nhật dữ liệu (${path})`;
    if (method === 'DELETE') return `Xóa dữ liệu (${path})`;
    if (method === 'GET') return `Tải / Xem dữ liệu (${path})`;

    return `${method} ${path}`;
};

module.exports = (req, res, next) => {
    if (shouldIgnoreRequest(req)) {
        return next();
    }

    const decodedUser = parseUserFromToken(req);
    const userCode = decodedUser?.user_code || decodedUser?.username || null;
    const userName = decodedUser ? (decodedUser.full_name || decodedUser.fullname || decodedUser.name || userCode || 'Người dùng') : 'Khách';
    const userEmail = decodedUser?.email || null;
    const userRole = decodedUser?.role ? String(decodedUser.role).toUpperCase() : 'GUEST';
    const url = req.originalUrl.split('?')[0];

    const rawIp = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress || null;
    const normalizedIp = normalizeIp(rawIp);

    res.on('finish', async () => {
        try {
            const log = new ActivityLog({
                user_code: userCode,
                user_name: userName,
                email: userEmail,
                role: userRole,
                actionType: getActionType(req),
                actionText: getActionText(req),
                method: req.method,
                url,
                statusCode: res.statusCode,
                ip: normalizedIp,
                userAgent: req.headers['user-agent'] || null,
                metadata: {}
            });
            await log.save();
        } catch (error) {
            console.error('Lỗi lưu nhật ký hoạt động:', error);
        }
    });

    next();
};
