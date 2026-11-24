// LƯU Ý: Đang để mặc định '/api/topics' để hiển thị ngay đề tài bạn vừa duyệt.
// Khi nào Backend làm xong API cho bảng Group thì đổi thành: window.APP_CONFIG.API_BASE_URL + '/api/groups'
const API_BASE_URL = window.APP_CONFIG.API_BASE_URL + '/api/topics';
const NOTIFICATION_API_URL = window.APP_CONFIG.API_BASE_URL + '/api/notifications/lecturer';
let allGroupsData = [];
let lecturerUnreadByTopic = new Map();

let notifyRecipients = [];
let notifyMode = null; // 'GROUP' or 'BROADCAST'

const CHAT_AVATAR_PALETTE = [
    { background: "#EAF1FF", color: "#48638E" },
    { background: "#EAF5EE", color: "#4E7259" },
    { background: "#FBF2E5", color: "#8A6A3F" },
    { background: "#F1ECF8", color: "#6C5A8A" },
    { background: "#F8ECEF", color: "#875C69" },
    { background: "#E8F3F3", color: "#4C7070" },
    { background: "#EEF1F4", color: "#536474" },
    { background: "#E8F2F6", color: "#4A6978" }
];

function getChatAvatarColors(identifier) {
    const key = String(identifier || "").trim().toUpperCase();
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    return CHAT_AVATAR_PALETTE[Math.abs(hash) % CHAT_AVATAR_PALETTE.length];
}

