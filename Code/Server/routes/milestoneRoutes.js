const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const milestoneController = require('../controllers/milestoneController');

const router = express.Router();

const requireRole = (...roles) => (req, res, next) => {
    const role = String(req.user?.role || '').toUpperCase();
    if (roles.includes(role)) return next();
    return res.status(403).json({ success: false, message: 'Bạn không có quyền thực hiện thao tác này.' });
};

router.get('/student', authMiddleware, requireRole('STUDENT'), milestoneController.getStudentMilestones);
router.get('/lecturer', authMiddleware, requireRole('LECTURER'), milestoneController.getLecturerMilestones);
router.post('/', authMiddleware, requireRole('LECTURER'), milestoneController.createMilestone);
router.patch('/:milestoneId', authMiddleware, requireRole('LECTURER'), milestoneController.updateMilestone);
router.delete('/:milestoneId', authMiddleware, requireRole('LECTURER'), milestoneController.deleteMilestone);

module.exports = router;