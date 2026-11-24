// Cấu hình URL Backend API
const API_BASE_URL = window.APP_CONFIG.API_BASE_URL + '/api/topics';

// Biến toàn cục lưu dữ liệu đề tài tải về từ Server
let allTopicsData = {
    pending: [],
    approved: [],
    myPool: []
};
// Biến tạm lưu trữ ID đề tài và hành động đang thao tác trong Modal
let currentSelectedTopicId = null;
let currentActionType = null; // 'APPROVE' | 'REJECT' | 'REVISION'
let editingPoolTopicId = null;

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA ĐĂNG NHẬP (Bắt buộc Token và Role là LECTURER)
    let lecturerAuth = null;
    try {
        lecturerAuth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    } catch (error) {
        lecturerAuth = null;
    }

    const token = lecturerAuth?.token;
    const userStr = lecturerAuth?.user ? JSON.stringify(lecturerAuth.user) : null;

    if (!userStr) {
        showAppNotification("Bạn chưa đăng nhập. Vui lòng đăng nhập để tiếp tục!");
        window.location.href = "../auth/index.html";
        return;
    }

    const user = JSON.parse(userStr);
    if (user.role !== "LECTURER") {
        showAppNotification("Bạn không có quyền truy cập trang dành cho Giảng viên!");
        window.location.href = "../auth/index.html";
        return;
    }

    const lecturerCode = user.user_code || user.userCode;

    // Hiển thị thông tin giảng viên lên Topbar
    const userNameEl = document.getElementById("userName");
    const userCodeEl = document.getElementById("userCode");
    if (userNameEl) userNameEl.textContent = user.full_name || user.fullName;
    if (userCodeEl) userCodeEl.textContent = lecturerCode;

    // 2. TẢI DỮ LIỆU THẬT TỪ SERVER
    loadLecturerTopics(lecturerCode, token);

    // 3. XỬ LÝ CHUYỂN TAB
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");
    const openCreateModalBtn = document.getElementById("openCreateModalBtn");
    const openTopicImportBtn = document.getElementById("openTopicImportBtn");

    const updateCreateButtonVisibility = activeTab => {
        // Luôn hiển thị nút để giảng viên thao tác nhanh, nếu nhấn từ tab khác sẽ tự mở modal/tab kho
        if (openCreateModalBtn) openCreateModalBtn.hidden = false;
        if (openTopicImportBtn) openTopicImportBtn.hidden = false;
    };

    updateCreateButtonVisibility(document.querySelector(".tab-btn.active")?.dataset.tab);

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => {
                b.classList.remove("active");
                b.setAttribute("aria-selected", "false");
            });
            tabContents.forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            btn.setAttribute("aria-selected", "true");
            const targetTabId = btn.getAttribute("data-tab");
            const targetContent = document.getElementById(`tab-${targetTabId}`);
            if (targetContent) targetContent.classList.add("active");
            updateCreateButtonVisibility(targetTabId);

            // Render lại dữ liệu cho phù hợp bộ lọc hiện tại
            filterAndRender();
        });
    });

    // Chuyển tab khi nhấp vào thẻ KPI
    document.querySelectorAll(".stat-kpi-card[data-tab-target]").forEach(card => {
        card.addEventListener("click", () => {
            const targetTab = card.getAttribute("data-tab-target");
            const targetBtn = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
            if (targetBtn) targetBtn.click();
        });
    });

    // 4. LẮNG NGHE LỌC & TÌM KIẾM
    const searchInput = document.getElementById("searchTopicInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const clearFilterBtn = document.getElementById("btnClearFilters");

    if (searchInput) searchInput.addEventListener("input", filterAndRender);
    if (categoryFilter) categoryFilter.addEventListener("change", filterAndRender);

    if (clearFilterBtn) {
        clearFilterBtn.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            if (categoryFilter) categoryFilter.value = "ALL";
            filterAndRender();
        });
    }

    // 5. THIẾT LẬP CÁC MODAL THAO TÁC
    setupModals(lecturerCode, token);
});

/**
 * Hàm gọi API Backend tải toàn bộ danh sách đề tài của Giảng viên
 */
