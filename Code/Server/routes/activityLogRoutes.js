const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const activityLogController = require('../controllers/activityLogController');

const requireAdminRole = (req, res, next) => {
    const userRole = req.user?.role ? String(req.user.role).toUpperCase() : '';
    const validAdminRoles = ['ADMIN', 'ADMINISTRATOR', 'QUAN_TRI', 'QUAN_TRI_VIEN'];

    if (validAdminRoles.includes(userRole)) {
        return next();
    }

    return res.status(403).json({
        success: false,
        message: 'Quyền truy cập bị từ chối. Chức năng này chỉ dành cho Quản trị viên!'
    });
};

router.get('/', authMiddleware, requireAdminRole, activityLogController.getActivityLogs);

module.exports = router;
