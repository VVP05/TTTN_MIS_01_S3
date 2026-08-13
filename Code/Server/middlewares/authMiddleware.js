const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    try {
        // 1. Lấy token từ header 'Authorization' (Định dạng: "Bearer <token>")
        const authHeader = req.headers.authorization || req.headers.Authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Bạn chưa đăng nhập hoặc phiên làm việc không hợp lệ (Thiếu Token)!'
            });
        }

        // 2. Tách lấy chuỗi Token (bỏ chữ "Bearer " ở đầu)
        const token = authHeader.split(' ')[1];

        // 3. Xác thực Token với chuỗi bí mật JWT_SECRET trong file .env
        // (Nếu không có trong .env thì dùng tạm chuỗi mặc định để tránh crash app)
        const secretKey = process.env.JWT_SECRET || 'secret_key_tttn_2026';

        const decoded = jwt.verify(token, secretKey);

        // 4. Gán thông tin người dùng đã giải mã vào req.user để các Controller phía sau sử dụng
        // (Ví dụ: req.user.id, req.user.user_code, req.user.role...)
        req.user = decoded;

        // Cho phép đi tiếp vào Controller
        next();
    } catch (error) {
        console.error('Lỗi xác thực Token:', error.message);
        return res.status(403).json({
            success: false,
            message: 'Phiên đăng nhập đã hết hạn hoặc Token không hợp lệ. Vui lòng đăng nhập lại!'
        });
    }
};

module.exports = authMiddleware;