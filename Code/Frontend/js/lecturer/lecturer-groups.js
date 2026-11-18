// LƯU Ý: Đang để mặc định '/api/topics' để hiển thị ngay đề tài bạn vừa duyệt.
// Khi nào Backend làm xong API cho bảng Group thì đổi thành: window.APP_CONFIG.API_BASE_URL + '/api/groups'
const API_BASE_URL = window.APP_CONFIG.API_BASE_URL + '/api/topics';
const NOTIFICATION_API_URL = window.APP_CONFIG.API_BASE_URL + '/api/notifications/lecturer';
let allGroupsData = [];

let notifyRecipients = [];
let notifyMode = null; // 'GROUP' or 'BROADCAST'

document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP (LECTURER)
    const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    const user = auth?.user || null;
    if (!user || user.role !== "LECTURER") {
        window.location.href = "../auth/index.html";
        return;
    }

    // Hiển thị thông tin giảng viên trên Navbar
    if (user.full_name) {
        const userNameEl = document.getElementById("userName");
        if (userNameEl) userNameEl.textContent = user.full_name;
    }
    const lecturerCode = user.user_code || user.userCode || "GV01";
    const userCodeEl = document.getElementById("userCode");
    if (userCodeEl) userCodeEl.textContent = lecturerCode;

    // 2. TẢI DANH SÁCH NHÓM/ĐỀ TÀI ĐÃ DUYỆT TỪ BACKEND
    loadLecturedGroups(lecturerCode);

    // 3. EVENT TÌM KIẾM & LỌC TRẠNG THÁI
    const searchInput = document.getElementById("searchGroupInput");
    const statusFilter = document.getElementById("statusFilter");

    if (searchInput) {
        searchInput.addEventListener("input", filterAndRenderGroups);
    }
    if (statusFilter) {
        statusFilter.addEventListener("change", filterAndRenderGroups);
    }

    // 4. SỰ KIỆN NÚT XUẤT EXCEL
    const exportExcelBtn = document.getElementById("exportExcelBtn");
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener("click", exportGroupsToExcel);
    }

    // 5. QUẢN LÝ MODAL THÔNG BÁO CHUNG / NHẮC NHỞ
    const messageModal = document.getElementById("messageModal");
    const modalTitle = document.getElementById("modalMessageTitle");
    const messageSubject = document.getElementById("messageSubject");
    const messageBody = document.getElementById("messageBody");

    // Mở modal khi bấm nút "Gửi thông báo chung"
    const broadcastBtn = document.getElementById("openBroadcastModalBtn");
    if (broadcastBtn) {
        broadcastBtn.addEventListener("click", () => {
            modalTitle.textContent = "Gửi thông báo chung đến TẤT CẢ sinh viên hướng dẫn";
            messageSubject.value = "[Thông báo chung TTTN] ";
            messageBody.value = "";
            notifyMode = 'BROADCAST';
            notifyRecipients = [];
            if (messageModal) messageModal.style.display = "flex";
        });
    }

    // Đóng Modal
    document.querySelectorAll(".btn-close-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            if (messageModal) messageModal.style.display = "none";
        });
    });

    window.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal-overlay")) {
            e.target.style.display = "none";
        }
    });

    // 6. XỬ LÝ SUBMIT FORM GỬI LỜI NHẮN
    const sendMessageForm = document.getElementById("sendMessageForm");
    if (sendMessageForm) {
        sendMessageForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            await handleSendMessage();
        });
    }

    async function postNotification(payload) {
        const response = await apiFetch(NOTIFICATION_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Không thể gửi thông báo.');
        }
        return result;
    }

    async function handleSendMessage() {
        const title = messageSubject.value.trim();
        const content = messageBody.value.trim();

        if (!title || !content) {
            showAppNotification('Vui lòng điền đầy đủ tiêu đề và nội dung thông báo.');
            return;
        }

        if (!notifyMode) {
            showAppNotification('Vui lòng chọn nhóm hoặc gửi thông báo chung trước khi gửi.');
            return;
        }

        const recipients = notifyMode === 'BROADCAST'
            ? allGroupsData.flatMap(group => [
                group.leader_code || group.leaderCode || group.student_code,
                group.member2_code || group.member2Code,
                group.member3_code || group.member3Code
            ])
            : notifyRecipients;
        const recipientCodes = [...new Set(recipients
            .filter(code => code && code.toString().trim() !== '')
            .map(code => code.toString().trim().toUpperCase()))];
        if (recipientCodes.length === 0) {
            showAppNotification('Không tìm thấy sinh viên để gửi thông báo.');
            return;
        }

        try {
            const result = await postNotification({
                title,
                content,
                recipient_codes: recipientCodes
            });
            showAppNotification(result.message || 'Thông báo đã được gửi thành công đến sinh viên.');
            if (messageModal) messageModal.style.display = 'none';
            sendMessageForm.reset();
            notifyMode = null;
            notifyRecipients = [];
        } catch (error) {
            console.error('Lỗi gửi thông báo:', error);
            showAppNotification(error.message || 'Gửi thông báo thất bại. Vui lòng thử lại sau.');
        }
    }

});

