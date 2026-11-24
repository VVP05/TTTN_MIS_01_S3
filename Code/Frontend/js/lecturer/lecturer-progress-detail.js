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

function formatDateTime(value) {
    if (!value) return 'Chưa cập nhật';
    const d = new Date(value);
    if (isNaN(d.getTime())) return 'Chưa cập nhật';
    const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const date = d.toLocaleDateString('vi-VN');
    return `${time} · ${date}`;
}

function shortenFileName(name, maxLength = 26) {
    if (!name || name.length <= maxLength) return name;
    const lastDot = name.lastIndexOf('.');
    const ext = lastDot !== -1 ? name.slice(lastDot) : '';
    const base = lastDot !== -1 ? name.slice(0, lastDot) : name;
    const keepStart = 6;
    const keepEnd = Math.max(4, maxLength - keepStart - 3 - ext.length);
    if (base.length <= keepStart + keepEnd) return name;
    return `${base.slice(0, keepStart)}...${base.slice(-keepEnd)}${ext}`;
}

function formatFileSize(bytes) {
    if (!bytes || isNaN(bytes)) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getNameInitials(name, fallback) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    return words.length
        ? words.slice(-2).map(word => word.charAt(0).toLocaleUpperCase('vi-VN')).join('')
        : fallback;
}

function getFileIcon(fileName) {
    const extension = String(fileName || '').split('.').pop().toLowerCase();
    if (extension === 'pdf') return 'fa-file-pdf';
    if (['doc', 'docx'].includes(extension)) return 'fa-file-word';
    if (['xls', 'xlsx'].includes(extension)) return 'fa-file-excel';
    if (['ppt', 'pptx'].includes(extension)) return 'fa-file-powerpoint';
    if (['zip', 'rar', '7z'].includes(extension)) return 'fa-file-zipper';
    return 'fa-file-lines';
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
        return {
            name: result?.full_name || result?.fullName || code,
            email: result?.email || ''
        };
    } catch (error) {
        console.error(`Lỗi lấy tên sinh viên ${code}:`, error);
        return { name: code, email: '' };
    }
}

