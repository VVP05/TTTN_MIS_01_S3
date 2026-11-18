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
const documentRoutes = require('./routes/documentRoutes');
const milestoneRoutes = require('./routes/milestoneRoutes');
const semesterRoutes = require('./routes/semesterRoutes');
const activityLogger = require('./middlewares/activityLogger');
const authMiddleware = require('./middlewares/authMiddleware');
const submissionController = require('./controllers/submissionController');
const groupController = require('./controllers/groupController');
const Milestone = require('./models/Milestone');
const Topic = require('./models/Topic');
const Semester = require('./models/Semester');
const Notification = require('./models/Notification');
const {
	startMilestoneReminderJob,
	startSemesterRegistrationNotifier
} = require('./services/notificationService');

const app = express();

app.use(createCorsMiddleware());
app.use(express.json());
app.use(activityLogger);

app.get('/uploads/:filename', authMiddleware, (req, res, next) => {
	if (['STUDENT', 'LECTURER'].includes(String(req.user?.role || '').toUpperCase())) return next();
	return res.status(403).json({ success: false, message: 'Bạn không có quyền tải tệp báo cáo.' });
}, submissionController.downloadTopicSubmissionFile);
app.use('/uploads/documents', express.static(path.join(__dirname, 'uploads', 'documents')));

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

app.get('/api/groups/lecturer/:lecturerCode', groupController.getGroupsByLecturer);

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

connectDB()
	.then(async () => {
		await migratePoolTopicIndexes();
		await Promise.all([
			Milestone.syncIndexes(),
			Topic.init(),
			Semester.init(),
			Notification.init(),
			ActivityLog.init()
		]);
	})
	.then(() => {
		startMilestoneReminderJob();
		startSemesterRegistrationNotifier();
		app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
	})
	.catch(error => {
		console.error(`❌ Không thể khởi động máy chủ: ${error.message}`);
		process.exit(1);
	});