/**
 * Gọi API tải danh sách nhóm/đề tài hướng dẫn
 */
async function loadLecturedGroups(lecturerCode) {
    const container = document.getElementById("groupsGridContainer");
    if (container) {
        container.innerHTML = `<p class="empty-msg">Đang tải danh sách nhóm hướng dẫn...</p>`;
    }

    try {
        const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
        const response = await apiFetch(`${API_BASE_URL}/lecturer/${lecturerCode}`, {
            headers: { Authorization: `Bearer ${auth?.token || ''}` }
        });
        const result = await response.json();

        // Debug: Kiểm tra dữ liệu thô trả về từ máy chủ trong F12 -> Console
        console.log("=== [DEBUG] DỮ LIỆU THÔ TỪ BACKEND ===", result);

        if (response.ok && result.success) {
            let rawData = [];

            // 1. Nhận diện linh hoạt cấu trúc trả về (Mảng trực tiếp hay nằm trong thuộc tính approved)
            if (result.data && Array.isArray(result.data.approved)) {
                rawData = result.data.approved;
            } else if (Array.isArray(result.data)) {
                rawData = result.data;
            } else if (Array.isArray(result)) {
                rawData = result;
            }

            // 2. Lọc chính xác các mục ĐÃ DUYỆT (Hỗ trợ nhiều kiểu ghi trạng thái từ MongoDB)
            allGroupsData = rawData.filter(item => {
                const status = (item.status || item.topic_status || "").toString().toUpperCase();
                const isApprovedBool = item.is_approved === true || item.approved === true;
                return status === "APPROVED" || status === "ĐÃ DUYỆT" || isApprovedBool || rawData.length === 1;
            });

            console.log("=== [DEBUG] DANH SÁCH SAU KHI LỌC DUYỆT ===", allGroupsData);

            updateOverviewStats(allGroupsData);
            filterAndRenderGroups();
        } else {
            console.error("Lỗi từ máy chủ:", result.message);
            if (container) {
                container.innerHTML = `<p class="empty-msg">Không thể tải dữ liệu: ${result.message || "Lỗi máy chủ"}</p>`;
            }
        }
    } catch (error) {
        console.error("Lỗi kết nối API:", error);
        if (container) {
            container.innerHTML = `<p class="empty-msg">Lỗi kết nối máy chủ. Vui lòng thử lại sau.</p>`;
        }
    }
}

/**
 * Cập nhật 4 ô thống kê tổng quan (ĐÃ CẬP NHẬT: Đếm thêm thành viên 3)
 */
