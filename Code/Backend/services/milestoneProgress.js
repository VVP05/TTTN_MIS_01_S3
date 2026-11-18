function getSubmissionStep(submission) {
    const rawStep = submission.milestone ?? submission.milestone_step;
    const match = String(rawStep ?? '').match(/\d+/);
    return match ? Number(match[0]) : null;
}

function getSubmissionDate(submission) {
    for (const value of [submission.submitted_at, submission.createdAt]) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
}

function getDirectFileDate(file) {
    for (const value of [file.submittedAt, file.uploadedAt]) {
        const date = new Date(value);
        if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
}

function getTopicMilestoneProgress(topics, milestones, submissions, now = new Date()) {
    const submissionsByTopic = new Map();
    for (const submission of submissions) {
        if (submission.is_draft === true) continue;
        const topicId = String(submission.topic_id);
        const step = getSubmissionStep(submission);
        const submittedAt = getSubmissionDate(submission);
        if (!step || !submittedAt) continue;

        if (!submissionsByTopic.has(topicId)) submissionsByTopic.set(topicId, new Map());
        const byStep = submissionsByTopic.get(topicId);
        const existing = byStep.get(step);
        if (!existing || submittedAt > existing.submittedAt) {
            byStep.set(step, {
                submittedAt,
                reviewStatus: submission.review_status || 'PENDING_REVIEW'
            });
        }
    }

    return new Map(topics.map(topic => {
        const topicId = String(topic._id);
        const lecturerCode = String(topic.lecturer_code || '').toUpperCase();
        const topicMilestones = milestones
            .filter(milestone => String(milestone.lecturerCode || '').toUpperCase() === lecturerCode)
            .sort((left, right) => Number(left.step) - Number(right.step));
        const submittedByStep = submissionsByTopic.get(topicId) || new Map();
        let completed = 0;
        let late = 0;
        let inProgress = 0;
        let submissionTimeUnknown = 0;

        const milestoneStates = topicMilestones.map(milestone => {
            const step = Number(milestone.step);
            const latestSubmission = submittedByStep.get(step);
            const hasSubmissionRecord = Boolean(latestSubmission);
            const submission = latestSubmission &&
                !['WITHDRAWN', 'SUPERSEDED'].includes(latestSubmission.reviewStatus)
                ? latestSubmission
                : null;
            const directFile = topic[`milestone${step}_file`];
            const hasDirectSubmission = !hasSubmissionRecord && directFile &&
                directFile.isDraft !== true &&
                (directFile.name || directFile.path || directFile.filename);
            const directFileSubmittedAt = hasDirectSubmission ? getDirectFileDate(directFile) : null;
            const submittedAt = submission?.submittedAt || directFileSubmittedAt;
            const endDate = new Date(milestone.endDate);
            const startDate = new Date(milestone.startDate);

            if (submittedAt) {
                completed++;
                if (!Number.isNaN(endDate.getTime()) && submittedAt > endDate) {
                    late++;
                    return { step, status: 'late', submittedAt };
                }
                return { step, status: 'completed', submittedAt };
            }
            if (hasDirectSubmission) {
                completed++;
                submissionTimeUnknown++;
                return { step, status: 'submitted_unknown', submittedAt: null };
            }

            if (!Number.isNaN(endDate.getTime()) && now > endDate) {
                late++;
                return { step, status: 'late', submittedAt: null };
            }
            if (!Number.isNaN(startDate.getTime()) && now >= startDate) {
                inProgress++;
                return { step, status: 'in_progress', submittedAt: null };
            }
            return { step, status: 'upcoming', submittedAt: null };
        });

        const total = topicMilestones.length;
        const progress = total ? Math.round(completed / total * 100) : 0;
        let progressStatus = 'Chưa cấu hình mốc';
        if (total && late > 0) progressStatus = 'Chậm tiến độ';
        else if (total && completed === total) progressStatus = 'Hoàn thành';
        else if (total && submissionTimeUnknown > 0) progressStatus = 'Cần kiểm tra thời gian nộp';
        else if (total && inProgress > 0) progressStatus = 'Đang thực hiện';
        else if (total) progressStatus = 'Đúng tiến độ';

        return [topicId, {
            progress_percentage: progress,
            milestone_progress: progress,
            completed_milestones: completed,
            total_milestones: total,
            late_milestones: late,
            progress_status: progressStatus,
            status_text: progressStatus,
            is_late: total > 0 && late > 0,
            milestones: milestoneStates
        }];
    }));
}

function getMilestoneProgressSeries(topics, milestoneProgress, steps) {
    const sortedSteps = [...steps].sort((left, right) => Number(left) - Number(right));
    const series = sortedSteps.map(step => ({
        step: Number(step),
        completed: 0,
        unknown: 0,
        onTime: 0,
        inProgress: 0,
        late: 0
    }));

    for (const topic of topics) {
        const progress = milestoneProgress.get(String(topic._id));
        if (!progress) continue;
        for (const milestone of progress.milestones) {
            const bucket = series.find(item => item.step === milestone.step);
            if (!bucket) continue;
            if (milestone.status === 'completed') bucket.completed++;
            else if (milestone.status === 'submitted_unknown') bucket.unknown++;
            else if (milestone.status === 'late') bucket.late++;
            else if (milestone.status === 'in_progress') bucket.inProgress++;
            else bucket.onTime++;
        }
    }

    return {
        labels: series.map(item => `Mốc ${item.step}`),
        series: [
            { name: 'Hoàn thành đúng hạn', data: series.map(item => item.completed) },
            { name: 'Thiếu thời gian nộp', data: series.map(item => item.unknown || 0) },
            { name: 'Sắp tới', data: series.map(item => item.onTime) },
            { name: 'Đang thực hiện', data: series.map(item => item.inProgress) },
            { name: 'Trễ hạn', data: series.map(item => item.late) }
        ]
    };
}

module.exports = { getTopicMilestoneProgress, getMilestoneProgressSeries };