async function loadLecturerTopics(lecturerCode, token) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/lecturer/${lecturerCode}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        const result = await response.json();

        if (response.ok && result.success) {
            allTopicsData = {
                pending: result.data.pending || [],
                approved: result.data.approved || [],
                myPool: result.data.myPool || []
            };

            const pendingCount = allTopicsData.pending.length;
            const approvedCount = allTopicsData.approved.length;
            const poolTotal = allTopicsData.myPool.length;
            const poolOpen = allTopicsData.myPool.filter(t => 
                !t.is_registered && 
                t.status !== 'REGISTERED' && 
                t.status !== 'REJECTED' && 
                (Number(t.registered_groups) || 0) < (Number(t.max_groups) || 1)
            ).length;

            // Cập nhật 4 thẻ KPI thống kê
            const statPending = document.getElementById("statKpiPending");
            const statApproved = document.getElementById("statKpiApproved");
            const statPoolTotal = document.getElementById("statKpiPoolTotal");
            const statPoolOpen = document.getElementById("statKpiPoolOpen");

            if (statPending) statPending.textContent = pendingCount;
            if (statApproved) statApproved.textContent = approvedCount;
            if (statPoolTotal) statPoolTotal.textContent = poolTotal;
            if (statPoolOpen) statPoolOpen.textContent = poolOpen;

            // Cập nhật số lượng huy hiệu (badge) các tab
            const badgePending = document.getElementById("badge-pending");
            if (badgePending) {
                badgePending.textContent = pendingCount;
                badgePending.classList.toggle("has-pending", pendingCount > 0);
            }

            const badgeApproved = document.getElementById("badge-approved");
            if (badgeApproved) badgeApproved.textContent = approvedCount;

            const badgeMyTopics = document.getElementById("badge-my-topics");
            if (badgeMyTopics) badgeMyTopics.textContent = poolTotal;

            // Render ra giao diện
            filterAndRender();
        } else {
            console.error("Lỗi từ server:", result.message);
        }
    } catch (error) {
        console.error("Lỗi kết nối API:", error);
        showAppNotification("Không thể kết nối đến máy chủ Backend!");
    }
}

/**
 * Lọc theo Từ khóa + Lĩnh vực và Render vào bảng
 */
