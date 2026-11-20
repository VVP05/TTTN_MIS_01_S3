const ChatMessage = require('../models/ChatMessage');
const ChatReadState = require('../models/ChatReadState');
const Topic = require('../models/Topic');
const User = require('../models/User');

const normalizeCode = value => String(value || '').trim().toUpperCase();
const escapeRegex = value => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const codeRegex = value => new RegExp(`^${escapeRegex(value)}$`, 'i');

async function getAuthorizedTopic(req, topicId) {
    const topic = await Topic.findById(topicId).lean();
    if (!topic) return { error: { status: 404, message: 'Không tìm thấy đề tài.' } };

    const role = String(req.user?.role || '').toUpperCase();
    const code = normalizeCode(req.user?.user_code);
    const members = [topic.leader_code, topic.member2_code, topic.member3_code]
        .filter(Boolean)
        .map(normalizeCode);

    if (role === 'STUDENT' && !members.includes(code)) {
        return { error: { status: 403, message: 'Bạn không thuộc nhóm của đề tài này.' } };
    }
    if (role === 'LECTURER' && String(topic.lecturer_code || '').toUpperCase() !== code) {
        return { error: { status: 403, message: 'Bạn không hướng dẫn đề tài này.' } };
    }
    if (!['STUDENT', 'LECTURER'].includes(role)) {
        return { error: { status: 403, message: 'Vai trò không được phép sử dụng chat.' } };
    }
    return { topic };
}

function getRoomAccessError(req, topic, roomType) {
    const role = String(req.user?.role || '').toUpperCase();
    const code = normalizeCode(req.user?.user_code);
    if (role === 'STUDENT' && roomType === 'LECTURER' && normalizeCode(topic.leader_code) !== code) {
        return { status: 403, message: 'Chỉ trưởng nhóm được chat với giảng viên.' };
    }
    if (role === 'LECTURER' && roomType === 'INTERNAL') {
        return { status: 403, message: 'Giảng viên không truy cập phòng chat nội bộ.' };
    }
    return null;
}

async function getUnreadSummary(req) {
    const role = String(req.user?.role || '').toUpperCase();
    const userCode = normalizeCode(req.user?.user_code);
    const topicQuery = role === 'STUDENT'
        ? {
            status: 'APPROVED',
            $or: [
                { leader_code: codeRegex(userCode) },
                { member2_code: codeRegex(userCode) },
                { member3_code: codeRegex(userCode) }
            ]
        }
        : { status: 'APPROVED', lecturer_code: codeRegex(userCode) };
    const topics = await Topic.find(topicQuery).select('_id leader_code').lean();
    const roomKeys = topics.flatMap(topic => {
        const rooms = role === 'LECTURER'
            ? ['LECTURER']
            : [
                'INTERNAL',
                ...(normalizeCode(topic.leader_code) === userCode ? ['LECTURER'] : [])
            ];
        return rooms.map(roomType => ({ topic, roomType }));
    });

    if (!roomKeys.length) return { total_unread: 0, rooms: [] };

    const readStates = await ChatReadState.find({
        user_code: userCode,
        topic_id: { $in: topics.map(topic => topic._id) }
    }).select('topic_id room_type last_read_at').lean();
    const readAtByRoom = new Map(readStates.map(state => [
        `${String(state.topic_id)}:${state.room_type}`,
        state.last_read_at
    ]));
    const filters = roomKeys.map(({ topic, roomType }) => {
        const filter = {
            topic_id: topic._id,
            room_type: roomType,
            sender_code: { $ne: userCode }
        };
        const lastReadAt = readAtByRoom.get(`${String(topic._id)}:${roomType}`);
        if (lastReadAt) filter.created_at = { $gt: lastReadAt };
        return filter;
    });

    const unreadGroups = await ChatMessage.aggregate([
        { $match: { $or: filters } },
        { $group: { _id: { topic_id: '$topic_id', room_type: '$room_type' }, count: { $sum: 1 } } }
    ]);
    const unreadByRoom = new Map(unreadGroups.map(group => [
        `${String(group._id.topic_id)}:${group._id.room_type}`,
        group.count
    ]));
    const rooms = roomKeys.map(({ topic, roomType }) => ({
        topic_id: String(topic._id),
        room_type: roomType,
        unread_count: unreadByRoom.get(`${String(topic._id)}:${roomType}`) || 0
    }));

    return {
        total_unread: rooms.reduce((total, room) => total + room.unread_count, 0),
        rooms
    };
}

exports.getUnreadSummary = async (req, res) => {
    try {
        const role = String(req.user?.role || '').toUpperCase();
        if (!['STUDENT', 'LECTURER'].includes(role)) {
            return res.status(403).json({ success: false, message: 'Vai trò không được phép xem tin nhắn chưa đọc.' });
        }
        const data = await getUnreadSummary(req);
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Không thể tải số tin nhắn chưa đọc: ' + error.message });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const roomType = String(req.query.room || 'INTERNAL').toUpperCase();
        if (!['INTERNAL', 'LECTURER'].includes(roomType)) {
            return res.status(400).json({ success: false, message: 'Loại phòng chat không hợp lệ.' });
        }
        const { topic, error } = await getAuthorizedTopic(req, req.params.topicId);
        if (error) return res.status(error.status).json({ success: false, message: error.message });

        const accessError = getRoomAccessError(req, topic, roomType);
        if (accessError) return res.status(accessError.status).json({ success: false, message: accessError.message });

        const messages = await ChatMessage.find({
            topic_id: topic._id,
            room_type: roomType
        }).sort({ created_at: -1 }).limit(200).lean();
        messages.reverse();
        const latestMessage = messages[messages.length - 1];
        if (latestMessage) {
            await ChatReadState.updateOne(
                {
                    topic_id: topic._id,
                    room_type: roomType,
                    user_code: normalizeCode(req.user?.user_code)
                },
                { $max: { last_read_at: latestMessage.created_at } },
                { upsert: true }
            );
        }
        return res.status(200).json({ success: true, data: messages });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Không thể tải tin nhắn: ' + error.message });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const roomType = String(req.body.room_type || '').toUpperCase();
        const content = String(req.body.content || '').trim();
        if (!['INTERNAL', 'LECTURER'].includes(roomType)) {
            return res.status(400).json({ success: false, message: 'Loại phòng chat không hợp lệ.' });
        }
        if (!content) return res.status(400).json({ success: false, message: 'Nội dung tin nhắn không được để trống.' });
        if (content.length > 2000) return res.status(400).json({ success: false, message: 'Tin nhắn tối đa 2000 ký tự.' });

        const { topic, error } = await getAuthorizedTopic(req, req.params.topicId);
        if (error) return res.status(error.status).json({ success: false, message: error.message });

        const accessError = getRoomAccessError(req, topic, roomType);
        if (accessError) return res.status(accessError.status).json({ success: false, message: accessError.message });

        const code = normalizeCode(req.user?.user_code);
        const user = await User.findOne({ user_code: code }).lean();
        const message = await ChatMessage.create({
            topic_id: topic._id,
            room_type: roomType,
            sender_code: code,
            sender_name: user?.full_name || code,
            content
        });
        return res.status(201).json({ success: true, data: message });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Không thể gửi tin nhắn: ' + error.message });
    }
};
