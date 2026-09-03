const API_BASE = 'http://localhost:5000';
const milestoneNames = {
    1: 'Đề cương & Báo cáo thiết kế kiến trúc',
    2: 'Lập trình chức năng & API',
    3: 'Kiểm thử & hoàn thiện hệ thống',
    4: 'Báo cáo tiến độ tổng hợp',
    5: 'Báo cáo tổng kết & bảo vệ'
};

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
    return file ? `${API_BASE}/uploads/${encodeURIComponent(file)}` : '#';
}

async function getStudentName(code) {
    try {
        const response = await fetch(`${API_BASE}/api/auth/users/${encodeURIComponent(code)}`);
        const result = await response.json();
        return result?.full_name || result?.fullName || code;
    } catch (error) {
        console.error(`Lỗi lấy tên sinh viên ${code}:`, error);
        return code;
    }
}

async function renderHeader(topic) {
    document.getElementById('topicStatus').textContent = topic.status === 'APPROVED' ? 'Đang thực hiện' : topic.status || 'Chưa cập nhật';
    document.getElementById('topicTitle').textContent = `[${topic.topic_code || 'Chưa có mã'}] ${topic.title || 'Chưa có tên đề tài'}`;
    document.getElementById('topicMeta').textContent = `Lĩnh vực: ${topic.category || 'Chưa cập nhật'} | Ngày bắt đầu: ${formatDate(topic.updatedAt || topic.createdAt)}`;
    const members = await Promise.all(getStudentCodes(topic).map(async code => ({
        code,
        name: await getStudentName(code)
    })));
    document.getElementById('memberList').innerHTML = members.map((member, index) =>
        `<div class="member-item"><span class="member-avatar">${index === 0 ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-solid fa-user"></i>'}</span><span><strong>${index === 0 ? 'Trưởng nhóm' : 'Thành viên'}</strong><b>${escapeHtml(member.name)}</b><small>${escapeHtml(member.code)}</small></span></div>`
    ).join('') || '<div class="member-item">Chưa có thành viên</div>';
}

function renderMilestones(submissions) {
    const submissionMap = new Map();
    submissions.forEach(submission => {
        const number = Number(submission.milestone || submission.milestone_step);
        if (!submissionMap.has(number)) submissionMap.set(number, submission);
    });

    document.getElementById('milestoneTracker').innerHTML = [1, 2, 3, 4, 5].map(number => {
        const submission = submissionMap.get(number);
        const complete = Boolean(submission);
        const color = complete ? '#16a34a' : '#cbd5e1';
        const label = complete ? 'HOÀN THÀNH' : 'CHƯA NỘP';
        return `<div class="milestone-box" style="border-color: ${color};">
            <span style="font-size: 12px; color: ${complete ? '#16a34a' : '#64748b'}; font-weight: 700;">MỐC ${number} (${label})</span>
            <h4 style="margin-top: 4px;">${milestoneNames[number]}</h4>
            <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${complete ? 100 : 0}%; background: ${color};"></div></div>
            <small>${complete ? `Đã nộp ngày ${formatDate(submission.submitted_at || submission.createdAt)}` : 'Chưa có bài nộp'}</small>
        </div>`;
    }).join('');
}

function renderSubmissions(submissions) {
    const body = document.getElementById('submissionTableBody');
    if (!submissions.length) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:24px 0;">Nhóm chưa nộp báo cáo nào.</td></tr>';
        return;
    }

    body.innerHTML = submissions.map(submission => {
        const fileName = submission.original_name || submission.file_name || 'Bài nộp';
        const fileUrl = getFileUrl(submission.file_path, submission.file_name);
        return `<tr>
            <td><strong>Mốc ${submission.milestone || submission.milestone_step || '?'}</strong><br><small>${formatDate(submission.submitted_at || submission.createdAt)}</small></td>
            <td>${escapeHtml(milestoneNames[submission.milestone] || 'Báo cáo tiến độ')}</td>
            <td><a href="${fileUrl}" target="_blank" rel="noopener" style="color:#2563eb;"><i class="fa-solid ${getFileIcon(fileName)}"></i> ${escapeHtml(fileName)}</a></td>
            <td><span class="badge badge-info">Đã nộp</span></td>
            <td><span style="color:#94a3b8;">Chưa có nhận xét</span></td>
        </tr>`;
    }).join('');
}

async function loadProgressDetail() {
    const auth = JSON.parse(localStorage.getItem('lecturerAuth') || 'null');
    const user = auth?.user;
    const topicId = new URLSearchParams(window.location.search).get('topicId');
    const body = document.getElementById('submissionTableBody');

    if (!user || user.role !== 'LECTURER' || !topicId) {
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:24px 0;">Không xác định được đề tài hoặc phiên giảng viên.</td></tr>';
        return;
    }

    try {
        const [topicsResponse, submissionsResponse] = await Promise.all([
            fetch(`${API_BASE}/api/topics/lecturer/${encodeURIComponent(user.user_code)}`),
            fetch(`${API_BASE}/api/submissions/topic/${encodeURIComponent(topicId)}`)
        ]);
        const topicsResult = await topicsResponse.json();
        const submissionsResult = await submissionsResponse.json();
        const topics = topicsResult?.data?.approved || [];
        const topic = topics.find(item => String(item._id) === String(topicId));

        if (!topic || !submissionsResponse.ok || !submissionsResult.success) throw new Error('Không tìm thấy dữ liệu đề tài');
        const submissions = submissionsResult.data || [];
        await renderHeader(topic);
        renderMilestones(submissions);
        renderSubmissions(submissions);
    } catch (error) {
        console.error('Lỗi tải chi tiết tiến độ:', error);
        body.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:24px 0;">Không thể tải dữ liệu tiến độ từ máy chủ.</td></tr>';
    }
}

document.addEventListener('DOMContentLoaded', loadProgressDetail);
