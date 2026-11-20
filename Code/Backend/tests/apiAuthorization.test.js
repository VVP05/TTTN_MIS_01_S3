const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
process.env.JWT_SECRET = 'test-only-jwt-secret-for-api-authorization-suite';

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const User = require('../models/User');
const Document = require('../models/Document');
const Topic = require('../models/Topic');
const Milestone = require('../models/Milestone');
const Submission = require('../models/Submission');
const Notification = require('../models/Notification');
const ChatMessage = require('../models/ChatMessage');
const ChatReadState = require('../models/ChatReadState');
const { AvailabilitySlot, Meeting, Todo } = require('../models/Schedule');
const LecturerTopic = require('../models/LecturerTopic');
const GroupJoinRequest = require('../models/GroupJoinRequest');
const Semester = require('../models/Semester');
const {
    submitMilestoneDraft,
    withdrawMilestoneSubmission,
    deleteMilestoneSubmission
} = require('../controllers/topicController');
const {
    createLecturerNotification,
    getAllNotifications
} = require('../controllers/notificationController');
const { getAllDocuments } = require('../controllers/documentController');
const { getLecturerQuotaStatus } = require('../services/lecturerQuota');
const { getTopicMilestoneProgress, getMilestoneProgressSeries } = require('../services/milestoneProgress');
const { getAvailablePoolTopicSlot } = require('../services/poolTopicCapacity');
const { createCorsMiddleware } = require('../config/cors');
const authMiddleware = require('../middlewares/authMiddleware');
const authRoutes = require('../routes/authRoutes');
const scheduleRoutes = require('../routes/scheduleRoutes');
const topicRoutes = require('../routes/topicRoutes');
const chatRoutes = require('../routes/chatRoutes');
const aiRoutes = require('../routes/aiRoutes');
const getJwtSecret = require('../utils/jwtSecret');
const { assertCollectionsEmpty, assertDevelopmentSeedEnvironment } = require('../seed');
const passwordResetEmail = require('../services/passwordResetEmail');
const { decodeLegacyFilename } = require('../utils/documentFilename');
const { extractOllamaAnswer, getOllamaConfig } = require('../services/ollamaChat');

const secretKey = process.env.JWT_SECRET;
const app = express();
app.use(express.json());
app.use(createCorsMiddleware(['https://frontend.example']));
app.use('/api/auth', authRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/topics', topicRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/ai', aiRoutes);
app.get('/test/session', authMiddleware, (req, res) => res.json({ role: req.user.role }));
app.post('/test/session', authMiddleware, (req, res) => res.json({ role: req.user.role }));
app.get('/test/identity', authMiddleware, (req, res) => res.json({
    role: req.user.role,
    user_code: req.user.user_code
}));

let server;
let baseUrl;

test('production defaults cross-site authentication cookies to secure SameSite=None', () => {
    const modulePath = require.resolve('../utils/authCookie');
    const result = spawnSync(process.execPath, [
        '-e',
        `const { authCookieOptions } = require(${JSON.stringify(modulePath)}); console.log(JSON.stringify({ sameSite: authCookieOptions.sameSite, secure: authCookieOptions.secure }));`
    ], {
        encoding: 'utf8',
        env: {
            ...process.env,
            NODE_ENV: 'production',
            AUTH_COOKIE_SAME_SITE: '',
            AUTH_COOKIE_SECURE: ''
        }
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { sameSite: 'none', secure: true });
});

test('JWT secret configuration rejects missing or placeholder values', () => {
    const originalSecret = process.env.JWT_SECRET;
    try {
        delete process.env.JWT_SECRET;
        assert.throws(getJwtSecret, /JWT_SECRET/);
        process.env.JWT_SECRET = 'secret_key_tttn_2026';
        assert.throws(getJwtSecret, /JWT_SECRET/);
        process.env.JWT_SECRET = 'replace-with-a-long-random-secret';
        assert.throws(getJwtSecret, /JWT_SECRET/);
        process.env.JWT_SECRET = 'a'.repeat(32);
        assert.equal(getJwtSecret(), process.env.JWT_SECRET);
    } finally {
        process.env.JWT_SECRET = originalSecret;
    }
});

test('seed safety check rejects any populated collection and accepts empty collections', async () => {
    const emptyCollection = { countDocuments: async () => 0 };
    const populatedCollection = { countDocuments: async () => 3 };

    await assert.doesNotReject(() => assertCollectionsEmpty([
        { name: 'users', model: emptyCollection },
        { name: 'topics', model: emptyCollection }
    ]));
    await assert.rejects(
        () => assertCollectionsEmpty([
            { name: 'users', model: emptyCollection },
            { name: 'topics', model: populatedCollection }
        ]),
        /topics/
    );
});

test('sample data seeding is allowed only in development', () => {
    assert.doesNotThrow(() => assertDevelopmentSeedEnvironment('development'));
    assert.throws(() => assertDevelopmentSeedEnvironment('production'), /NODE_ENV=development/);
    assert.throws(() => assertDevelopmentSeedEnvironment(undefined), /NODE_ENV=development/);
});

test('login failures are rate-limited per account instead of blocking everyone on the same network', async t => {
    t.mock.method(User, 'findOne', async () => null);

    for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await request('/api/auth/login', {
            method: 'POST',
            body: { user_code: 'RATE_LIMITED_USER', password: 'wrong-password' }
        });
        assert.equal(response.status, 400);
    }

    const blockedAccountResponse = await request('/api/auth/login', {
        method: 'POST',
        body: { user_code: 'RATE_LIMITED_USER', password: 'wrong-password' }
    });
    assert.equal(blockedAccountResponse.status, 429);

    const otherAccountResponse = await request('/api/auth/login', {
        method: 'POST',
        body: { user_code: 'ANOTHER_USER', password: 'wrong-password' }
    });
    assert.equal(otherAccountResponse.status, 400);
});

test('forgot password sends a one-time email link without revealing whether an account exists', async t => {
    const configKeys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM', 'FRONTEND_RESET_URL'];
    const originalConfig = new Map(configKeys.map(key => [key, process.env[key]]));
    Object.assign(process.env, {
        SMTP_HOST: 'smtp.example.test',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false',
        SMTP_USER: 'sender@example.test',
        SMTP_PASS: 'test-only-password',
        SMTP_FROM: 'TTTN <sender@example.test>',
        FRONTEND_RESET_URL: 'https://frontend.example/reset-password.html'
    });

    const user = {
        user_code: 'SV01',
        email: 'sv01@example.test',
        async save() {}
    };
    let account = user;
    const sentMessages = [];
    t.mock.method(User, 'findOne', async () => account);
    t.mock.method(passwordResetEmail, 'sendPasswordResetEmail', async message => sentMessages.push(message));

    try {
        const validResponse = await request('/api/auth/forgot-password', {
            method: 'POST',
            body: { user_code: 'SV01', email: 'sv01@example.test' }
        });
        const validResult = await validResponse.json();
        assert.equal(validResponse.status, 202);
        assert.equal(sentMessages.length, 1);
        assert.equal(sentMessages[0].to, user.email);
        assert.match(sentMessages[0].token, /^[a-f0-9]{64}$/);
        assert.equal(user.passwordResetTokenHash, crypto.createHash('sha256').update(sentMessages[0].token).digest('hex'));
        assert.ok(user.passwordResetExpiresAt > new Date());
        assert.equal(JSON.stringify(validResult).includes(sentMessages[0].token), false);

        account = null;
        const unknownResponse = await request('/api/auth/forgot-password', {
            method: 'POST',
            body: { user_code: 'UNKNOWN', email: 'nobody@example.test' }
        });
        assert.equal(unknownResponse.status, 202);
        assert.deepEqual(await unknownResponse.json(), validResult);
        assert.equal(sentMessages.length, 1);
    } finally {
        for (const key of configKeys) {
            if (originalConfig.get(key) === undefined) delete process.env[key];
            else process.env[key] = originalConfig.get(key);
        }
    }
});

test('reset password accepts a valid one-time token and consumes it', async t => {
    const rawToken = 'a'.repeat(64);
    const user = {
        password: 'old-hash',
        must_change_password: true,
        passwordResetTokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
        passwordResetExpiresAt: new Date(Date.now() + 60_000),
        async save() {}
    };
    t.mock.method(User, 'findOne', async query => {
        assert.equal(query.passwordResetTokenHash, user.passwordResetTokenHash);
        assert.ok(query.passwordResetExpiresAt.$gt <= new Date());
        return user;
    });

    const response = await request('/api/auth/reset-password', {
        method: 'POST',
        body: { token: rawToken, new_password: 'StrongPass1!' }
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(user.must_change_password, false);
    assert.equal(user.passwordResetTokenHash, undefined);
    assert.equal(user.passwordResetExpiresAt, undefined);
    assert.equal(await bcrypt.compare('StrongPass1!', user.password), true);
});

test('accounts using the shared initial password are required to change it at first login', async t => {
    const user = {
        _id: 'user-id',
        user_code: 'SV01',
        full_name: 'Student',
        role: 'STUDENT',
        password: 'hashed-password',
        must_change_password: false,
        async save() {}
    };
    t.mock.method(User, 'findOne', async () => user);
    t.mock.method(bcrypt, 'compare', async (_password, _hash) => true);

    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
            Origin: 'https://frontend.example',
            'Content-Type': 'application/json',
            'X-Auth-Session': 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        },
        body: JSON.stringify({ user_code: 'SV01', password: '123456' })
    });
    const result = await response.json();
    assert.equal(response.status, 200);
    assert.equal(result.user.must_change_password, true);

    const cookie = response.headers.getSetCookie().find(value => value.startsWith('tttn_session_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb='));
    assert.ok(cookie);
    const token = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));
    assert.equal(jwt.verify(token, secretKey).must_change_password, true);
    assert.equal(user.must_change_password, true);
});