function filterAndRender() {
    const searchInput = document.getElementById("searchTopicInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const clearFilterBtn = document.getElementById("btnClearFilters");

    const keyword = (searchInput?.value || "").toLowerCase().trim();
    const category = categoryFilter?.value || "ALL";

    // Cập nhật hiển thị nút Xóa bộ lọc
    const hasFilter = Boolean(keyword) || (category !== "ALL");
    if (clearFilterBtn) {
        clearFilterBtn.style.display = hasFilter ? "inline-flex" : "none";
    }

    // Hàm kiểm tra 1 đề tài có thỏa mãn điều kiện lọc không
    const matchFilter = (topic) => {
        const matchKeyword = (
            (topic.title || "").toLowerCase().includes(keyword) ||
            (topic.topic_code || "").toLowerCase().includes(keyword) ||
            (topic.leader_code || topic.student_code || "").toLowerCase().includes(keyword) ||
            (topic.leader_name || "").toLowerCase().includes(keyword) ||
            (topic.member2_code || "").toLowerCase().includes(keyword) ||
            (topic.member2_name || "").toLowerCase().includes(keyword) ||
            (topic.member3_code || "").toLowerCase().includes(keyword) ||
            (topic.member3_name || "").toLowerCase().includes(keyword)
        );
        const matchCategory = (category === "ALL" || topic.category === category);
        return matchKeyword && matchCategory;
    };

    // Lọc dữ liệu từng mảng
    const filteredPending = allTopicsData.pending.filter(matchFilter);
    const filteredApproved = allTopicsData.approved.filter(matchFilter);
    const filteredMyPool = allTopicsData.myPool.filter(matchFilter);

    // Render ra 3 Tab
    renderPendingTable(filteredPending);
    renderApprovedTable(filteredApproved);
    renderMyTopicsTable(filteredMyPool);
}

/**
 * RENDER TAB 1: CHỜ PHÊ DUYỆT (ƯU TIÊN THAO TÁC AN TOÀN)
 */
function renderPendingTable(list) {
    const tbody = document.getElementById("tbody-pending");
    const footerText = document.getElementById("footer-pending-text");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state-card">
                        <div class="empty-state-icon green">
                            <i class="fa-solid fa-circle-check"></i>
                        </div>
                        <h4>Không có đề tài nào chờ phê duyệt</h4>
                        <p>Bạn đã xử lý hết các đề xuất đề tài từ sinh viên. Khi có nhóm mới đăng ký, danh sách sẽ hiển thị tại đây.</p>
                    </div>
                </td>
            </tr>
        `;
        if (footerText) footerText.innerHTML = "Hiển thị <strong>0</strong> kết quả";
        return;
    }

    list.forEach(topic => {
        const tr = document.createElement("tr");
        tr.className = "row-pending";

        const created = topic.createdAt ? new Date(topic.createdAt) : null;
        const dateStr = created ? created.toLocaleDateString("vi-VN") : "N/A";
        let relativeTimeStr = "";
        let isOverdueDays = false;
        if (created) {
            const now = new Date();
            const diffMs = now - created;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            if (diffDays === 0) relativeTimeStr = "Hôm nay";
            else if (diffDays === 1) relativeTimeStr = "Hôm qua";
            else {
                relativeTimeStr = `Cách đây ${diffDays} ngày`;
                if (diffDays >= 3) isOverdueDays = true;
            }
        }

        const tagClass = getCategoryTagClass(topic.category);
        const codeDisplay = topic.topic_code || ("DT-" + (topic._id ? topic._id.slice(-5).toUpperCase() : "0000"));
        const leaderCode = topic.leader_code || topic.student_code || "N/A";
        const leaderName = topic.leader_name || leaderCode;
        const leaderInitial = leaderName.trim().split(/\s+/).slice(-2)
            .map(part => part.charAt(0).toLocaleUpperCase("vi-VN")).join("");

        tr.innerHTML = `
            <td><span class="topic-code-cell">${escapeHtml(codeDisplay)}</span></td>
            <td>
                <div class="topic-title-cell" title="${escapeHtml(topic.title || '')}">
                    <span class="topic-title-main">${escapeHtml(topic.title || "Chưa có tên đề tài")}</span>
                    <span class="topic-desc-sub" title="${escapeHtml(topic.description || '')}">${escapeHtml(topic.description || "Không có mô tả")}</span>
                </div>
            </td>
            <td><span class="tag-chip ${tagClass}">${escapeHtml(topic.category || "Web / Ứng dụng")}</span></td>
            <td>
                <div class="student-cell">
                    <span class="student-avatar is-leader" title="Trưởng nhóm">${leaderInitial}</span>
                    <div class="student-info">
                        <span class="student-name">${escapeHtml(leaderName)}</span>
                        <span class="student-code-badge">${leaderCode !== "N/A" ? `MSSV: ${escapeHtml(leaderCode)} · ` : ""}Trưởng nhóm</span>
                    </div>
                </div>
            </td>
            <td>
                <div class="date-cell-info">
                    <span class="date-main"><i class="fa-regular fa-calendar"></i> ${dateStr}</span>
                    ${relativeTimeStr ? `<span class="date-relative ${isOverdueDays ? 'warning' : ''}">${relativeTimeStr}</span>` : ''}
                </div>
            </td>
            <td>
                <div class="action-buttons-group">
                    <button type="button" class="btn-table-action btn-action-approve" title="Phê duyệt hướng dẫn đề tài này" onclick="openConfirmModal('${topic._id}', 'APPROVE')">
                        <i class="fa-solid fa-check"></i> <span>Duyệt</span>
                    </button>
                    <button type="button" class="btn-table-action btn-action-reject" title="Từ chối hướng dẫn đề tài này" onclick="openConfirmModal('${topic._id}', 'REJECT')">
                        <i class="fa-solid fa-xmark"></i> <span>Từ chối</span>
                    </button>
                    <button type="button" class="btn-icon-action" title="Yêu cầu sinh viên chỉnh sửa" onclick="openRevisionModal('${topic._id}')">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (footerText) {
        footerText.innerHTML = `Hiển thị <strong>${list.length}</strong> trên tổng số <strong>${allTopicsData.pending.length}</strong> đề tài chờ duyệt`;
    }
}

/**
 * RENDER TAB 2: ĐÃ PHÊ DUYỆT (ĐANG HƯỚNG DẪN)
 */
function renderApprovedTable(list) {
    const tbody = document.getElementById("tbody-approved");
    const footerText = document.getElementById("footer-approved-text");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8">
                    <div class="empty-state-card">
                        <div class="empty-state-icon blue">
                            <i class="fa-solid fa-user-group"></i>
                        </div>
                        <h4>Chưa có đề tài nào đang hướng dẫn</h4>
                        <p>Các đề tài sau khi bạn phê duyệt sẽ xuất hiện tại đây để thuận tiện theo dõi tiến độ các tuần.</p>
                    </div>
                </td>
            </tr>
        `;
        if (footerText) footerText.innerHTML = "Hiển thị <strong>0</strong> kết quả";
        return;
    }

    list.forEach(topic => {
        const tr = document.createElement("tr");
        const dateStr = topic.updatedAt ? new Date(topic.updatedAt).toLocaleDateString("vi-VN") : "N/A";
        const tagClass = getCategoryTagClass(topic.category);
        const codeDisplay = topic.topic_code || ("DT-" + (topic._id ? topic._id.slice(-5).toUpperCase() : "0000"));

        // Danh sách sinh viên thực hiện
        const membersList = [
            { code: topic.leader_code || topic.student_code, name: topic.leader_name },
            { code: topic.member2_code, name: topic.member2_name },
            { code: topic.member3_code, name: topic.member3_name }
        ].filter(member => member.code);
        const membersHtml = `
            <div class="students-stack">
                ${membersList.map((member, idx) => {
                    const isLeader = idx === 0;
                    const displayName = member.name || member.code;
                    const initial = displayName.trim().split(/\s+/).slice(-2)
                        .map(part => part.charAt(0).toLocaleUpperCase("vi-VN")).join("");
                    return `
                        <div class="student-cell" title="${escapeHtml(`${isLeader ? 'Trưởng nhóm: ' : 'Thành viên: '}${displayName} (${member.code})`)}">
                            <span class="student-avatar ${isLeader ? 'is-leader' : ''}">${initial}</span>
                            <span class="student-info">
                                <span class="student-name" style="font-size: 12.5px;">${escapeHtml(displayName)}</span>
                                <span class="student-code-badge">${escapeHtml(member.code)}</span>
                            </span>
                        </div>
                    `;
                }).join("")}
            </div>
        `;

        tr.innerHTML = `
            <td><span class="topic-code-cell">${escapeHtml(codeDisplay)}</span></td>
            <td>
                <div class="topic-title-cell" title="${escapeHtml(topic.title || '')}">
                    <span class="topic-title-main">${escapeHtml(topic.title || "Chưa có tên")}</span>
                </div>
            </td>
            <td><span class="tag-chip ${tagClass}">${escapeHtml(topic.category || "Web / Ứng dụng")}</span></td>
            <td>${membersHtml}</td>
            <td>
                <span class="date-main"><i class="fa-regular fa-calendar"></i> ${dateStr}</span>
            </td>
            <td>
                <div class="progress-cell-wrap">
                    <span class="progress-text-sm">Tuần 01/15 (7%)</span>
                    <div class="progress-track-sm">
                        <div class="progress-fill-sm" style="width: 7%;"></div>
                    </div>
                </div>
            </td>
            <td>
                <span class="status-pill status-green">
                    <span class="dot"></span>
                    <span>Đang hướng dẫn</span>
                </span>
            </td>
            <td style="text-align: center;">
                <a href="lecturer-progress-detail.html?topicId=${encodeURIComponent(topic._id)}" class="btn-outline-action">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i> <span>Xem tiến độ</span>
                </a>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (footerText) {
        footerText.innerHTML = `Hiển thị <strong>${list.length}</strong> trên tổng số <strong>${allTopicsData.approved.length}</strong> đề tài đang hướng dẫn`;
    }
}

/**
 * RENDER TAB 3: KHO ĐỀ TÀI CỦA GIẢNG VIÊN
 */
function renderMyTopicsTable(list) {
    const tbody = document.getElementById("tbody-mytopics");
    const footerText = document.getElementById("footer-mytopics-text");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (list.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="empty-state-card">
                        <div class="empty-state-icon gray">
                            <i class="fa-solid fa-box-archive"></i>
                        </div>
                        <h4>Kho đề tài trống</h4>
                        <p>Bạn chưa đăng đề tài gợi ý nào vào kho. Hãy thêm đề tài để sinh viên đăng ký!</p>
                        <button type="button" class="btn-primary" style="margin-top: 14px;" onclick="document.getElementById('openCreateModalBtn')?.click()">
                            <i class="fa-solid fa-plus"></i> Đề xuất đề tài mới
                        </button>
                    </div>
                </td>
            </tr>
        `;
        if (footerText) footerText.innerHTML = "Hiển thị <strong>0</strong> kết quả";
        return;
    }

    list.forEach(topic => {
        const tr = document.createElement("tr");
        const tagClass = getCategoryTagClass(topic.category);
        const codeDisplay = topic.topic_code || ("DT-" + (topic._id ? topic._id.slice(-5).toUpperCase() : "0000"));
        const registeredGroups = Number(topic.registered_groups) || 0;
        const maxGroupsValue = Number(topic.max_groups);
        const maxGroups = Number.isInteger(maxGroupsValue) && maxGroupsValue >= 0 ? maxGroupsValue : 1;
        const isRegistered = topic.status === 'REGISTERED' || topic.is_registered === true;

        let statusBadge = "";
        if (maxGroups === 0 && registeredGroups === 0) {
            statusBadge = `<span class="status-pill status-gray"><span class="dot"></span> Tạm khóa</span>`;
        } else if (isRegistered || registeredGroups >= maxGroups) {
            statusBadge = `<span class="status-pill status-blue"><span class="dot"></span> Đã có nhóm (${registeredGroups}/${maxGroups})</span>`;
        } else {
            statusBadge = `<span class="status-pill status-green"><span class="dot"></span> Đang mở (${registeredGroups}/${maxGroups})</span>`;
        }

        const reqText = topic.requirements || topic.description || "Không có yêu cầu cụ thể";

        tr.innerHTML = `
            <td><span class="topic-code-cell">${escapeHtml(codeDisplay)}</span></td>
            <td>
                <div class="topic-title-cell" title="${escapeHtml(topic.title || '')}">
                    <span class="topic-title-main">${escapeHtml(topic.title || "Chưa có tên")}</span>
                </div>
            </td>
            <td><span class="tag-chip ${tagClass}">${escapeHtml(topic.category || "Web / Ứng dụng")}</span></td>
            <td>
                <div class="requirements-cell" title="${escapeHtml(reqText)}">
                    ${escapeHtml(reqText)}
                </div>
            </td>
            <td>${statusBadge}</td>
            <td style="text-align: center;">
                <button type="button" class="btn-outline-action" data-edit-pool-topic="${topic._id}" title="Chỉnh sửa thông tin đề tài">
                    <i class="fa-solid fa-pen-to-square"></i> <span>Sửa</span>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (footerText) {
        footerText.innerHTML = `Hiển thị <strong>${list.length}</strong> trên tổng số <strong>${allTopicsData.myPool.length}</strong> đề tài trong kho`;
    }
}

/**
 * Hàm trợ giúp chọn màu Tag theo lĩnh vực
 */
function getCategoryTagClass(category) {
    if (category === "AI / ML") return "tag-purple";
    if (category === "Dữ liệu / Phân tích") return "tag-orange";
    if (category === "Khác") return "tag-gray";
    return "tag-blue";
}

/**
 * THIẾT LẬP CÁC SỰ KIỆN ĐÓNG/MỞ MODAL & GỌI API THAO TÁC
 */
function setupModals(lecturerCode, token) {
    const createModal = document.getElementById("createTopicModal");
    const revisionModal = document.getElementById("revisionModal");
    const confirmModal = document.getElementById("actionConfirmModal");
    const topicImportModal = document.getElementById("topicImportModal");
    const rejectModal = document.getElementById("rejectTopicModal");

    // Đóng Modal khi bấm nút X hoặc Hủy
    document.querySelectorAll(".btn-close-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            if (createModal) createModal.style.display = "none";
            if (revisionModal) revisionModal.style.display = "none";
            if (confirmModal) confirmModal.style.display = "none";
            if (topicImportModal) topicImportModal.style.display = "none";
            if (rejectModal) rejectModal.style.display = "none";
        });
    });

    // Mở Modal Đề xuất đề tài mới vào Kho
    const openCreateBtn = document.getElementById("openCreateModalBtn");
    if (openCreateBtn) {
        openCreateBtn.addEventListener("click", () => {
            resetPoolTopicForm();
            if (createModal) createModal.style.display = "flex";
        });
    }

    const createForm = document.getElementById("createTopicForm");
    const poolTopicsBody = document.getElementById("tbody-mytopics");
    const modalTitle = document.getElementById("createTopicModalTitle");
    const saveButton = document.getElementById("savePoolTopicBtn");

    function resetPoolTopicForm() {
        editingPoolTopicId = null;
        if (createForm) createForm.reset();
        if (modalTitle) modalTitle.textContent = "Thêm đề tài vào kho hướng dẫn";
        if (saveButton) saveButton.textContent = "Lưu & Đăng lên kho";
    }

    if (poolTopicsBody) {
        poolTopicsBody.addEventListener("click", (event) => {
            const editButton = event.target.closest("[data-edit-pool-topic]");
            if (!editButton) return;

            const topic = allTopicsData.myPool.find(item => item._id === editButton.dataset.editPoolTopic);
            if (!topic) return;

            editingPoolTopicId = topic._id;
            document.getElementById("createTitle").value = topic.title || "";
            document.getElementById("createCategory").value = topic.category || "Web / Ứng dụng";
            document.getElementById("createDescription").value = topic.description || "";
            document.getElementById("createRequirements").value = topic.requirements || "";
            if (modalTitle) modalTitle.textContent = "Chỉnh sửa đề tài trong kho";
            if (saveButton) saveButton.textContent = "Lưu thay đổi";
            if (createModal) createModal.style.display = "flex";
        });
    }

    if (createForm) {
        createForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const titleInput = document.getElementById("createTitle")?.value.trim();
            const categoryInput = document.getElementById("createCategory")?.value;
            const descriptionInput = document.getElementById("createDescription")?.value.trim();
            const requirementsInput = document.getElementById("createRequirements")?.value.trim();

            if (!titleInput) {
                showAppNotification("Vui lòng nhập tên đề tài!");
                return;
            }
            try {
                const isEditing = Boolean(editingPoolTopicId);
                const url = isEditing
                    ? `${API_BASE_URL}/lecturer-pool/${encodeURIComponent(lecturerCode)}/${encodeURIComponent(editingPoolTopicId)}`
                    : `${API_BASE_URL}/lecturer-pool`;
                const response = await apiFetch(url, {
                    method: isEditing ? "PUT" : "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        lecturer_code: lecturerCode,
                        title: titleInput,
                        category: categoryInput || "Web / Ứng dụng",
                        description: descriptionInput || "Chưa có mô tả chi tiết",
                        requirements: requirementsInput || ""
                    })
                });

                const result = await response.json();
                if (response.ok && result.success) {
                    showAppNotification(isEditing
                        ? "Đã cập nhật đề tài trong kho."
                        : "Đề tài đã được thêm vào Kho và hiển thị cho sinh viên.");
                    if (createModal) createModal.style.display = "none";
                    resetPoolTopicForm();
                    
                    // Tải lại dữ liệu và tự động kích hoạt Tab Kho đề tài để xem kết quả
                    await loadLecturerTopics(lecturerCode, token);

                    const poolTabBtn = document.querySelector('.tab-btn[data-tab="my-topics"]');
                    if (poolTabBtn) poolTabBtn.click();
                } else {
                    showAppNotification("Lỗi: " + (result.message || "Không thể tạo đề tài"));
                }
            } catch (error) {
                console.error("Lỗi khi tạo đề tài:", error);
                showAppNotification("Lỗi kết nối máy chủ khi tạo đề tài!");
            }
        });
    }

    const openImportButton = document.getElementById("openTopicImportBtn");
    const importFileInput = document.getElementById("topicImportFile");
    const previewImportButton = document.getElementById("previewTopicImportBtn");
    const confirmImportButton = document.getElementById("confirmTopicImportBtn");
    const importSummary = document.getElementById("topicImportSummary");
    const importMessage = document.getElementById("topicImportMessage");
    const previewBody = document.getElementById("topicImportPreviewBody");
    let previewValidCount = 0;
    let previewedFile = null;

    function clearTopicImportPreview() {
        previewValidCount = 0;
        previewedFile = null;
        if (importSummary) importSummary.textContent = "";
        if (importMessage) {
            importMessage.textContent = "";
            importMessage.className = "topic-import-message";
        }
        if (confirmImportButton) confirmImportButton.disabled = true;
        if (previewBody) {
            previewBody.replaceChildren();
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 5;
            cell.className = "topic-import-empty";
            cell.textContent = "Chưa có dữ liệu xem trước.";
            row.appendChild(cell);
            previewBody.appendChild(row);
        }
    }

    function setTopicImportMessage(message, type) {
        if (!importMessage) return;
        importMessage.textContent = message;
        importMessage.className = `topic-import-message ${type || ""}`;
    }

    function renderTopicImportRows(rows) {
        if (!previewBody) return;
        previewBody.replaceChildren();
        rows.forEach(rowData => {
            const row = document.createElement("tr");
            const rowNumber = document.createElement("td");
            rowNumber.textContent = String(rowData.rowNumber);
            row.appendChild(rowNumber);

            const title = document.createElement("td");
            title.textContent = rowData.title || "";
            row.appendChild(title);

            const description = document.createElement("td");
            description.textContent = rowData.description || "";
            row.appendChild(description);

            const category = document.createElement("td");
            category.textContent = rowData.category || "";
            row.appendChild(category);

            const validation = document.createElement("td");
            validation.textContent = rowData.valid ? "Hợp lệ" : rowData.errors.join(" ");
            validation.className = rowData.valid ? "topic-import-valid" : "topic-import-invalid";
            row.appendChild(validation);
            previewBody.appendChild(row);
        });
    }

    async function sendTopicImportFile(url) {
        if (typeof window.verifyAuthSession === "function" &&
            !await window.verifyAuthSession("LECTURER")) {
            throw new Error("Không thể xác minh phiên Giảng viên.");
        }
        const file = importFileInput?.files?.[0];
        if (!file) throw new Error("Vui lòng chọn file Excel.");

        const formData = new FormData();
        formData.append("file", file);
        const response = await apiFetch(url, { method: "POST", body: formData });
        let result;
        try {
            result = await response.json();
        } catch (error) {
            throw new Error("Máy chủ trả về phản hồi không hợp lệ.");
        }
        if (!response.ok || !result.success) {
            throw new Error(result.message || "Không thể xử lý file Excel.");
        }
        return result.data;
    }

    openImportButton?.addEventListener("click", () => {
        if (importFileInput) importFileInput.value = "";
        clearTopicImportPreview();
        if (topicImportModal) topicImportModal.style.display = "flex";
    });
    importFileInput?.addEventListener("change", clearTopicImportPreview);

    document.getElementById("downloadTopicTemplateBtn")?.addEventListener("click", async () => {
        try {
            if (typeof window.verifyAuthSession === "function" &&
                !await window.verifyAuthSession("LECTURER")) {
                throw new Error("Không thể xác minh phiên Giảng viên.");
            }
            const response = await apiFetch(`${API_BASE_URL}/lecturer-pool/import/template`);
            if (!response.ok) {
                let result = {};
                try { result = await response.json(); } catch (error) { }
                throw new Error(result.message || "Không tải được file mẫu.");
            }
            const linkUrl = URL.createObjectURL(await response.blob());
            const link = document.createElement("a");
            link.href = linkUrl;
            link.download = "mau-import-de-tai.xlsx";
            link.click();
            setTimeout(() => URL.revokeObjectURL(linkUrl), 0);
        } catch (error) {
            setTopicImportMessage(error.message || "Không tải được file mẫu.", "error");
        }
    });

    previewImportButton?.addEventListener("click", async () => {
        clearTopicImportPreview();
        previewImportButton.disabled = true;
        previewImportButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang kiểm tra...</span>';
        try {
            const data = await sendTopicImportFile(`${API_BASE_URL}/lecturer-pool/import/preview`);
            previewValidCount = data.valid_count;
            const selectedFile = importFileInput.files[0];
            previewedFile = `${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}`;
            if (importSummary) importSummary.textContent = `Tổng ${data.total_rows} dòng: ${data.valid_count} hợp lệ, ${data.error_count} có lỗi.`;
            renderTopicImportRows(data.rows);
            if (confirmImportButton) confirmImportButton.disabled = previewValidCount === 0;
            setTopicImportMessage(
                previewValidCount
                    ? "Có thể import các dòng hợp lệ; các dòng lỗi sẽ được bỏ qua."
                    : "Không có dòng hợp lệ để import.",
                previewValidCount ? "success" : "error"
            );
        } catch (error) {
            setTopicImportMessage(error.message || "Không thể kiểm tra file Excel.", "error");
        } finally {
            previewImportButton.disabled = false;
            previewImportButton.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> <span>Kiểm tra & xem trước</span>';
        }
    });

    confirmImportButton?.addEventListener("click", async () => {
        const selectedFile = importFileInput?.files?.[0];
        if (!previewValidCount || !selectedFile ||
            previewedFile !== `${selectedFile.name}:${selectedFile.size}:${selectedFile.lastModified}`) return;
        confirmImportButton.disabled = true;
        if (previewImportButton) previewImportButton.disabled = true;
        confirmImportButton.textContent = "Đang import...";
        try {
            const data = await sendTopicImportFile(`${API_BASE_URL}/lecturer-pool/import`);
            previewValidCount = 0;
            if (importSummary) importSummary.textContent = `Đã import ${data.imported_count}/${data.total_rows} đề tài hợp lệ.`;
            setTopicImportMessage(data.message, data.imported_count ? "success" : "error");
            confirmImportButton.disabled = true;
            showAppNotification(data.message || "Đã import đề tài vào kho.");
            if (data.imported_count) await loadLecturerTopics(lecturerCode, token);
        } catch (error) {
            setTopicImportMessage(error.message || "Không thể import đề tài.", "error");
            confirmImportButton.disabled = false;
        } finally {
            if (previewImportButton) previewImportButton.disabled = false;
            confirmImportButton.textContent = "Import đề tài hợp lệ";
        }
    });

    const rejectReasonInput = document.getElementById("rejectReasonInput");
    const confirmRejectBtn = document.getElementById("confirmRejectBtn");

    // Xử lý nút Xác nhận Phê duyệt trong Confirm Modal
    const confirmActionBtn = document.getElementById("confirmActionBtn");
    if (confirmActionBtn) {
        confirmActionBtn.addEventListener("click", async () => {
            if (!currentSelectedTopicId || !currentActionType || currentActionType !== 'APPROVE') return;

            const feedbackMsg = 'Giảng viên đã đồng ý hướng dẫn đề tài này.';
            await executeStatusUpdate(currentSelectedTopicId, 'APPROVED', feedbackMsg, lecturerCode, token);
            if (confirmModal) confirmModal.style.display = "none";
        });
    }

    // Xử lý nút Xác nhận Từ chối (Modal nhập lý do)
    if (confirmRejectBtn) {
        confirmRejectBtn.addEventListener("click", async () => {
            const reason = rejectReasonInput ? rejectReasonInput.value.trim() : "";
            if (!reason) {
                showAppNotification("Vui lòng điền lý do từ chối đề tài!");
                return;
            }

            await executeStatusUpdate(currentSelectedTopicId, 'REJECTED', reason, lecturerCode, token);
            if (rejectModal) rejectModal.style.display = "none";
            if (rejectReasonInput) rejectReasonInput.value = "";
        });
    }

    // Xử lý nút Gửi Yêu Cầu Chỉnh Sửa trong Revision Modal
    const confirmRevisionBtn = document.getElementById("confirmRevisionBtn");
    if (confirmRevisionBtn) {
        confirmRevisionBtn.addEventListener("click", async () => {
            const noteInput = document.getElementById("revisionNoteInput");
            const note = noteInput ? noteInput.value.trim() : "";
            
            if (!note) {
                showAppNotification("Vui lòng nhập chi tiết phản hồi/yêu cầu chỉnh sửa cho sinh viên!");
                return;
            }

            await executeStatusUpdate(currentSelectedTopicId, 'NEED_REVISION', note, lecturerCode, token);
            if (revisionModal) revisionModal.style.display = "none";
            if (noteInput) noteInput.value = "";
        });
    }

    // Đóng khi nhấp ra ngoài Modal
    window.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal-overlay")) {
            e.target.style.display = "none";
        }
    });
}