async function getUserDisplayByCode(userCode) {
    if (!userCode) {
        return { full_name: 'Chưa có thông tin', user_code: '' };
    }

    const cacheKey = `user_display_${userCode}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        try {
            return JSON.parse(cached);
        } catch (error) {
            sessionStorage.removeItem(cacheKey);
        }
    }

    try {
        let auth = null;
        try {
            auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
        } catch {
            auth = null;
        }
        if (auth?.user?.role !== "LECTURER") throw new Error("Phiên đăng nhập không hợp lệ.");
        const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/users/${encodeURIComponent(userCode)}`, {
            headers: { Authorization: `Bearer ${auth.token}` }
        });
        const data = await response.json();
        const result = data && data.full_name
            ? { full_name: data.full_name, user_code: data.user_code || userCode }
            : { full_name: 'Sinh viên ' + userCode, user_code: userCode };

        sessionStorage.setItem(cacheKey, JSON.stringify(result));
        return result;
    } catch (error) {
        const fallback = { full_name: 'Sinh viên ' + userCode, user_code: userCode };
        sessionStorage.setItem(cacheKey, JSON.stringify(fallback));
        return fallback;
    }
}

async function getGroupMemberInfo(group) {
    const leaderCode = group.leader_code || group.leaderCode || group.student_code || '';
    const member2Code = group.member2_code || group.member2Code || '';
    const member3Code = group.member3_code || group.member3Code || '';

    const [leaderInfo, member2Info, member3Info] = await Promise.all([
        getUserDisplayByCode(leaderCode),
        member2Code ? getUserDisplayByCode(member2Code) : null,
        member3Code ? getUserDisplayByCode(member3Code) : null,
    ]);

    return {
        leaderInfo,
        member2Info,
        member3Info
    };
}

function updateOverviewStats(groups) {
    let totalStudents = 0;
    let onTrackCount = 0;
    let warningCount = 0;

    groups.forEach(g => {
        // Nếu có mã trưởng nhóm thì tính 1 sinh viên, ngược lại tính mặc định 1 cho đề tài
        totalStudents += (g.leader_code || g.student_code) ? 1 : 1;
        if (g.member2_code || g.member2Code) totalStudents += 1;
        if (g.member3_code || g.member3Code) totalStudents += 1; // <--- Thêm đếm thành viên 3

        const progressState = getGroupProgressState(g);
        if (progressState === "ON_TRACK") onTrackCount++;
        if (progressState === "WARNING") warningCount++;
    });

    const totalGroupsEl = document.getElementById("stat-total-groups");
    const totalStudentsEl = document.getElementById("stat-total-students");
    const onTrackEl = document.getElementById("stat-on-track");
    const warningEl = document.getElementById("stat-warning");

    if (totalGroupsEl) totalGroupsEl.textContent = groups.length;
    if (totalStudentsEl) totalStudentsEl.textContent = totalStudents;
    if (onTrackEl) onTrackEl.textContent = onTrackCount;
    if (warningEl) warningEl.textContent = warningCount;
}

function getGroupProgressState(group) {
    if (group.progress_status === "Chưa cấu hình mốc" || Number(group.total_milestones) === 0) {
        return "UNCONFIGURED";
    }
    if (typeof group.is_late === "boolean") return group.is_late ? "WARNING" : "ON_TRACK";

    const progress = Number(group.progress_percentage || group.milestone_progress || group.progress) || 0;
    return progress > 0 ? "ON_TRACK" : "UNKNOWN";
}

/**
 * Lọc từ khóa + tình trạng tiến độ và vẽ lại giao diện (ĐÃ CẬP NHẬT: Render thành viên 3)
 */