test('change password rejects the current password and leaves forced change enabled', async t => {
    let saveCalled = false;
    const user = {
        password: 'current-hash',
        must_change_password: true,
        async save() {
            saveCalled = true;
        }
    };
    t.mock.method(User, 'findOne', async () => user);
    t.mock.method(bcrypt, 'compare', async candidate => candidate === 'ValidPassword1!');

    const response = await request('/api/auth/change-password', {
        method: 'PUT',
        role: 'STUDENT',
        userCode: 'SV01',
        body: {
            currentPassword: 'ValidPassword1!',
            newPassword: 'ValidPassword1!'
        }
    });
    const result = await response.json();

    assert.equal(response.status, 400);
    assert.match(result.message, /không được trùng/);
    assert.equal(saveCalled, false);
    assert.equal(user.must_change_password, true);
});

test('change password returns a success message after saving a different password', async t => {
    let saveCalled = false;
    const user = {
        password: 'current-hash',
        must_change_password: true,
        async save() {
            saveCalled = true;
        }
    };
    t.mock.method(User, 'findOne', async () => user);
    t.mock.method(bcrypt, 'compare', async candidate => candidate === 'ValidPassword1!');
    t.mock.method(bcrypt, 'hash', async () => 'new-password-hash');

    const response = await request('/api/auth/change-password', {
        method: 'PUT',
        role: 'STUDENT',
        userCode: 'SV01',
        body: {
            currentPassword: 'ValidPassword1!',
            newPassword: 'DifferentPassword2@'
        }
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.message, 'Đổi mật khẩu thành công!');
    assert.equal(saveCalled, true);
    assert.equal(user.password, 'new-password-hash');
    assert.equal(user.must_change_password, false);
});

test('authentication middleware blocks forced-password accounts from other protected APIs', async () => {
    const token = jwt.sign({
        role: 'STUDENT',
        user_code: 'SV01',
        must_change_password: true
    }, secretKey, { expiresIn: '1m' });

    const response = await fetch(`${baseUrl}/test/identity`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'PASSWORD_CHANGE_REQUIRED');
});

test('chat unread summary is limited to each role’s accessible rooms', async t => {
    const topic = { _id: 'topic-1', leader_code: 'SV01' };
    t.mock.method(Topic, 'find', () => ({
        select() { return this; },
        lean: async () => [topic]
    }));
    t.mock.method(ChatReadState, 'find', () => ({
        select() { return this; },
        lean: async () => []
    }));
    t.mock.method(ChatMessage, 'aggregate', async () => [
        { _id: { topic_id: topic._id, room_type: 'INTERNAL' }, count: 2 },
        { _id: { topic_id: topic._id, room_type: 'LECTURER' }, count: 1 }
    ]);

    const studentResponse = await request('/api/chat/unread', {
        role: 'STUDENT',
        userCode: 'SV01'
    });
    const studentResult = await studentResponse.json();
    assert.equal(studentResponse.status, 200);
    assert.equal(studentResult.data.total_unread, 3);
    assert.deepEqual(studentResult.data.rooms.map(room => room.room_type), ['INTERNAL', 'LECTURER']);

    const lecturerResponse = await request('/api/chat/unread', {
        role: 'LECTURER',
        userCode: 'GV01'
    });
    const lecturerResult = await lecturerResponse.json();
    assert.equal(lecturerResponse.status, 200);
    assert.equal(lecturerResult.data.total_unread, 1);
    assert.deepEqual(lecturerResult.data.rooms.map(room => room.room_type), ['LECTURER']);
});

test('opening a chat room marks its latest message as read', async t => {
    const latestMessageAt = new Date();
    const topic = { _id: 'topic-1', leader_code: 'SV01', member2_code: 'SV02', member3_code: '' };
    t.mock.method(Topic, 'findById', () => ({
        lean: async () => topic
    }));
    t.mock.method(ChatMessage, 'find', () => ({
        sort() { return this; },
        limit() { return this; },
        lean: async () => [
            { sender_code: 'SV01', created_at: latestMessageAt },
            { sender_code: 'SV02', created_at: new Date(latestMessageAt.getTime() - 1000) }
        ]
    }));
    let readStateUpdate;
    t.mock.method(ChatReadState, 'updateOne', async (...args) => {
        readStateUpdate = args;
    });

    const response = await request('/api/chat/topics/topic-1?room=INTERNAL', {
        role: 'STUDENT',
        userCode: 'SV01'
    });
    assert.equal(response.status, 200);
    assert.equal(readStateUpdate[0].user_code, 'SV01');
    assert.equal(readStateUpdate[1].$max.last_read_at, latestMessageAt);
    assert.equal(readStateUpdate[2].upsert, true);
});

test('non-leader students cannot read the lecturer chat room', async t => {
    t.mock.method(Topic, 'findById', () => ({
        lean: async () => ({ _id: 'topic-1', leader_code: 'SV01', member2_code: 'SV02' })
    }));
    const findMessages = t.mock.method(ChatMessage, 'find', async () => {
        throw new Error('Chat messages must not be queried for a denied room.');
    });

    const response = await request('/api/chat/topics/topic-1?room=LECTURER', {
        role: 'STUDENT',
        userCode: 'SV02'
    });
    assert.equal(response.status, 403);
    assert.equal(findMessages.mock.callCount(), 0);
});

before(async () => {
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
});

function tokenFor(role, userCode) {
    return jwt.sign({ role, user_code: userCode }, secretKey, { expiresIn: '1m' });
}

async function request(path, { method = 'GET', role, userCode, body } = {}) {
    const headers = {};
    if (role && userCode) headers.Authorization = `Bearer ${tokenFor(role, userCode)}`;
    if (body) headers['Content-Type'] = 'application/json';

    return fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
    });
}

async function requestExcelUpload(path, { role, userCode, fileName, fileBuffer }) {
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }), fileName);
    const headers = {};
    if (role && userCode) headers.Authorization = `Bearer ${tokenFor(role, userCode)}`;
    return fetch(`${baseUrl}${path}`, { method: 'POST', headers, body: formData });
}

test('lecturer quota counts only active assigned groups and blocks at the limit', async t => {
    t.mock.method(User, 'findOne', () => ({
        select: () => ({ lean: async () => ({ user_code: 'GV01', max_quota: 2 }) })
    }));
    t.mock.method(Topic, 'countDocuments', async filter => {
        assert.deepEqual(filter.status.$in, ['PENDING', 'NEED_REVISION', 'APPROVED']);
        assert.equal(filter.leader_code.$exists, true);
        assert.deepEqual(filter.leader_code.$nin, [null, '']);
        return 2;
    });

    const status = await getLecturerQuotaStatus('GV01');
    assert.deepEqual(status, { found: true, assigned: 2, quota: 2, available: false });
});

test('per-topic capacity allocates free slots, blocks new groups at the limit, and allows the same group to resubmit', () => {
    const activeGroups = [
        { _id: 'topic-1', leader_code: 'SV01', active_pool_topic_slot: 1 },
        { _id: 'topic-2', leader_code: 'SV02', active_pool_topic_slot: 2 },
        { _id: 'topic-3', leader_code: 'SV03', active_pool_topic_slot: 3 }
    ];

    assert.equal(getAvailablePoolTopicSlot(activeGroups.slice(0, 2), 3, 'SV04'), 3);
    assert.equal(getAvailablePoolTopicSlot(activeGroups, 3, 'SV04'), null);
    assert.equal(getAvailablePoolTopicSlot(activeGroups, 3, 'SV02'), 2);
    assert.equal(getAvailablePoolTopicSlot(activeGroups.slice(0, 1), 1, 'SV04'), null);
    assert.equal(getAvailablePoolTopicSlot(activeGroups.slice(0, 1), 1, 'SV01'), 1);
});

test('milestone progress detects late submissions and overdue missing submissions', () => {
    const topics = [{ _id: 'topic-1', lecturer_code: 'GV01' }];
    const milestones = [
        { step: 1, lecturerCode: 'GV01', startDate: '2025-03-01', endDate: '2025-03-08' },
        { step: 2, lecturerCode: 'GV01', startDate: '2025-03-01', endDate: '2025-03-09' },
        { step: 3, lecturerCode: 'GV01', startDate: '2025-03-15', endDate: '2025-03-20' },
        { step: 4, lecturerCode: 'GV01', startDate: '2025-03-01', endDate: '2025-03-09' }
    ];
    const submissions = [
        { topic_id: 'topic-1', milestone: 1, submitted_at: '2025-03-08T00:00:00Z' },
        { topic_id: 'topic-1', milestone: 2, submitted_at: '2025-03-09T00:00:01Z' },
        { topic_id: 'topic-1', milestone: 3, is_draft: true, submitted_at: '2025-03-09T00:00:00Z' }
    ];
    const progress = getTopicMilestoneProgress(topics, milestones, submissions, new Date('2025-03-10T00:00:00Z'));
    const topicProgress = progress.get('topic-1');

    assert.equal(topicProgress.milestones[0].status, 'completed');
    assert.equal(topicProgress.milestones[1].status, 'late');
    assert.equal(topicProgress.milestones[2].status, 'upcoming');
    assert.equal(topicProgress.milestones[3].status, 'late');
    assert.equal(topicProgress.is_late, true);
    assert.equal(topicProgress.completed_milestones, 2);
});

