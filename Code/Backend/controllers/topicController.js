const Topic = require('../models/Topic');
const Submission = require('../models/Submission');
const Milestone = require('../models/Milestone');
const LecturerTopic = require('../models/LecturerTopic');
const User = require('../models/User');
const GroupJoinRequest = require('../models/GroupJoinRequest');
const GroupRecruitment = require('../models/GroupRecruitment');
const Semester = require('../models/Semester');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { notifyUsers, notifyTopicStudents } = require('../services/notificationService');
const { getLecturerQuotaStatus } = require('../services/lecturerQuota');
const { getTopicMilestoneProgress } = require('../services/milestoneProgress');
const { getAvailablePoolTopicSlot } = require('../services/poolTopicCapacity');
const { getAvailableLecturerPoolTopics } = require('../services/lecturerPoolTopics');
const getSemesterRegistrationRange = require('../utils/semesterRegistrationRange');

const activeTopicStatuses = ['PENDING', 'APPROVED', 'NEED_REVISION'];
const codeRegex = value => new RegExp(
    `^${String(value || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
    'i'
);

async function addAcceptedMemberToTopic(topicId, memberCode) {
    const normalizedCode = String(memberCode || '').trim().toUpperCase();
    if (!normalizedCode) return false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const topic = await Topic.findById(topicId)
            .select('_id status leader_code member2_code member3_code')
            .lean();
        if (!topic || !activeTopicStatuses.includes(topic.status)) return false;

        const memberCodes = [topic.leader_code, topic.member2_code, topic.member3_code]
            .map(code => String(code || '').trim().toUpperCase())
            .filter(Boolean);
        if (memberCodes.includes(normalizedCode)) return true;

        const slot = !topic.member2_code ? 'member2_code'
            : !topic.member3_code ? 'member3_code'
                : null;
        if (!slot) return false;

        const result = await Topic.updateOne(
            {
                _id: topic._id,
                status: { $in: activeTopicStatuses },
                [slot]: { $in: [null, ''] }
            },
            { $set: { [slot]: normalizedCode } }
        );
        if (result.modifiedCount === 1) return true;
    }

    return false;
}

async function ensureLecturerHasCapacity(res, lecturerCode, excludeTopicId) {
    const quotaStatus = await getLecturerQuotaStatus(lecturerCode, excludeTopicId);
    if (!quotaStatus.found) {
        res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên được phân công.' });
        return false;
    }
    if (!quotaStatus.available) {
        res.status(409).json({
            success: false,
            message: `Giảng viên ${lecturerCode} đã đủ số nhóm hướng dẫn (${quotaStatus.assigned}/${quotaStatus.quota}).`,
            assigned: quotaStatus.assigned,
            quota: quotaStatus.quota
        });
        return false;
    }
    return true;
}

function getRegistrationEndOfDay(date) {
    const dateOnly = new Date(date).toISOString().slice(0, 10);
    return new Date(`${dateOnly}T23:59:59.999+07:00`);
}

function getRegistrationStartOfDay(date) {
    const dateOnly = new Date(date).toISOString().slice(0, 10);
    return new Date(`${dateOnly}T00:00:00+07:00`);
}

function normalizeTopicTitle(title) {
    return String(title || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}

async function findActiveTitleConflict(title, excludeTopicId) {
    const titleKey = normalizeTopicTitle(title);
    if (!titleKey) return null;

    const exclude = excludeTopicId ? { _id: { $ne: excludeTopicId } } : {};
    const indexedConflicts = await Topic.find({
        active_title_key: titleKey,
        status: { $in: activeTopicStatuses },
        ...exclude
    }).select('_id title leader_code active_pool_topic_id pool_topic_id').lean();
    if (indexedConflicts.length > 0) return indexedConflicts[0];

    const legacyTopics = await Topic.find({
        status: { $in: activeTopicStatuses },
        active_title_key: { $exists: false },
        ...exclude
    }).select('_id title leader_code active_pool_topic_id pool_topic_id').lean();

    return legacyTopics.find(topic =>
        normalizeTopicTitle(topic.title) === titleKey
    ) || null;
}

async function getActivePoolTopicGroups(poolTopicId) {
    return Topic.find({
        status: { $in: activeTopicStatuses },
        $or: [
            { active_pool_topic_id: poolTopicId },
            { pool_topic_id: poolTopicId }
        ]
    }).select('_id leader_code active_pool_topic_slot').lean();
}

async function ensurePoolTopicCapacity(res, poolTopic, leaderCode) {
    const activeGroups = await getActivePoolTopicGroups(poolTopic._id);
    const maxGroups = 1;
    const availableSlot = getAvailablePoolTopicSlot(activeGroups, maxGroups, leaderCode);
    if (availableSlot !== null) return availableSlot;

    res.status(409).json({
        success: false,
        message: `Đề tài đã đủ số nhóm đăng ký (${activeGroups.length}/${maxGroups}).`,
        registeredGroups: activeGroups.length,
        maxGroups
    });
    return null;
}

async function removeUploadedReportFile(filePath) {
    if (!filePath) return;

    const uploadRoot = path.resolve(__dirname, '../uploads');
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(`${uploadRoot}${path.sep}`)) return;

    try {
        await fs.promises.unlink(resolvedPath);
    } catch (error) {
        if (error.code !== 'ENOENT') console.error('Không thể xóa file báo cáo cũ:', error);
    }
}

// =========================================================================
// PHẦN 1: LOGIC DÀNH CHO SINH VIÊN
// =========================================================================

// 1. Đăng ký mới hoặc Cập nhật / Gửi lại đề tài
exports.registerTopic = async (req, res) => {
    try {
        let { lecturer_code, title, description, category } = req.body;
        if (lecturer_code === 'UNASSIGNED') lecturer_code = null;
        const { registration_role } = req.body;
        const selectedPoolTopicId = String(req.body.proposed_topic_id || req.body.pool_topic_id || '').trim();
        const normalizeCode = (code) => {
            if (!code) return null;
            const normalized = String(code).trim().toUpperCase();
            return normalized || null;
        };
        const codePattern = (code) => new RegExp(`^${String(code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const leader_code = normalizeCode(req.body.leader_code);
        const member2_code = normalizeCode(req.body.member2_code);
        const member3_code = normalizeCode(req.body.member3_code);

        const rawCodes = [req.body.leader_code, req.body.member2_code, req.body.member3_code]
            .filter(code => code !== null && code !== undefined && String(code).trim() !== '')
            .map(code => String(code).trim());
        const invalidFormatCode = rawCodes.find(code => code !== code.toUpperCase());
        if (invalidFormatCode) {
            return res.status(400).json({
                message: `Mã sinh viên ${invalidFormatCode} không hợp lệ. Vui lòng kiểm tra lại!`
            });
        }

        if (!leader_code) {
            return res.status(400).json({ message: 'Vui lòng nhập mã Trưởng nhóm!' });
        }

        const memberCodes = [leader_code, member2_code, member3_code].filter(Boolean);
        const students = await User.find({
            user_code: { $in: memberCodes },
            role: 'STUDENT'
        }).select('user_code');
        const validStudentCodes = new Set(students.map(student => student.user_code.toUpperCase()));
        const invalidCode = memberCodes.find(code => !validStudentCodes.has(code));

        if (invalidCode) {
            return res.status(400).json({
                message: `Mã sinh viên (${invalidCode}) không tồn tại hoặc không phải tài khoản sinh viên!`
            });
        }

        if (member2_code && member2_code.toUpperCase() === leader_code.toUpperCase()) {
            return res.status(400).json({ message: 'Mã thành viên 2 không được trùng với Trưởng nhóm!' });
        }
        if (member3_code && member3_code.toUpperCase() === leader_code.toUpperCase()) {
            return res.status(400).json({ message: 'Mã thành viên 3 không được trùng với Trưởng nhóm!' });
        }
        if (member2_code && member3_code && member2_code.toUpperCase() === member3_code.toUpperCase()) {
            return res.status(400).json({ message: 'Mã Thành viên 2 và Thành viên 3 không được trùng nhau!' });
        }

        const requesterCode = normalizeCode(req.user?.user_code);
        if (!requesterCode || String(req.user?.role).toUpperCase() !== 'STUDENT') {
            return res.status(403).json({ message: 'Chỉ tài khoản sinh viên mới được đăng ký hoặc tham gia đề tài!' });
        }

        const registrationRole = String(registration_role || '').toUpperCase();
        if (!['LEADER', 'MEMBER'].includes(registrationRole)) {
            return res.status(400).json({ message: 'Vui lòng chọn đúng vai trò đăng ký đề tài!' });
        }

        let selectedPoolTopic = null;
        let selectedPoolTopicSlot = null;
        if (registrationRole === 'LEADER' && selectedPoolTopicId) {
            if (!mongoose.Types.ObjectId.isValid(selectedPoolTopicId)) {
                return res.status(400).json({ message: 'Đề tài trong kho không hợp lệ. Vui lòng chọn lại!' });
            }

            selectedPoolTopic = await LecturerTopic.findById(selectedPoolTopicId);
            if (!selectedPoolTopic || selectedPoolTopic.status === 'REJECTED' || selectedPoolTopic.is_active === false) {
                return res.status(404).json({ message: 'Đề tài này hiện không khả dụng trong kho!' });
            }

            selectedPoolTopicSlot = await ensurePoolTopicCapacity(res, selectedPoolTopic, leader_code);
            if (selectedPoolTopicSlot === null) return;

            lecturer_code = selectedPoolTopic.lecturer_code;
            title = selectedPoolTopic.title;
            description = selectedPoolTopic.description;
            category = selectedPoolTopic.category;
        }

        if (registrationRole === 'MEMBER' && leader_code === requesterCode) {
            return res.status(400).json({ message: 'Mã Trưởng nhóm không được trùng với mã sinh viên của bạn!' });
        }

        if (registrationRole === 'LEADER' && leader_code !== requesterCode) {
            return res.status(403).json({ message: 'Mã Trưởng nhóm phải trùng với tài khoản đang đăng nhập!' });
        }

        if (registrationRole === 'LEADER' && [member2_code, member3_code].includes(requesterCode)) {
            return res.status(400).json({
                message: 'Mã sinh viên của bạn đã là Trưởng nhóm, không thể đăng ký thêm ở Thành viên 2 hoặc 3.'
            });
        }

        if (registrationRole === 'LEADER') {
            const existingMembershipRequest = await GroupJoinRequest.findOne({
                member_code: codePattern(requesterCode),
                status: { $in: ['PENDING', 'ACCEPTED'] }
            }).select('leader_code status').lean();
            if (existingMembershipRequest) {
                return res.status(409).json({
                    message: existingMembershipRequest.status === 'ACCEPTED'
                        ? `Bạn đã được xác nhận vào nhóm của Trưởng nhóm ${existingMembershipRequest.leader_code}, không thể đăng ký làm Trưởng nhóm khác!`
                        : `Bạn đang chờ Trưởng nhóm ${existingMembershipRequest.leader_code} xác nhận. Không thể đăng ký làm Trưởng nhóm khác trong lúc này.`
                });
            }
        }

        let existingTopic = await Topic.findOne({ leader_code: codePattern(leader_code) });
        if (registrationRole === 'MEMBER' || !existingTopic ||
            !['PENDING', 'NEED_REVISION'].includes(existingTopic.status)) {
            const activeSemester = await Semester.findOne({ is_active: true }).lean();
            const now = new Date();
            const registrationStart = activeSemester?.registration_start_date
                ? getRegistrationStartOfDay(activeSemester.registration_start_date)
                : null;
            const registrationEnd = activeSemester?.registration_end_date
                ? new Date(activeSemester.registration_end_date)
                : null;
            if (!registrationStart || !registrationEnd) {
                return res.status(403).json({
                    message: 'Hiện chưa có học kỳ mở thời hạn đăng ký đề tài. Vui lòng liên hệ quản trị viên.'
                });
            }
            const registrationEndOfDay = getRegistrationEndOfDay(registrationEnd);
            if (now < registrationStart || now > registrationEndOfDay) {
                return res.status(403).json({
                    message: 'Đã hết hoặc chưa đến thời hạn đăng ký đề tài của học kỳ hiện tại.'
                });
            }
        }

        if (registrationRole === 'LEADER') {
            const memberCodesToCheck = [member2_code, member3_code].filter(Boolean);
            const topicsWithMembers = memberCodesToCheck.length > 0
                ? await Topic.find({
                    $or: memberCodesToCheck.flatMap(code => [
                        { leader_code: codePattern(code) },
                        { member2_code: codePattern(code) },
                        { member3_code: codePattern(code) }
                    ])
                }).select('_id leader_code member2_code member3_code').lean()
                : [];
            const occupiedMemberCodes = memberCodesToCheck.filter(code => topicsWithMembers.some(topic => {
                if (existingTopic && topic._id.toString() === existingTopic._id.toString()) return false;
                return [topic.leader_code, topic.member2_code, topic.member3_code]
                    .some(topicCode => normalizeCode(topicCode) === code);
            }));

            if (occupiedMemberCodes.length > 0) {
                return res.status(400).json({
                    message: `Các sinh viên (${occupiedMemberCodes.join(', ')}) đã tham gia đề tài hoặc đã có nhóm!`
                });
            }

            const groupRequests = await GroupJoinRequest.find({
                leader_code: codePattern(requesterCode),
                status: { $in: ['PENDING', 'ACCEPTED'] }
            }).select('member_code status').lean();
            const pendingMemberCodes = new Set(
                groupRequests
                    .filter(request => request.status === 'PENDING')
                    .map(request => normalizeCode(request.member_code))
            );
            const acceptedMemberCodes = new Set(
                groupRequests
                    .filter(request => request.status === 'ACCEPTED')
                    .map(request => normalizeCode(request.member_code))
            );
            const unconfirmedMembers = memberCodesToCheck.filter(code => pendingMemberCodes.has(code));

            if (acceptedMemberCodes.size > 0) {
                memberCodesToCheck
                    .filter(code => !acceptedMemberCodes.has(code))
                    .forEach(code => {
                        if (!unconfirmedMembers.includes(code)) unconfirmedMembers.push(code);
                    });
            }

            if (unconfirmedMembers.length > 0) {
                return res.status(400).json({
                    message: `Các sinh viên (${unconfirmedMembers.join(', ')}) chưa được xác nhận tham gia nhóm. Chỉ được đăng ký thành viên đã xác nhận!`
                });
            }

        }

        if (registrationRole === 'MEMBER') {
            if (member2_code !== requesterCode || member3_code) {
                return res.status(403).json({ message: 'Thông tin thành viên không hợp lệ với tài khoản đang đăng nhập!' });
            }

            const requesterTopic = await Topic.findOne({
                $or: [
                    { leader_code: codePattern(requesterCode) },
                    { member2_code: codePattern(requesterCode) },
                    { member3_code: codePattern(requesterCode) }
                ]
            });
            if (requesterTopic) {
                return res.status(400).json({ message: 'Bạn đã tham gia một đề tài khác!' });
            }

            const acceptedAsLeader = await GroupJoinRequest.findOne({
                leader_code: codePattern(requesterCode),
                status: 'ACCEPTED'
            });
            if (acceptedAsLeader) {
                return res.status(400).json({
                    message: `Nhóm của bạn đã có thành viên xác nhận, không thể xin tham gia nhóm khác!`
                });
            }

            const acceptedMembership = await GroupJoinRequest.findOne({
                member_code: codePattern(requesterCode),
                status: 'ACCEPTED'
            });
            if (acceptedMembership) {
                return res.status(400).json({
                    message: `Bạn đã được xác nhận vào nhóm của Trưởng nhóm ${acceptedMembership.leader_code}, không thể xin vào nhóm khác!`
                });
            }

            const leaderMembership = await Topic.findOne({
                $or: [
                    { member2_code: codePattern(leader_code) },
                    { member3_code: codePattern(leader_code) }
                ]
            });
            if (leaderMembership) {
                return res.status(400).json({
                    message: `Mã (${leader_code}) đang là thành viên của nhóm khác, không thể chọn làm Trưởng nhóm!`
                });
            }

            const acceptedLeaderMembership = await GroupJoinRequest.findOne({
                member_code: codePattern(leader_code),
                status: 'ACCEPTED'
            });
            if (acceptedLeaderMembership) {
                return res.status(400).json({
                    message: `Mã (${leader_code}) đã được xác nhận vào nhóm của Trưởng nhóm (${acceptedLeaderMembership.leader_code}), không thể chọn làm Trưởng nhóm!`
                });
            }

            if (existingTopic && !activeTopicStatuses.includes(existingTopic.status)) {
                return res.status(400).json({
                    message: 'Nhóm này hiện không nhận thêm thành viên.'
                });
            }

            const previousRequest = await GroupJoinRequest.findOne({
                leader_code: codePattern(leader_code),
                member_code: codePattern(requesterCode),
                status: { $in: ['PENDING', 'ACCEPTED'] }
            });
            if (previousRequest) {
                return res.status(400).json({ message: previousRequest.status === 'ACCEPTED'
                    ? 'Yêu cầu tham gia nhóm của bạn đã được trưởng nhóm xác nhận!'
                    : 'Bạn đã gửi yêu cầu tham gia nhóm này, đang chờ trưởng nhóm xác nhận!' });
            }

            const activeMembershipRequests = await GroupJoinRequest.find({
                leader_code: codePattern(leader_code),
                status: { $in: ['PENDING', 'ACCEPTED'] }
            }).select('member_code').lean();
            const occupiedMemberCodes = new Set([
                existingTopic?.member2_code,
                existingTopic?.member3_code,
                ...activeMembershipRequests.map(request => request.member_code)
            ].map(normalizeCode).filter(Boolean));
            if (occupiedMemberCodes.size >= 2) {
                return res.status(400).json({ message: 'Nhóm đã đủ số lượng thành viên hoặc đã có đủ yêu cầu chờ xác nhận!' });
            }

            const groupRequest = await GroupJoinRequest.create({ leader_code, member_code: requesterCode });
            await notifyUsers([leader_code], {
                title: 'Yêu cầu tham gia nhóm mới',
                content: `Sinh viên ${requesterCode} muốn tham gia nhóm của bạn.`,
                eventKey: `group-join-request:${groupRequest._id}`
            });

            return res.status(200).json({
                success: true,
                message: 'Đã gửi yêu cầu tham gia nhóm. Vui lòng chờ Trưởng nhóm xác nhận!',
                pending: true
            });
        }

        const duplicateTitle = await findActiveTitleConflict(title, existingTopic?._id);
        if (duplicateTitle) {
            return res.status(409).json({
                message: 'Đề tài này đã được nhóm khác đăng ký. Vui lòng chọn đề tài khác!'
            });
        }

        if (lecturer_code) {
            const alreadyUsesLecturerQuota = existingTopic &&
                activeTopicStatuses.includes(existingTopic.status) &&
                String(existingTopic.lecturer_code || '').trim().toUpperCase() ===
                    String(lecturer_code || '').trim().toUpperCase();
            if (!alreadyUsesLecturerQuota &&
                !await ensureLecturerHasCapacity(res, lecturer_code, existingTopic?._id)) return;
        }

        if (existingTopic) {
            if (existingTopic.status === 'APPROVED') {
                return res.status(400).json({ message: 'Đề tài đã được phê duyệt, bạn không thể chỉnh sửa nữa!' });
            }

            if (member2_code && member2_code !== existingTopic.member2_code) {
                const checkMember2 = await Topic.findOne({
                    $or: [{ leader_code: member2_code }, { member2_code: member2_code }, { member3_code: member2_code }]
                });

                if (checkMember2 && checkMember2._id.toString() !== existingTopic._id.toString()) {
                    return res.status(400).json({ message: `Sinh viên (${member2_code}) đã tham gia một đề tài khác!` });
                }
            }

            if (member3_code && member3_code !== existingTopic.member3_code) {
                const checkMember3 = await Topic.findOne({
                    $or: [{ leader_code: member3_code }, { member2_code: member3_code }, { member3_code: member3_code }]
                });

                if (checkMember3 && checkMember3._id.toString() !== existingTopic._id.toString()) {
                    return res.status(400).json({ message: `Sinh viên (${member3_code}) đã tham gia một đề tài khác!` });
                }
            }

            existingTopic.member2_code = member2_code || null;
            existingTopic.member3_code = member3_code || null;
            existingTopic.lecturer_code = lecturer_code || null;
            existingTopic.title = title;
            existingTopic.description = description;
            existingTopic.category = category || existingTopic.category || 'Web / Ứng dụng';
            existingTopic.max_groups = selectedPoolTopic ? 1 : existingTopic.max_groups || 1;
            existingTopic.pool_topic_id = selectedPoolTopic?._id;
            existingTopic.active_pool_topic_id = selectedPoolTopic?._id;
            existingTopic.active_pool_topic_slot = selectedPoolTopic ? selectedPoolTopicSlot : undefined;
            existingTopic.active_title_key = normalizeTopicTitle(title) || undefined;
            existingTopic.status = 'PENDING';
            existingTopic.feedback = '';

            await existingTopic.save();

            return res.status(200).json({ 
                success: true,
                message: 'Cập nhật thông tin đề tài thành công! Đang chờ Giảng viên duyệt lại.',
                topic: existingTopic 
            });
        }

        const checkLeaderAsMember = await Topic.findOne({ 
            $or: [{ member2_code: leader_code }, { member3_code: leader_code }] 
        });
        if (checkLeaderAsMember) {
            return res.status(400).json({ message: `Bạn đang là Thành viên trong đề tài của Trưởng nhóm (${checkLeaderAsMember.leader_code})!` });
        }

        if (member2_code) {
            const checkMember2 = await Topic.findOne({
                $or: [{ leader_code: member2_code }, { member2_code: member2_code }, { member3_code: member2_code }]
            });
            if (checkMember2) {
                return res.status(400).json({ message: `Sinh viên (${member2_code}) đã tham gia một đề tài khác!` });
            }
        }

        if (member3_code) {
            const checkMember3 = await Topic.findOne({
                $or: [{ leader_code: member3_code }, { member2_code: member3_code }, { member3_code: member3_code }]
            });
            if (checkMember3) {
                return res.status(400).json({ message: `Sinh viên (${member3_code}) đã tham gia một đề tài khác!` });
            }
        }

        const acceptedRequests = await GroupJoinRequest.find({
            leader_code: codePattern(leader_code),
            status: 'ACCEPTED'
        }).sort({ createdAt: 1 }).limit(2).select('member_code');
        const acceptedMemberCodes = acceptedRequests.map(request => normalizeCode(request.member_code));
        const finalMemberCodes = [member2_code, member3_code];
        for (const acceptedMemberCode of acceptedMemberCodes) {
            if (!acceptedMemberCode || finalMemberCodes.includes(acceptedMemberCode)) continue;
            const emptySlot = finalMemberCodes.indexOf(null);
            if (emptySlot === -1) break;
            finalMemberCodes[emptySlot] = acceptedMemberCode;
        }

        const newTopic = new Topic({
            leader_code,
            member2_code: finalMemberCodes[0],
            member3_code: finalMemberCodes[1],
            lecturer_code: lecturer_code || null,
            title,
            description,
            category: category || 'Web / Ứng dụng',
            max_groups: 1,
            source: 'STUDENT',
            pool_topic_id: selectedPoolTopic?._id,
            active_pool_topic_id: selectedPoolTopic?._id,
            active_pool_topic_slot: selectedPoolTopic ? selectedPoolTopicSlot : undefined,
            active_title_key: normalizeTopicTitle(title) || undefined,
            status: 'PENDING'
        });

        await newTopic.save();
        await GroupJoinRequest.updateMany(
            { leader_code, member_code: { $in: acceptedMemberCodes }, status: 'ACCEPTED' },
            { $set: { status: 'ACCEPTED' } }
        );
        return res.status(201).json({ 
            success: true,
            message: 'Đăng ký đề tài thành công! Đang chờ duyệt.', 
            topic: newTopic 
        });

    } catch (error) {
        console.error("Lỗi đăng ký/cập nhật đề tài:", error);
        if (error.code === 11000 &&
            (error.keyPattern?.active_pool_topic_id || error.keyPattern?.active_pool_topic_slot ||
                error.keyPattern?.active_title_key)) {
            return res.status(409).json({
                message: 'Đề tài vừa được nhóm khác đăng ký hết chỉ tiêu. Vui lòng thử lại hoặc chọn đề tài khác!'
            });
        }
        return res.status(500).json({ message: 'Lỗi máy chủ khi xử lý đề tài!' });
    }
};

// 2. Lấy đề tài của sinh viên
exports.getMyTopic = async (req, res) => {
    try {
        const userCode = String(req.params.user_code || '').trim();
        const authenticatedCode = String(req.user?.user_code || '').trim();
        if (!authenticatedCode || authenticatedCode.toUpperCase() !== userCode.toUpperCase()) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể xem đề tài của tài khoản mình.' });
        }
        const codePattern = code => new RegExp(`^${String(code || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        const studentTopicFilter = {
            $or: [
                { leader_code: codePattern(userCode) },
                { member2_code: codePattern(userCode) },
                { member3_code: codePattern(userCode) }
            ]
        };

        let topic = await Topic.findOne({ ...studentTopicFilter, status: 'APPROVED' })
            .sort({ updatedAt: -1 })
            .lean();
        if (!topic) {
            topic = await Topic.findOne(studentTopicFilter).sort({ updatedAt: -1 }).lean();
        }

        let joinRequest = null;
        if (!topic) {
            joinRequest = await GroupJoinRequest.findOne({
                member_code: codePattern(userCode),
                status: { $in: ['PENDING', 'ACCEPTED', 'REJECTED'] }
            }).sort({ createdAt: -1 }).lean();

            if (joinRequest?.status === 'ACCEPTED') {
                const leaderFilter = { leader_code: codePattern(joinRequest.leader_code) };
                topic = await Topic.findOne({ ...leaderFilter, status: 'APPROVED' })
                    .sort({ updatedAt: -1 })
                    .lean();
                if (!topic) topic = await Topic.findOne(leaderFilter).sort({ updatedAt: -1 }).lean();

                if (topic && String(topic.leader_code || '').toUpperCase() !== userCode.toUpperCase()) {
                    const memberCodes = [topic.member2_code, topic.member3_code]
                        .filter(Boolean)
                        .map(code => String(code).toUpperCase());
                    if (!memberCodes.includes(userCode.toUpperCase())) {
                        const memberAdded = await addAcceptedMemberToTopic(topic._id, userCode);
                        if (!memberAdded) {
                            return res.status(409).json({
                                success: false,
                                message: 'Nhóm đã đủ thành viên hoặc đề tài không còn hoạt động. Vui lòng liên hệ Trưởng nhóm.'
                            });
                        }
                        topic = await Topic.findById(topic._id).lean();
                    }
                }
            }

            if (!topic && joinRequest) {
                const joinStatus = joinRequest.status === 'ACCEPTED'
                    ? 'JOIN_ACCEPTED'
                    : joinRequest.status === 'REJECTED' ? 'JOIN_REJECTED' : 'JOIN_PENDING';
                return res.json({
                    status: joinStatus,
                    leader_code: joinRequest.leader_code,
                    member2_code: userCode,
                    member3_code: null,
                    title: '',
                    description: '',
                    lecturer_code: ''
                });
            }

            if (!topic) return res.status(404).json({ message: "Không tìm thấy đề tài nào!" });
        }

        const submissions = await Submission.find({ topic_id: topic._id })
            .sort({ milestone: 1, is_draft: -1, submitted_at: -1, createdAt: -1 })
            .lean();

        const submittedSteps = submissions
            .map(submission => Number(String(submission.milestone || submission.milestone_step || '').replace(/\D/g, '')))
            .filter(step => Number.isInteger(step) && step > 0);
        const directFileSteps = Object.keys(topic)
            .map(key => Number(key.match(/^milestone(\d+)_file$/)?.[1]))
            .filter(step => Number.isInteger(step) && step > 0);

        for (const step of new Set([...submittedSteps, ...directFileSteps])) {
            const sub = submissions.find(item =>
                Number(String(item.milestone || item.milestone_step || '').replace(/\D/g, '')) === step
            );
            if (sub) {
                topic[`milestone${step}_file`] = {
                    name: sub.file_name || sub.original_name || `Bài nộp mốc ${step}`,
                    path: sub.file_path,
                    filename: sub.stored_filename || String(sub.file_path || '').split(/[\\/]/).pop(),
                    submittedAt: sub.submitted_at || sub.createdAt || null,
                    isDraft: Boolean(sub.is_draft)
                };
            } else if (topic[`milestone${step}_file`] && !topic[`milestone${step}_file`].name) {
                const directFile = topic[`milestone${step}_file`];
                topic[`milestone${step}_file`] = {
                    name: `Bài nộp mốc ${step}`,
                    path: directFile.path || '',
                    submittedAt: directFile.submittedAt || directFile.uploadedAt || null
                };
            }
        }

        return res.status(200).json(topic);
    } catch (error) {
        console.error("Lỗi khi lấy thông tin đề tài:", error);
        return res.status(500).json({ message: "Lỗi hệ thống phía Server!" });
    }
};

// 3. Cập nhật đề tài theo ID
exports.updateTopic = async (req, res) => {
    try {
        const { topic_id } = req.params;
        const { title, description, member2_code, member3_code, category } = req.body;
        const userCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'STUDENT' || !userCode) {
            return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới có thể cập nhật đề tài.' });
        }

        const topic = await Topic.findOne({ _id: topic_id, leader_code: codeRegex(userCode) });
        if (!topic) {
            return res.status(404).json({ message: 'Không tìm thấy đề tài!' });
        }

        if (topic.status !== 'PENDING' && topic.status !== 'NEED_REVISION') {
            return res.status(400).json({ 
                message: 'Chỉ có thể chỉnh sửa đề tài khi đang ở trạng thái Chờ duyệt hoặc Yêu cầu sửa!' 
            });
        }

        if (member2_code && member2_code !== topic.member2_code) {
            const checkMember2 = await Topic.findOne({
                $or: [{ leader_code: member2_code }, { member2_code: member2_code }, { member3_code: member2_code }]
            });
            if (checkMember2) {
                return res.status(400).json({ message: `Sinh viên (${member2_code}) đã tham gia một đề tài khác!` });
            }
        }

        if (member3_code && member3_code !== topic.member3_code) {
            const checkMember3 = await Topic.findOne({
                $or: [{ leader_code: member3_code }, { member2_code: member3_code }, { member3_code: member3_code }]
            });
            if (checkMember3) {
                return res.status(400).json({ message: `Sinh viên (${member3_code}) đã tham gia một đề tài khác!` });
            }
        }

        topic.title = title || topic.title;
        const duplicateTitle = await findActiveTitleConflict(topic.title, topic._id);
        if (duplicateTitle) {
            return res.status(409).json({
                message: 'Tên đề tài này đã được nhóm khác đăng ký. Vui lòng chọn tên đề tài khác!'
            });
        }
        topic.active_title_key = normalizeTopicTitle(topic.title) || undefined;
        topic.description = description || topic.description;
        topic.category = category || topic.category;
        topic.member2_code = member2_code !== undefined ? (member2_code || null) : topic.member2_code;
        topic.member3_code = member3_code !== undefined ? (member3_code || null) : topic.member3_code;
        topic.status = 'PENDING';
        topic.feedback = '';

        await topic.save();

        res.json({ success: true, message: 'Cập nhật thông tin đề tài thành công!', topic });
    } catch (error) {
        console.error("Lỗi khi cập nhật đề tài:", error);
        if (error.code === 11000 && error.keyPattern?.active_pool_topic_slot) {
            return res.status(409).json({
                message: 'Đề tài vừa được nhóm khác đăng ký hết chỉ tiêu. Vui lòng tải lại trang.'
            });
        }
        if (error.code === 11000 && error.keyPattern?.active_title_key) {
            return res.status(409).json({
                message: 'Tên đề tài này vừa được nhóm khác đăng ký. Vui lòng chọn tên đề tài khác!'
            });
        }
        res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật đề tài!' });
    }
};

// 4. Hủy đăng ký đề tài theo Mã sinh viên
exports.cancelTopic = async (req, res) => {
    try {
        const userCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'STUDENT' || !userCode) {
            return res.status(403).json({ success: false, message: 'Chỉ sinh viên mới có thể hủy đề tài.' });
        }

        const requestedUserCode = String(req.params.user_code || '').trim();
        if (requestedUserCode && requestedUserCode.toUpperCase() !== userCode.toUpperCase()) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể hủy đề tài của nhóm mình.' });
        }

        const topicId = req.params.topic_id;
        const topic = await Topic.findOne({
            ...(topicId ? { _id: topicId } : {}),
            leader_code: codeRegex(userCode)
        });

        if (!topic) {
            return res.status(404).json({ message: "Không tìm thấy đề tài để hủy!" });
        }

        if (topic.status === 'APPROVED') {
            return res.status(400).json({ message: "Đề tài đã được phê duyệt, không thể hủy!" });
        }

        await Topic.findByIdAndDelete(topic._id);
        if (topic.pool_topic_id) {
            await LecturerTopic.findByIdAndUpdate(topic.pool_topic_id, {
                status: 'APPROVED',
                is_registered: false
            });
        }

        return res.status(200).json({ success: true, message: "Đã hủy đăng ký đề tài thành công!" });
    } catch (error) {
        console.error("Lỗi khi hủy đề tài:", error);
        return res.status(500).json({ message: "Lỗi máy chủ khi hủy đề tài!" });
    }
};

// 5. Nộp báo cáo Mốc tiến độ
exports.uploadMilestone = async (req, res) => {
    try {
        const topic_id = req.params.topic_id || req.body.topic_id;
        const mIndex = req.params.mIndex || req.body.milestoneIndex || req.body.milestone;
        const file = req.file;
        const isDraft = String(req.body.isDraft || '').toLowerCase() === 'true';
        const discardFile = () => {
            if (file?.path) fs.unlink(file.path, error => {
                if (error && error.code !== 'ENOENT') console.error('Lỗi xóa file milestone bị từ chối:', error);
            });
        };

        if (!file) {
            return res.status(400).json({ success: false, message: "Vui lòng chọn file tải lên!" });
        }

        const step = Number(mIndex);
        if (!Number.isInteger(step) || step < 1) {
            discardFile();
            return res.status(400).json({ success: false, message: "Thiếu thông tin cột mốc cần nộp!" });
        }

        const studentCode = String(req.user?.user_code || '').trim();
        const escapedStudentCode = studentCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const studentCodePattern = new RegExp(`^${escapedStudentCode}$`, 'i');
        const topic = await Topic.findOne({
            _id: topic_id,
            status: 'APPROVED',
            $or: [
                { leader_code: studentCodePattern },
                { member2_code: studentCodePattern },
                { member3_code: studentCodePattern }
            ]
        }).select('lecturer_code');

        if (!topic) {
            discardFile();
            return res.status(403).json({ success: false, message: 'Bạn không có quyền nộp bài cho đề tài này.' });
        }

        const milestone = await Milestone.findOne({ lecturerCode: topic.lecturer_code, topicId: null, step });
        if (!milestone) {
            discardFile();
            return res.status(404).json({ success: false, message: 'Giảng viên chưa tạo mốc nộp bài này.' });
        }

        const now = new Date();
        if (now < milestone.startDate) {
            discardFile();
            return res.status(403).json({
                success: false,
                message: `Chưa đến thời gian nộp bài. Mốc này mở từ ${milestone.startDate.toLocaleString('vi-VN')}.`
            });
        }
        const latestOfficialSubmission = await Submission.findOne({
            topic_id,
            milestone: step,
            is_draft: { $ne: true }
        }).sort({ attempt: -1, submitted_at: -1, createdAt: -1 }).select('review_status').lean();
        const latestReviewStatus = latestOfficialSubmission?.review_status || 'PENDING_REVIEW';
        if (now > milestone.endDate && !milestone.allowLate && latestReviewStatus !== 'REVISION_REQUESTED') {
            discardFile();
            return res.status(403).json({ success: false, message: 'Đã quá hạn nộp bài cho mốc này.' });
        }
        const canReplacePendingSubmission = latestReviewStatus === 'PENDING_REVIEW' &&
            (now <= milestone.endDate || milestone.allowLate);
        const canReplaceWithdrawnSubmission = latestReviewStatus === 'WITHDRAWN' &&
            (now <= milestone.endDate || milestone.allowLate);
        if (latestOfficialSubmission && latestReviewStatus !== 'REVISION_REQUESTED' &&
            !canReplacePendingSubmission && !canReplaceWithdrawnSubmission) {
            discardFile();
            return res.status(409).json({
                success: false,
                message: latestReviewStatus === 'APPROVED'
                    ? 'Bài nộp đã được duyệt, không thể thay đổi.'
                    : latestReviewStatus === 'PENDING_REVIEW'
                        ? 'Chỉ có thể thay đổi bài đang chờ nhận xét trong thời hạn nộp.'
                        : 'Bài nộp này không thể thay đổi.'
            });
        }

        const previousDraft = await Submission.findOne({ topic_id, milestone: step, is_draft: true })
            .select('file_path')
            .lean();
        const officialAttempts = await Submission.countDocuments({
            topic_id,
            milestone: step,
            is_draft: { $ne: true }
        });

        const fileInfo = {
            name: file.originalname,
            path: file.path,
            filename: file.filename,
            mimetype: file.mimetype,
            size: file.size,
            submittedAt: new Date(),
            isDraft
        };

        const updateData = {};
        updateData[`milestone${step}_file`] = fileInfo;

        const updatedTopic = await Topic.findByIdAndUpdate(
            topic_id,
            { $set: updateData },
            { new: true }
        );

        if (!updatedTopic) {
            return res.status(404).json({ success: false, message: "Không tìm thấy đề tài trong hệ thống!" });
        }

        const submissionData = {
                topic_id: topic_id,
                student_id: studentCode,
                milestone: step,
                file_name: file.originalname,
                original_name: file.originalname,
                file_path: file.path,
                stored_filename: file.filename,
                file_size: file.size,
                is_draft: isDraft,
                submitted_at: new Date(),
                attempt: officialAttempts + 1,
                review_status: isDraft ? 'DRAFT' : 'PENDING_REVIEW',
                ...(isDraft ? {} : { feedback: '', reviewed_by: null, reviewed_at: null })
            };
        if (isDraft) {
            await Submission.findOneAndUpdate(
                { topic_id, milestone: step, is_draft: true },
                { $set: submissionData },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
        } else {
            await Submission.create(submissionData);
        }

        if (previousDraft?.file_path && previousDraft.file_path !== file.path) {
            await removeUploadedReportFile(previousDraft.file_path);
        }

        return res.status(200).json({
            success: true,
            message: isDraft
                ? `Đã lưu bản nháp Mốc ${step}. Bấm "Nộp bài" để gửi chính thức.`
                : `Đã nộp thành công báo cáo Mốc ${step}!`,
            data: updatedTopic
        });

    } catch (error) {
        console.error("Lỗi upload milestone:", error);
        return res.status(500).json({ success: false, message: "Lỗi Server: " + error.message });
    }
};

exports.submitMilestoneDraft = async (req, res) => {
    try {
        const { topic_id } = req.params;
        const step = Number(req.params.mIndex);
        if (!Number.isInteger(step) || step < 1) {
            return res.status(400).json({ success: false, message: 'Mốc nộp bài không hợp lệ.' });
        }

        const studentCode = String(req.user?.user_code || '').trim();
        const escapedStudentCode = studentCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const studentCodePattern = new RegExp(`^${escapedStudentCode}$`, 'i');
        const topic = await Topic.findOne({
            _id: topic_id,
            status: 'APPROVED',
            $or: [
                { leader_code: studentCodePattern },
                { member2_code: studentCodePattern },
                { member3_code: studentCodePattern }
            ]
        });
        if (!topic) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền nộp bài cho đề tài này.' });
        }

        const milestone = await Milestone.findOne({ lecturerCode: topic.lecturer_code, topicId: null, step });
        const now = new Date();
        if (!milestone || now < milestone.startDate) {
            return res.status(403).json({ success: false, message: 'Mốc này hiện không nhận bài nộp.' });
        }

        const submission = await Submission.findOne({ topic_id, milestone: step, is_draft: true });
        if (!submission) {
            return res.status(404).json({ success: false, message: 'Chưa có bản nháp để nộp.' });
        }
        if (!submission.is_draft) {
            return res.status(409).json({ success: false, message: 'Bài ở mốc này đã được nộp chính thức.' });
        }
        const latestOfficialSubmission = await Submission.findOne({
            topic_id,
            milestone: step,
            is_draft: { $ne: true }
        }).sort({ attempt: -1, submitted_at: -1, createdAt: -1 }).select('_id review_status').lean();
        const latestReviewStatus = latestOfficialSubmission?.review_status || 'PENDING_REVIEW';
        if (now > milestone.endDate && !milestone.allowLate && latestReviewStatus !== 'REVISION_REQUESTED') {
            return res.status(403).json({ success: false, message: 'Mốc này hiện không nhận bài nộp.' });
        }
        const canReplacePendingSubmission = Boolean(latestOfficialSubmission) &&
            latestReviewStatus === 'PENDING_REVIEW' &&
            (now <= milestone.endDate || milestone.allowLate);
        const canResubmitWithdrawnSubmission = Boolean(latestOfficialSubmission) &&
            latestReviewStatus === 'WITHDRAWN' &&
            (now <= milestone.endDate || milestone.allowLate);
        if (latestOfficialSubmission && latestReviewStatus !== 'REVISION_REQUESTED' &&
            !canReplacePendingSubmission && !canResubmitWithdrawnSubmission) {
            return res.status(409).json({
                success: false,
                message: latestReviewStatus === 'APPROVED'
                    ? 'Bài nộp đã được duyệt, không thể nộp lại.'
                    : latestReviewStatus === 'PENDING_REVIEW'
                        ? 'Chỉ có thể thay đổi bài đang chờ nhận xét trong thời hạn nộp.'
                        : 'Bài nộp này không thể nộp lại.'
            });
        }

        let supersededSubmissionId = null;
        if (canReplacePendingSubmission) {
            const superseded = await Submission.updateOne(
                {
                    _id: latestOfficialSubmission._id,
                    is_draft: { $ne: true },
                    review_status: 'PENDING_REVIEW'
                },
                { $set: { review_status: 'SUPERSEDED' } }
            );
            if (superseded.modifiedCount !== 1) {
                return res.status(409).json({ success: false, message: 'Bài nộp vừa được giảng viên xử lý. Vui lòng tải lại trang.' });
            }
            supersededSubmissionId = latestOfficialSubmission._id;
        }

        submission.is_draft = false;
        submission.review_status = 'PENDING_REVIEW';
        submission.feedback = '';
        submission.reviewed_by = null;
        submission.reviewed_at = null;
        submission.submitted_at = now;
        try {
            await submission.save();
        } catch (error) {
            if (supersededSubmissionId) {
                await Submission.updateOne(
                    { _id: supersededSubmissionId, review_status: 'SUPERSEDED' },
                    { $set: { review_status: 'PENDING_REVIEW' } }
                );
            }
            throw error;
        }

        try {
            const student = req.user?.full_name
                ? null
                : await User.findOne({ user_code: studentCode, role: 'STUDENT' })
                    .select('full_name')
                    .lean();
            const studentName = String(req.user?.full_name || student?.full_name || studentCode).trim();
            await notifyUsers([topic.lecturer_code], {
                title: `Bài nộp Mốc ${step} mới cần nhận xét`,
                content: `Sinh viên ${studentName} (${studentCode}) vừa nộp báo cáo Mốc ${step} cho đề tài "${topic.title || 'đề tài'}". Vui lòng xem và nhận xét bài nộp.`,
                eventKey: `submission-received:${submission._id}`,
                priority: 'info',
                type: 'STUDENT',
                senderName: studentName
            });
        } catch (notificationError) {
            console.error('Lỗi gửi thông báo bài nộp mới cho giảng viên:', notificationError);
        }

        return res.json({ success: true, message: `Đã nộp chính thức bài làm Mốc ${step}.` });
    } catch (error) {
        console.error('Lỗi nộp chính thức bài làm:', error);
        return res.status(500).json({ success: false, message: 'Không thể nộp bài lúc này.' });
    }
};

exports.withdrawMilestoneSubmission = async (req, res) => {
    try {
        const { topic_id } = req.params;
        const step = Number(req.params.mIndex);
        if (!Number.isInteger(step) || step < 1) {
            return res.status(400).json({ success: false, message: 'Mốc nộp bài không hợp lệ.' });
        }

        const studentCode = String(req.user?.user_code || '').trim();
        const escapedStudentCode = studentCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const studentCodePattern = new RegExp(`^${escapedStudentCode}$`, 'i');
        const topic = await Topic.findOne({
            _id: topic_id,
            status: 'APPROVED',
            $or: [
                { leader_code: studentCodePattern },
                { member2_code: studentCodePattern },
                { member3_code: studentCodePattern }
            ]
        });
        if (!topic) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền rút bài nộp của đề tài này.' });
        }

        const milestone = await Milestone.findOne({ lecturerCode: topic.lecturer_code, topicId: null, step });
        if (!milestone) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy mốc nộp bài.' });
        }

        const now = new Date();
        if (now > milestone.endDate && !milestone.allowLate) {
            return res.status(403).json({ success: false, message: 'Đã hết thời hạn rút bài nộp.' });
        }

        const draft = await Submission.findOne({ topic_id, milestone: step, is_draft: true }).select('_id').lean();
        if (draft) {
            return res.status(409).json({ success: false, message: 'Bạn đang có bản nháp. Hãy nộp hoặc xóa bản nháp trước.' });
        }

        const latestSubmission = await Submission.findOne({
            topic_id,
            milestone: step,
            is_draft: { $ne: true }
        }).sort({ attempt: -1, submitted_at: -1, createdAt: -1 }).select('_id review_status').lean();
        if (!latestSubmission || latestSubmission.review_status !== 'PENDING_REVIEW') {
            return res.status(409).json({ success: false, message: 'Chỉ có thể rút bài đang chờ giảng viên nhận xét.' });
        }

        const withdrawnSubmission = await Submission.findOneAndUpdate(
            {
                _id: latestSubmission._id,
                topic_id,
                milestone: step,
                is_draft: { $ne: true },
                review_status: 'PENDING_REVIEW'
            },
            {
                $set: {
                    review_status: 'WITHDRAWN',
                    withdrawn_by: studentCode,
                    withdrawn_at: now
                }
            },
            { new: true }
        );
        if (!withdrawnSubmission) {
            return res.status(409).json({ success: false, message: 'Bài nộp vừa được giảng viên xử lý. Vui lòng tải lại trang.' });
        }

        return res.json({ success: true, message: 'Đã rút bài nộp. Bạn có thể tải bài mới lên trong thời hạn.' });
    } catch (error) {
        console.error('Lỗi rút bài nộp milestone:', error);
        return res.status(500).json({ success: false, message: 'Không thể rút bài nộp lúc này.' });
    }
};

exports.deleteMilestoneSubmission = async (req, res) => {
    try {
        const { topic_id } = req.params;
        const step = Number(req.params.mIndex);
        if (!Number.isInteger(step) || step < 1) {
            return res.status(400).json({ success: false, message: 'Mốc nộp bài không hợp lệ.' });
        }

        const studentCode = String(req.user?.user_code || '').trim();
        const escapedStudentCode = studentCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const studentCodePattern = new RegExp(`^${escapedStudentCode}$`, 'i');
        const topic = await Topic.findOne({
            _id: topic_id,
            status: 'APPROVED',
            $or: [
                { leader_code: studentCodePattern },
                { member2_code: studentCodePattern },
                { member3_code: studentCodePattern }
            ]
        });

        if (!topic) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền sửa bài nộp của đề tài này.' });
        }

        const milestone = await Milestone.findOne({ lecturerCode: topic.lecturer_code, topicId: null, step });
        if (!milestone) {
            return res.status(403).json({ success: false, message: 'Đã hết thời gian chỉnh sửa bài nộp ở mốc này.' });
        }

        const submission = await Submission.findOne({ topic_id, milestone: step, is_draft: true })
            .select('_id file_path stored_filename')
            .lean();
        const latestOfficialSubmission = await Submission.findOne({
            topic_id,
            milestone: step,
            is_draft: { $ne: true }
        }).sort({ attempt: -1, submitted_at: -1, createdAt: -1 }).select('review_status').lean();
        const resubmissionRequested = (latestOfficialSubmission?.review_status || 'PENDING_REVIEW') === 'REVISION_REQUESTED';
        if (new Date() > milestone.endDate && !milestone.allowLate && !resubmissionRequested) {
            return res.status(403).json({ success: false, message: 'Đã hết thời gian chỉnh sửa bài nộp ở mốc này.' });
        }

        const milestoneField = `milestone${step}_file`;
        const topicFile = topic[milestoneField];
        if (!submission) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy bản nháp cần xóa.' });
        }

        const currentFilePath = topicFile?.path || '';
        const currentStoredFilename = topicFile?.filename || path.basename(currentFilePath);
        const isCurrentDraftFile = topicFile?.isDraft === true ||
            (submission.stored_filename && currentStoredFilename === submission.stored_filename);
        if (currentFilePath === submission.file_path || isCurrentDraftFile) {
            await Topic.updateOne({ _id: topic_id }, { $unset: { [milestoneField]: '' } });
        }
        await Submission.deleteOne({ _id: submission._id });
        await removeUploadedReportFile(submission.file_path);

        return res.json({
            success: true,
            message: latestOfficialSubmission
                ? `Đã xóa bản nháp Mốc ${step}. Bài nộp chính thức trước đó vẫn được giữ lại.`
                : `Đã xóa bản nháp Mốc ${step}. Bạn có thể tải tệp khác lên.`
        });
    } catch (error) {
        console.error('Lỗi xóa bài nộp milestone:', error);
        return res.status(500).json({ success: false, message: 'Không thể xóa bài nộp lúc này.' });
    }
};

// 6. Lấy danh sách đề tài gợi ý trong Kho (Cho SV & GV xem)
exports.getLecturerPoolTopics = async (req, res) => {
    try {
        const availablePool = await getAvailableLecturerPoolTopics();
        return res.status(200).json({ success: true, data: availablePool });
    } catch (error) {
        console.error("Lỗi lấy kho đề tài giảng viên:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.getStudentTopicMarketplace = async (req, res) => {
    try {
        const studentCode = String(req.user?.user_code || '').trim().toUpperCase();
        const activeTopicsFilter = { status: { $in: activeTopicStatuses } };
        const [lecturerTopics, groupTopics, recruitments, studentTopic, studentMembership] = await Promise.all([
            getAvailableLecturerPoolTopics(),
            Topic.find({
                ...activeTopicsFilter,
                leader_code: { $exists: true, $nin: ['', null] }
            }).sort({ createdAt: -1 }).lean(),
            GroupRecruitment.find({ status: 'OPEN' }).sort({ updatedAt: -1 }).lean(),
            Topic.findOne({
                ...activeTopicsFilter,
                $or: [
                    { leader_code: codeRegex(studentCode) },
                    { member2_code: codeRegex(studentCode) },
                    { member3_code: codeRegex(studentCode) }
                ]
            }).select('_id').lean(),
            GroupJoinRequest.findOne({
                member_code: codeRegex(studentCode),
                status: 'ACCEPTED'
            }).select('_id').lean()
        ]);

        const registeredLeaderCodes = new Set(groupTopics.map(topic =>
            String(topic.leader_code || '').trim().toUpperCase()
        ).filter(Boolean));
        const leaderCodes = [...new Set([
            ...groupTopics.map(topic => String(topic.leader_code || '').trim().toUpperCase()),
            ...recruitments.map(recruitment => String(recruitment.leader_code || '').trim().toUpperCase())
        ].filter(Boolean))];
        const joinRequests = await GroupJoinRequest.find({
            status: { $in: ['PENDING', 'ACCEPTED'] },
            $or: [
                { leader_code: { $in: leaderCodes.map(codeRegex) } },
                { member_code: codeRegex(studentCode) }
            ]
        }).lean();
        const lecturerCodes = [...new Set([
            ...lecturerTopics.map(topic => String(topic.lecturer_code || '').trim().toUpperCase()),
            ...groupTopics.map(topic => String(topic.lecturer_code || '').trim().toUpperCase())
        ].filter(Boolean))];
        const users = await User.find({
            user_code: { $in: [...leaderCodes, ...lecturerCodes].map(codeRegex) }
        }).select('user_code full_name').lean();
        const namesByCode = new Map(users.map(user => [
            String(user.user_code || '').trim().toUpperCase(),
            user.full_name || ''
        ]));
        const requestsByLeader = new Map();
        joinRequests.forEach(request => {
            const leaderCode = String(request.leader_code || '').trim().toUpperCase();
            if (!requestsByLeader.has(leaderCode)) requestsByLeader.set(leaderCode, []);
            requestsByLeader.get(leaderCode).push(request);
        });
        const studentHasTopic = Boolean(studentTopic || studentMembership);
        const ownRequests = joinRequests.filter(request =>
            String(request.member_code || '').trim().toUpperCase() === studentCode
        );
        const hasPendingRequest = ownRequests.some(request => request.status === 'PENDING');
        const hasAcceptedRequest = ownRequests.some(request => request.status === 'ACCEPTED');
        const hasAcceptedMemberAsLeader = joinRequests.some(request =>
            String(request.leader_code || '').trim().toUpperCase() === studentCode &&
            request.status === 'ACCEPTED'
        );
        const cannotJoinAnotherGroup = Boolean(
            studentHasTopic || hasPendingRequest || hasAcceptedRequest || hasAcceptedMemberAsLeader
        );

        const openGroupTopics = groupTopics.map(topic => {
            const leaderCode = String(topic.leader_code || '').trim().toUpperCase();
            const members = [topic.member2_code, topic.member3_code]
                .map(code => String(code || '').trim().toUpperCase())
                .filter(Boolean);
            const activeRequests = requestsByLeader.get(leaderCode) || [];
            const occupiedMembers = new Set(members);
            activeRequests.forEach(request => {
                const memberCode = String(request.member_code || '').trim().toUpperCase();
                if (memberCode) occupiedMembers.add(memberCode);
            });
            const openSlots = Math.max(0, 2 - occupiedMembers.size);
            const ownRequest = ownRequests.find(request =>
                String(request.leader_code || '').trim().toUpperCase() === leaderCode
            );
            return {
                _id: topic._id,
                title: topic.title,
                description: topic.description,
                category: topic.category,
                requirements: topic.requirements || '',
                status: topic.status,
                lecturer_code: topic.lecturer_code,
                lecturer_name: namesByCode.get(String(topic.lecturer_code || '').trim().toUpperCase()) ||
                    topic.lecturer_code,
                leader_code: topic.leader_code,
                leader_name: namesByCode.get(leaderCode) || topic.leader_code,
                member_count: occupiedMembers.size + 1,
                open_slots: openSlots,
                request_status: ownRequest?.status || null,
                cannot_join_reason: cannotJoinAnotherGroup
                    ? 'Bạn đã tham gia hoặc đang chịu trách nhiệm một nhóm khác.'
                    : null,
                can_join: openSlots > 0 && !cannotJoinAnotherGroup && !ownRequest
            };
        }).filter(topic => topic.open_slots > 0);
        const preRegistrationGroups = recruitments
            .filter(recruitment => {
                const leaderCode = String(recruitment.leader_code || '').trim().toUpperCase();
                return leaderCode !== studentCode && !registeredLeaderCodes.has(leaderCode);
            })
            .map(recruitment => {
                const leaderCode = String(recruitment.leader_code || '').trim().toUpperCase();
                const activeRequests = requestsByLeader.get(leaderCode) || [];
                const occupiedMembers = new Set(activeRequests.map(request =>
                    String(request.member_code || '').trim().toUpperCase()
                ).filter(Boolean));
                const openSlots = Math.max(0, 2 - occupiedMembers.size);
                const ownRequest = ownRequests.find(request =>
                    String(request.leader_code || '').trim().toUpperCase() === leaderCode
                );
                return {
                    _id: recruitment._id,
                    title: 'Nhóm đang tuyển thành viên',
                    description: '',
                    leader_code: leaderCode,
                    leader_name: namesByCode.get(leaderCode) || 'Trưởng nhóm',
                    member_count: occupiedMembers.size + 1,
                    open_slots: openSlots,
                    request_status: ownRequest?.status || null,
                    cannot_join_reason: cannotJoinAnotherGroup
                        ? 'Nhóm của bạn đã có thành viên xác nhận.'
                        : null,
                    can_join: openSlots > 0 && !cannotJoinAnotherGroup && !ownRequest,
                    pre_registration: true
                };
            })
            .filter(group => group.open_slots > 0);

        return res.status(200).json({
            success: true,
            data: {
                my_recruitment: recruitments.some(recruitment =>
                    String(recruitment.leader_code || '').trim().toUpperCase() === studentCode
                ) && !registeredLeaderCodes.has(studentCode),
                can_publish_recruitment: !studentHasTopic && !hasPendingRequest,
                lecturerTopics: lecturerTopics
                    .filter(topic => Number(topic.remaining_groups) > 0)
                    .map(topic => ({
                        ...topic,
                        lecturer_name: namesByCode.get(String(topic.lecturer_code || '').trim().toUpperCase()) ||
                            topic.lecturer_code,
                        can_register_as_leader: !studentHasTopic && !hasPendingRequest
                    })),
                groupTopics: [...preRegistrationGroups, ...openGroupTopics]
            }
        });
    } catch (error) {
        console.error('Lỗi lấy sàn đề tài sinh viên:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể tải danh sách đề tài. Vui lòng thử lại sau.'
        });
    }
};

exports.publishGroupRecruitment = async (req, res) => {
    try {
        const leaderCode = String(req.user?.user_code || '').trim().toUpperCase();
        const activeSemester = await Semester.findOne({ is_active: true }).lean();
        const now = new Date();
        const registrationStart = activeSemester?.registration_start_date
            ? getRegistrationStartOfDay(activeSemester.registration_start_date)
            : null;
        const registrationEnd = activeSemester?.registration_end_date
            ? getRegistrationEndOfDay(activeSemester.registration_end_date)
            : null;
        if (!registrationStart || !registrationEnd || now < registrationStart || now > registrationEnd) {
            return res.status(403).json({
                success: false,
                message: 'Chỉ có thể công khai nhóm trong thời hạn đăng ký đề tài.'
            });
        }

        const [activeTopic, activeMembership, activeRequests] = await Promise.all([
            Topic.findOne({
                status: { $in: activeTopicStatuses },
                $or: [
                    { leader_code: codeRegex(leaderCode) },
                    { member2_code: codeRegex(leaderCode) },
                    { member3_code: codeRegex(leaderCode) }
                ]
            }).select('_id').lean(),
            GroupJoinRequest.findOne({
                member_code: codeRegex(leaderCode),
                status: { $in: ['PENDING', 'ACCEPTED'] }
            }).select('_id').lean(),
            GroupJoinRequest.find({
                leader_code: codeRegex(leaderCode),
                status: { $in: ['PENDING', 'ACCEPTED'] }
            }).select('member_code').lean()
        ]);
        if (activeTopic || activeMembership) {
            return res.status(409).json({
                success: false,
                message: 'Bạn đã đăng ký đề tài hoặc đang tham gia nhóm khác nên không thể mở nhóm tuyển thành viên.'
            });
        }

        const occupiedMembers = new Set(activeRequests.map(request =>
            String(request.member_code || '').trim().toUpperCase()
        ).filter(Boolean));
        if (occupiedMembers.size >= 2) {
            return res.status(409).json({
                success: false,
                message: 'Nhóm đã đủ thành viên hoặc đã có đủ yêu cầu chờ xác nhận.'
            });
        }

        await GroupRecruitment.findOneAndUpdate(
            { leader_code: leaderCode },
            { $set: { status: 'OPEN' }, $setOnInsert: { leader_code: leaderCode } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        return res.status(200).json({
            success: true,
            message: 'Đã công khai nhóm tuyển thành viên. Các sinh viên khác có thể gửi yêu cầu tham gia.'
        });
    } catch (error) {
        console.error('Lỗi công khai nhóm tuyển thành viên:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể công khai nhóm lúc này. Vui lòng thử lại.'
        });
    }
};

exports.closeGroupRecruitment = async (req, res) => {
    try {
        const leaderCode = String(req.user?.user_code || '').trim().toUpperCase();
        await GroupRecruitment.updateOne(
            { leader_code: leaderCode, status: 'OPEN' },
            { $set: { status: 'CLOSED' } }
        );
        return res.status(200).json({
            success: true,
            message: 'Đã ngừng công khai nhóm tuyển thành viên.'
        });
    } catch (error) {
        console.error('Lỗi ngừng công khai nhóm tuyển thành viên:', error);
        return res.status(500).json({
            success: false,
            message: 'Không thể ngừng công khai nhóm lúc này. Vui lòng thử lại.'
        });
    }
};

// Admin: lấy toàn bộ nhóm đề tài thật từ hệ thống
exports.getAllTopicsForAdmin = async (req, res) => {
    try {
        const semesterId = typeof req.query.semester === 'string' ? req.query.semester : '';
        const topicFilter = {};
        if (semesterId && semesterId !== 'all') {
            if (!mongoose.Types.ObjectId.isValid(semesterId)) {
                return res.status(400).json({ success: false, message: 'Học kỳ được chọn không hợp lệ.' });
            }

            const semester = await Semester.findById(semesterId).lean();
            if (!semester) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy học kỳ được chọn.' });
            }

            const registrationRange = getSemesterRegistrationRange(semester);
            if (!registrationRange) {
                return res.status(400).json({
                    success: false,
                    message: 'Học kỳ này chưa được cấu hình thời hạn đăng ký hợp lệ.'
                });
            }
            topicFilter.createdAt = { $gte: registrationRange.start, $lte: registrationRange.end };
        }

        const topics = await Topic.find(topicFilter).sort({ createdAt: -1 }).lean();

        const memberCodes = topics.flatMap(topic => [
            topic.leader_code,
            topic.member2_code,
            topic.member3_code
        ].filter(Boolean));

        const users = await User.find({ user_code: { $in: memberCodes } }).select('user_code full_name role');
        const userMap = new Map(users.map(user => [user.user_code, user]));

        const lecturerCodes = topics.map(topic => topic.lecturer_code).filter(Boolean);
        const lecturers = await User.find({
            role: 'LECTURER',
            user_code: { $in: lecturerCodes }
        }).select('user_code full_name');
        const lecturerMap = new Map(lecturers.map(lecturer => [lecturer.user_code, lecturer]));

        const data = topics.map(topic => {
            const members = [
                { code: topic.leader_code, isLeader: true },
                { code: topic.member2_code, isLeader: false },
                { code: topic.member3_code, isLeader: false }
            ].filter(item => item.code);

            const students = members.map(member => {
                const user = userMap.get(member.code);
                return {
                    name: user ? user.full_name : member.code,
                    code: member.code,
                    isLeader: member.isLeader
                };
            });

            return {
                _id: topic._id,
                id: topic.topic_code || topic._id,
                topicTitle: topic.title,
                lecturerHD: topic.lecturer_code
                    ? (lecturerMap.get(topic.lecturer_code)?.full_name || topic.lecturer_code)
                    : null,
                lecturer_code: topic.lecturer_code || null,
                students,
                topicStatus: topic.status || '',
                status: topic.lecturer_code ? 'assigned' : 'unassigned'
            };
        });

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Lỗi lấy danh sách nhóm admin:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.assignLecturerToTopic = async (req, res) => {
    try {
        const { topic_id } = req.params;
        const { lecturer_code } = req.body;

        if (!lecturer_code) {
            return res.status(400).json({ success: false, message: 'Vui lòng chọn giảng viên hướng dẫn!' });
        }

        const lecturer = await User.findOne({ user_code: lecturer_code, role: 'LECTURER' });
        if (!lecturer) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy giảng viên phù hợp!' });
        }

        const topic = await Topic.findById(topic_id);
        if (!topic) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm / đề tài!' });
        }

        const isActiveAssignment = activeTopicStatuses.includes(topic.status) &&
            Boolean(String(topic.leader_code || '').trim());
        const isSameLecturer = String(topic.lecturer_code || '').trim().toUpperCase() ===
            String(lecturer.user_code || '').trim().toUpperCase();
        if (isActiveAssignment && !isSameLecturer &&
            !await ensureLecturerHasCapacity(res, lecturer.user_code, topic._id)) return;

        topic.lecturer_code = lecturer_code;
        topic.status = topic.status === 'PENDING' ? 'PENDING' : topic.status;
        await topic.save();

        return res.status(200).json({
            success: true,
            message: `Đã phân công giảng viên ${lecturer.full_name} cho đề tài thành công!`,
            data: topic
        });
    } catch (error) {
        console.error('Lỗi phân công giảng viên cho đề tài:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

// 7. Sinh viên đăng ký đề tài từ Kho đề tài (Bổ sung lưu pool_topic_id)
exports.registerPoolTopic = async (req, res) => {
    try {
        const { pool_topic_id } = req.body;
        const leader_code = String(req.body.leader_code || '').trim().toUpperCase();
        const member2_code = String(req.body.member2_code || '').trim().toUpperCase() || null;
        const member3_code = String(req.body.member3_code || '').trim().toUpperCase() || null;
        const requesterCode = String(req.user?.user_code || '').trim().toUpperCase();
        if (String(req.user?.role || '').toUpperCase() !== 'STUDENT' || !requesterCode) {
            return res.status(403).json({ message: 'Chỉ sinh viên mới được đăng ký đề tài!' });
        }
        if (String(leader_code || '').trim().toUpperCase() !== requesterCode) {
            return res.status(403).json({ message: 'Mã Trưởng nhóm phải trùng với tài khoản đang đăng nhập!' });
        }
        const groupCodes = [leader_code, member2_code, member3_code].filter(Boolean);
        if (new Set(groupCodes).size !== groupCodes.length) {
            return res.status(400).json({ message: 'Mã sinh viên trong nhóm không được trùng nhau.' });
        }

        const students = await User.find({
            user_code: { $in: groupCodes },
            role: 'STUDENT'
        }).select('user_code');
        if (students.length !== groupCodes.length) {
            return res.status(400).json({ message: 'Một hoặc nhiều mã sinh viên trong nhóm không hợp lệ.' });
        }

        const groupIdentityFilter = groupCodes.flatMap(code => [
            { leader_code: codeRegex(code) },
            { member2_code: codeRegex(code) },
            { member3_code: codeRegex(code) }
        ]);
        const existingActiveTopic = await Topic.findOne({
            status: { $in: activeTopicStatuses },
            $or: groupIdentityFilter
        }).select('_id leader_code title').lean();
        if (existingActiveTopic) {
            return res.status(409).json({
                message: 'Bạn hoặc một thành viên trong nhóm đã có đề tài đang hoạt động. Mỗi sinh viên chỉ được tham gia một đề tài.'
            });
        }

        const acceptedMembership = await GroupJoinRequest.findOne({
            member_code: { $in: groupCodes.map(code => codeRegex(code)) },
            status: 'ACCEPTED'
        }).select('leader_code member_code').lean();
        if (acceptedMembership) {
            return res.status(409).json({
                message: `Sinh viên ${acceptedMembership.member_code} đã được xác nhận vào nhóm của Trưởng nhóm ${acceptedMembership.leader_code}.`
            });
        }

        const activeSemester = await Semester.findOne({ is_active: true }).lean();
        const now = new Date();
        const registrationStart = activeSemester?.registration_start_date
            ? getRegistrationStartOfDay(activeSemester.registration_start_date)
            : null;
        const registrationEnd = activeSemester?.registration_end_date
            ? new Date(activeSemester.registration_end_date)
            : null;
        if (!registrationStart || !registrationEnd) {
            return res.status(403).json({
                message: 'Hiện chưa có học kỳ mở thời hạn đăng ký đề tài. Vui lòng liên hệ quản trị viên.'
            });
        }
        const registrationEndOfDay = getRegistrationEndOfDay(registrationEnd);
        if (now < registrationStart || now > registrationEndOfDay) {
            return res.status(403).json({
                message: 'Đã hết hoặc chưa đến thời hạn đăng ký đề tài của học kỳ hiện tại.'
            });
        }
        if (!mongoose.Types.ObjectId.isValid(String(pool_topic_id || ''))) {
            return res.status(400).json({ message: 'Đề tài trong kho không hợp lệ. Vui lòng chọn lại!' });
        }

        const poolTopic = await LecturerTopic.findById(pool_topic_id);
        if (!poolTopic) {
            return res.status(404).json({ message: "Không tìm thấy đề tài mẫu trong kho!" });
        }
        if (poolTopic.status === 'REJECTED' || poolTopic.is_active === false) {
            return res.status(404).json({ message: "Đề tài này hiện không khả dụng trong kho!" });
        }
        const poolTopicSlot = await ensurePoolTopicCapacity(res, poolTopic, leader_code);
        if (poolTopicSlot === null) return;

        const duplicateTitle = await findActiveTitleConflict(poolTopic.title);
        if (duplicateTitle) {
            return res.status(409).json({
                message: 'Đề tài này đã được nhóm khác đăng ký. Vui lòng chọn đề tài khác!'
            });
        }
        if (!await ensureLecturerHasCapacity(res, poolTopic.lecturer_code)) return;

        const newTopic = new Topic({
            leader_code,
            member2_code: member2_code || null,
            member3_code: member3_code || null,
            lecturer_code: poolTopic.lecturer_code,
            title: poolTopic.title,
            description: poolTopic.description,
            requirements: poolTopic.requirements || '',
            category: poolTopic.category || 'Web / Ứng dụng',
            max_groups: 1,
            source: 'LECTURER',
            pool_topic_id: poolTopic._id,
            active_pool_topic_id: poolTopic._id,
            active_pool_topic_slot: poolTopicSlot,
            active_title_key: normalizeTopicTitle(poolTopic.title) || undefined,
            status: 'PENDING'
        });

        await newTopic.save();
        return res.status(201).json({
            success: true,
            message: "Đã đăng ký đề tài thành công! Đang chờ Giảng viên phê duyệt.",
            topic: newTopic
        });
    } catch (error) {
        console.error("Lỗi đăng ký đề tài từ Kho:", error);
        if (error.code === 11000 &&
            (error.keyPattern?.active_pool_topic_id || error.keyPattern?.active_pool_topic_slot ||
                error.keyPattern?.active_title_key)) {
            return res.status(409).json({
                message: 'Đề tài vừa được nhóm khác đăng ký hết chỉ tiêu. Vui lòng thử lại hoặc chọn đề tài khác!'
            });
        }
        return res.status(500).json({ message: "Lỗi máy chủ khi chọn đề tài từ Kho!" });
    }
};

// =========================================================================
// PHẦN 2: LOGIC DÀNH CHO GIẢNG VIÊN (QUẢN LÝ & DUYỆT ĐỀ TÀI)
// =========================================================================

// 1. Lấy danh sách đề tài sinh viên nộp + Kho đề tài gợi ý của giảng viên (Bổ sung gán trạng thái Đã đăng ký)
exports.getLecturerTopics = async (req, res) => {
    try {
        const lecturer_code = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'LECTURER' ||
            lecturer_code.toUpperCase() !== String(req.params.lecturer_code || '').trim().toUpperCase()) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể xem đề tài của mình.' });
        }

        const lecturerQuotaStatus = await getLecturerQuotaStatus(lecturer_code);
        if (!lecturerQuotaStatus.found) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin chỉ tiêu của giảng viên.' });
        }
        
        // Lấy đề tài Sinh viên đăng ký
        const topics = await Topic.find({ lecturer_code }).sort({ createdAt: -1 }).lean();
        const studentCodes = [...new Set(topics.flatMap(topic => [
            topic.leader_code || topic.student_code,
            topic.member2_code,
            topic.member3_code
        ]).map(code => String(code || '').trim()).filter(Boolean))];
        const students = studentCodes.length
            ? await User.find({ role: 'STUDENT', user_code: { $in: studentCodes } })
                .select('user_code full_name')
                .lean()
            : [];
        const studentNamesByCode = new Map(students.map(student => [
            String(student.user_code || '').trim().toUpperCase(),
            student.full_name
        ]));
        const topicsWithStudentNames = topics.map(topic => ({
            ...topic,
            leader_name: studentNamesByCode.get(
                String(topic.leader_code || topic.student_code || '').trim().toUpperCase()
            ) || '',
            member2_name: studentNamesByCode.get(String(topic.member2_code || '').trim().toUpperCase()) || '',
            member3_name: studentNamesByCode.get(String(topic.member3_code || '').trim().toUpperCase()) || ''
        }));

        // Lấy đề tài Giảng viên đã tạo trong Kho (lecturer_topics)
        const lecturerPool = await LecturerTopic.find({ lecturer_code }).sort({ createdAt: -1 }).lean();
        const milestones = await Milestone.find({ lecturerCode: lecturer_code, topicId: null })
            .sort({ step: 1 })
            .lean();

        const topicIds = topics.map(t => t._id);
        const submissions = await Submission.find({
            topic_id: { $in: topicIds },
            is_draft: { $ne: true }
        }).lean();

        const progressByTopic = getTopicMilestoneProgress(topics, milestones, submissions);
        const enrichedTopics = topicsWithStudentNames.map(topic => ({
            ...topic,
            ...progressByTopic.get(String(topic._id))
        }));

        const pendingTopics = enrichedTopics.filter(t => t.status === 'PENDING' || t.status === 'NEED_REVISION');
        const approvedTopics = enrichedTopics.filter(t => t.status === 'APPROVED');

        const registeredByPoolTopic = new Map();
        topics.filter(topic => activeTopicStatuses.includes(topic.status)).forEach(topic => {
            const poolTopicId = String(topic.active_pool_topic_id || topic.pool_topic_id || '');
            if (poolTopicId) {
                registeredByPoolTopic.set(poolTopicId, (registeredByPoolTopic.get(poolTopicId) || 0) + 1);
            }
        });

        const enrichedLecturerPool = lecturerPool.map(poolItem => {
            const itemId = poolItem._id.toString();
            const registeredGroups = registeredByPoolTopic.get(itemId) || 0;
            const maxGroups = registeredGroups > 0 || lecturerQuotaStatus.available ? 1 : 0;
            const remainingGroups = Math.max(0, maxGroups - registeredGroups);
            const isRegistered = remainingGroups === 0;

            return {
                ...poolItem,
                status: poolItem.status === 'REJECTED'
                    ? 'REJECTED'
                    : isRegistered ? 'REGISTERED' : 'OPEN',
                is_active: poolItem.status !== 'REJECTED' && poolItem.is_active !== false,
                is_registered: isRegistered,
                max_groups: 1,
                registered_groups: registeredGroups,
                remaining_groups: remainingGroups
            };
        });

        res.json({
            success: true,
            data: {
                pending: pendingTopics,
                approved: approvedTopics,
                myPool: enrichedLecturerPool, // Trả về kho đề tài đã gán trạng thái đối soát
                lecturerMaxQuota: lecturerQuotaStatus.quota,
                all: enrichedTopics
            }
        });
    } catch (error) {
        console.error("Lỗi lấy danh sách đề tài:", error);
        res.status(500).json({ message: 'Lỗi lấy danh sách đề tài!' });
    }
};

exports.getLecturerPendingReviewStatus = async (req, res) => {
    try {
        const lecturerCode = String(req.params.lecturer_code || '').trim();
        const pendingCount = await Topic.countDocuments({
            lecturer_code: lecturerCode,
            status: { $in: ['PENDING', 'NEED_REVISION'] }
        });

        return res.json({ success: true, hasPendingReview: pendingCount > 0 });
    } catch (error) {
        console.error('Lỗi kiểm tra đề tài chờ duyệt:', error);
        return res.status(500).json({ success: false, message: 'Không thể kiểm tra đề tài chờ duyệt.' });
    }
};

// 2. Tạo đề tài trực tiếp vào bảng Topic
exports.createLecturerTopic = async (req, res) => {
    try {
        const { title, category, description, requirements, max_groups } = req.body;
        const lecturer_code = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'LECTURER' || !lecturer_code) {
            return res.status(403).json({ success: false, message: 'Chỉ giảng viên mới có thể tạo đề tài.' });
        }

        const newTopic = new Topic({
            lecturer_code,
            title,
            category: category || 'Web / Ứng dụng',
            description,
            requirements: requirements || '',
            max_groups: max_groups || 1,
            source: 'LECTURER',
            status: 'OPEN'
        });

        await newTopic.save();

        res.status(201).json({
            success: true,
            message: 'Đã thêm đề tài mới vào kho hướng dẫn!',
            topic: newTopic
        });
    } catch (error) {
        console.error("Lỗi khi GV thêm đề tài kho:", error);
        res.status(500).json({ message: 'Lỗi khi tạo đề tài vào kho!' });
    }
};

// 3. Giảng viên thêm đề tài gợi ý vào Collection 'lecturer_topics'
exports.createLecturerPoolTopic = async (req, res) => {
    try {
        const { title, description, requirements, category } = req.body;
        const lecturer_code = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'LECTURER' || !lecturer_code) {
            return res.status(403).json({ success: false, message: 'Chỉ giảng viên mới có thể tạo đề tài.' });
        }
        const lecturerQuotaStatus = await getLecturerQuotaStatus(lecturer_code);
        if (!lecturerQuotaStatus.found) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin chỉ tiêu của giảng viên.' });
        }
        if (lecturerQuotaStatus.quota < 1) {
            return res.status(400).json({
                success: false,
                message: 'Chỉ tiêu tổng của bạn đang bằng 0. Vui lòng liên hệ Admin để tăng chỉ tiêu trước.'
            });
        }

        const newTopic = new LecturerTopic({
            lecturer_code,
            title,
            description,
            requirements: requirements || '',
            category: category || 'Web / Ứng dụng',
            max_groups: 1,
            status: 'APPROVED',
            is_active: true,
            feedback: ''
        });

        await newTopic.save();

        return res.status(201).json({
            success: true,
            message: "Đề tài đã được thêm vào Kho và hiển thị cho sinh viên.",
            data: newTopic
        });
    } catch (error) {
        console.error("Lỗi thêm đề tài vào kho lecturer_topics:", error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateLecturerPoolTopic = async (req, res) => {
    try {
        const { title, description, requirements, category } = req.body;
        const normalizedTitle = String(title || '').trim();

        if (!normalizedTitle) {
            return res.status(400).json({ success: false, message: 'Tên đề tài không được để trống.' });
        }

        const poolTopic = await LecturerTopic.findOne({
            _id: req.params.pool_topic_id,
            lecturer_code: req.user.user_code
        });
        if (!poolTopic) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đề tài trong kho của bạn.' });
        }
        const lecturerQuotaStatus = await getLecturerQuotaStatus(poolTopic.lecturer_code);
        if (!lecturerQuotaStatus.found) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy thông tin chỉ tiêu của giảng viên.' });
        }
        if (lecturerQuotaStatus.quota < 1) {
            return res.status(400).json({
                success: false,
                message: 'Chỉ tiêu tổng của bạn đang bằng 0. Vui lòng liên hệ Admin để tăng chỉ tiêu trước.'
            });
        }

        poolTopic.title = normalizedTitle;
        poolTopic.description = String(description || '').trim();
        poolTopic.requirements = String(requirements || '').trim();
        poolTopic.category = category || 'Web / Ứng dụng';
        poolTopic.max_groups = 1;
        await poolTopic.save();

        return res.json({
            success: true,
            message: 'Đã cập nhật đề tài trong kho.',
            data: poolTopic
        });
    } catch (error) {
        console.error('Lỗi cập nhật đề tài trong kho giảng viên:', error);
        return res.status(500).json({ success: false, message: 'Không thể cập nhật đề tài lúc này.' });
    }
};

// 4. Cập nhật trạng thái duyệt/yêu cầu sửa/từ chối đề tài sinh viên
exports.updateTopicStatus = async (req, res) => {
    try {
        const { topic_id } = req.params;
        const { status, feedback } = req.body; 
        const lecturerCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'LECTURER' || !lecturerCode ||
            !['APPROVED', 'NEED_REVISION', 'REJECTED'].includes(status)) {
            return res.status(403).json({ success: false, message: 'Bạn không có quyền cập nhật trạng thái đề tài này.' });
        }

        const escapedLecturerCode = lecturerCode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const topic = await Topic.findOne({
            _id: topic_id,
            lecturer_code: new RegExp(`^${escapedLecturerCode}$`, 'i')
        });

        if (!topic) {
            return res.status(404).json({ message: 'Không tìm thấy đề tài!' });
        }
        const previousStatus = topic.status;
        if (activeTopicStatuses.includes(status) && !activeTopicStatuses.includes(previousStatus) &&
            String(topic.leader_code || '').trim() &&
            !await ensureLecturerHasCapacity(res, lecturerCode, topic._id)) return;

        topic.status = status;
        topic.feedback = String(feedback || '');
        if (status === 'REJECTED') {
            topic.active_pool_topic_id = undefined;
            topic.active_pool_topic_slot = undefined;
            topic.active_title_key = undefined;
        }
        await topic.save();

        // BỔ SUNG: Khi duyệt đề tài, tự động cập nhật bản ghi tương ứng trong Kho (LecturerTopic)
        if (status === 'APPROVED') {
            if (topic.pool_topic_id) {
                await LecturerTopic.findByIdAndUpdate(topic.pool_topic_id, {
                    status: 'REGISTERED',
                    is_registered: true
                });
            } else {
                await LecturerTopic.findOneAndUpdate(
                    { lecturer_code: topic.lecturer_code, title: topic.title },
                    { status: 'REGISTERED', is_registered: true }
                );
            }
        }
        if (status === 'REJECTED') {
            if (topic.pool_topic_id) {
                await LecturerTopic.findByIdAndUpdate(topic.pool_topic_id, {
                    status: 'APPROVED',
                    is_registered: false
                });
            }
        }

        if (previousStatus !== status) {
            const lecturer = await User.findOne({
                user_code: new RegExp(`^${escapedLecturerCode}$`, 'i'),
                role: 'LECTURER'
            }).select('full_name').lean();
            const statusTitle = {
                APPROVED: 'Đề tài đã được duyệt',
                NEED_REVISION: 'Đề tài cần chỉnh sửa',
                REJECTED: 'Đề tài đã bị từ chối'
            }[status];
            const feedbackText = topic.feedback ? ` Nhận xét giảng viên: ${topic.feedback}` : '';
            await notifyTopicStudents(topic, {
                title: statusTitle,
                content: `Đề tài "${topic.title}" của nhóm đã được cập nhật trạng thái.${feedbackText}`,
                eventKey: `topic-status:${topic._id}:${previousStatus}:${status}:${topic.updatedAt.getTime()}`,
                priority: status === 'REJECTED' ? 'warning' : 'info',
                type: 'LECTURER',
                senderName: lecturer?.full_name || `Giảng viên ${topic.lecturer_code}`
            });
        }

        let messageText = 'Cập nhật trạng thái đề tài thành công!';
        if (status === 'APPROVED') messageText = 'Đã phê duyệt đề tài cho nhóm!';
        if (status === 'NEED_REVISION') messageText = 'Đã gửi yêu cầu chỉnh sửa đến nhóm sinh viên!';
        if (status === 'REJECTED') messageText = 'Đã từ chối đề tài!';

        res.json({ 
            success: true,
            message: messageText, 
            topic 
        });
    } catch (error) {
        console.error("Lỗi cập nhật trạng thái đề tài:", error);
        res.status(500).json({ message: 'Lỗi cập nhật trạng thái đề tài!' });
    }
};

// 5. Lấy Ma trận Tiến độ báo cáo
exports.getLecturerProgressMatrix = async (req, res) => {
    try {
        const lecturerCode = String(req.user?.user_code || '').trim();
        if (String(req.user?.role || '').toUpperCase() !== 'LECTURER' ||
            lecturerCode.toUpperCase() !== String(req.params.lecturerCode || '').trim().toUpperCase()) {
            return res.status(403).json({ success: false, message: 'Bạn chỉ có thể xem tiến độ đề tài của mình.' });
        }

        const topics = await Topic.find({ 
            lecturer_code: lecturerCode,
            status: 'APPROVED' 
        }).lean();

        if (!topics || topics.length === 0) {
            return res.status(200).json({
                success: true,
                data: []
            });
        }

        const topicIds = topics.map(t => t._id);
        const milestoneSteps = (await Milestone.find({ lecturerCode, topicId: null }).select('step').lean())
            .map(item => item.step)
            .sort((a, b) => a - b);

        const submissions = await Submission.find({
            topic_id: { $in: topicIds },
            is_draft: { $ne: true }
        }).lean();

        const matrixData = topics.map(topic => {
            const topicSubmissions = submissions.filter(
                s => s.topic_id && s.topic_id.toString() === topic._id.toString()
            );

            const milestones = {};
            for (const i of milestoneSteps) {
                const sub = topicSubmissions.find(s => 
                    s.milestone == i || 
                    s.milestone_step == i || 
                    s.milestone === `Mốc ${i}`
                );

                const directFile = topic[`milestone${i}_file`];

                if (sub) {
                    milestones[`milestone${i}`] = {
                        submitted: true,
                        file_name: sub.file_name || sub.original_name || 'Bài nộp',
                        file_path: sub.file_path,
                        submitted_at: sub.submitted_at || sub.createdAt
                    };
                } else if (directFile && (directFile.name || directFile.path)) {
                    milestones[`milestone${i}`] = {
                        submitted: true,
                        file_name: directFile.name || 'Bài nộp',
                        file_path: directFile.path,
                        submitted_at: directFile.uploadedAt || directFile.submittedAt || null
                    };
                } else {
                    milestones[`milestone${i}`] = null;
                }
            }

            return {
                _id: topic._id,
                topic_code: topic.topic_code || `DT-${topic._id.toString().slice(-5).toUpperCase()}`,
                title: topic.title,
                student_code: topic.student_code || topic.leader_code || "N/A",
                milestones,
                completed_milestones: Object.values(milestones).filter(Boolean).length,
                total_milestones: milestoneSteps.length
            };
        });

        return res.status(200).json({
            success: true,
            data: matrixData
        });

    } catch (error) {
        console.error("Lỗi getLecturerProgressMatrix:", error);
        return res.status(500).json({ 
            success: false, 
            message: "Lỗi kết nối máy chủ khi lấy ma trận tiến độ: " + error.message 
        });
    }
};

exports.getGroupJoinRequests = async (req, res) => {
    try {
        const leaderCode = String(req.params.leader_code || '').trim().toUpperCase();
        if (req.user?.user_code?.toUpperCase() !== leaderCode) {
            return res.status(403).json({ message: 'Bạn không có quyền xem yêu cầu của nhóm này!' });
        }
        const requests = await GroupJoinRequest.find({ leader_code: leaderCode, status: { $in: ['PENDING', 'ACCEPTED'] } })
            .sort({ createdAt: 1 }).lean();
        const memberCodes = requests.map(request => request.member_code);
        const members = await User.find({
            $or: memberCodes.map(code => ({
                user_code: new RegExp(`^${String(code).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
            }))
        }).select('user_code full_name').lean();
        const memberMap = new Map(members.map(member => [member.user_code.toUpperCase(), member.full_name]));
        const requestsWithNames = requests.map(request => ({
            ...request,
            member_name: memberMap.get(String(request.member_code).toUpperCase()) || 'Chưa có thông tin'
        }));
        return res.json({ success: true, requests: requestsWithNames });
    } catch (error) {
        return res.status(500).json({ message: 'Không thể tải yêu cầu tham gia nhóm!' });
    }
};