/**
 * HÀM MỞ MODAL PHÊ DUYỆT / TỪ CHỐI (Gọi từ HTML inline onclick)
 */
window.openConfirmModal = function(topicId, actionType) {
    currentSelectedTopicId = topicId;
    currentActionType = actionType;

    const topic = allTopicsData.pending.find(t => t._id === topicId) || {};
    const codeDisplay = topic.topic_code || ("DT-" + (topic._id ? topic._id.slice(-5).toUpperCase() : "0000"));
    const leaderCode = topic.leader_code || topic.student_code || "N/A";
    const leaderName = topic.leader_name || leaderCode;

    const previewHtml = `
        <div class="preview-title">${escapeHtml(topic.title || 'Chưa có tên đề tài')}</div>
        <div class="preview-meta">
            <span><i class="fa-solid fa-hashtag"></i> <strong>${escapeHtml(codeDisplay)}</strong></span>
            <span><i class="fa-solid fa-user"></i> Trưởng nhóm: <strong>${escapeHtml(leaderName)}</strong>${leaderCode !== "N/A" ? ` (${escapeHtml(leaderCode)})` : ""}</span>
            <span><i class="fa-solid fa-layer-group"></i> ${escapeHtml(topic.category || 'Web / Ứng dụng')}</span>
        </div>
    `;

    const modal = document.getElementById("actionConfirmModal");
    const iconEl = document.getElementById("confirmIcon");
    const titleEl = document.getElementById("confirmTitle");
    const msgEl = document.getElementById("confirmMessage");
    const actionBtn = document.getElementById("confirmActionBtn");
    const approvePreview = document.getElementById("approveTopicPreview");

    if (actionType === 'APPROVE') {
        if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #16a34a; font-size: 3rem;"></i>';
        if (titleEl) titleEl.textContent = "Xác nhận phê duyệt";
        if (msgEl) msgEl.textContent = "Bạn có chắc chắn muốn phê duyệt đề tài này cho nhóm sinh viên không?";
        if (approvePreview) approvePreview.innerHTML = previewHtml;
        if (actionBtn) {
            actionBtn.style.backgroundColor = "#16a34a";
            actionBtn.innerHTML = '<i class="fa-solid fa-check"></i> Đồng ý phê duyệt';
        }

        if (modal) modal.style.display = "flex";
    } else {
        if (modal) modal.style.display = "none";
        const rejectModal = document.getElementById("rejectTopicModal");
        const rejectReasonInput = document.getElementById("rejectReasonInput");
        const rejectPreview = document.getElementById("rejectTopicPreview");
        if (rejectPreview) rejectPreview.innerHTML = previewHtml;
        if (rejectReasonInput) rejectReasonInput.value = "";
        if (rejectModal) rejectModal.style.display = "flex";
    }
};

