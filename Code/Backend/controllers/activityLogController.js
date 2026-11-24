const { once } = require('events');
const ActivityLog = require('../models/ActivityLog');

const allowedRoles = new Set(['ADMIN', 'LECTURER', 'STUDENT', 'GUEST']);
const allowedActionTypes = new Set(['CREATE', 'UPDATE', 'DELETE', 'AUTH', 'READ', 'OTHER']);
const PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeIp(rawIp) {
    if (!rawIp) return '127.0.0.1';
    let ip = String(rawIp).trim();
    if (ip.startsWith('::ffff:')) {
        ip = ip.replace('::ffff:', '');
    }
    if (ip === '::1' || ip === 'localhost') {
        ip = '127.0.0.1';
    }
    return ip;
}

function buildFilter(query) {
    const filter = {};
    const role = String(query.role || '').trim().toUpperCase();
    const actionType = String(query.actionType || '').trim().toUpperCase();
    const search = String(query.search || '').trim().slice(0, 100);
    const status = String(query.status || '').trim().toUpperCase();
    const dateRange = String(query.dateRange || '').trim();

    if (role) {
        if (!allowedRoles.has(role)) return { error: 'Bộ lọc vai trò không hợp lệ.' };
        filter.role = role;
    }
    if (actionType) {
        if (!allowedActionTypes.has(actionType)) return { error: 'Bộ lọc thao tác không hợp lệ.' };
        filter.actionType = actionType;
    }
    if (status === 'SUCCESS') {
        filter.statusCode = { $lt: 400 };
    } else if (status === 'ERROR') {
        filter.statusCode = { $gte: 400 };
    }

    if (dateRange === 'today') {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        filter.createdAt = { $gte: start };
    } else if (dateRange === '7days') {
        const start = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        filter.createdAt = { $gte: start };
    } else if (dateRange === '30days') {
        const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        filter.createdAt = { $gte: start };
    }

    if (search) {
        const expression = new RegExp(escapeRegex(search), 'i');
        filter.$or = [
            { user_name: expression },
            { user_code: expression },
            { email: expression },
            { actionText: expression },
            { url: expression },
            { method: expression }
        ];
    }
    return { filter };
}

function getPagination(query) {
    const requestedPage = Number.parseInt(query.page, 10);
    const requestedLimit = Number.parseInt(query.limit, 10);
    return {
        page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
        limit: Number.isInteger(requestedLimit) && requestedLimit > 0
            ? Math.min(requestedLimit, MAX_PAGE_SIZE)
            : PAGE_SIZE
    };
}

function csvCell(value) {
    let text = String(value ?? '');
    if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values) {
    return `${values.map(csvCell).join(',')}\r\n`;
}

exports.getActivityLogs = async (req, res) => {
    try {
        const { filter, error } = buildFilter(req.query);
        if (error) return res.status(400).json({ success: false, message: error });

        const { page, limit } = getPagination(req.query);
        const [total, rawData, roleCounts] = await Promise.all([
            ActivityLog.countDocuments(filter),
            ActivityLog.find(filter)
                .select('-metadata')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            ActivityLog.aggregate([
                { $group: { _id: '$role', count: { $sum: 1 } } }
            ])
        ]);

        const stats = { total: 0, ADMIN: 0, LECTURER: 0, STUDENT: 0, GUEST: 0 };
        roleCounts.forEach(item => {
            stats.total += item.count;
            if (Object.hasOwn(stats, item._id)) stats[item._id] = item.count;
        });

        const data = rawData.map(log => ({
            ...log,
            ip: normalizeIp(log.ip)
        }));

        return res.status(200).json({
            success: true,
            total,
            page,
            limit,
            stats,
            data
        });
    } catch (error) {
        console.error('Lỗi lấy nhật ký hoạt động:', error);
        return res.status(500).json({ success: false, message: 'Lỗi máy chủ khi lấy nhật ký hoạt động.' });
    }
};

exports.exportActivityLogs = async (req, res) => {
    const { filter, error } = buildFilter(req.query);
    if (error) return res.status(400).json({ success: false, message: error });

    try {
        const cursor = ActivityLog.find(filter)
            .select('-metadata')
            .sort({ createdAt: -1 })
            .cursor();
        const headers = [
            'Thời gian',
            'Mã người dùng',
            'Người thực hiện',
            'Email',
            'Vai trò',
            'Loại thao tác',
            'Chi tiết hành động',
            'Phương thức',
            'Đường dẫn',
            'Mã HTTP',
            'Địa chỉ IP'
        ];

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="system-activity-logs.csv"');
        res.setHeader('Cache-Control', 'no-store');
        res.write(`\uFEFF${csvRow(headers)}`);

        for await (const log of cursor) {
            const timestamp = log.createdAt
                ? new Date(log.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                : '';
            const row = [
                timestamp,
                log.user_code,
                log.user_name,
                log.email,
                log.role,
                log.actionType,
                log.actionText,
                log.method,
                log.url,
                log.statusCode,
                normalizeIp(log.ip)
            ];
            if (!res.write(csvRow(row))) await once(res, 'drain');
        }
        return res.end();
    } catch (error) {
        console.error('Lỗi xuất nhật ký hoạt động:', error);
        if (res.headersSent) return res.destroy(error);
        return res.status(500).json({ success: false, message: 'Không thể xuất nhật ký hoạt động.' });
    }
};