async function renderHeader(topic, token) {
    const groupCode = topic.group_code || topic.topic_code || 'Chưa có mã nhóm';
    const status = topic.status === 'APPROVED' ? 'Đang thực hiện' : topic.status || 'Chưa cập nhật';
    const statusElement = document.getElementById('topicStatus');
    statusElement.textContent = status;
    statusElement.className = `status-pill ${topic.status === 'APPROVED' ? 'status-approved' : 'status-neutral'}`;
    document.getElementById('topicTitle').textContent = topic.title || 'Chưa có tên đề tài';
    document.getElementById('topicMeta').innerHTML = `
        <span class="topic-code-chip"><i class="fa-solid fa-users"></i>${escapeHtml(groupCode)}</span>
        <span class="topic-category-chip"><i class="fa-solid fa-layer-group"></i>${escapeHtml(topic.category || 'Chưa cập nhật lĩnh vực')}</span>
        <span class="topic-start-date"><i class="fa-regular fa-calendar"></i> Ngày bắt đầu: ${escapeHtml(formatDate(topic.start_date || topic.updatedAt || topic.createdAt))}</span>
    `;
    const breadcrumbCode = document.getElementById('breadcrumbGroupCode');
    if (breadcrumbCode) breadcrumbCode.textContent = groupCode;
    const members = await Promise.all(getStudentCodes(topic).map(async code => ({
        code,
        ...(await getStudentName(code, token))
    })));
    document.getElementById('memberList').innerHTML = members.map((member, index) => {
        const isLeader = index === 0;
        const initials = getNameInitials(member.name, isLeader ? 'TN' : 'SV');
        return `
            <article class="member-item ${isLeader ? 'is-leader' : ''}">
                <div class="member-avatar-wrap">
                    <span class="member-avatar" aria-hidden="true">${escapeHtml(initials)}</span>
                    ${isLeader ? '<span class="leader-crown-badge" title="Trưởng nhóm"><i class="fa-solid fa-crown"></i></span>' : ''}
                </div>
                <div class="member-details">
                    <div class="member-role-title">
                        <strong>${isLeader ? 'Trưởng nhóm' : 'Thành viên'}</strong>
                    </div>
                    <b class="member-name">${escapeHtml(member.name)}</b>
                    <small class="member-code"><i class="fa-solid fa-id-card"></i> ${escapeHtml(member.code)}</small>
                    ${member.email ? `<small class="member-email" title="${escapeHtml(member.email)}"><i class="fa-regular fa-envelope"></i> ${escapeHtml(member.email)}</small>` : ''}
                </div>
            </article>
        `;
    }).join('') || '<div class="member-empty">Chưa có thành viên trong nhóm.</div>';
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
        tracker.innerHTML = '<p class="milestone-empty">Giảng viên chưa cấu hình mốc tiến độ.</p>';
        return;
    }

    let currentMilestoneAssigned = false;
    tracker.innerHTML = milestones.map(milestone => {
        const number = Number(milestone.step);
        const submission = submissionMap.get(number);
        const status = submission?.review_status || (submission ? 'PENDING_REVIEW' : '');
        const complete = status === 'APPROVED';
        const withdrawn = status === 'WITHDRAWN';
        const superseded = status === 'SUPERSEDED';
        const isRevision = status === 'REVISION_REQUESTED';
        const activeSubmission = submission && !withdrawn && !superseded;
        const overdue = !complete && !activeSubmission && milestone.endDate && new Date(milestone.endDate) < new Date();

        let statusClass = 'not-submitted';
        let statusIcon = '<i class="fa-regular fa-clock"></i>';
        let statusLabel = 'Chưa nộp';

        if (complete) {
            statusClass = 'approved';
            statusIcon = '<i class="fa-solid fa-circle-check"></i>';
            statusLabel = 'Đã duyệt';
        } else if (isRevision) {
            statusClass = 'revision';
            statusIcon = '<i class="fa-solid fa-triangle-exclamation"></i>';
            statusLabel = 'Yêu cầu nộp lại';
        } else if (activeSubmission) {
            statusClass = 'submitted';
            statusIcon = '<i class="fa-solid fa-hourglass-half"></i>';
            statusLabel = 'Đã nộp chờ duyệt';
        } else if (overdue) {
            statusClass = 'overdue';
            statusIcon = '<i class="fa-solid fa-circle-exclamation"></i>';
            statusLabel = 'Trễ hạn';
        }

        const isCurrent = !currentMilestoneAssigned && !complete;
        if (isCurrent) currentMilestoneAssigned = true;

        const subInfo = activeSubmission
            ? `Lần nộp ${Number(submission.attempt) || 1} · ${formatDate(submission.submitted_at || submission.createdAt)}`
            : withdrawn ? 'Bài nộp đã được rút'
            : superseded ? 'Bài nộp đã được thay thế'
            : overdue ? 'Đã quá hạn và chưa có bài nộp'
            : isRevision ? 'Cần cập nhật báo cáo mới'
            : 'Chưa có bài nộp hiện hành';

        return `
            <article class="milestone-box ${statusClass} ${isCurrent ? 'is-current' : ''}">
                <div class="milestone-topline">
                    <span class="milestone-number">Mốc ${number}</span>
                    <span class="milestone-status-chip chip-${statusClass}">
                        ${statusIcon} ${statusLabel}
                    </span>
                </div>
                <h3 class="milestone-title">${escapeHtml(milestone.name || `Mốc ${number}`)}</h3>
                <div class="milestone-deadline-pill">
                    <i class="fa-regular fa-calendar-check"></i>
                    <span>Hạn nộp:</span>
                    <strong>${escapeHtml(formatDate(milestone.endDate))}</strong>
                </div>
                <small class="milestone-subinfo">${escapeHtml(subInfo)}</small>
            </article>
        `;
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
            showAppNotification(error.message || 'Không thể tải tệp báo cáo.', 'error');
        }
    };

    if (!submissions.length) {
        body.innerHTML = `
            <div class="empty-submissions-card">
                <div class="empty-icon"><i class="fa-regular fa-folder-open"></i></div>
                <strong>Nhóm chưa nộp báo cáo nào</strong>
                <span>Báo cáo của nhóm sẽ hiển thị tại đây sau khi sinh viên nộp.</span>
            </div>
        `;
        return;
    }

    const auth = getLecturerAuth();
    const lecturerName = auth?.user?.full_name || 'Giảng viên hướng dẫn';

    body.innerHTML = submissions.map(submission => {
        const fileName = submission.original_name || submission.file_name || 'Bài nộp';
        const fileUrl = getFileUrl(submission.file_path, submission.file_name);
        const milestoneNumber = Number(submission.milestone || submission.milestone_step);
        const milestoneTitle = milestoneNames[milestoneNumber] || `Mốc ${milestoneNumber}`;
        const status = submission.review_status || 'PENDING_REVIEW';
        const attempt = Number(submission.attempt) || 1;
        const fileSizeText = formatFileSize(submission.file_size);

        let pillHtml = '<span class="status-pill pill-orange"><i class="fa-regular fa-hourglass-half"></i> Chờ nhận xét</span>';
        if (status === 'APPROVED') {
            pillHtml = '<span class="status-pill pill-green"><i class="fa-solid fa-circle-check"></i> Đã duyệt</span>';
        } else if (status === 'REVISION_REQUESTED') {
            pillHtml = '<span class="status-pill pill-red"><i class="fa-solid fa-triangle-exclamation"></i> Yêu cầu nộp lại</span>';
        } else if (status === 'WITHDRAWN') {
            pillHtml = '<span class="status-pill pill-gray"><i class="fa-solid fa-rotate-left"></i> Đã rút bài</span>';
        } else if (status === 'SUPERSEDED') {
            pillHtml = '<span class="status-pill pill-gray"><i class="fa-solid fa-clock-rotate-left"></i> Đã thay thế</span>';
        }

        const isReviewed = Boolean(submission.feedback) || status === 'APPROVED' || status === 'REVISION_REQUESTED';

        const bubbleHtml = isReviewed ? `
            <div class="submission-feedback-bubble-wrap" id="feedbackBubble_${submission._id}">
                <div class="feedback-bubble-avatar">
                    <i class="fa-solid fa-user-tie"></i>
                </div>
                <div class="feedback-bubble-content">
                    <div class="feedback-bubble-header">
                        <div class="feedback-bubble-author">
                            <strong>${escapeHtml(lecturerName)}</strong>
                            <span class="feedback-time"><i class="fa-regular fa-clock"></i> ${formatDateTime(submission.reviewed_at || submission.updatedAt)}</span>
                        </div>
                        <button type="button" class="btn-edit-feedback" data-submission-id="${escapeHtml(submission._id)}">
                            <i class="fa-solid fa-pen"></i> Sửa nhận xét
                        </button>
                    </div>
                    <div class="feedback-bubble-text">${escapeHtml(submission.feedback || 'Không có nhận xét bổ sung.')}</div>
                </div>
            </div>
        ` : '';

        const reviewBoxHtml = `
            <div class="submission-review-box" id="reviewBox_${submission._id}" style="${isReviewed ? 'display: none;' : ''}">
                <div class="feedback-textarea-wrap">
                    <label for="feedbackText_${submission._id}" class="feedback-input-label">
                        <i class="fa-solid fa-comment-dots"></i> Nhận xét của giảng viên:
                    </label>
                    <textarea id="feedbackText_${submission._id}" class="submission-review-feedback" maxlength="2000" placeholder="Nhập nhận xét chi tiết cho nhóm; bắt buộc nếu yêu cầu nộp lại...">${escapeHtml(submission.feedback || '')}</textarea>
                    <div class="feedback-textarea-footer">
                        <span class="feedback-helper"><i class="fa-solid fa-circle-info"></i> Bắt buộc nếu yêu cầu nộp lại</span>
                        <span class="char-counter" id="charCounter_${submission._id}">${(submission.feedback || '').length}/2000</span>
                    </div>
                    <div class="feedback-inline-error" id="feedbackError_${submission._id}" style="display: none;">
                        <i class="fa-solid fa-circle-exclamation"></i> Vui lòng nhập nhận xét trước khi yêu cầu sinh viên nộp lại.
                    </div>
                </div>
                <div class="review-buttons-row">
                    ${isReviewed ? `<button type="button" class="btn-cancel-edit-feedback" data-submission-id="${escapeHtml(submission._id)}">Hủy</button>` : ''}
                    <button type="button" class="review-submission-button request-revision" data-review-status="REVISION_REQUESTED" data-submission-id="${escapeHtml(submission._id)}">
                        <i class="fa-solid fa-rotate-left"></i> Yêu cầu nộp lại
                    </button>
                    <button type="button" class="review-submission-button approve" data-review-status="APPROVED" data-submission-id="${escapeHtml(submission._id)}">
                        <i class="fa-solid fa-check"></i> Duyệt
                    </button>
                </div>
            </div>
        `;

        return `
            <article class="submission-card" id="submissionCard_${submission._id}">
                <header class="submission-card-header">
                    <div class="submission-card-title-group">
                        <h3 class="submission-card-title">Lần nộp ${attempt} · Mốc ${milestoneNumber}: ${escapeHtml(milestoneTitle)}</h3>
                        <span class="submission-card-date"><i class="fa-regular fa-clock"></i> ${formatDateTime(submission.submitted_at || submission.createdAt)}</span>
                    </div>
                    <div class="submission-card-status">
                        ${pillHtml}
                    </div>
                </header>

                <div class="submission-card-body">
                    <div class="submission-file-chip-wrap">
                        <div class="submission-file-chip" title="${escapeHtml(fileName)}">
                            <span class="file-chip-icon"><i class="fa-solid ${getFileIcon(fileName)}"></i></span>
                            <span class="file-chip-name">${escapeHtml(shortenFileName(fileName))}</span>
                            ${fileSizeText ? `<span class="file-chip-size">${fileSizeText}</span>` : ''}
                            <a class="protected-submission-file btn-download-file" href="${fileUrl}" data-file-name="${escapeHtml(fileName)}" title="Tải xuống tệp báo cáo" aria-label="Tải xuống tệp báo cáo">
                                <i class="fa-solid fa-download"></i>
                            </a>
                        </div>
                    </div>

                    ${bubbleHtml}
                    ${reviewBoxHtml}
                </div>
            </article>
        `;
    }).join('');

    // Sự kiện đếm ký tự và xóa lỗi inline cho textarea
    body.querySelectorAll('.submission-review-feedback').forEach(textarea => {
        const submissionCard = textarea.closest('.submission-card');
        const counter = submissionCard?.querySelector('.char-counter');
        const inlineError = submissionCard?.querySelector('.feedback-inline-error');
        textarea.addEventListener('input', () => {
            if (counter) counter.textContent = `${textarea.value.length}/2000`;
            if (inlineError && textarea.value.trim()) {
                inlineError.style.display = 'none';
                textarea.classList.remove('has-error');
            }
        });
    });

    // Sự kiện nút "Sửa nhận xét"
    body.querySelectorAll('.btn-edit-feedback').forEach(button => {
        button.addEventListener('click', () => {
            const id = button.dataset.submissionId;
            const bubble = document.getElementById(`feedbackBubble_${id}`);
            const reviewBox = document.getElementById(`reviewBox_${id}`);
            if (bubble) bubble.style.display = 'none';
            if (reviewBox) {
                reviewBox.style.display = 'block';
                const textarea = reviewBox.querySelector('.submission-review-feedback');
                if (textarea) textarea.focus();
            }
        });
    });

    // Sự kiện nút "Hủy sửa"
    body.querySelectorAll('.btn-cancel-edit-feedback').forEach(button => {
        button.addEventListener('click', () => {
            const id = button.dataset.submissionId;
            const bubble = document.getElementById(`feedbackBubble_${id}`);
            const reviewBox = document.getElementById(`reviewBox_${id}`);
            const inlineError = document.getElementById(`feedbackError_${id}`);
            if (inlineError) inlineError.style.display = 'none';
            if (reviewBox) reviewBox.style.display = 'none';
            if (bubble) bubble.style.display = 'flex';
        });
    });

    // Sự kiện duyệt và yêu cầu nộp lại
    body.querySelectorAll('.review-submission-button').forEach(button => {
        button.addEventListener('click', async () => {
            const card = button.closest('.submission-card');
            const textarea = card?.querySelector('.submission-review-feedback');
            const inlineError = card?.querySelector('.feedback-inline-error');
            const feedback = textarea?.value.trim() || '';
            const status = button.dataset.reviewStatus;
            const submissionId = button.dataset.submissionId;

            // Bấm "Yêu cầu nộp lại" mà chưa nhập nhận xét thì báo lỗi inline, không dùng alert
            if (status === 'REVISION_REQUESTED' && !feedback) {
                if (inlineError) inlineError.style.display = 'flex';
                if (textarea) {
                    textarea.classList.add('has-error');
                    textarea.focus();
                }
                return;
            }

            // Có xác nhận nhẹ trước khi duyệt
            if (status === 'APPROVED') {
                let confirmed = true;
                if (typeof window.showConfirmDialog === 'function') {
                    confirmed = await window.showConfirmDialog({
                        title: 'Xác nhận duyệt báo cáo',
                        message: 'Bạn có chắc chắn muốn duyệt bài nộp này cho nhóm sinh viên?',
                        confirmText: 'Duyệt bài',
                        cancelText: 'Hủy bỏ',
                        danger: false
                    });
                }
                if (!confirmed) return;
            }

            const auth = getLecturerAuth();
            const originalHtml = button.innerHTML;
            button.disabled = true;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';

            // Tạm khóa các nút cùng hàng
            const rowButtons = card?.querySelectorAll('.review-submission-button');
            rowButtons?.forEach(btn => btn.disabled = true);

            try {
                const response = await apiFetch(
                    `${API_BASE}/api/submissions/topic/${encodeURIComponent(currentTopicId)}/${encodeURIComponent(submissionId)}/review`,
                    {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Bearer ${auth.token}`
                        },
                        body: JSON.stringify({ status, feedback })
                    }
                );
                const result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.message || 'Không thể lưu nhận xét.');
                showAppNotification(result.message || 'Cập nhật nhận xét thành công.', 'success');
                await loadProgressDetail();
            } catch (error) {
                showAppNotification(error.message || 'Không thể lưu nhận xét.', 'error');
                button.disabled = false;
                button.innerHTML = originalHtml;
                rowButtons?.forEach(btn => btn.disabled = false);
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
    if (user) {
        const name = document.getElementById('userName');
        const code = document.getElementById('userCode');
        if (name) name.textContent = user.full_name || 'Giảng viên';
        if (code) code.textContent = user.user_code || 'GV';
    }

    if (!user || user.role !== 'LECTURER' || !topicId) {
        document.getElementById('topicTitle').textContent = 'Không thể tải thông tin đề tài';
        document.getElementById('topicMeta').textContent = 'Vui lòng đăng nhập lại hoặc mở lại đề tài từ danh sách của giảng viên.';
        if (body) {
            body.innerHTML = `
                <div class="empty-submissions-card error">
                    <div class="empty-icon text-red"><i class="fa-solid fa-circle-exclamation"></i></div>
                    <strong>Không xác định được đề tài hoặc phiên đăng nhập giảng viên</strong>
                    <span>Vui lòng đăng nhập lại hoặc chọn lại nhóm từ danh sách.</span>
                </div>
            `;
        }
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
        if (body) {
            body.innerHTML = `
                <div class="empty-submissions-card error">
                    <div class="empty-icon text-red"><i class="fa-solid fa-triangle-exclamation"></i></div>
                    <strong>Không thể tải dữ liệu tiến độ từ máy chủ</strong>
                    <span>Vui lòng kiểm tra kết nối mạng và thử lại sau.</span>
                </div>
            `;
        }
    }
}

document.addEventListener('DOMContentLoaded', loadProgressDetail);

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
    if (user) {
        const name = document.getElementById('userName');
        const code = document.getElementById('userCode');
        if (name) name.textContent = user.full_name || 'Giảng viên';
        if (code) code.textContent = user.user_code || 'GV';
    }

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
