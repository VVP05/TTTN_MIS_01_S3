const LecturerTopic = require('../models/LecturerTopic');
const Topic = require('../models/Topic');
const User = require('../models/User');

async function getAvailableLecturerPoolTopics() {
    const [pool, activeTopics, lecturers] = await Promise.all([
        LecturerTopic.find({
            status: { $ne: 'REJECTED' },
            is_active: { $ne: false }
        }).sort({ createdAt: -1 }).lean(),
        Topic.find({ status: { $in: ['PENDING', 'APPROVED', 'NEED_REVISION'] } })
            .select('active_pool_topic_id pool_topic_id lecturer_code leader_code')
            .lean(),
        User.find({ role: 'LECTURER' }).select('user_code max_quota').lean()
    ]);

    const quotaByLecturer = new Map(lecturers.map(lecturer => {
        const quota = Number(lecturer.max_quota);
        return [
            String(lecturer.user_code || '').toUpperCase(),
            Number.isInteger(quota) && quota >= 0 ? quota : 5
        ];
    }));
    const registeredByPoolTopic = new Map();
    const assignedByLecturer = new Map();
    activeTopics.forEach(topic => {
        const poolTopicId = String(topic.active_pool_topic_id || topic.pool_topic_id || '');
        if (poolTopicId) {
            registeredByPoolTopic.set(poolTopicId, (registeredByPoolTopic.get(poolTopicId) || 0) + 1);
        }
        const lecturerCode = String(topic.lecturer_code || '').toUpperCase();
        if (lecturerCode && String(topic.leader_code || '').trim()) {
            assignedByLecturer.set(lecturerCode, (assignedByLecturer.get(lecturerCode) || 0) + 1);
        }
    });

    return pool.map(topic => {
        const registeredGroups = registeredByPoolTopic.get(String(topic._id)) || 0;
        const lecturerQuota = quotaByLecturer.get(String(topic.lecturer_code || '').toUpperCase()) ?? 5;
        const lecturerAssigned = assignedByLecturer.get(String(topic.lecturer_code || '').toUpperCase()) || 0;
        const maxGroups = registeredGroups > 0 || lecturerAssigned < lecturerQuota ? 1 : 0;
        const remainingGroups = Math.max(0, maxGroups - registeredGroups);
        return {
            ...topic,
            max_groups: maxGroups,
            registered_groups: registeredGroups,
            remaining_groups: remainingGroups,
            is_registered: remainingGroups === 0,
            status: remainingGroups === 0
                ? 'REGISTERED'
                : topic.status === 'PENDING' ? 'PENDING' : 'OPEN'
        };
    });
}

module.exports = { getAvailableLecturerPoolTopics };