function filterAndRenderGroups() {
    const keyword = (document.getElementById("searchGroupInput")?.value || "").toLowerCase().trim();
    const status = document.getElementById("statusFilter")?.value || "ALL";
    const container = document.getElementById("groupsGridContainer");
    if (!container) return;

    const filtered = allGroupsData.filter(group => {
        // Hỗ trợ đọc an toàn cả snake_case lẫn camelCase
        const title = (group.topic?.title || group.title || "").toLowerCase();
        const groupCode = (group.group_code || group.topic_code || group.code || "").toLowerCase();
        const leader = (group.leader_code || group.leaderCode || group.student_code || "").toLowerCase();
        const member2 = (group.member2_code || group.member2Code || "").toLowerCase();
        const member3 = (group.member3_code || group.member3Code || "").toLowerCase(); // <--- Đọc mã TV3

        const matchesKeyword = title.includes(keyword) || groupCode.includes(keyword) || 
                             leader.includes(keyword) || member2.includes(keyword) || member3.includes(keyword);

        // Đọc % tiến độ chuẩn xác
        const groupStatus = getGroupProgressState(group);
        const matchesStatus = (status === "ALL") || (groupStatus === status);

        return matchesKeyword && matchesStatus;
    });

    container.innerHTML = "";

    if (filtered.length === 0) {
        container.innerHTML = `<p class="empty-msg">Không tìm thấy nhóm sinh viên nào khớp với bộ lọc.</p>`;
        return;
    }

    filtered.forEach(async (group, index) => {
        const { leaderInfo, member2Info, member3Info } = await getGroupMemberInfo(group);

        // 1. Lấy phần trăm tiến độ từ Backend trả về
        const progress = Number(group.progress_percentage || group.milestone_progress || group.progress) || 0;
        
        // 2. Xác định trạng thái tiến độ
        const progressState = getGroupProgressState(group);
        const isWarning = progressState === "WARNING";
        const isOnTrack = progressState === "ON_TRACK";
        const statusClass = isWarning ? "tag-warning" : isOnTrack ? "tag-success" : "tag-neutral";
        const statusText = isWarning
            ? '<i class="fa-solid fa-triangle-exclamation"></i> Chậm tiến độ'
            : isOnTrack
                ? '<i class="fa-solid fa-check-circle"></i> Đúng tiến độ'
                : progressState === "UNCONFIGURED"
                    ? '<i class="fa-solid fa-circle-info"></i> Chưa cấu hình mốc'
                    : '<i class="fa-solid fa-circle-info"></i> Chưa xác định tiến độ';
        const barColor = isWarning ? "bg-orange" : isOnTrack ? "bg-blue" : "bg-neutral";
        const percentColor = isWarning ? "text-red" : "";

        // Lấy thông tin đề tài
        const topicTitle = group.topic?.title || group.title || "Đề tài chưa cập nhật tên";
        const topicCategory = group.topic?.category || group.category || "Web / Ứng dụng";
        const displayGroupCode = group.group_code || group.topic_code || 'N0' + (index + 1);

        // Thông tin Trưởng nhóm (Hoặc sinh viên thực hiện đề tài)
        const leaderCode = group.leader_code || group.leaderCode || group.student_code || "Chưa ĐK";

        let membersHtml = `
            <div class="member-item leader">
                <span class="member-role" title="Trưởng nhóm"><i class="fa-solid fa-crown"></i></span>
                <div class="member-info">
                    <p class="member-name">${leaderInfo.full_name} (${leaderCode})</p>
                    <small>
                        ${leaderInfo.phone ? `<a href="tel:${leaderInfo.phone}">${leaderInfo.phone}</a> • ` : ''}
                        ${leaderInfo.email ? `<a href="mailto:${leaderInfo.email}">${leaderInfo.email}</a>` : 'Chưa có email'}
                    </small>
                </div>
            </div>
        `;

        // Thông tin Thành viên 2 (Nếu có)
        const member2Code = group.member2_code || group.member2Code;
        if (member2Code && member2Info) {
            membersHtml += `
                <div class="member-item">
                    <span class="member-role"><i class="fa-solid fa-user"></i></span>
                    <div class="member-info">
                        <p class="member-name">${member2Info.full_name} (${member2Code})</p>
                        <small>
                            ${member2Info.phone ? `<a href="tel:${member2Info.phone}">${member2Info.phone}</a> • ` : ''}
                            ${member2Info.email ? `<a href="mailto:${member2Info.email}">${member2Info.email}</a>` : 'Chưa có email'}
                        </small>
                    </div>
                </div>
            `;
        }

        // Thông tin Thành viên 3 (Nếu có)
        const member3Code = group.member3_code || group.member3Code;
        if (member3Code && member3Info) {
            membersHtml += `
                <div class="member-item">
                    <span class="member-role"><i class="fa-solid fa-user"></i></span>
                    <div class="member-info">
                        <p class="member-name">${member3Info.full_name} (${member3Code})</p>
                        <small>
                            ${member3Info.phone ? `<a href="tel:${member3Info.phone}">${member3Info.phone}</a> • ` : ''}
                            ${member3Info.email ? `<a href="mailto:${member3Info.email}">${member3Info.email}</a>` : 'Chưa có email'}
                        </small>
                    </div>
                </div>
            `;
        }

        const card = document.createElement("div");
        card.className = "group-card";
        card.setAttribute("data-status", isWarning ? "WARNING" : "ON_TRACK");

        card.innerHTML = `
            <div class="group-card-header">
                <div class="group-badge-code">
                    <span>Nhóm</span>
                    <strong>${displayGroupCode}</strong>
                </div>
                <span class="status-tag ${statusClass}">${statusText}</span>
            </div>

            <div class="group-topic-title">
                <h3>${topicTitle}</h3>
                <span class="category-text">${topicCategory}</span>
            </div>

            <div class="group-members-list">
                ${membersHtml}
            </div>

            <div class="group-progress-section">
                <div class="progress-labels">
                    <span>Milestone hiện tại</span>
                    <strong class="${percentColor}">${progress}%</strong>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill ${barColor}" style="width: ${progress}%;"></div>
                </div>
            </div>

            <div class="group-card-actions">
                <a href="lecturer-schedule.html?group_id=${group._id}" class="btn-card-action btn-view-progress">
                    <i class="fa-solid fa-chart-line"></i> Xem tiến độ
                </a>
                <button class="btn-card-action btn-message-group" type="button">
                    <i class="fa-solid fa-envelope"></i> Nhắc nhở
                </button>
            </div>
        `;

        container.appendChild(card);
        const messageButton = card.querySelector('.btn-message-group');
        if (messageButton) {
            messageButton.addEventListener('click', () => openRemindModal(group));
        }
    });
}