test('legacy file uploads without timestamps are not classified as on-time or late', () => {
    const topics = [{
        _id: 'topic-2',
        lecturer_code: 'GV01',
        milestone1_file: { name: 'report.pdf' }
    }];
    const milestones = [
        { step: 1, lecturerCode: 'GV01', startDate: '2025-03-01', endDate: '2025-03-08' }
    ];
    const progress = getTopicMilestoneProgress(topics, milestones, [], new Date('2025-03-10T00:00:00Z'));
    const topicProgress = progress.get('topic-2');
    const chart = getMilestoneProgressSeries(topics, progress, [1]);

    assert.equal(topicProgress.milestones[0].status, 'submitted_unknown');
    assert.equal(topicProgress.is_late, false);
    assert.equal(chart.series.find(series => series.name === 'Thiếu thời gian nộp').data[0], 1);
});

test('withdrawn and superseded milestone submissions do not count as completed', () => {
    const topics = [
        { _id: 'topic-withdrawn', lecturer_code: 'GV01' },
        { _id: 'topic-superseded', lecturer_code: 'GV01' }
    ];
    const milestones = [{
        lecturerCode: 'GV01',
        step: 1,
        startDate: new Date('2025-03-01T00:00:00Z'),
        endDate: new Date('2025-03-20T00:00:00Z')
    }];
    const submissions = [
        {
            topic_id: 'topic-withdrawn',
            milestone: 1,
            review_status: 'WITHDRAWN',
            submitted_at: new Date('2025-03-05T00:00:00Z')
        },
        {
            topic_id: 'topic-superseded',
            milestone: 1,
            review_status: 'SUPERSEDED',
            submitted_at: new Date('2025-03-05T00:00:00Z')
        }
    ];

    const progress = getTopicMilestoneProgress(
        topics,
        milestones,
        submissions,
        new Date('2025-03-10T00:00:00Z')
    );

    for (const topic of topics) {
        const topicProgress = progress.get(topic._id);
        assert.equal(topicProgress.completed_milestones, 0);
        assert.equal(topicProgress.milestones[0].status, 'in_progress');
    }
});

