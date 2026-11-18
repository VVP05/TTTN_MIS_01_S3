const API_BASE = window.APP_CONFIG.API_BASE_URL + '';
let milestoneNames = {};
let currentTopicId = null;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[char]));
}

function formatDate(value) {
    if (!value) return 'Chưa cập nhật';
    return new Date(value).toLocaleDateString('vi-VN');
}

function getFileIcon(fileName) {
    const extension = String(fileName || '').split('.').pop().toLowerCase();
    if (extension === 'pdf') return 'fa-file-pdf';
    if (['doc', 'docx'].includes(extension)) return 'fa-file-word';
    if (['xls', 'xlsx'].includes(extension)) return 'fa-file-excel';
    if (['ppt', 'pptx'].includes(extension)) return 'fa-file-powerpoint';
    return 'fa-file';
}

function getStudentCodes(topic) {
    return [topic.leader_code, topic.member2_code, topic.member3_code].filter(Boolean);
}

function getFileUrl(filePath, fileName) {
    const storedPath = String(filePath || '').replace(/\\/g, '/');
    const file = storedPath.split('/').pop() || fileName;
    return file ? `${API_BASE}/api/submissions/file/${encodeURIComponent(file)}` : '#';
}

async function getStudentName(code, token) {
    try {
        const response = await apiFetch(`${API_BASE}/api/auth/users/${encodeURIComponent(code)}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const result = await response.json();
        return result?.full_name || result?.fullName || code;
    } catch (error) {
        console.error(`Lỗi lấy tên sinh viên ${code}:`, error);
        return code;
    }
}

async function renderHeader(topic, token) {
    document.getElementById('topicStatus').textContent = topic.status === 'APPROVED' ? 'Đang thực hiện' : topic.status || 'Chưa cập nhật';
    document.getElementById('topicTitle').textContent = `[${topic.topic_code || 'Chưa có mã'}] ${topic.title || 'Chưa có tên đề tài'}`;
    document.getElementById('topicMeta').textContent = `Lĩnh vực: ${topic.category || 'Chưa cập nhật'} | Ngày bắt đầu: ${formatDate(topic.updatedAt || topic.createdAt)}`;
    const members = await Promise.all(getStudentCodes(topic).map(async code => ({
        code,
        name: await getStudentName(code, token)
    })));
    document.getElementById('memberList').innerHTML = members.map((member, index) =>
        `<div class="member-item"><span class="member-avatar">${index === 0 ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-solid fa-user"></i>'}</span><span><strong>${index === 0 ? 'Trưởng nhóm' : 'Thành viên'}</strong><b>${escapeHtml(member.name)}</b><small>${escapeHtml(member.code)}</small></span></div>`
    ).join('') || '<div class="member-item">Chưa có thành viên</div>';
}

function renderMilestones(submissions, milestones) {
    const submissionMap = new Map();
    [...submissions]
        .sort((left, right) =>
            (Number(right.attempt) || 0) - (Number(left.attempt) || 0) ||
            new Date(right.submitted_at || right.createdAt) - new Date(left.submitted_at || left.createdAt)
        )
        .forEach(submission => {
        const number = Number(submission.milestone || submission.milestone_step);
        if (!submissionMap.has(number)) submissionMap.set(number, submission);
    });

    const tracker = document.getElementById('milestoneTracker');
    if (!milestones.length) {
        tracker.innerHTML = '<p style="grid-column: 1 / -1; color: #64748b;">Giảng viên chưa cấu hình mốc tiến độ.</p>';
        return;
    }

    tracker.innerHTML = milestones.map(milestone => {
        const number = Number(milestone.step);
        const submission = submissionMap.get(number);
        const status = submission?.review_status || (submission ? 'PENDING_REVIEW' : '');
        const complete = status === 'APPROVED';
        const withdrawn = status === 'WITHDRAWN';
        const superseded = status === 'SUPERSEDED';
        const activeSubmission = submission && !withdrawn && !superseded;
        const color = complete ? '#16a34a' : status === 'REVISION_REQUESTED' ? '#f97316' : activeSubmission ? '#2563eb' : '#cbd5e1';
        const label = complete ? 'ĐÃ DUYỆT'
            : status === 'REVISION_REQUESTED' ? 'CẦN NỘP LẠI'
                : withdrawn ? 'ĐÃ RÚT BÀI'
                    : superseded ? 'ĐÃ THAY THẾ'
                        : activeSubmission ? 'CHỜ NHẬN XÉT' : 'CHƯA NỘP';
        return `<div class="milestone-box" style="border-color: ${color};">
            <span style="font-size: 12px; color: ${color}; font-weight: 700;">MỐC ${number} (${label})</span>
            <h4 style="margin-top: 4px;">${escapeHtml(milestone.name)}</h4>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${activeSubmission ? 100 : 0}%; background: ${color};"></div></div>
            <small>${activeSubmission ? `Lần nộp ${Number(submission.attempt) || 1} · ${formatDate(submission.submitted_at || submission.createdAt)}` : withdrawn ? 'Sinh viên đã rút bài' : 'Chưa có bài nộp hiện hành'}</small>
        </div>`;
    }).join('');
}

function renderSubmissions(submissions) {
    const body = document.getElementById('submissionTableBody');
    body.onclick = async event => {
        const link = event.target.closest('.protected-submission-file');
        if (!link) return;
        event.preventDefault();
        const auth = getLecturerAuth();
        try {
            const response = await apiFetch(link.href, {
                headers: { Authorization: `Bearer ${auth?.token || ''}` }
            });
            if (!response.ok) throw new Error('Không thể tải tệp báo cáo.');
            const fileUrl = URL.createObjectURL(await response.blob());
            const downloadLink = document.createElement('a');
            downloadLink.href = fileUrl;
            downloadLink.download = link.dataset.fileName || 'bao-cao';
            downloadLink.click();
            window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
        } catch (error) {
            showAppNotification(error.message || 'Không thể tải tệp báo cáo.');
        }
    };
    if (!submissions.length) {
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:24px 0;">Nhóm chưa nộp báo cáo nào.</td></tr>';
        return;
    }

    body.innerHTML = submissions.map(submission => {
        const fileName = submission.original_name || submission.file_name || 'Bài nộp';
        const fileUrl = getFileUrl(submission.file_path, submission.file_name);
        const milestoneNumber = Number(submission.milestone || submission.milestone_step);
        const status = submission.review_status || 'PENDING_REVIEW';
        const statusLabels = {
            PENDING_REVIEW: 'Chờ nhận xét',
            APPROVED: 'Đã duyệt',
            REVISION_REQUESTED: 'Yêu cầu nộp lại',
            WITHDRAWN: 'Đã rút bài',
            SUPERSEDED: 'Đã được thay thế'
        };
        const statusClass = {
            PENDING_REVIEW: 'pending-review',
            APPROVED: 'approved',
            REVISION_REQUESTED: 'revision-requested',
            WITHDRAWN: 'withdrawn',
            SUPERSEDED: 'superseded'
        };
        const reviewActions = status === 'PENDING_REVIEW'
            ? `<div class="submission-review-actions">
                <textarea class="submission-review-feedback" maxlength="2000" placeholder="Nhận xét cho nhóm; bắt buộc nếu yêu cầu nộp lại"></textarea>
                <div>
                    <button type="button" class="review-submission-button approve" data-review-status="APPROVED" data-submission-id="${escapeHtml(submission._id)}">Duyệt</button>
                    <button type="button" class="review-submission-button request-revision" data-review-status="REVISION_REQUESTED" data-submission-id="${escapeHtml(submission._id)}">Yêu cầu nộp lại</button>
                </div>
            </div>`
            : '<span style="color:#94a3b8;">Đã xử lý</span>';
        return `<tr>
            <td><strong>Lần nộp ${Number(submission.attempt) || 1}</strong><br><small>${formatDate(submission.submitted_at || submission.createdAt)}</small></td>
            <td><strong>Mốc ${submission.milestone || submission.milestone_step || '?'}</strong><br>${escapeHtml(milestoneNames[milestoneNumber] || 'Chưa cấu hình mốc này')}</td>
            <td><a class="protected-submission-file" href="${fileUrl}" data-file-name="${escapeHtml(fileName)}" style="color:#2563eb;"><i class="fa-solid ${getFileIcon(fileName)}"></i> ${escapeHtml(fileName)}</a></td>
            <td><span class="submission-review-status ${statusClass[status] || statusClass.PENDING_REVIEW}">${statusLabels[status] || statusLabels.PENDING_REVIEW}</span></td>
            <td>${submission.feedback ? escapeHtml(submission.feedback) : '<span style="color:#94a3b8;">Chưa có nhận xét</span>'}</td>
            <td>${reviewActions}</td>
        </tr>`;
    }).join('');

    body.querySelectorAll('.review-submission-button').forEach(button => {
        button.addEventListener('click', async () => {
            const feedback = button.closest('tr').querySelector('.submission-review-feedback')?.value.trim() || '';
            if (button.dataset.reviewStatus === 'REVISION_REQUESTED' && !feedback) {
                showAppNotification('Vui lòng nhập nhận xét trước khi yêu cầu sinh viên nộp lại.');
                return;
            }

            const auth = getLecturerAuth();
            button.disabled = true;
            try {
                const response = await apiFetch(
                    `${API_BASE}/api/submissions/topic/${encodeURIComponent(currentTopicId)}/${encodeURIComponent(button.dataset.submissionId)}/review`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${auth.token}`
                        },
                        body: JSON.stringify({ status: button.dataset.reviewStatus, feedback })
                    }
                );
                const result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.message || 'Không thể lưu nhận xét.');
                showAppNotification(result.message);
                await loadProgressDetail();
            } catch (error) {
                showAppNotification(error.message || 'Không thể lưu nhận xét.');
                button.disabled = false;
            }
        });
    });
}

function getLecturerAuth() {
    try {
        const active = JSON.parse(sessionStorage.getItem('activeAuth') || 'null');
        if (active?.user?.role === 'LECTURER') return active;
        const stored = JSON.parse(localStorage.getItem('lecturerAuth') || 'null');
        return stored?.user?.role === 'LECTURER' ? stored : null;
    } catch (error) {
        console.error('Không thể đọc thông tin phiên giảng viên:', error);
        return null;
    }
}

async function loadProgressDetail() {
    const auth = getLecturerAuth();
    const user = auth?.user;
    const topicId = new URLSearchParams(window.location.search).get('topicId');
    currentTopicId = topicId;
    const body = document.getElementById('submissionTableBody');

    if (!user || user.role !== 'LECTURER' || !topicId) {
        document.getElementById('topicTitle').textContent = 'Không thể tải thông tin đề tài';
        document.getElementById('topicMeta').textContent = 'Vui lòng đăng nhập lại hoặc mở lại đề tài từ danh sách của giảng viên.';
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444; padding:24px 0;">Không xác định được đề tài hoặc phiên giảng viên.</td></tr>';
        return;
    }

    try {
        const [topicsResponse, submissionsResponse, milestonesResponse] = await Promise.all([
            apiFetch(`${API_BASE}/api/topics/lecturer/${encodeURIComponent(user.user_code)}`, {
                headers: { Authorization: `Bearer ${auth.token}` }
            }),
            apiFetch(`${API_BASE}/api/submissions/topic/${encodeURIComponent(topicId)}`, { headers: { Authorization: `Bearer ${auth.token}` } }),
            apiFetch(`${API_BASE}/api/milestones/lecturer`, { headers: { Authorization: `Bearer ${auth.token}` } })
        ]);
        const topicsResult = await topicsResponse.json();
        const submissionsResult = await submissionsResponse.json();
        const milestonesResult = milestonesResponse.ok ? await milestonesResponse.json() : { data: [] };
        milestoneNames = Object.fromEntries((milestonesResult.data || []).map(item => [Number(item.step), item.name]));
        const topics = topicsResult?.data?.approved || [];
        const topic = topics.find(item => String(item._id) === String(topicId));

        if (!topic || !submissionsResponse.ok || !submissionsResult.success) throw new Error('Không tìm thấy dữ liệu đề tài');
        const submissions = submissionsResult.data || [];
        const milestones = milestonesResult.data || [];
        const countLabel = document.getElementById('progressMilestoneCount');
        if (countLabel) countLabel.textContent = `${milestones.length} mốc báo cáo`;
        await renderHeader(topic, auth.token);
        milestoneNames = Object.fromEntries(milestones.map(item => [Number(item.step), item.name]));
        renderMilestones(submissions, milestones);
        renderSubmissions(submissions);
    } catch (error) {
        console.error('Lỗi tải chi tiết tiến độ:', error);
        document.getElementById('topicTitle').textContent = 'Không thể tải dữ liệu đề tài';
        document.getElementById('topicMeta').textContent = 'Vui lòng kiểm tra kết nối máy chủ và thử lại.';
        body.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#ef4444; padding:24px 0;">Không thể tải dữ liệu tiến độ từ máy chủ.</td></tr>';
    }
}

document.addEventListener('DOMContentLoaded', loadProgressDetail);
