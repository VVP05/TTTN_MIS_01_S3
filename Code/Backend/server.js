const express = require('express');
const dotenv = require('dotenv');
dotenv.config();
const getJwtSecret = require('./utils/jwtSecret');

try {
	getJwtSecret();
} catch (error) {
	console.error(`❌ Cấu hình JWT không hợp lệ: ${error.message}`);
	process.exit(1);
}

const path = require('path');
const helmet = require('helmet');
const mongoose = require('mongoose');
const connectDB = require('./config/db.js');
const { createCorsMiddleware } = require('./config/cors');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const topicRoutes = require('./routes/topicRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const ActivityLog = require('./models/ActivityLog');
const Document = require('./models/Document');
const documentRoutes = require('./routes/documentRoutes');
const milestoneRoutes = require('./routes/milestoneRoutes');
const semesterRoutes = require('./routes/semesterRoutes');
const chatRoutes = require('./routes/chatRoutes');
const aiRoutes = require('./routes/aiRoutes');
const activityLogger = require('./middlewares/activityLogger');
const authMiddleware = require('./middlewares/authMiddleware');
const submissionController = require('./controllers/submissionController');
const groupController = require('./controllers/groupController');
const Milestone = require('./models/Milestone');
const Topic = require('./models/Topic');
const Semester = require('./models/Semester');
const Notification = require('./models/Notification');
const ChatMessage = require('./models/ChatMessage');
const ChatReadState = require('./models/ChatReadState');
const {
	startMilestoneReminderJob,
	startSemesterRegistrationNotifier
} = require('./services/notificationService');

const app = express();

app.disable('x-powered-by');
app.use(helmet({
	contentSecurityPolicy: false,
	crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(createCorsMiddleware());
app.use(express.json());
app.use(activityLogger);

app.get('/uploads/:filename', authMiddleware, (req, res, next) => {
	if (['STUDENT', 'LECTURER'].includes(String(req.user?.role || '').toUpperCase())) return next();
	return res.status(403).json({ success: false, message: 'Bạn không có quyền tải tệp báo cáo.' });
}, submissionController.downloadTopicSubmissionFile);

app.get('/uploads/documents/:filename', async (req, res, next) => {
	try {
		const doc = await Document.findOne({ file_name: req.params.filename }).select('cloudinary_url file_path');
		if (doc?.cloudinary_url || (doc?.file_path && doc.file_path.startsWith('http'))) {
			return res.redirect(doc.cloudinary_url || doc.file_path);
		}
	} catch (error) {
		// Bỏ qua và chuyển sang kiểm tra file local
	}
	return next();
});
app.use('/uploads/documents', express.static(path.join(__dirname, 'uploads', 'documents')));

// Phục vụ giao diện Frontend tĩnh từ cùng máy chủ (Chung 1 tên miền)
const frontendDir = path.join(__dirname, '..', 'Frontend');

// Phục vụ trang đăng nhập tại /, /login và /index.html mà không đổi URL trên thanh địa chỉ
app.get(['/', '/login', '/index.html'], (req, res) => {
	res.sendFile(path.join(frontendDir, 'html', 'auth', 'index.html'));
});

app.use(express.static(frontendDir));

// Routes API
app.use('/api/auth', authRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/notifications', notificationRoutes);

// Khai báo Dashboard Route hỗ trợ cả v1 lẫn route mặc định
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/v1/lecturer/dashboard', dashboardRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/milestones', milestoneRoutes);
app.use('/api/semesters', semesterRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes);

app.get('/api/groups/lecturer/:lecturerCode', groupController.getGroupsByLecturer);

// Health check endpoint cho Render và monitoring
app.get('/health', (req, res) => {
	res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 Handler cho các route API không tồn tại
app.use('/api/*', (req, res) => {
	res.status(404).json({ success: false, message: 'Đường dẫn API không tồn tại.' });
});

// Global Error Handler tập trung
app.use((err, req, res, next) => {
	console.error('Unhandled server error:', err);
	const statusCode = err.status || err.statusCode || 500;
	const message = process.env.NODE_ENV === 'production' && statusCode === 500
		? 'Đã xảy ra lỗi hệ thống, vui lòng thử lại sau.'
		: (err.message || 'Lỗi máy chủ nội bộ.');
	res.status(statusCode).json({ success: false, message });
});

const PORT = process.env.PORT || 5000;
const migratePoolTopicIndexes = async () => {
	const legacyUniqueIndexes = new Set([
		'unique_active_pool_topic',
		'unique_active_topic_title'
	]);
	const collectionExists = await Topic.db.db
		.listCollections({ name: Topic.collection.name }, { nameOnly: true })
		.hasNext();
	if (!collectionExists) return;

	const indexes = await Topic.collection.indexes();
	for (const index of indexes) {
		if (legacyUniqueIndexes.has(index.name) && index.unique) {
			await Topic.collection.dropIndex(index.name);
			console.log(`Removed legacy unique index: ${index.name}`);
		}
	}
};

let serverInstance;

connectDB()
	.then(async () => {
		await migratePoolTopicIndexes();
		await Promise.all([
			Milestone.syncIndexes(),
			Topic.init(),
			Semester.init(),
			ChatMessage.init(),
			ChatReadState.init(),
			Notification.init(),
			ActivityLog.init()
		]);
	})
	.then(() => {
		startMilestoneReminderJob();
		startSemesterRegistrationNotifier();
		serverInstance = app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
	})
	.catch(error => {
		console.error(`❌ Không thể khởi động máy chủ: ${error.message}`);
		process.exit(1);
	});

const gracefulShutdown = signal => {
	console.log(`\nNhận tín hiệu ${signal}, đang đóng kết nối an toàn...`);
	if (serverInstance) {
		serverInstance.close(async () => {
			try {
				await mongoose.connection.close(false);
				console.log('✅ Đã ngắt kết nối MongoDB. Máy chủ dừng an toàn.');
				process.exit(0);
			} catch (err) {
				console.error('❌ Lỗi khi đóng MongoDB:', err);
				process.exit(1);
			}
		});
	} else {
		process.exit(0);
	}
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));