exports.updateGroupJoinRequest = async (req, res) => {
    try {
        const leaderCode = String(req.params.leader_code || '').trim().toUpperCase();
        const requestId = req.params.request_id;
        const status = String(req.body.status || '').toUpperCase();
        if (String(req.user?.role || '').toUpperCase() !== 'STUDENT' ||
            req.user?.user_code?.toUpperCase() !== leaderCode || !['ACCEPTED', 'REJECTED'].includes(status)) {
            return res.status(403).json({ message: 'Yêu cầu xác nhận không hợp lệ!' });
        }
        const request = await GroupJoinRequest.findOneAndUpdate(
            { _id: requestId, leader_code: leaderCode, status: 'PENDING' },
            { $set: { status } }, { new: true }
        );
        if (!request) return res.status(404).json({ message: 'Không tìm thấy yêu cầu tham gia nhóm!' });

        if (status === 'ACCEPTED') {
            const activeTopic = await Topic.findOne({
                leader_code: codeRegex(leaderCode),
                status: { $in: activeTopicStatuses }
            }).select('_id').lean();

            const otherAcceptedMembership = await GroupJoinRequest.findOne({
                _id: { $ne: request._id },
                member_code: codeRegex(request.member_code),
                status: 'ACCEPTED'
            });
            const otherTopic = await Topic.findOne({
                ...(activeTopic ? { _id: { $ne: activeTopic._id } } : {}),
                status: { $in: activeTopicStatuses },
                $or: [
                    { leader_code: codeRegex(request.member_code) },
                    { member2_code: codeRegex(request.member_code) },
                    { member3_code: codeRegex(request.member_code) }
                ]
            }).select('_id').lean();

            if (otherAcceptedMembership || otherTopic) {
                await GroupJoinRequest.updateOne(
                    { _id: request._id, status: 'ACCEPTED' },
                    { $set: { status: 'PENDING' } }
                );
                return res.status(409).json({
                    success: false,
                    message: 'Sinh viên này đã thuộc một nhóm khác.'
                });
            }

            if (activeTopic) {
                if (!await addAcceptedMemberToTopic(activeTopic._id, request.member_code)) {
                    const rollback = await GroupJoinRequest.updateOne(
                        { _id: request._id, status: 'ACCEPTED' },
                        { $set: { status: 'PENDING' } }
                    );
                    if (rollback.modifiedCount !== 1) {
                        throw new Error('Không thể hoàn tác yêu cầu tham gia sau khi kiểm tra nhóm thất bại.');
                    }
                    return res.status(409).json({
                        success: false,
                        message: otherAcceptedMembership || otherTopic
                            ? 'Sinh viên này đã thuộc một nhóm khác.'
                            : 'Nhóm đã đủ thành viên hoặc đề tài không còn hoạt động.'
                    });
                }
            }
        }

        await notifyUsers([request.member_code], {
            title: status === 'ACCEPTED' ? 'Yêu cầu tham gia nhóm đã được chấp nhận' : 'Yêu cầu tham gia nhóm đã bị từ chối',
            content: status === 'ACCEPTED'
                ? `Trưởng nhóm ${leaderCode} đã chấp nhận yêu cầu tham gia nhóm của bạn.`
                : `Trưởng nhóm ${leaderCode} đã từ chối yêu cầu tham gia nhóm của bạn.`,
            eventKey: `group-join-response:${request._id}:${status}`,
            priority: status === 'REJECTED' ? 'warning' : 'info'
        });
        return res.json({ success: true, message: status === 'ACCEPTED' ? 'Đã xác nhận thành viên!' : 'Đã từ chối yêu cầu!' });
    } catch (error) {
        console.error('Lỗi xác nhận yêu cầu tham gia nhóm:', error);
        return res.status(500).json({ message: 'Không thể xử lý yêu cầu tham gia nhóm!' });
    }
};