/**
 * Mở modal gửi lời nhắn cho 1 nhóm cụ thể
 */
window.openRemindModal = function(group) {
    const messageModal = document.getElementById("messageModal");
    const modalTitle = document.getElementById("modalMessageTitle");
    const messageSubject = document.getElementById("messageSubject");
    const messageBody = document.getElementById("messageBody");

    if (!group || !messageModal || !modalTitle || !messageSubject) return;

    const displayGroupCode = group.group_code || group.topic_code || 'N/A';
    modalTitle.textContent = `Gửi lời nhắn cho Nhóm ${displayGroupCode}`;
    messageSubject.value = `[Nhắc nhở TTTN - ${displayGroupCode}] `;
    messageBody.value = "";
    notifyMode = 'GROUP';
    notifyRecipients = [
        group.leader_code || group.leaderCode || group.student_code || '',
        group.member2_code || group.member2Code || '',
        group.member3_code || group.member3Code || ''
    ].filter(code => code && code.toString().trim() !== '');

    if (messageModal) messageModal.style.display = "flex";
};

/**
 * Tính năng xuất danh sách sang dạng dữ liệu giả lập (Export Excel)
 */
function exportGroupsToExcel() {
    if (allGroupsData.length === 0) {
        showAppNotification("Không có dữ liệu nhóm sinh viên để xuất!");
        return;
    }
    showAppNotification(`Đang tiến hành tạo file Excel cho ${allGroupsData.length} nhóm hướng dẫn...`);
}