test('submitting a replacement supersedes the pending attempt', async t => {
    const previousSubmission = { _id: 'submission-old', review_status: 'PENDING_REVIEW' };
    const draft = {
        is_draft: true,
        async save() {
            this.saved = true;
        }
    };
    let supersededFilter;
    t.mock.method(Topic, 'findOne', async () => ({
        _id: 'topic-1',
        lecturer_code: 'GV01'
    }));
    t.mock.method(Milestone, 'findOne', async () => ({
        startDate: new Date(Date.now() - 60_000),
        endDate: new Date(Date.now() + 60_000),
        allowLate: false
    }));
    t.mock.method(Submission, 'findOne', filter => {
        if (filter.is_draft === true) return draft;
        return {
            sort() { return this; },
            select() { return this; },
            lean: async () => previousSubmission
        };
    });
    t.mock.method(Submission, 'updateOne', async (filter, update) => {
        supersededFilter = filter;
        assert.equal(update.$set.review_status, 'SUPERSEDED');
        return { modifiedCount: 1 };
    });

    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    await submitMilestoneDraft({
        params: { topic_id: 'topic-1', mIndex: '1' },
        user: { user_code: 'SV01' }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(draft.saved, true);
    assert.equal(draft.review_status, 'PENDING_REVIEW');
    assert.equal(supersededFilter._id, previousSubmission._id);
});

test('first official submission does not expect a previous attempt', async t => {
    const draft = {
        is_draft: true,
        async save() {
            this.saved = true;
        }
    };
    let updateCalled = false;
    t.mock.method(Topic, 'findOne', async () => ({
        _id: 'topic-1',
        lecturer_code: 'GV01'
    }));
    t.mock.method(Milestone, 'findOne', async () => ({
        startDate: new Date(Date.now() - 60_000),
        endDate: new Date(Date.now() + 60_000),
        allowLate: false
    }));
    t.mock.method(Submission, 'findOne', filter => {
        if (filter.is_draft === true) return draft;
        return {
            sort() { return this; },
            select() { return this; },
            lean: async () => null
        };
    });
    t.mock.method(Submission, 'updateOne', async () => {
        updateCalled = true;
        return { modifiedCount: 1 };
    });

    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    await submitMilestoneDraft({
        params: { topic_id: 'topic-1', mIndex: '1' },
        user: { user_code: 'SV01' }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(draft.saved, true);
    assert.equal(draft.review_status, 'PENDING_REVIEW');
    assert.equal(updateCalled, false);
});

test('students can withdraw a pending submission within the deadline', async t => {
    const previousSubmission = { _id: 'submission-old', review_status: 'PENDING_REVIEW' };
    let withdrawalUpdate;
    const queryResult = value => ({
        select() { return this; },
        sort() { return this; },
        lean: async () => value
    });
    t.mock.method(Topic, 'findOne', async () => ({
        _id: 'topic-1',
        lecturer_code: 'GV01'
    }));
    t.mock.method(Milestone, 'findOne', async () => ({
        startDate: new Date('2025-03-01T00:00:00Z'),
        endDate: new Date(Date.now() + 60_000),
        allowLate: false
    }));
    t.mock.method(Submission, 'findOne', filter => queryResult(
        filter.is_draft === true ? null : previousSubmission
    ));
    t.mock.method(Submission, 'findOneAndUpdate', async (filter, update) => {
        withdrawalUpdate = { filter, update };
        return { ...previousSubmission, review_status: 'WITHDRAWN' };
    });

    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    await withdrawMilestoneSubmission({
        params: { topic_id: 'topic-1', mIndex: '1' },
        user: { user_code: 'SV01' }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(withdrawalUpdate.filter._id, previousSubmission._id);
    assert.equal(withdrawalUpdate.update.$set.review_status, 'WITHDRAWN');
    assert.equal(withdrawalUpdate.update.$set.withdrawn_by, 'SV01');
});

test('deleting a draft clears a stale draft pointer from the topic', async t => {
    let topicUpdate;
    let deletedSubmission;
    const draft = {
        _id: 'draft-1',
        file_path: 'C:\\uploads\\new-file.docx',
        stored_filename: 'new-file.docx'
    };
    const queryResult = value => ({
        select() { return this; },
        sort() { return this; },
        lean: async () => value
    });
    t.mock.method(Topic, 'findOne', async () => ({
        _id: 'topic-1',
        lecturer_code: 'GV01',
        milestone1_file: {
            path: 'C:\\uploads\\old-file.docx',
            filename: 'old-file.docx',
            isDraft: true
        }
    }));
    t.mock.method(Milestone, 'findOne', async () => ({
        endDate: new Date(Date.now() + 60_000),
        allowLate: false
    }));
    t.mock.method(Submission, 'findOne', filter =>
        queryResult(filter.is_draft === true ? draft : null)
    );
    t.mock.method(Topic, 'updateOne', async (filter, update) => {
        topicUpdate = { filter, update };
        return { modifiedCount: 1 };
    });
    t.mock.method(Submission, 'deleteOne', async filter => {
        deletedSubmission = filter._id;
        return { deletedCount: 1 };
    });

    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    await deleteMilestoneSubmission({
        params: { topic_id: 'topic-1', mIndex: '1' },
        user: { user_code: 'SV01' }
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.success, true);
    assert.equal(deletedSubmission, draft._id);
    assert.deepEqual(topicUpdate.update.$unset, { milestone1_file: '' });
});

test('milestone progress with no configured milestones is not marked late', () => {
    const progress = getTopicMilestoneProgress(
        [{ _id: 'topic-3', lecturer_code: 'GV01' }],
        [],
        [],
        new Date('2025-03-10T00:00:00Z')
    );

    assert.equal(progress.get('topic-3').progress_status, 'Chưa cấu hình mốc');
    assert.equal(progress.get('topic-3').is_late, false);
});

test('account listing requires authentication and admin privileges', async () => {
    const unauthenticated = await request('/api/auth/students');
    assert.equal(unauthenticated.status, 401);

    const student = await request('/api/auth/students', { role: 'STUDENT', userCode: 'SV01' });
    assert.equal(student.status, 403);
});

test('student lecturer list includes current group counts and lecturer quotas', async t => {
    const lecturers = [{
        user_code: 'GV01',
        full_name: 'Giảng viên 1',
        max_quota: 1
    }];
    t.mock.method(User, 'find', () => ({
        select: () => ({ sort: async () => lecturers })
    }));
    t.mock.method(Topic, 'aggregate', async () => [
        { _id: 'GV01', groupsCount: 1 }
    ]);

    const response = await request('/api/auth/lecturers', {
        role: 'STUDENT',
        userCode: 'SV01'
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.data[0].groupsCount, 1);
    assert.equal(result.data[0].max_quota, 1);
});

test('bulk lecturer quota updates require admin privileges', async () => {
    const body = { user_codes: ['GV01'], max_quota: 5 };
    const unauthenticated = await request('/api/auth/lecturers/bulk-quota', {
        method: 'PUT',
        body
    });
    assert.equal(unauthenticated.status, 401);

    const studentResponse = await request('/api/auth/lecturers/bulk-quota', {
        method: 'PUT',
        role: 'STUDENT',
        userCode: 'SV01',
        body
    });
    assert.equal(studentResponse.status, 403);
});

test('bulk lecturer quota updates apply to all selected lecturers', async t => {
    const lecturers = [
        { _id: 'lecturer-1', user_code: 'GV01', full_name: 'Giảng viên 1' },
        { _id: 'lecturer-2', user_code: 'GV02', full_name: 'Giảng viên 2' }
    ];
    t.mock.method(User, 'find', () => ({ select: async () => lecturers }));
    t.mock.method(Topic, 'aggregate', async () => [
        { _id: 'GV01', groupsCount: 2 },
        { _id: 'GV02', groupsCount: 1 }
    ]);
    t.mock.method(User, 'updateMany', async (filter, update) => {
        assert.deepEqual(filter, { _id: { $in: ['lecturer-1', 'lecturer-2'] }, role: 'LECTURER' });
        assert.deepEqual(update, { $set: { max_quota: 3 } });
        return { modifiedCount: 2 };
    });

    const response = await request('/api/auth/lecturers/bulk-quota', {
        method: 'PUT',
        role: 'ADMIN',
        userCode: 'AD01',
        body: { user_codes: ['GV01', 'GV02'], max_quota: 3 }
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(result.data.user_codes, ['GV01', 'GV02']);
    assert.equal(result.data.max_quota, 3);
});

test('bulk lecturer quota updates reject the whole batch when a selected lecturer has too many groups', async t => {
    const lecturers = [
        { _id: 'lecturer-1', user_code: 'GV01', full_name: 'Giảng viên 1' },
        { _id: 'lecturer-2', user_code: 'GV02', full_name: 'Giảng viên 2' }
    ];
    let updateAttempted = false;
    t.mock.method(User, 'find', () => ({ select: async () => lecturers }));
    t.mock.method(Topic, 'aggregate', async () => [
        { _id: 'GV01', groupsCount: 2 },
        { _id: 'GV02', groupsCount: 4 }
    ]);
    t.mock.method(User, 'updateMany', async () => {
        updateAttempted = true;
    });

    const response = await request('/api/auth/lecturers/bulk-quota', {
        method: 'PUT',
        role: 'ADMIN',
        userCode: 'AD01',
        body: { user_codes: ['GV01', 'GV02'], max_quota: 3 }
    });
    const result = await response.json();

    assert.equal(response.status, 409);
    assert.match(result.message, /GV02: 4 nhóm/);
    assert.equal(updateAttempted, false);
});

test('admin topic endpoints reject non-admin callers', async () => {
    const student = await request('/api/topics/admin/all', { role: 'STUDENT', userCode: 'SV01' });
    assert.equal(student.status, 403);
});

test('student topic marketplace is restricted to authenticated students', async () => {
    const unauthenticated = await request('/api/topics/marketplace');
    const lecturer = await request('/api/topics/marketplace', { role: 'LECTURER', userCode: 'GV01' });
    assert.equal(unauthenticated.status, 401);
    assert.equal(lecturer.status, 403);
});

test('lecturer topic reads are restricted to the signed-in lecturer', async () => {
    const lecturer = await request('/api/topics/lecturer/GV02', { role: 'LECTURER', userCode: 'GV01' });
    assert.equal(lecturer.status, 403);
});

test('lecturers can preview and import valid Excel pool topics without choosing another lecturer identity', async t => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Danh sách đề tài');
    worksheet.addRow(['Tên đề tài', 'Mô tả', 'Lĩnh vực', 'Yêu cầu đầu vào', 'Mã giảng viên']);
    worksheet.addRow(['Thiết kế website', 'Xây dựng website quản lý.', 'AI / ML', 'JavaScript', 'GV99']);
    worksheet.addRow(['thiết kế WEBSITE', 'Dòng này trùng trong file.', 'Web / Ứng dụng', '', 'GV99']);
    worksheet.addRow(['Đề tài hiện có', 'Đã được thêm trước đó.', 'Khác', '', 'GV99']);
    worksheet.addRow(['Thiếu mô tả', '', 'Web / Ứng dụng', '', 'GV99']);
    const fileBuffer = Buffer.from(await workbook.xlsx.writeBuffer());

    t.mock.method(LecturerTopic, 'find', filter => {
        assert.equal(filter.lecturer_code.test('GV01'), true);
        return {
            select() { return this; },
            lean: async () => [{ title: 'Đề tài hiện có' }]
        };
    });
    t.mock.method(User, 'findOne', () => ({
        select() { return this; },
        lean: async () => ({ user_code: 'GV01', max_quota: 3 })
    }));
    t.mock.method(Topic, 'countDocuments', async () => 0);
    let insertedTopics;
    t.mock.method(LecturerTopic, 'insertMany', async topics => {
        insertedTopics = topics;
        return topics.map((topic, index) => ({ ...topic, _id: `imported-${index}` }));
    });

    const templateResponse = await request('/api/topics/lecturer-pool/import/template', {
        role: 'LECTURER',
        userCode: 'GV01'
    });
    assert.equal(templateResponse.status, 200);
    const templateWorkbook = new ExcelJS.Workbook();
    await templateWorkbook.xlsx.load(Buffer.from(await templateResponse.arrayBuffer()));
    assert.deepEqual(templateWorkbook.worksheets[0].getRow(1).values.slice(1), [
        'Tên đề tài', 'Mô tả', 'Lĩnh vực', 'Yêu cầu đầu vào'
    ]);

    const studentPreviewResponse = await requestExcelUpload('/api/topics/lecturer-pool/import/preview', {
        role: 'STUDENT',
        userCode: 'SV01',
        fileName: 'topics.xlsx',
        fileBuffer
    });
    assert.equal(studentPreviewResponse.status, 403);

    const previewResponse = await requestExcelUpload('/api/topics/lecturer-pool/import/preview', {
        role: 'LECTURER',
        userCode: 'GV01',
        fileName: 'topics.xlsx',
        fileBuffer
    });
    assert.equal(previewResponse.status, 200);
    const preview = (await previewResponse.json()).data;
    assert.equal(preview.total_rows, 4);
    assert.equal(preview.valid_count, 1);
    assert.equal(preview.error_count, 3);
    assert.equal(preview.rows[0].category, 'AI / ML');
    assert.match(preview.rows[1].errors.join(' '), /trùng trong file/);
    assert.match(preview.rows[2].errors.join(' '), /đã có trong kho/);
    assert.match(preview.rows[3].errors.join(' '), /Thiếu mô tả/);

    const importResponse = await requestExcelUpload('/api/topics/lecturer-pool/import', {
        role: 'LECTURER',
        userCode: 'GV01',
        fileName: 'topics.xlsx',
        fileBuffer
    });
    assert.equal(importResponse.status, 201);
    assert.equal((await importResponse.json()).data.imported_count, 1);
    assert.equal(insertedTopics.length, 1);
    assert.equal(insertedTopics[0].lecturer_code, 'GV01');
    assert.equal(insertedTopics[0].title, 'Thiết kế website');
    assert.equal(insertedTopics[0].status, 'APPROVED');
});

test('direct pool registration rejects students who already have an active topic', async t => {
    t.mock.method(User, 'find', () => ({
        select: async () => [{ user_code: 'SV01' }]
    }));
    t.mock.method(Topic, 'findOne', () => ({
        select: () => ({ lean: async () => ({ _id: 'existing-topic', leader_code: 'SV01' }) })
    }));

    const response = await request('/api/topics/register-pool', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV01',
        body: { leader_code: 'SV01', pool_topic_id: 'invalid-before-the-group-check' }
    });
    const result = await response.json();

    assert.equal(response.status, 409);
    assert.match(result.message, /đã có đề tài đang hoạt động/);
});

test('students can request to join an active registered group', async t => {
    const now = new Date();
    const group = {
        _id: 'topic-sv02',
        status: 'PENDING',
        leader_code: 'SV02',
        member2_code: null,
        member3_code: null
    };
    let createdRequest;
    t.mock.method(User, 'find', () => ({
        select: async () => [{ user_code: 'SV01' }, { user_code: 'SV02' }]
    }));
    t.mock.method(Topic, 'findOne', filter => filter.leader_code ? group : null);
    t.mock.method(Semester, 'findOne', () => ({
        lean: async () => ({
            is_active: true,
            registration_start_date: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            registration_end_date: new Date(now.getTime() + 24 * 60 * 60 * 1000)
        })
    }));
    t.mock.method(GroupJoinRequest, 'findOne', async () => null);
    t.mock.method(GroupJoinRequest, 'find', () => ({
        select: () => ({ lean: async () => [] })
    }));
    t.mock.method(GroupJoinRequest, 'create', async request => {
        createdRequest = request;
        return { ...request, _id: 'join-request-1' };
    });
    t.mock.method(Notification, 'findOneAndUpdate', async () => ({}));

    const response = await request('/api/topics/register', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV01',
        body: {
            registration_role: 'MEMBER',
            leader_code: 'SV02',
            member2_code: 'SV01',
            member3_code: null
        }
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.pending, true);
    assert.deepEqual(createdRequest, { leader_code: 'SV02', member_code: 'SV01' });
});

test('accepting a join request adds the student to an already registered topic', async t => {
    const topic = {
        _id: 'topic-sv03',
        status: 'APPROVED',
        leader_code: 'SV03',
        member2_code: null,
        member3_code: null
    };
    let updatedMember;
    t.mock.method(GroupJoinRequest, 'findOneAndUpdate', async () => ({
        _id: 'join-request-2',
        leader_code: 'SV03',
        member_code: 'SV04'
    }));
    t.mock.method(GroupJoinRequest, 'findOne', () => ({
        select: () => ({ lean: async () => null })
    }));
    t.mock.method(Topic, 'findOne', filter => ({
        select: () => ({
            lean: async () => filter.leader_code ? { _id: topic._id } : null
        })
    }));
    t.mock.method(Topic, 'findById', () => ({
        select: () => ({ lean: async () => topic })
    }));
    t.mock.method(Topic, 'updateOne', async (filter, update) => {
        updatedMember = update.$set.member2_code;
        return { modifiedCount: 1 };
    });
    t.mock.method(Notification, 'findOneAndUpdate', async () => ({}));

    const response = await request('/api/topics/join-requests/SV03/join-request-2', {
        method: 'PATCH',
        role: 'STUDENT',
        userCode: 'SV03',
        body: { status: 'ACCEPTED' }
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.success, true);
    assert.equal(updatedMember, 'SV04');
});

test('accepted members are synchronized to an existing topic when loading their topic page', async t => {
    const topic = {
        _id: 'topic-sv03',
        status: 'APPROVED',
        leader_code: 'SV03',
        member2_code: null,
        member3_code: null
    };
    let topicByIdCalls = 0;
    let updatedMember;
    t.mock.method(Topic, 'findOne', filter => ({
        sort: () => ({
            lean: async () => filter.leader_code ? topic : null
        })
    }));
    t.mock.method(GroupJoinRequest, 'findOne', () => ({
        sort: () => ({
            lean: async () => ({
                _id: 'join-request-3',
                leader_code: 'SV03',
                member_code: 'SV04',
                status: 'ACCEPTED'
            })
        })
    }));
    t.mock.method(Topic, 'findById', () => {
        topicByIdCalls += 1;
        return {
            select: () => ({ lean: async () => topic }),
            lean: async () => ({ ...topic, member2_code: 'SV04' })
        };
    });
    t.mock.method(Topic, 'updateOne', async (filter, update) => {
        updatedMember = update.$set.member2_code;
        return { modifiedCount: 1 };
    });
    t.mock.method(Submission, 'find', () => ({
        sort: () => ({ lean: async () => [] })
    }));

    const response = await request('/api/topics/student/SV04', {
        role: 'STUDENT',
        userCode: 'SV04'
    });
    const result = await response.json();

    assert.equal(response.status, 200);
    assert.equal(result.member2_code, 'SV04');
    assert.equal(updatedMember, 'SV04');
    assert.equal(topicByIdCalls, 2);
});

test('session endpoint returns the authenticated user profile', async t => {
    const user = {
        _id: 'user-id',
        user_code: 'AD01',
        full_name: 'Admin',
        role: 'ADMIN',
        must_change_password: false
    };
    t.mock.method(User, 'findById', () => ({ select: async () => user }));
    const token = jwt.sign({
        id: user._id,
        user_code: user.user_code,
        role: user.role
    }, secretKey, { expiresIn: '1m' });

    const response = await fetch(`${baseUrl}/api/auth/session`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        success: true,
        user: {
            id: user._id,
            user_code: user.user_code,
            full_name: user.full_name,
            role: user.role,
            must_change_password: false
        }
    });
});

test('student schedule is scoped to the signed-in student while group members share it', async t => {
    const topic = {
        _id: 'topic-1',
        status: 'APPROVED',
        title: 'Đề tài nhóm',
        leader_code: 'SV01',
        member2_code: 'SV02',
        member3_code: null,
        lecturer_code: 'GV01'
    };
    const meetings = [{ _id: 'meeting-1' }];
    const todos = [{ _id: 'todo-1', title: 'Công việc chung' }];
    let topicFilter;

    t.mock.method(Topic, 'findOne', filter => {
        topicFilter = filter;
        return { sort: async () => topic };
    });
    t.mock.method(Meeting, 'find', () => ({ sort: async () => meetings }));
    t.mock.method(Todo, 'find', () => ({ sort: async () => todos }));
    t.mock.method(require('../models/Semester'), 'findOne', async () => null);

    const otherStudentRequest = await request('/api/schedule/my-schedule/SV02', {
        role: 'STUDENT',
        userCode: 'SV01'
    });
    assert.equal(otherStudentRequest.status, 403);

    const groupMemberRequest = await request('/api/schedule/my-schedule/SV02', {
        role: 'STUDENT',
        userCode: 'SV02'
    });
    assert.equal(groupMemberRequest.status, 200);
    assert.ok(topicFilter.$or.some(condition => Object.values(condition)[0].test('SV02')));
    const body = await groupMemberRequest.json();
    assert.deepEqual(body.meetings, meetings);
    assert.deepEqual(body.todos, todos);
});

test('student AI advisor uses local Ollama and only sends available pool topics as context', async t => {
    const configKeys = ['OLLAMA_BASE_URL', 'OLLAMA_MODEL'];
    const previousConfig = Object.fromEntries(configKeys.map(key => [key, process.env[key]]));
    t.after(() => {
        configKeys.forEach(key => {
            if (previousConfig[key] === undefined) delete process.env[key];
            else process.env[key] = previousConfig[key];
        });
    });
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    process.env.OLLAMA_MODEL = 'qwen2.5:3b';

    t.mock.method(LecturerTopic, 'find', () => ({
        sort() { return this; },
        lean: async () => Array.from({ length: 10 }, (_, index) => ({
            _id: `pool-${index}`,
            title: index === 0 ? 'Ứng dụng quản lý thực tập' : `Đề tài mẫu ${index}`,
            description: index === 0
                ? 'Xây dựng nền tảng web quản lý tiến độ.'
                : `Mô tả chủ đề mẫu ${index}.`,
            requirements: index === 0 ? 'JavaScript, cơ sở dữ liệu' : '',
            category: 'Web / Ứng dụng',
            lecturer_code: 'GV01',
            status: 'APPROVED'
        }))
    }));
    t.mock.method(Topic, 'find', () => ({
        select() { return this; },
        lean: async () => []
    }));
    t.mock.method(User, 'find', () => ({
        select() { return this; },
        lean: async () => [{ user_code: 'GV01', max_quota: 5 }]
    }));

    const originalFetch = globalThis.fetch;
    let ollamaRequest;
    t.mock.method(globalThis, 'fetch', async (input, init) => {
        if (String(input).startsWith('http://127.0.0.1:11434/api/chat')) {
            ollamaRequest = { url: String(input), init };
            return new Response(JSON.stringify({
                message: {
                    role: 'assistant',
                    content: 'Okay, the user wants a suggestion. Let me think through the options.\n</think>\n\nBạn có thể cân nhắc đề tài quản lý thực tập.'
                },
                done: true
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(input, init);
    });

    const response = await request('/api/ai/student-advisor/chat', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV01',
        body: {
            message: 'Em học Công nghệ thông tin, nên chọn đề tài gì?',
            profile: { major: 'Công nghệ thông tin', skills: 'JavaScript', interests: 'Web' },
            history: Array.from({ length: 6 }, (_, index) => ({
                role: index % 2 ? 'assistant' : 'user',
                content: `Lịch sử hội thoại ${index}: `.repeat(100)
            }))
        }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        success: true,
        reply: 'Bạn có thể cân nhắc đề tài quản lý thực tập.'
    });
    assert.equal(ollamaRequest.url, 'http://127.0.0.1:11434/api/chat');
    const ollamaBody = JSON.parse(ollamaRequest.init.body);
    assert.equal(ollamaBody.model, 'qwen2.5:3b');
    assert.equal(ollamaBody.stream, false);
    assert.equal(ollamaBody.think, false);
    assert.equal(ollamaBody.keep_alive, '10m');
    assert.equal(ollamaBody.options.num_predict, 192);
    assert.equal(ollamaBody.messages.length, 6);
    assert.ok(ollamaBody.messages.slice(1, -1).every(item => item.content.length <= 600));
    const prompt = ollamaBody.messages;
    assert.match(prompt[0].content, /Công nghệ thông tin/);
    assert.match(prompt[0].content, /Ứng dụng quản lý thực tập/);
    const topicContext = prompt[0].content.split('Dữ liệu đề tài hiện tại: ').at(-1);
    assert.equal(JSON.parse(topicContext).length, 8);
    assert.match(prompt[0].content, /không bắt sinh viên phải viết đúng cụm "ngành học"/);
    assert.match(prompt[0].content, /Tuyệt đối không trình bày suy luận/);
    assert.match(prompt[0].content, /ưu tiên điều sinh viên đang hỏi và không lặp gợi ý cũ/);
    assert.match(prompt[0].content, /đối chiếu tên\/mô tả\/yêu cầu của kho/);
    assert.match(prompt[0].content, /Nếu kho trống hoặc không có đề tài nào phù hợp, vẫn chủ động tự đề xuất tối đa 2 ý tưởng mới/);
    assert.match(prompt[0].content, /chưa có trong kho và chưa được giảng viên xác nhận\/duyệt/);
    assert.match(prompt[0].content, /Không lặp lại câu hỏi, không lặp ý/);
});

test('student AI advisor responds naturally to a simple thank-you without calling Ollama', async t => {
    const originalFetch = globalThis.fetch;
    let ollamaCalled = false;
    t.mock.method(globalThis, 'fetch', async (input, init) => {
        if (String(input).startsWith('http://127.0.0.1:11434/api/chat')) {
            ollamaCalled = true;
        }
        return originalFetch(input, init);
    });

    const messages = [
        ['À oke cảm ơn bạn', 'Không có gì nha! Nếu cần, bạn cứ hỏi mình thêm về các đề tài nhé.'],
        ['oke thanks k iu bạn nhé', 'Không có gì nha! Nếu cần, bạn cứ hỏi mình thêm về các đề tài nhé.'],
        ['ok', 'Ừ, khi nào cần tư vấn đề tài hay hướng dẫn dùng hệ thống thì cứ nhắn mình nhé.'],
        ['chào bạn', 'Chào bạn! Mình có thể giúp bạn tìm hiểu đề tài hoặc cách dùng hệ thống.']
    ];
    for (const [message, reply] of messages) {
        const response = await request('/api/ai/student-advisor/chat', {
            method: 'POST',
            role: 'STUDENT',
            userCode: 'SV01',
            body: { message }
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { success: true, reply });
    }
    assert.equal(ollamaCalled, false);
});

test('student AI advisor includes verified topic-registration and report-submission steps', async t => {
    const configKeys = ['OLLAMA_BASE_URL', 'OLLAMA_MODEL'];
    const previousConfig = Object.fromEntries(configKeys.map(key => [key, process.env[key]]));
    t.after(() => {
        configKeys.forEach(key => {
            if (previousConfig[key] === undefined) delete process.env[key];
            else process.env[key] = previousConfig[key];
        });
    });
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    process.env.OLLAMA_MODEL = 'qwen2.5:3b';

    let poolQueryCount = 0;
    t.mock.method(LecturerTopic, 'find', () => {
        poolQueryCount += 1;
        return {
            sort() { return this; },
            lean: async () => []
        };
    });
    t.mock.method(Topic, 'find', () => ({
        select() { return this; },
        lean: async () => []
    }));
    t.mock.method(User, 'find', () => ({
        select() { return this; },
        lean: async () => []
    }));

    const originalFetch = globalThis.fetch;
    let ollamaMessages;
    t.mock.method(globalThis, 'fetch', async (input, init) => {
        if (String(input).startsWith('http://127.0.0.1:11434/api/chat')) {
            ollamaMessages = JSON.parse(init.body).messages;
            return new Response(JSON.stringify({
                message: { role: 'assistant', content: 'Vào Đề tài của tôi, chọn mốc đang mở để nộp báo cáo.' },
                done: true
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(input, init);
    });

    const response = await request('/api/ai/student-advisor/chat', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV01',
        body: { message: 'Nộp bài ở chỗ nào vậy?' }
    });

    assert.equal(response.status, 200);
    assert.equal(ollamaMessages.at(-1).content, 'Nộp bài ở chỗ nào vậy?');
    assert.match(ollamaMessages[0].content, /Mở mục "Đăng ký đề tài"/);
    assert.match(ollamaMessages[0].content, /Mở mục "Đề tài của tôi"/);
    assert.match(ollamaMessages[0].content, /Lưu thay đổi.*sau đó nhấn "Nộp bài"/);
    assert.match(ollamaMessages[0].content, /Không bịa tên trang\/nút/);
    assert.equal(poolQueryCount, 0);
});

test('Ollama advisor strips complete Qwen thinking and rejects incomplete reasoning', () => {
    assert.equal(
        extractOllamaAnswer('Okay, let me think.\n</think>\n\nGợi ý: Xây dựng dashboard phân tích dữ liệu bán hàng.'),
        'Gợi ý: Xây dựng dashboard phân tích dữ liệu bán hàng.'
    );
    assert.equal(
        extractOllamaAnswer('Dừng客, nếu bạn cần thêm gợi ý, hãy cho mình biết.'),
        'Dừng, nếu bạn cần thêm gợi ý, hãy cho mình biết.'
    );
    assert.throws(
        () => extractOllamaAnswer('Okay, the user is studying Management Information Systems. Let me think through this.'),
        /chưa có câu trả lời cuối cùng/
    );
});

test('Ollama defaults away from the legacy reasoning model and keeps custom model settings', t => {
    const previousModel = process.env.OLLAMA_MODEL;
    t.after(() => {
        if (previousModel === undefined) delete process.env.OLLAMA_MODEL;
        else process.env.OLLAMA_MODEL = previousModel;
    });

    delete process.env.OLLAMA_MODEL;
    assert.equal(getOllamaConfig().model, 'qwen2.5:3b');
    process.env.OLLAMA_MODEL = 'qwen3:4b';
    assert.equal(getOllamaConfig().model, 'qwen2.5:3b');
    process.env.OLLAMA_MODEL = 'custom:1b';
    assert.equal(getOllamaConfig().model, 'custom:1b');
});

test('student AI advisor lets Ollama interpret informal major messages without a profile', async t => {
    t.mock.method(LecturerTopic, 'find', () => ({
        sort() { return this; },
        lean: async () => []
    }));
    t.mock.method(Topic, 'find', () => ({
        select() { return this; },
        lean: async () => []
    }));
    t.mock.method(User, 'find', () => ({
        select() { return this; },
        lean: async () => []
    }));

    const originalFetch = globalThis.fetch;
    let ollamaCalled = false;
    t.mock.method(globalThis, 'fetch', async (input, init) => {
        if (String(input).startsWith('http://127.0.0.1:11434/api/chat')) {
            ollamaCalled = true;
            const body = JSON.parse(init.body);
            assert.match(body.messages[0].content, /không bắt sinh viên phải viết đúng cụm "ngành học"/);
            assert.equal(body.messages[body.messages.length - 1].content, 'Mình bên IT á, nên chọn đề tài gì?');
            return new Response(JSON.stringify({
                message: { role: 'assistant', content: 'Em có thể tham khảo các đề tài về phát triển phần mềm hoặc dữ liệu.' },
                done: true
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(input, init);
    });

    const response = await request('/api/ai/student-advisor/chat', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV01',
        body: {
            message: 'Mình bên IT á, nên chọn đề tài gì?',
            profile: {},
            history: [
                { role: 'assistant', content: 'Bạn chưa cho mình biết ngành đang học. Bạn học ngành gì vậy? Gửi tên ngành, mình sẽ gợi ý hướng đề tài phù hợp nhé.' }
            ]
        }
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.match(body.reply, /phát triển phần mềm hoặc dữ liệu/);
    assert.equal(ollamaCalled, true);
});

test('student AI advisor validates student access and explains when Ollama is unavailable', async t => {
    const configKeys = ['OLLAMA_BASE_URL', 'OLLAMA_MODEL'];
    const previousConfig = Object.fromEntries(configKeys.map(key => [key, process.env[key]]));
    t.after(() => {
        configKeys.forEach(key => {
            if (previousConfig[key] === undefined) delete process.env[key];
            else process.env[key] = previousConfig[key];
        });
    });
    process.env.OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
    process.env.OLLAMA_MODEL = 'qwen2.5:3b';

    const lecturerResponse = await request('/api/ai/student-advisor/chat', {
        method: 'POST',
        role: 'LECTURER',
        userCode: 'GV01',
        body: { message: 'Xin tư vấn đề tài' }
    });
    assert.equal(lecturerResponse.status, 403);

    t.mock.method(LecturerTopic, 'find', () => ({
        sort() { return this; },
        lean: async () => []
    }));
    t.mock.method(Topic, 'find', () => ({
        select() { return this; },
        lean: async () => []
    }));
    t.mock.method(User, 'find', () => ({
        select() { return this; },
        lean: async () => []
    }));

    const originalFetch = globalThis.fetch;
    t.mock.method(globalThis, 'fetch', async (input, init) => {
        if (String(input).startsWith('http://127.0.0.1:11434/api/chat')) {
            throw new TypeError('fetch failed');
        }
        return originalFetch(input, init);
    });
    const unavailableResponse = await request('/api/ai/student-advisor/chat', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV01',
        body: { message: 'Em học ngành Công nghệ thông tin, nên chọn đề tài gì?' }
    });
    assert.equal(unavailableResponse.status, 503);
    assert.match((await unavailableResponse.json()).message, /Không kết nối được Ollama/);
});

test('group members can add and set all shared todo statuses; supplied identity is ignored', async t => {
    const topic = {
        _id: 'topic-1',
        status: 'APPROVED',
        title: 'Đề tài nhóm',
        leader_code: 'SV01',
        member2_code: 'SV02',
        member3_code: null
    };
    let createdTodo;
    const storedTodo = {
        topic_id: 'topic-1',
        student_code: 'SV01',
        status: 'NOT_STARTED',
        is_completed: false,
        save: async function () { return this; }
    };
    t.mock.method(Topic, 'findOne', async () => topic);
    t.mock.method(Todo.prototype, 'save', async function () {
        createdTodo = this;
        return this;
    });
    t.mock.method(Todo, 'findById', async () => storedTodo);

    const addResponse = await request('/api/schedule/todos/add', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV01',
        body: {
            student_code: 'SV99',
            topic_id: 'topic-1',
            assigned_to: 'SV02',
            title: 'Hoàn thiện báo cáo'
        }
    });
    assert.equal(addResponse.status, 201);
    assert.equal(createdTodo.student_code, 'SV01');
    assert.equal(createdTodo.created_by, 'SV01');
    assert.equal(createdTodo.assigned_to, 'SV02');
    assert.equal(createdTodo.status, 'NOT_STARTED');

    const inProgressResponse = await request('/api/schedule/todos/toggle/todo-1', {
        method: 'PATCH',
        role: 'STUDENT',
        userCode: 'SV02',
        body: { status: 'IN_PROGRESS' }
    });
    assert.equal(inProgressResponse.status, 200);
    assert.equal((await inProgressResponse.json()).status, 'IN_PROGRESS');
    assert.equal(storedTodo.is_completed, false);

    const completedResponse = await request('/api/schedule/todos/toggle/todo-1', {
        method: 'PATCH',
        role: 'STUDENT',
        userCode: 'SV02',
        body: { status: 'COMPLETED' }
    });
    assert.equal(completedResponse.status, 200);
    assert.equal((await completedResponse.json()).status, 'COMPLETED');
    assert.equal(storedTodo.is_completed, true);

    const invalidStatusResponse = await request('/api/schedule/todos/toggle/todo-1', {
        method: 'PATCH',
        role: 'STUDENT',
        userCode: 'SV02',
        body: { status: 'BLOCKED' }
    });
    assert.equal(invalidStatusResponse.status, 400);
    assert.equal(storedTodo.status, 'COMPLETED');

    const legacyToggleResponse = await request('/api/schedule/todos/toggle/todo-1', {
        method: 'PATCH',
        role: 'STUDENT',
        userCode: 'SV02'
    });
    assert.equal(legacyToggleResponse.status, 200);
    assert.equal((await legacyToggleResponse.json()).status, 'NOT_STARTED');
});

test('students outside the group cannot add, update, or delete its todos', async t => {
    let deleteCalled = false;
    t.mock.method(Topic, 'findOne', async () => null);
    t.mock.method(Todo, 'findById', async () => ({
        topic_id: 'topic-1',
        student_code: 'SV01',
        is_completed: false,
        save: async function () { return this; },
        deleteOne: async function () { deleteCalled = true; }
    }));

    const addResponse = await request('/api/schedule/todos/add', {
        method: 'POST',
        role: 'STUDENT',
        userCode: 'SV99',
        body: { student_code: 'SV01', topic_id: 'topic-1', title: 'Việc riêng' }
    });
    assert.equal(addResponse.status, 403);

    const toggleResponse = await request('/api/schedule/todos/toggle/todo-1', {
        method: 'PATCH',
        role: 'STUDENT',
        userCode: 'SV99'
    });
    assert.equal(toggleResponse.status, 403);

    const deleteResponse = await request('/api/schedule/todos/todo-1', {
        method: 'DELETE',
        role: 'STUDENT',
        userCode: 'SV99'
    });
    assert.equal(deleteResponse.status, 403);
    assert.equal(deleteCalled, false);
});

test('only a todo creator or group leader can delete shared todos', async t => {
    const topic = {
        _id: 'topic-1',
        status: 'APPROVED',
        leader_code: 'SV01',
        member2_code: 'SV02',
        member3_code: 'SV03'
    };
    const deletionCalls = [];
    const todos = {
        'creator-todo': {
            _id: 'creator-todo',
            topic_id: 'topic-1',
            student_code: 'SV02',
            created_by: '',
            deleteOne: async function () { deletionCalls.push(this._id); }
        },
        'other-todo': {
            _id: 'other-todo',
            topic_id: 'topic-1',
            student_code: 'SV02',
            created_by: 'SV03',
            deleteOne: async function () { deletionCalls.push(this._id); }
        }
    };
    t.mock.method(Topic, 'findOne', async () => topic);
    t.mock.method(Todo, 'findById', async todoId => todos[todoId] || null);

    const creatorResponse = await request('/api/schedule/todos/creator-todo', {
        method: 'DELETE',
        role: 'STUDENT',
        userCode: 'SV02'
    });
    assert.equal(creatorResponse.status, 200);

    const otherMemberResponse = await request('/api/schedule/todos/other-todo', {
        method: 'DELETE',
        role: 'STUDENT',
        userCode: 'SV02'
    });
    assert.equal(otherMemberResponse.status, 403);

    const leaderResponse = await request('/api/schedule/todos/other-todo', {
        method: 'DELETE',
        role: 'STUDENT',
        userCode: 'SV01'
    });
    assert.equal(leaderResponse.status, 200);
    assert.deepEqual(deletionCalls, ['creator-todo', 'other-todo']);
});

test('lecturer schedule reads are limited to the signed-in lecturer', async t => {
    let findCalled = false;
    t.mock.method(Meeting, 'find', () => {
        findCalled = true;
        return {
            populate() { return this; },
            sort: async () => []
        };
    });

    const otherLecturer = await request('/api/schedule/lecturer/meetings/GV02', {
        role: 'LECTURER',
        userCode: 'GV01'
    });
    assert.equal(otherLecturer.status, 403);
    assert.equal(findCalled, false);

    const ownSchedule = await request('/api/schedule/lecturer/meetings/GV01', {
        role: 'LECTURER',
        userCode: 'GV01'
    });
    assert.equal(ownSchedule.status, 200);
    assert.equal(findCalled, true);
});

test('lecturers can send notifications only to students in their approved topics', async t => {
    let insertedNotifications;
    t.mock.method(User, 'findOne', () => ({
        select() { return this; },
        lean: async () => ({ full_name: 'Giảng viên A' })
    }));
    t.mock.method(Topic, 'find', () => ({
        select() { return this; },
        lean: async () => [{
            leader_code: 'SV01',
            member2_code: 'SV02',
            member3_code: null
        }]
    }));
    t.mock.method(Notification, 'insertMany', async notifications => {
        insertedNotifications = notifications;
        return notifications.map((notification, index) => ({ ...notification, _id: `notification-${index}` }));
    });

    const response = {
        statusCode: 201,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    await createLecturerNotification({
        user: { role: 'LECTURER', user_code: 'GV01' },
        body: { title: 'Nhắc nộp bài', content: 'Nộp trước hạn', recipient_codes: ['sv01', 'SV02'] }
    }, response);

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.sent_count, 2);
    assert.deepEqual(insertedNotifications.map(notification => notification.recipient_code), ['SV01', 'SV02']);
    assert.ok(insertedNotifications.every(notification =>
        notification.type === 'LECTURER' &&
        notification.target === 'students' &&
        notification.sender_name === 'Giảng viên A' &&
        notification.status === 'published'
    ));
});

test('lecturers cannot send notifications to students outside their approved topics', async t => {
    let insertCalled = false;
    t.mock.method(User, 'findOne', () => ({
        select() { return this; },
        lean: async () => ({ full_name: 'Giảng viên A' })
    }));
    t.mock.method(Topic, 'find', () => ({
        select() { return this; },
        lean: async () => [{ leader_code: 'SV01' }]
    }));
    t.mock.method(Notification, 'insertMany', async () => {
        insertCalled = true;
        return [];
    });

    const response = {
        statusCode: 201,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    await createLecturerNotification({
        user: { role: 'LECTURER', user_code: 'GV01' },
        body: { title: 'Nhắc nộp bài', content: 'Nộp trước hạn', recipient_codes: ['SV99'] }
    }, response);

    assert.equal(response.statusCode, 403);
    assert.equal(response.body.success, false);
    assert.equal(insertCalled, false);
});

test('admin notification list excludes lecturer notifications', async t => {
    const storedNotifications = [
        { _id: 'system-notification', type: 'SYSTEM', title: 'Thông báo hệ thống' },
        { _id: 'lecturer-document-notification', type: 'LECTURER', title: 'Tài liệu mới' },
        { _id: 'legacy-system-notification', title: 'Thông báo cũ' }
    ];
    t.mock.method(Notification, 'find', filter => {
        assert.deepEqual(filter, {
            event_key: { $exists: false },
            type: { $in: ['SYSTEM', null] }
        });
        return {
            sort: async () => storedNotifications.filter(notification =>
                notification.type === 'SYSTEM' || notification.type == null
            )
        };
    });

    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    await getAllNotifications({}, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
        response.body.notifications.map(notification => notification._id),
        ['system-notification', 'legacy-system-notification']
    );
});

test('admin document list includes administrator uploads but excludes lecturer uploads', async t => {
    const storedDocuments = [
        { _id: 'admin-doc', uploader_code: 'ADMIN01', uploader_role: 'ADMIN', title: 'Biểu mẫu chung' },
        { _id: 'lecturer-doc', uploader_code: 'GV01', uploader_role: 'LECTURER', title: 'Tài liệu nhóm' },
        { _id: 'legacy-admin-doc', uploader_code: 'ADMIN02', title: 'Biểu mẫu cũ' }
    ];
    t.mock.method(Document, 'find', () => ({
        sort() { return this; },
        lean: async () => storedDocuments
    }));
    t.mock.method(User, 'find', () => ({
        select() { return this; },
        lean: async () => [
            { user_code: 'ADMIN02', full_name: 'Quản trị viên 2', role: 'ADMIN' },
            { user_code: 'GV01', full_name: 'Giảng viên 1', role: 'LECTURER' }
        ]
    }));

    const response = {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
    await getAllDocuments({}, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.documents.map(document => document._id), ['admin-doc', 'legacy-admin-doc']);
    assert.equal(response.body.documents[1].uploader_role, 'ADMIN');
});

test('document filenames decode legacy Vietnamese mojibake without changing valid names', () => {
    assert.equal(decodeLegacyFilename('Tieu_luan_nhÃ³m 1.docx'), 'Tieu_luan_nhóm 1.docx');
    assert.equal(decodeLegacyFilename('Tieu_luan_nhóm 1.docx'), 'Tieu_luan_nhóm 1.docx');
});

test('lecturers can view their own availability and students can view their supervisor slots', async t => {
    const slots = [{ _id: 'slot-1', lecturer_code: 'GV01' }];
    let topicFilter;
    t.mock.method(Topic, 'findOne', filter => {
        topicFilter = filter;
        return { select: async () => ({ _id: 'topic-1' }) };
    });
    t.mock.method(AvailabilitySlot, 'find', () => ({
        sort() { return this; },
        lean: async () => slots
    }));

    const lecturerResponse = await request('/api/schedule/availability/GV01', {
        role: 'LECTURER',
        userCode: 'GV01'
    });
    assert.equal(lecturerResponse.status, 200);
    assert.deepEqual((await lecturerResponse.json()).data, slots);

    const otherLecturerResponse = await request('/api/schedule/availability/GV02', {
        role: 'LECTURER',
        userCode: 'GV01'
    });
    assert.equal(otherLecturerResponse.status, 403);

    const studentResponse = await request('/api/schedule/availability/GV01', {
        role: 'STUDENT',
        userCode: 'SV02'
    });
    assert.equal(studentResponse.status, 200);
    assert.ok(topicFilter.$or.some(condition => Object.values(condition)[0].test('SV02')));
});

test('students cannot update another student profile or cancel another group', async () => {
    const profile = await request('/api/auth/students/SV02/profile', {
        method: 'PUT',
        role: 'STUDENT',
        userCode: 'SV01',
        body: { email: 'sv02@example.test' }
    });
    assert.equal(profile.status, 403);

    const cancellation = await request('/api/topics/cancel/SV02', {
        method: 'DELETE',
        role: 'STUDENT',
        userCode: 'SV01'
    });
    assert.equal(cancellation.status, 403);
});

test('CORS allows configured frontend origins and rejects other origins', async () => {
    const allowedPreflight = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: {
            Origin: 'https://frontend.example',
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,x-auth-role,x-auth-session,x-csrf-protection'
        }
    });
    assert.equal(allowedPreflight.status, 204);
    assert.equal(allowedPreflight.headers.get('access-control-allow-origin'), 'https://frontend.example');
    assert.equal(allowedPreflight.headers.get('access-control-allow-credentials'), 'true');
    assert.match(allowedPreflight.headers.get('access-control-allow-headers'), /x-auth-role/i);
    assert.match(allowedPreflight.headers.get('access-control-allow-headers'), /x-auth-session/i);
    assert.match(allowedPreflight.headers.get('access-control-allow-headers'), /x-csrf-protection/i);

    const denied = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'OPTIONS',
        headers: { Origin: 'https://untrusted.example' }
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
});

test('HttpOnly session cookies authenticate API requests and protect mutations from CSRF', async () => {
    const cookieToken = tokenFor('ADMIN', 'AD01');
    const readResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: `tttn_session=${cookieToken}` }
    });
    assert.equal(readResponse.status, 200);
    assert.deepEqual(await readResponse.json(), { role: 'ADMIN' });

    const blockedMutation = await fetch(`${baseUrl}/test/session`, {
        method: 'POST',
        headers: { Cookie: `tttn_session=${cookieToken}` }
    });
    assert.equal(blockedMutation.status, 403);

    const allowedMutation = await fetch(`${baseUrl}/test/session`, {
        method: 'POST',
        headers: {
            Cookie: `tttn_session=${cookieToken}`,
            'X-CSRF-Protection': '1'
        }
    });
    assert.equal(allowedMutation.status, 200);

    const expiredToken = jwt.sign({
        role: 'ADMIN',
        user_code: 'AD01',
        exp: Math.floor(Date.now() / 1000) - 1
    }, secretKey);
    const expiredResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: `tttn_session=${expiredToken}` }
    });
    assert.equal(expiredResponse.status, 401);
});

test('role-specific HttpOnly cookies keep sessions isolated while allowing them in one browser', async () => {
    const adminToken = tokenFor('ADMIN', 'AD01');
    const studentToken = tokenFor('STUDENT', 'SV01');
    const cookies = `tttn_session_admin=${adminToken}; tttn_session_student=${studentToken}`;

    const adminResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: cookies, 'X-Auth-Role': 'ADMIN' }
    });
    assert.equal(adminResponse.status, 200);
    assert.deepEqual(await adminResponse.json(), { role: 'ADMIN' });

    const studentResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: cookies, 'X-Auth-Role': 'STUDENT' }
    });
    assert.equal(studentResponse.status, 200);
    assert.deepEqual(await studentResponse.json(), { role: 'STUDENT' });

    const unselectedResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: cookies }
    });
    assert.equal(unselectedResponse.status, 401);

    const wrongRoleResponse = await fetch(`${baseUrl}/test/session`, {
        headers: { Cookie: cookies, 'X-Auth-Role': 'LECTURER' }
    });
    assert.equal(wrongRoleResponse.status, 401);

    const mismatchedCookieResponse = await fetch(`${baseUrl}/test/session`, {
        headers: {
            Cookie: `tttn_session_student=${adminToken}`,
            'X-Auth-Role': 'STUDENT'
        }
    });
    assert.equal(mismatchedCookieResponse.status, 403);

    const blockedMutation = await fetch(`${baseUrl}/test/session`, {
        method: 'POST',
        headers: { Cookie: cookies, 'X-Auth-Role': 'ADMIN' }
    });
    assert.equal(blockedMutation.status, 403);

    const allowedMutation = await fetch(`${baseUrl}/test/session`, {
        method: 'POST',
        headers: {
            Cookie: cookies,
            'X-Auth-Role': 'STUDENT',
            'X-CSRF-Protection': '1'
        }
    });
    assert.equal(allowedMutation.status, 200);
});

test('tab-specific cookies keep two accounts with the same role isolated', async () => {
    const sv01Session = '11111111111111111111111111111111';
    const sv02Session = '22222222222222222222222222222222';
    const cookies = [
        `tttn_session_${sv01Session}=${tokenFor('STUDENT', 'SV01')}`,
        `tttn_session_${sv02Session}=${tokenFor('STUDENT', 'SV02')}`
    ].join('; ');

    for (const [sessionId, userCode] of [[sv01Session, 'SV01'], [sv02Session, 'SV02']]) {
        const response = await fetch(`${baseUrl}/test/identity`, {
            headers: {
                Cookie: cookies,
                'X-Auth-Role': 'STUDENT',
                'X-Auth-Session': sessionId
            }
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { role: 'STUDENT', user_code: userCode });
    }

    const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
            'X-CSRF-Protection': '1',
            'X-Auth-Role': 'STUDENT',
            'X-Auth-Session': sv01Session
        }
    });
    assert.equal(logoutResponse.status, 200);
    const clearedCookies = logoutResponse.headers.getSetCookie().join(';');
    assert.match(clearedCookies, new RegExp(`tttn_session_${sv01Session}=;`));
    assert.doesNotMatch(clearedCookies, new RegExp(`tttn_session_${sv02Session}=;`));
});

test('logout clears the HttpOnly session cookie and requires the CSRF header', async () => {
    const blocked = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
    assert.equal(blocked.status, 403);

    const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { 'X-CSRF-Protection': '1' }
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /tttn_session=;/);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(response.headers.get('set-cookie'), /SameSite=Lax/i);
});

