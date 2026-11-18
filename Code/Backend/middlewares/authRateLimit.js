const { rateLimit } = require('express-rate-limit');

const createLimiter = (limit, windowMs, message) => rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message }
});

const getLoginIdentifier = req => String(req.body?.user_code || '').trim().toUpperCase();
const loginWindowMs = 15 * 60 * 1000;

module.exports = {
    loginIpRateLimit: rateLimit({
        windowMs: loginWindowMs,
        limit: 1000,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        skipSuccessfulRequests: true,
        message: {
            success: false,
            message: 'Quá nhiều lần đăng nhập thất bại từ mạng này. Vui lòng thử lại sau 15 phút.'
        }
    }),
    loginAccountRateLimit: rateLimit({
        windowMs: loginWindowMs,
        limit: 10,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        keyGenerator: req => `login-account:${getLoginIdentifier(req)}`,
        skip: req => !getLoginIdentifier(req),
        skipSuccessfulRequests: true,
        message: {
            success: false,
            message: 'Tài khoản này có quá nhiều lần đăng nhập thất bại. Vui lòng thử lại sau 15 phút.'
        }
    }),
    passwordResetRequestRateLimit: createLimiter(3, 15 * 60 * 1000, 'Bạn đã yêu cầu quá nhiều lần. Vui lòng thử lại sau 15 phút.'),
    passwordResetSubmitRateLimit: createLimiter(10, 15 * 60 * 1000, 'Quá nhiều lần thử đặt lại mật khẩu. Vui lòng thử lại sau 15 phút.')
};
