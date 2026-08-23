const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db.js');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const topicRoutes = require('./routes/topicRoutes');
const submissionRoutes = require('./routes/submissionRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const activityLogRoutes = require('./routes/activityLogRoutes');
const documentRoutes = require('./routes/documentRoutes');
const activityLogger = require('./middlewares/activityLogger');
const groupController = require('./controllers/groupController');

dotenv.config();
connectDB();

const app = express();

app.use(cors());
app.use(express.json());
app.use(activityLogger);
app.use('/uploads', express.static('uploads'));

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

app.get('/api/groups/lecturer/:lecturerCode', groupController.getGroupsByLecturer);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));