function getNameInitials(name, fallback) {
    const words = String(name || "").trim().split(/\s+/).filter(Boolean);
    return words.length
        ? words.slice(-2).map(word => word.charAt(0).toLocaleUpperCase("vi-VN")).join("")
        : fallback;
}

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
    const btnClearFilters = document.getElementById("btnClearGroupFilters");

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            toggleClearFilterBtn();
            filterAndRenderGroups();
        });
    }
    if (statusFilter) {
        statusFilter.addEventListener("change", () => {
            toggleClearFilterBtn();
            filterAndRenderGroups();
        });
    }

    if (btnClearFilters) {
        btnClearFilters.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            if (statusFilter) statusFilter.value = "ALL";
            toggleClearFilterBtn();
            filterAndRenderGroups();
        });
    }

    // Click vào thẻ thống kê để lọc nhanh
    document.querySelectorAll(".stat-box[data-filter]").forEach(statBox => {
        statBox.addEventListener("click", () => {
            const filterValue = statBox.getAttribute("data-filter");
            if (statusFilter && filterValue) {
                statusFilter.value = filterValue;
                toggleClearFilterBtn();
                filterAndRenderGroups();
            }
        });
    });

    function toggleClearFilterBtn() {
        if (!btnClearFilters) return;
        const hasKeyword = Boolean(searchInput?.value.trim());
        const hasStatus = statusFilter?.value !== "ALL";
        btnClearFilters.style.display = (hasKeyword || hasStatus) ? "inline-flex" : "none";
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
        container.innerHTML = `
            <div class="empty-msg">
                <div class="empty-state-card">
                    <div class="empty-state-icon"><i class="fa-solid fa-spinner fa-spin"></i></div>
                    <h3 class="empty-state-title">Đang tải danh sách nhóm hướng dẫn...</h3>
                    <p class="empty-state-desc">Vui lòng chờ giây lát trong khi hệ thống đồng bộ dữ liệu.</p>
                </div>
            </div>
        `;
    }

    try {
        const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
        const response = await apiFetch(`${API_BASE_URL}/lecturer/${lecturerCode}`, {
            headers: { Authorization: `Bearer ${auth?.token || ''}` }
        });
        const result = await response.json();

        console.log("=== [DEBUG] DỮ LIỆU THÔ TỪ BACKEND ===", result);

        if (response.ok && result.success) {
            let rawData = [];

            // Nhận diện linh hoạt cấu trúc trả về
            if (result.data && Array.isArray(result.data.approved)) {
                rawData = result.data.approved;
            } else if (Array.isArray(result.data)) {
                rawData = result.data;
            } else if (Array.isArray(result)) {
                rawData = result;
            }

            // Lọc các mục đã duyệt
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
                container.innerHTML = `
                    <div class="empty-msg">
                        <div class="empty-state-card">
                            <div class="empty-state-icon" style="color: #ef4444; background: #fef2f2;"><i class="fa-solid fa-circle-exclamation"></i></div>
                            <h3 class="empty-state-title">Không thể tải dữ liệu</h3>
                            <p class="empty-state-desc">${result.message || "Lỗi kết nối máy chủ"}</p>
                        </div>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error("Lỗi kết nối API:", error);
        if (container) {
            container.innerHTML = `
                <div class="empty-msg">
                    <div class="empty-state-card">
                        <div class="empty-state-icon" style="color: #ef4444; background: #fef2f2;"><i class="fa-solid fa-triangle-exclamation"></i></div>
                        <h3 class="empty-state-title">Lỗi kết nối máy chủ</h3>
                        <p class="empty-state-desc">Không thể kết nối đến hệ thống backend. Vui lòng kiểm tra lại mạng hoặc thử lại sau.</p>
                    </div>
                </div>
            `;
        }
    }
}

/**
 * Cache thông tin sinh viên hiển thị
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
            ? { full_name: data.full_name, user_code: data.user_code || userCode, email: data.email || '', phone: data.phone || '' }
            : { full_name: 'Sinh viên ' + userCode, user_code: userCode, email: '', phone: '' };

        sessionStorage.setItem(cacheKey, JSON.stringify(result));
        return result;
    } catch (error) {
        const fallback = { full_name: 'Sinh viên ' + userCode, user_code: userCode, email: '', phone: '' };
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

/**
 * Cập nhật 4 thẻ thống kê tổng quan
 */
function updateOverviewStats(groups) {
    let totalStudents = 0;
    let onTrackCount = 0;
    let warningCount = 0;

    groups.forEach(g => {
        totalStudents += (g.leader_code || g.student_code) ? 1 : 1;
        if (g.member2_code || g.member2Code) totalStudents += 1;
        if (g.member3_code || g.member3Code) totalStudents += 1;

        const progressState = getGroupProgressState(g);
        if (progressState === "ON_TRACK") onTrackCount++;
        if (progressState === "WARNING") warningCount++;
    });

    const totalGroupsEl = document.getElementById("stat-total-groups");
    const totalStudentsEl = document.getElementById("stat-total-students");
    const onTrackEl = document.getElementById("stat-on-track");
    const warningEl = document.getElementById("stat-warning");

    if (totalGroupsEl) animateCount(totalGroupsEl, groups.length);
    if (totalStudentsEl) animateCount(totalStudentsEl, totalStudents);
    if (onTrackEl) animateCount(onTrackEl, onTrackCount);
    if (warningEl) {
        animateCount(warningEl, warningCount);
        const warningCard = warningEl.closest(".stat-box");
        if (warningCard) {
            if (warningCount > 0) {
                warningCard.classList.add("has-warning");
            } else {
                warningCard.classList.remove("has-warning");
            }
        }
    }
}

function animateCount(element, target) {
    const start = parseInt(element.textContent, 10) || 0;
    if (start === target) {
        element.textContent = target;
        return;
    }
    const duration = 400;
    const stepTime = 30;
    const steps = Math.ceil(duration / stepTime);
    const increment = (target - start) / steps;
    let current = start;
    let stepCount = 0;

    const timer = setInterval(() => {
        stepCount++;
        current += increment;
        if (stepCount >= steps) {
            clearInterval(timer);
            element.textContent = target;
        } else {
            element.textContent = Math.round(current);
        }
    }, stepTime);
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
 * Lọc từ khóa + tình trạng tiến độ và vẽ lại giao diện
 */
function filterAndRenderGroups() {
    const keyword = (document.getElementById("searchGroupInput")?.value || "").toLowerCase().trim();
    const status = document.getElementById("statusFilter")?.value || "ALL";
    const container = document.getElementById("groupsGridContainer");
    if (!container) return;

    const filtered = allGroupsData.filter(group => {
        const title = (group.topic?.title || group.title || "").toLowerCase();
        const groupCode = (group.group_code || group.topic_code || group.code || "").toLowerCase();
        const leader = (group.leader_code || group.leaderCode || group.student_code || "").toLowerCase();
        const member2 = (group.member2_code || group.member2Code || "").toLowerCase();
        const member3 = (group.member3_code || group.member3Code || "").toLowerCase();

        const matchesKeyword = !keyword || title.includes(keyword) || groupCode.includes(keyword) || 
                             leader.includes(keyword) || member2.includes(keyword) || member3.includes(keyword);

        const groupStatus = getGroupProgressState(group);
        const matchesStatus = (status === "ALL") || (groupStatus === status);

        return matchesKeyword && matchesStatus;
    });

    container.innerHTML = "";

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-msg">
                <div class="empty-state-card">
                    <div class="empty-state-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                    <h3 class="empty-state-title">Không tìm thấy nhóm sinh viên nào</h3>
                    <p class="empty-state-desc">Không có kết quả nào khớp với từ khóa tìm kiếm hoặc bộ lọc hiện tại. Vui lòng thử lại với tiêu chí khác.</p>
                </div>
            </div>
        `;
        return;
    }

    filtered.forEach(async (group, index) => {
        const { leaderInfo, member2Info, member3Info } = await getGroupMemberInfo(group);

        const progress = Number(group.progress_percentage || group.milestone_progress || group.progress) || 0;
        
        const progressState = getGroupProgressState(group);
        const isWarning = progressState === "WARNING";
        const isOnTrack = progressState === "ON_TRACK";
        const isUnconfigured = progressState === "UNCONFIGURED";

        const statusClass = isWarning ? "tag-warning" : isOnTrack ? "tag-success" : "tag-neutral";
        const statusText = isWarning
            ? '<i class="fa-solid fa-triangle-exclamation"></i> Chậm tiến độ'
            : isOnTrack
                ? '<i class="fa-solid fa-circle-check"></i> Đúng tiến độ'
                : isUnconfigured
                    ? '<i class="fa-solid fa-circle-info"></i> Chưa cấu hình mốc'
                    : '<i class="fa-solid fa-circle-info"></i> Đang khởi tạo';
        const barColor = isWarning ? "bg-orange" : isOnTrack ? "bg-blue" : "bg-neutral";
        const percentColor = isWarning ? "text-red" : "";

        // Thông tin đề tài
        const topicTitle = group.topic?.title || group.title || "Đề tài chưa cập nhật tên";
        const topicCategory = group.topic?.category || group.category || "Web / Ứng dụng";
        const displayGroupCode = group.group_code || group.topic_code || ('N0' + (index + 1));
        const chatTopicId = group.topic?._id || group.topic_id?._id || group.topic_id || group._id;

        // Trưởng nhóm
        const leaderCode = group.leader_code || group.leaderCode || group.student_code || "Chưa ĐK";
        const leaderInitial = getNameInitials(leaderInfo.full_name || leaderCode, "T");

        let membersHtml = `
            <div class="member-item leader">
                <div class="member-avatar avatar-leader" title="Trưởng nhóm">${leaderInitial}</div>
                <div class="member-info">
                    <div class="member-name-row">
                        <span class="member-name">${leaderInfo.full_name}</span>
                        <small style="color: #64748b;">(${leaderCode})</small>
                        <i class="fa-solid fa-crown crown-badge" title="Trưởng nhóm"></i>
                    </div>
                    <div class="member-contact">
                        ${leaderInfo.phone ? `<a href="tel:${leaderInfo.phone}"><i class="fa-solid fa-phone"></i> ${leaderInfo.phone}</a>` : ''}
                        ${leaderInfo.email ? `<a href="mailto:${leaderInfo.email}"><i class="fa-regular fa-envelope"></i> ${leaderInfo.email}</a>` : ''}
                        ${!leaderInfo.phone && !leaderInfo.email ? '<span style="color:#94a3b8; font-size:11.5px;">Chưa cập nhật liên hệ</span>' : ''}
                    </div>
                </div>
            </div>
        `;

        // Thành viên 2
        const member2Code = group.member2_code || group.member2Code;
        if (member2Code && member2Info) {
            const m2Initial = getNameInitials(member2Info.full_name || member2Code, "S");
            membersHtml += `
                <div class="member-item">
                    <div class="member-avatar avatar-member-1">${m2Initial}</div>
                    <div class="member-info">
                        <div class="member-name-row">
                            <span class="member-name">${member2Info.full_name}</span>
                            <small style="color: #64748b;">(${member2Code})</small>
                        </div>
                        <div class="member-contact">
                            ${member2Info.phone ? `<a href="tel:${member2Info.phone}"><i class="fa-solid fa-phone"></i> ${member2Info.phone}</a>` : ''}
                            ${member2Info.email ? `<a href="mailto:${member2Info.email}"><i class="fa-regular fa-envelope"></i> ${member2Info.email}</a>` : ''}
                            ${!member2Info.phone && !member2Info.email ? '<span style="color:#94a3b8; font-size:11.5px;">Chưa cập nhật liên hệ</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        // Thành viên 3
        const member3Code = group.member3_code || group.member3Code;
        if (member3Code && member3Info) {
            const m3Initial = getNameInitials(member3Info.full_name || member3Code, "S");
            membersHtml += `
                <div class="member-item">
                    <div class="member-avatar avatar-member-2">${m3Initial}</div>
                    <div class="member-info">
                        <div class="member-name-row">
                            <span class="member-name">${member3Info.full_name}</span>
                            <small style="color: #64748b;">(${member3Code})</small>
                        </div>
                        <div class="member-contact">
                            ${member3Info.phone ? `<a href="tel:${member3Info.phone}"><i class="fa-solid fa-phone"></i> ${member3Info.phone}</a>` : ''}
                            ${member3Info.email ? `<a href="mailto:${member3Info.email}"><i class="fa-regular fa-envelope"></i> ${member3Info.email}</a>` : ''}
                            ${!member3Info.phone && !member3Info.email ? '<span style="color:#94a3b8; font-size:11.5px;">Chưa cập nhật liên hệ</span>' : ''}
                        </div>
                    </div>
                </div>
            `;
        }

        const card = document.createElement("div");
        card.className = `group-card ${isWarning ? "has-late" : ""}`;
        card.setAttribute("data-status", isWarning ? "WARNING" : "ON_TRACK");

        card.innerHTML = `
            <div class="group-card-header">
                <div class="group-badge-code">
                    <i class="fa-solid fa-users"></i>
                    <span>Nhóm</span>
                    <strong>${displayGroupCode}</strong>
                </div>
                <span class="status-tag ${statusClass}">${statusText}</span>
            </div>

            <div class="group-topic-title">
                <h3 title="${escapeLecturerChatText(topicTitle)}">${topicTitle}</h3>
                <span class="category-chip"><i class="fa-solid fa-layer-group"></i> ${topicCategory}</span>
            </div>

            <div class="group-members-list">
                ${membersHtml}
            </div>

            <div class="group-progress-section">
                <div class="progress-labels">
                    <span>Milestone hoàn thành</span>
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
                    <i class="fa-solid fa-comments"></i> Chat trưởng nhóm
                    <span class="chat-unread-badge chat-button-unread" data-chat-unread-topic="${chatTopicId}" hidden></span>
                </button>
            </div>
        `;

        container.appendChild(card);
        updateLecturerGroupChatBadge(chatTopicId);
        const messageButton = card.querySelector('.btn-message-group');
        if (messageButton) {
            messageButton.addEventListener('click', () => openLecturerGroupChat(group));
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

let lecturerChatTopicId = null;
let lecturerChatPollTimer = null;

window.openLecturerGroupChat = function(group) {
    const modal = document.getElementById("groupChatModal");
    const title = document.getElementById("groupChatTitle");
    const subtitle = document.getElementById("groupChatSubtitle");
    const leaderCode = group.leader_code || group.leaderCode || group.student_code || "";
    lecturerChatTopicId = group.topic?._id || group.topic_id?._id || group.topic_id || group._id || null;

    if (title) title.textContent = `Chat với trưởng nhóm ${leaderCode || "chưa xác định"}`;
    if (subtitle) subtitle.textContent = `Trao đổi riêng với trưởng nhóm · Nhóm ${group.group_code || group.topic_code || "thực tập"}`;
    if (modal) modal.style.display = "flex";

    if (lecturerChatPollTimer) clearInterval(lecturerChatPollTimer);
    loadLecturerGroupChat();
    lecturerChatPollTimer = setInterval(loadLecturerGroupChat, 5000);

    const closeButton = document.getElementById("closeGroupChatBtn");
    if (closeButton) {
        closeButton.onclick = () => {
            if (modal) modal.style.display = "none";
            if (lecturerChatPollTimer) clearInterval(lecturerChatPollTimer);
        };
    }
};

async function loadLecturerGroupChat() {
    const container = document.getElementById("groupChatMessages");
    if (!container || !lecturerChatTopicId) return;
    try {
        const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
        const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/chat/topics/${encodeURIComponent(lecturerChatTopicId)}?room=LECTURER`, {
            headers: { Authorization: `Bearer ${auth?.token || ""}` }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể tải tin nhắn.");
        if (window.refreshChatUnreadSidebar) await window.refreshChatUnreadSidebar();
        if (!result.data?.length) {
            container.innerHTML = '<p class="group-chat-empty">Chưa có tin nhắn nào với trưởng nhóm.</p>';
            return;
        }
        const lecturerCode = String(auth?.user?.user_code || "").toUpperCase();
        let previousDay = "";
        container.innerHTML = result.data.map(message => {
            const mine = String(message.sender_code || "").toUpperCase() === lecturerCode;
            const createdAt = new Date(message.created_at);
            const time = createdAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
            const dayKey = createdAt.toLocaleDateString("vi-VN");
            const dayDivider = dayKey !== previousDay
                ? `<div class="group-chat-day-separator"><span>${formatGroupChatDay(createdAt)}</span></div>`
                : "";
            previousDay = dayKey;
            const senderName = mine ? "Bạn" : (message.sender_name || message.sender_code);
            const avatarName = message.sender_name || message.sender_code;
            const avatarNameParts = String(avatarName || "").trim().split(/\s+/).filter(Boolean);
            const initialLetter = (avatarNameParts.length ? avatarNameParts[avatarNameParts.length - 1].charAt(0) : "U").toLocaleUpperCase("vi-VN");
            const avatarColors = getChatAvatarColors(message.sender_code || avatarName);
            const avatarStyle = mine ? "" : `background-color: ${avatarColors.background}; color: ${avatarColors.color};`;
            return `
                ${dayDivider}
                <div class="group-chat-message ${mine ? "mine" : ""}">
                    <span class="group-chat-avatar" style="${avatarStyle}">${mine ? '<i class="fa-solid fa-user"></i>' : escapeLecturerChatText(initialLetter)}</span>
                    <div class="group-chat-message-body">
                        <div class="group-chat-meta"><span>${escapeLecturerChatText(senderName)}</span><span>${time}</span></div>
                        <div class="group-chat-bubble">${escapeLecturerChatText(message.content)}</div>
                    </div>
                </div>
            `;
        }).join("");
        container.scrollTop = container.scrollHeight;
    } catch (error) {
        container.innerHTML = `<p class="group-chat-empty">${escapeLecturerChatText(error.message)}</p>`;
    }
}

window.addEventListener("chat:unread-updated", event => {
    lecturerUnreadByTopic = new Map((event.detail.rooms || []).map(room => [
        String(room.topic_id),
        Number(room.unread_count) || 0
    ]));
    document.querySelectorAll("[data-chat-unread-topic]").forEach(badge => {
        updateLecturerGroupChatBadge(badge.dataset.chatUnreadTopic);
    });
});

function updateLecturerGroupChatBadge(topicId) {
    const key = String(topicId);
    const unreadCount = lecturerUnreadByTopic.get(key) || 0;
    document.querySelectorAll("[data-chat-unread-topic]").forEach(badge => {
        if (badge.dataset.chatUnreadTopic === key) {
            setLecturerChatUnreadBadgeElement(badge, unreadCount);
        }
    });
}

function setLecturerChatUnreadBadgeElement(badge, count) {
    const unreadCount = Math.max(0, Number(count) || 0);
    badge.hidden = unreadCount === 0;
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.setAttribute("aria-label", `${unreadCount} tin nhắn chưa đọc`);
}

function formatGroupChatDay(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const formatDate = value => value.toLocaleDateString("vi-VN");
    if (formatDate(date) === formatDate(today)) return `Hôm nay, ${formatDate(date)}`;
    if (formatDate(date) === formatDate(yesterday)) return `Hôm qua, ${formatDate(date)}`;
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function escapeLecturerChatText(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

const lecturerChatForm = document.getElementById("groupChatForm");
if (lecturerChatForm) {
    lecturerChatForm.addEventListener("submit", async event => {
        event.preventDefault();
        if (!lecturerChatTopicId) return;
        const input = document.getElementById("groupChatInput");
        const content = input?.value.trim();
        if (!content) return;
        try {
            const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/chat/topics/${encodeURIComponent(lecturerChatTopicId)}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${auth?.token || ""}`
                },
                body: JSON.stringify({ room_type: "LECTURER", content })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Không thể gửi tin nhắn.");
            if (input) input.value = "";
            await loadLecturerGroupChat();
        } catch (error) {
            showAppNotification(error.message);
        }
    });
}