/**
 * HÀM MỞ MODAL YÊU CẦU CHỈNH SỬA (Gọi từ HTML inline onclick)
 */
window.openRevisionModal = function(topicId) {
    currentSelectedTopicId = topicId;
    const topic = allTopicsData.pending.find(t => t._id === topicId) || {};
    const codeDisplay = topic.topic_code || ("DT-" + (topic._id ? topic._id.slice(-5).toUpperCase() : "0000"));
    const leaderCode = topic.leader_code || topic.student_code || "N/A";
    const leaderName = topic.leader_name || leaderCode;

    const revisionPreview = document.getElementById("revisionTopicPreview");
    if (revisionPreview) {
        revisionPreview.innerHTML = `
            <div class="preview-title">${escapeHtml(topic.title || 'Chưa có tên đề tài')}</div>
            <div class="preview-meta">
                <span><i class="fa-solid fa-hashtag"></i> <strong>${escapeHtml(codeDisplay)}</strong></span>
                <span><i class="fa-solid fa-user"></i> Trưởng nhóm: <strong>${escapeHtml(leaderName)}</strong>${leaderCode !== "N/A" ? ` (${escapeHtml(leaderCode)})` : ""}</span>
                <span><i class="fa-solid fa-layer-group"></i> ${escapeHtml(topic.category || 'Web / Ứng dụng')}</span>
            </div>
        `;
    }

    const modal = document.getElementById("revisionModal");
    if (modal) modal.style.display = "flex";
};

/**
 * GỌI API CẬP NHẬT TRẠNG THÁI ĐỀ TÀI (PUT /api/topics/update-status/:topic_id)
 */
async function executeStatusUpdate(topicId, status, feedback, lecturerCode, token) {
    try {
        const response = await apiFetch(`${API_BASE_URL}/update-status/${topicId}`, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ status, feedback })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            showAppNotification(result.message || "Cập nhật trạng thái đề tài thành công!");
            // Tải lại dữ liệu mới nhất từ Server (sẽ tự động cập nhật lại Kho đề tài sang Đã đăng ký)
            loadLecturerTopics(lecturerCode, token);
        } else {
            showAppNotification("Lỗi thao tác: " + (result.message || "Không thể cập nhật trạng thái đề tài!"));
        }
    } catch (error) {
        console.error("Lỗi khi cập nhật trạng thái:", error);
        showAppNotification("Lỗi kết nối máy chủ khi cập nhật trạng thái!");
    }
}