test('role-specific logout clears only the selected account session', async () => {
    const response = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: {
            'X-CSRF-Protection': '1',
            'X-Auth-Role': 'ADMIN'
        }
    });
    assert.equal(response.status, 200);
    const setCookies = response.headers.getSetCookie().join(';');
    assert.match(setCookies, /tttn_session_admin=;/);
    assert.doesNotMatch(setCookies, /tttn_session_student=;/);
});

test('login issues an HttpOnly cookie without returning the JWT to JavaScript', async t => {
    const sessionId = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    t.mock.method(User, 'findOne', async () => ({
        _id: 'user-id',
        user_code: 'AD01',
        full_name: 'Admin',
        role: 'ADMIN',
        password: 'hashed-password'
    }));
    t.mock.method(bcrypt, 'compare', async () => true);

    const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
            Origin: 'https://frontend.example',
            'Content-Type': 'application/json',
            'X-Auth-Session': sessionId
        },
        body: JSON.stringify({ user_code: 'AD01', password: 'ValidPassword1!' })
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    const setCookies = response.headers.getSetCookie();
    const adminCookie = setCookies.find(cookie => cookie.startsWith(`tttn_session_${sessionId}=`));
    assert.ok(adminCookie);
    assert.match(adminCookie, /HttpOnly/i);
    assert.match(adminCookie, /SameSite=Lax/i);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.user.role, 'ADMIN');
    assert.equal('token' in body, false);

    const sessionResponse = await fetch(`${baseUrl}/test/session`, {
        headers: {
            Cookie: adminCookie.split(';')[0],
            'X-Auth-Role': 'ADMIN',
            'X-Auth-Session': sessionId
        }
    });
    assert.equal(sessionResponse.status, 200);
    assert.deepEqual(await sessionResponse.json(), { role: 'ADMIN' });
});
