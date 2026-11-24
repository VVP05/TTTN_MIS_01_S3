document.addEventListener("DOMContentLoaded", async () => {

    const API_BASE_URL = window.APP_CONFIG.API_BASE_URL + "/api/notifications";
    const user = await window.verifyAuthSession("ADMIN");
    if (!user) return;
    const authHeaders = headers => ({ ...headers });

    // STATE
    let notificationList = [];
    let filteredList = [];
    let deleteTargetId = null;
    let deleteTargetTitle = "";
    let currentPage = 1;
    let pageSize = 10;
    let activeQuickFilter = "all"; // 'all', 'pinned', 'published', 'draft'

    // DOM ELEMENTS (GIỮ NGUYÊN ID GỐC)
    const tableBody = document.getElementById("notifTableBody");
    const searchInput = document.getElementById("searchInput");
    const targetFilter = document.getElementById("targetFilter");
    const statusFilter = document.getElementById("statusFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");
    const activeFilterChips = document.getElementById("activeFilterChips");
    const pageSizeSelect = document.getElementById("pageSizeSelect");
    const paginationControls = document.getElementById("paginationControls");
    const paginationInfo = document.getElementById("paginationInfo");

    const notifModal = document.getElementById("notifModal");
    const modalTitle = document.getElementById("modalTitle");
    const openAddModalBtn = document.getElementById("openAddModalBtn");
    const closeNotifModal = document.getElementById("closeNotifModal");

    const notifForm = document.getElementById("notifForm");
    const notifIdInput = document.getElementById("notifId");
    const notifTitleInput = document.getElementById("notifTitle");
    const notifTargetSelect = document.getElementById("notifTarget");
    const notifPrioritySelect = document.getElementById("notifPriority");
    const notifContentInput = document.getElementById("notifContent");
    const notifPinnedCheckbox = document.getElementById("notifPinned");
    const titleCharCount = document.getElementById("titleCharCount");
    const contentCharCount = document.getElementById("contentCharCount");

    const saveDraftBtn = document.getElementById("saveDraftBtn");
    const publishBtn = document.getElementById("publishBtn");
    const publishBtnText = document.getElementById("publishBtnText");

    const viewModal = document.getElementById("viewModal");
    const closeViewModal = document.getElementById("closeViewModal");
    const closeViewBtn = document.getElementById("closeViewBtn");
    const viewPriorityBadge = document.getElementById("viewPriorityBadge");
    const viewTargetBadge = document.getElementById("viewTargetBadge");
    const viewPinnedBadge = document.getElementById("viewPinnedBadge");
    const viewTitle = document.getElementById("viewTitle");
    const viewDate = document.getElementById("viewDate");
    const viewContent = document.getElementById("viewContent");

    const deleteModal = document.getElementById("deleteModal");
    const deleteModalDesc = document.getElementById("deleteModalDesc");
    const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    const semesterSelect = document.getElementById("semesterSelect");
    const userNameElem = document.getElementById("userName");
    if (userNameElem) {
        userNameElem.textContent = user.full_name || user.fullName || "Quản Trị Viên";
    }

    // ── TẢI HỌC KỲ CHO TOPBAR ─────────────────────────────────
    async function loadSemesterOptions() {
        if (!semesterSelect) return;
        try {
            const res = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/semesters");
            const result = await res.json();
            const list = Array.isArray(result) ? result : (result.data || []);
            semesterSelect.replaceChildren();
            list.forEach(s => {
                const opt = document.createElement("option");
                opt.value = s._id || s.id || "";
                let name = s.semesterName || s.name || "Học kỳ";
                name = name.replace(/Học kì/gi, "Học kỳ");
                opt.textContent = name;
                if (s.isActive || s.is_active) opt.selected = true;
                semesterSelect.appendChild(opt);
            });
            if (semesterSelect.options.length === 0) {
                semesterSelect.innerHTML = `<option value="">Chưa có học kỳ</option>`;
            }
        } catch {
            semesterSelect.innerHTML = `<option value="">Lỗi tải học kỳ</option>`;
        }
    }

    // ── TẢI DANH SÁCH THÔNG BÁO ───────────────────────────────
    async function loadNotifications() {
        try {
            const response = await apiFetch(`${API_BASE_URL}/admin/all`, {
                headers: authHeaders({})
            });
            const result = await response.json();
            if (response.ok && result.success) {
                notificationList = Array.isArray(result.notifications) ? result.notifications : [];
                updateSummaryCards();
                handleFilter();
            } else {
                console.error("Lỗi tải thông báo:", result.message);
                notificationList = [];
                updateSummaryCards();
                renderNotifications([]);
            }
        } catch (error) {
            console.error("Lỗi kết nối khi tải thông báo:", error);
            notificationList = [];
            updateSummaryCards();
            renderNotifications([]);
        }
    }

    // ── CẬP NHẬT CARDS THỐNG KÊ ───────────────────────────────
    function updateSummaryCards() {
        const total = notificationList.length;
        const pinned = notificationList.filter(n => n.isPinned).length;
        const published = notificationList.filter(n => n.status === "published").length;
        const draft = notificationList.filter(n => n.status === "draft").length;

        document.getElementById("totalCount").textContent = total;
        document.getElementById("pinnedCount").textContent = pinned;
        document.getElementById("publishedCount").textContent = published;
        document.getElementById("draftCount").textContent = draft;
    }

    // ── FORMAT DATE HELPERS ───────────────────────────────────
    function formatDateFull(dateStr) {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    function formatTime(dateStr) {
        if (!dateStr) return "";
        const d = new Date(dateStr);
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    }

    function formatTimeAgo(dateStr) {
        if (!dateStr) return "";
        const now = new Date();
        const past = new Date(dateStr);
        const diffDays = Math.floor((now - past) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) return "Hôm nay";
        if (diffDays === 1) return "Hôm qua";
        if (diffDays < 30) return `${diffDays} ngày trước`;
        const diffMonths = Math.floor(diffDays / 30);
        return `${diffMonths} tháng trước`;
    }

    const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);

    // ── ACTIVE FILTER CHIPS ───────────────────────────────────
    function renderFilterChips() {
        if (!activeFilterChips) return;
        const chips = [];
        const q = searchInput?.value.trim();
        const t = targetFilter?.value;
        const s = statusFilter?.value;

        if (q) {
            chips.push(`<span class="filter-chip" data-clear="search">
                <i class="fa-solid fa-magnifying-glass"></i> "${escapeHtml(q)}" <i class="fa-solid fa-xmark"></i>
            </span>`);
        }
        if (t === "all") chips.push(`<span class="filter-chip" data-clear="target"><i class="fa-solid fa-users"></i> Tất cả người dùng <i class="fa-solid fa-xmark"></i></span>`);
        if (t === "students") chips.push(`<span class="filter-chip" data-clear="target"><i class="fa-solid fa-user-graduate"></i> Chỉ Sinh viên <i class="fa-solid fa-xmark"></i></span>`);
        if (t === "lecturers") chips.push(`<span class="filter-chip" data-clear="target"><i class="fa-solid fa-chalkboard-user"></i> Chỉ Giảng viên <i class="fa-solid fa-xmark"></i></span>`);

        if (s === "published") chips.push(`<span class="filter-chip" data-clear="status"><i class="fa-solid fa-circle-check"></i> Đã phát hành <i class="fa-solid fa-xmark"></i></span>`);
        if (s === "draft") chips.push(`<span class="filter-chip" data-clear="status"><i class="fa-solid fa-file-pen"></i> Bản nháp <i class="fa-solid fa-xmark"></i></span>`);

        activeFilterChips.innerHTML = chips.join("");
        activeFilterChips.style.display = chips.length ? "flex" : "none";

        if (resetFilterBtn) {
            resetFilterBtn.classList.toggle("active", chips.length > 0 || activeQuickFilter !== "all");
        }

        activeFilterChips.querySelectorAll(".filter-chip").forEach(chip => {
            chip.onclick = () => {
                const type = chip.dataset.clear;
                if (type === "search" && searchInput) searchInput.value = "";
                if (type === "target" && targetFilter) targetFilter.value = "";
                if (type === "status" && statusFilter) statusFilter.value = "";
                handleFilter();
            };
        });
    }

    // ── RENDER BẢNG DỮ LIỆU ───────────────────────────────────
    function renderNotifications(data) {
        filteredList = data;
        tableBody.innerHTML = "";

        const totalItems = data.length;
        const totalPages = Math.ceil(totalItems / pageSize) || 1;
        currentPage = Math.max(1, Math.min(currentPage, totalPages));

        if (totalItems === 0) {
            const hasFilter = searchInput?.value.trim() || targetFilter?.value || statusFilter?.value || activeQuickFilter !== "all";
            tableBody.innerHTML = `
                <tr><td colspan="7">
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fa-solid fa-bullhorn"></i></div>
                        <div class="empty-title">${hasFilter ? "Không tìm thấy thông báo phù hợp" : "Chưa có thông báo nào"}</div>
                        <div class="empty-desc">${hasFilter ? "Thử thay đổi từ khóa tìm kiếm hoặc điều chỉnh bộ lọc đối tượng / trạng thái." : "Bấm nút 'Tạo thông báo mới' để gửi thông báo đầu tiên tới sinh viên và giảng viên."}</div>
                        ${hasFilter ? `<button class="btn-action btn-action-outline btn-sm" id="emptyResetBtn"><i class="fa-solid fa-rotate-left"></i> Xóa bộ lọc</button>` : ""}
                    </div>
                </td></tr>`;
            if (paginationInfo) paginationInfo.textContent = "Hiển thị 0 trên tổng số 0 thông báo";
            if (paginationControls && window.renderAdminPagination) {
                window.renderAdminPagination(paginationControls, 0, 0, () => {});
            }
            const emptyResetBtn = document.getElementById("emptyResetBtn");
            if (emptyResetBtn) {
                emptyResetBtn.onclick = () => {
                    searchInput.value = "";
                    targetFilter.value = "";
                    statusFilter.value = "";
                    activeQuickFilter = "all";
                    syncQuickFilterUI();
                    handleFilter();
                };
            }
            return;
        }

        // Sắp xếp: Tin ghim đưa lên trước
        const sortedData = [...data].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

        const startIndex = (currentPage - 1) * pageSize;
        const pageData = sortedData.slice(startIndex, startIndex + pageSize);

        tableBody.innerHTML = pageData.map(item => {
            const notificationId = item._id || item.id;
            const isPinned = Boolean(item.isPinned);

            // Priority Badge
            let priorityBadge = "";
            if (item.priority === "danger") {
                priorityBadge = `<span class="priority-badge-chip danger"><i class="fa-solid fa-circle-exclamation"></i> Khẩn cấp</span>`;
            } else if (item.priority === "warning") {
                priorityBadge = `<span class="priority-badge-chip warning"><i class="fa-solid fa-triangle-exclamation"></i> Quan trọng</span>`;
            } else {
                priorityBadge = `<span class="priority-badge-chip info"><i class="fa-solid fa-circle-info"></i> Chung</span>`;
            }

            // Target Chip
            let targetChip = "";
            if (item.target === "students") {
                targetChip = `<span class="target-badge-chip students"><i class="fa-solid fa-user-graduate"></i> Sinh viên</span>`;
            } else if (item.target === "lecturers") {
                targetChip = `<span class="target-badge-chip lecturers"><i class="fa-solid fa-chalkboard-user"></i> Giảng viên</span>`;
            } else {
                targetChip = `<span class="target-badge-chip all"><i class="fa-solid fa-users"></i> Tất cả</span>`;
            }

            // Status Badge
            const isPublished = item.status === "published";
            const statusBadge = isPublished
                ? `<span class="status-pill-badge published"><span class="dot"></span>Đã đăng</span>`
                : `<span class="status-pill-badge draft"><span class="dot"></span>Bản nháp</span>`;

            // Preview nội dung 1 dòng
            const previewText = item.content ? escapeHtml(item.content.trim()) : "";

            return `
                <tr class="${isPinned ? 'row-pinned' : ''}">
                    <td class="text-center">
                        <button type="button" class="btn-pin-toggle ${isPinned ? 'pinned' : ''}" data-id="${notificationId}"
                            title="${isPinned ? 'Bỏ ghim thông báo' : 'Ghim thông báo lên đầu'}"
                            aria-label="${isPinned ? 'Bỏ ghim' : 'Ghim'}"
                            aria-pressed="${isPinned}">
                            <i class="fa-solid fa-thumbtack"></i>
                        </button>
                    </td>
                    <td>
                        <div class="notif-title-cell">
                            <span class="notif-title-text view-btn" data-id="${notificationId}" title="${escapeHtml(item.title)}">
                                ${escapeHtml(item.title)}
                            </span>
                            ${previewText ? `<span class="notif-preview-text">${previewText}</span>` : ""}
                        </div>
                    </td>
                    <td>${targetChip}</td>
                    <td>${priorityBadge}</td>
                    <td>
                        <div class="date-cell-box">
                            <span class="date-primary">${formatDateFull(item.createdAt)}</span>
                            <span class="date-relative">${formatTime(item.createdAt)} · ${formatTimeAgo(item.createdAt)}</span>
                        </div>
                    </td>
                    <td class="text-center">${statusBadge}</td>
                    <td class="text-center">
                        <div class="table-action-group">
                            <button class="btn-icon-action view view-btn" data-id="${notificationId}" title="Xem chi tiết" aria-label="Xem chi tiết">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                            <button class="btn-icon-action edit edit-btn" data-id="${notificationId}" title="Chỉnh sửa thông báo" aria-label="Sửa thông báo">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button class="btn-icon-action delete delete-btn" data-id="${notificationId}" title="Xóa thông báo" aria-label="Xóa thông báo">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

        // Cập nhật phân trang
        if (paginationInfo) {
            paginationInfo.textContent = `Hiển thị ${startIndex + 1} – ${startIndex + pageData.length} trên tổng số ${totalItems} thông báo`;
        }

        if (paginationControls && window.renderAdminPagination) {
            window.renderAdminPagination(paginationControls, currentPage, totalPages, (newPage) => {
                currentPage = newPage;
                renderNotifications(filteredList);
            });
        }

        attachTableEvents();
    }

    // ── LỌC VÀ TÌM KIẾM ───────────────────────────────────────
    function handleFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedTarget = targetFilter.value;
        const selectedStatus = statusFilter.value;

        const filtered = notificationList.filter(n => {
            const matchQuery = (n.title || "").toLowerCase().includes(query) || (n.content || "").toLowerCase().includes(query);
            const matchTarget = selectedTarget === "" || n.target === selectedTarget;
            const matchStatus = selectedStatus === "" || n.status === selectedStatus;

            let matchQuick = true;
            if (activeQuickFilter === "pinned") matchQuick = Boolean(n.isPinned);
            if (activeQuickFilter === "published") matchQuick = n.status === "published";
            if (activeQuickFilter === "draft") matchQuick = n.status === "draft";

            return matchQuery && matchTarget && matchStatus && matchQuick;
        });

        currentPage = 1;
        renderFilterChips();
        renderNotifications(filtered);
    }

    function syncQuickFilterUI() {
        document.querySelectorAll(".tab-btn").forEach(btn => {
            const isMatch = btn.dataset.tabFilter === activeQuickFilter;
            btn.classList.toggle("active", isMatch);
            btn.setAttribute("aria-pressed", isMatch ? "true" : "false");
        });
        document.querySelectorAll(".stat-card").forEach(card => {
            const isMatch = card.dataset.quickFilter === activeQuickFilter;
            card.classList.toggle("active-filter", isMatch && activeQuickFilter !== "all");
        });
    }

    // Quick filter tabs
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            activeQuickFilter = btn.dataset.tabFilter;
            syncQuickFilterUI();
            handleFilter();
        });
    });

    // Thẻ thống kê bấm được để lọc
    document.querySelectorAll(".stat-card").forEach(card => {
        card.addEventListener("click", () => {
            const filterKey = card.dataset.quickFilter;
            if (filterKey) {
                activeQuickFilter = (activeQuickFilter === filterKey && filterKey !== "all") ? "all" : filterKey;
                syncQuickFilterUI();
                handleFilter();
            }
        });
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                card.click();
            }
        });
    });

    searchInput.addEventListener("input", handleFilter);
    targetFilter.addEventListener("change", handleFilter);
    statusFilter.addEventListener("change", handleFilter);

    if (resetFilterBtn) {
        resetFilterBtn.addEventListener("click", () => {
            searchInput.value = "";
            targetFilter.value = "";
            statusFilter.value = "";
            activeQuickFilter = "all";
            syncQuickFilterUI();
            handleFilter();
        });
    }

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", () => {
            pageSize = parseInt(pageSizeSelect.value, 10) || 10;
            currentPage = 1;
            renderNotifications(filteredList);
        });
    }

    // ── BỘ ĐẾM KÝ TỰ MODAL ────────────────────────────────────
    function updateCharCounters() {
        if (titleCharCount && notifTitleInput) {
            titleCharCount.textContent = `${notifTitleInput.value.length} / 200`;
        }
        if (contentCharCount && notifContentInput) {
            contentCharCount.textContent = `${notifContentInput.value.length} ký tự`;
        }
    }

    if (notifTitleInput) notifTitleInput.addEventListener("input", updateCharCounters);
    if (notifContentInput) notifContentInput.addEventListener("input", updateCharCounters);

    // ── MỞ MODAL TẠO / SỬA ────────────────────────────────────
    openAddModalBtn.onclick = () => {
        modalTitle.textContent = "Soạn Thông Báo Mới";
        notifForm.reset();
        notifIdInput.value = "";
        updateCharCounters();
        notifModal.style.display = "flex";
        notifTitleInput.focus();
    };

    function openEditModal(id) {
        const item = notificationList.find(n => (n._id || n.id) === id);
        if (!item) return;

        modalTitle.textContent = "Chỉnh Sửa Thông Báo";
        notifIdInput.value = item._id || item.id;
        notifTitleInput.value = item.title || "";
        notifTargetSelect.value = item.target || "all";
        notifPrioritySelect.value = item.priority || "info";
        notifContentInput.value = item.content || "";
        notifPinnedCheckbox.checked = Boolean(item.isPinned);
        updateCharCounters();

        notifModal.style.display = "flex";
        notifTitleInput.focus();
    }

    // ── XỬ LÝ LƯU THÔNG BÁO (NHÁP HOẶC PHÁT HÀNH) ──────────────
    async function saveNotification(status) {
        if (!notifTitleInput.value.trim() || !notifContentInput.value.trim()) {
            window.showAppNotification?.("Vui lòng nhập đầy đủ Tiêu đề và Nội dung thông báo!");
            if (!notifTitleInput.value.trim()) notifTitleInput.focus();
            else notifContentInput.focus();
            return;
        }

        const id = notifIdInput.value;
        const payload = {
            title: notifTitleInput.value.trim(),
            content: notifContentInput.value.trim(),
            target: notifTargetSelect.value,
            priority: notifPrioritySelect.value,
            isPinned: notifPinnedCheckbox.checked,
            status: status
        };

        const activeBtn = status === "published" ? publishBtn : saveDraftBtn;
        const origContent = activeBtn.innerHTML;
        activeBtn.disabled = true;
        activeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...`;

        try {
            let response;
            if (id) {
                response = await apiFetch(`${API_BASE_URL}/${id}`, {
                    method: 'PUT',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(payload)
                });
            } else {
                response = await apiFetch(API_BASE_URL, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(payload)
                });
            }
            const result = await response.json();
            if (response.ok && result.success) {
                notifModal.style.display = "none";
                window.showAppNotification?.(status === "published" ? "Đã phát hành thông báo thành công!" : "Đã lưu bản nháp thông báo.");
                loadNotifications();
                return;
            }
            window.showAppNotification?.(result.message || 'Lỗi khi lưu thông báo');
        } catch (error) {
            console.error('Lỗi khi gửi thông báo:', error);
            window.showAppNotification?.('Lỗi khi gửi thông báo. Vui lòng thử lại.');
        } finally {
            activeBtn.disabled = false;
            activeBtn.innerHTML = origContent;
        }
    }

    saveDraftBtn.addEventListener('click', () => saveNotification('draft'));
    publishBtn.addEventListener('click', () => saveNotification('published'));

    // ── XEM CHI TIẾT THÔNG BÁO ────────────────────────────────
    function openViewModal(id) {
        const item = notificationList.find(n => (n._id || n.id) === id);
        if (!item) return;

        if (item.priority === "danger") {
            viewPriorityBadge.className = "priority-badge-chip danger";
            viewPriorityBadge.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Khẩn cấp`;
        } else if (item.priority === "warning") {
            viewPriorityBadge.className = "priority-badge-chip warning";
            viewPriorityBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Quan trọng`;
        } else {
            viewPriorityBadge.className = "priority-badge-chip info";
            viewPriorityBadge.innerHTML = `<i class="fa-solid fa-circle-info"></i> Chung`;
        }

        let targetText = "Tất cả người dùng";
        let targetCls = "all";
        let targetIcon = "fa-users";
        if (item.target === "students") {
            targetText = "Chỉ Sinh viên";
            targetCls = "students";
            targetIcon = "fa-user-graduate";
        } else if (item.target === "lecturers") {
            targetText = "Chỉ Giảng viên";
            targetCls = "lecturers";
            targetIcon = "fa-chalkboard-user";
        }
        viewTargetBadge.className = `target-badge-chip ${targetCls}`;
        viewTargetBadge.innerHTML = `<i class="fa-solid ${targetIcon}"></i> ${targetText}`;

        viewPinnedBadge.style.display = item.isPinned ? "inline-flex" : "none";
        viewTitle.textContent = item.title;
        viewDate.textContent = `${formatDateFull(item.createdAt)} lúc ${formatTime(item.createdAt)}`;
        viewContent.textContent = item.content;

        viewModal.style.display = "flex";
    }

    // ── ATTACH TABLE EVENTS ───────────────────────────────────
    function attachTableEvents() {
        // Toggle Pin trực tiếp
        tableBody.querySelectorAll(".btn-pin-toggle").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const item = notificationList.find(n => (n._id || n.id) === id);
                if (!item) return;

                const newPinned = !item.isPinned;
                item.isPinned = newPinned;
                updateSummaryCards();
                handleFilter();

                // Cập nhật lên backend
                try {
                    await apiFetch(`${API_BASE_URL}/${id}`, {
                        method: 'PUT',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ isPinned: newPinned })
                    });
                } catch (err) {
                    console.warn("Không thể lưu trạng thái ghim:", err);
                }
            };
        });

        // View
        tableBody.querySelectorAll(".view-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                openViewModal(id);
            };
        });

        // Edit
        tableBody.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                openEditModal(id);
            };
        });

        // Delete
        tableBody.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const item = notificationList.find(n => (n._id || n.id) === id);
                deleteTargetId = id;
                deleteTargetTitle = item ? item.title : "";
                if (deleteModalDesc) {
                    deleteModalDesc.innerHTML = deleteTargetTitle
                        ? `Bạn có chắc chắn muốn xóa thông báo <strong>"${escapeHtml(deleteTargetTitle)}"</strong> không? Thao tác này không thể hoàn tác.`
                        : `Bạn có chắc chắn muốn xóa thông báo này không? Thao tác này không thể hoàn tác.`;
                }
                deleteModal.style.display = "flex";
            };
        });
    }

    // ── XÁC NHẬN XÓA THÔNG BÁO ────────────────────────────────
    confirmDeleteBtn.onclick = async () => {
        if (deleteTargetId !== null) {
            const origText = confirmDeleteBtn.innerHTML;
            confirmDeleteBtn.disabled = true;
            confirmDeleteBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...`;

            try {
                const response = await apiFetch(`${API_BASE_URL}/${deleteTargetId}`, {
                    method: 'DELETE',
                    headers: authHeaders({})
                });
                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Lỗi xóa thông báo');
                }
                window.showAppNotification?.("Đã xóa thông báo thành công!");
                deleteModal.style.display = "none";
                deleteTargetId = null;
                await loadNotifications();
            } catch (error) {
                console.error('Lỗi xóa thông báo:', error);
                window.showAppNotification?.(error.message || 'Không thể xóa thông báo hiện tại.');
            } finally {
                confirmDeleteBtn.disabled = false;
                confirmDeleteBtn.innerHTML = origText;
            }
        }
    };

    // ── ĐÓNG MODALS ───────────────────────────────────────────
    closeNotifModal.onclick = () => notifModal.style.display = "none";
    closeViewModal.onclick = () => viewModal.style.display = "none";
    closeViewBtn.onclick = () => viewModal.style.display = "none";
    cancelDeleteBtn.onclick = () => deleteModal.style.display = "none";

    [notifModal, viewModal, deleteModal, logoutModal].forEach(modal => {
        if (modal) {
            modal.addEventListener("click", (e) => {
                if (e.target === modal) modal.style.display = "none";
            });
        }
    });

    // ── LOGOUT ────────────────────────────────────────────────
    openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    cancelLogout.onclick = () => logoutModal.style.display = "none";
    confirmLogout.onclick = () => {
        window.logoutSession?.();
        localStorage.clear();
        window.location.href = "../auth/index.html";
    };

    // ── KHỞI TẠO BAN ĐẦU ──────────────────────────────────────
    await Promise.all([loadSemesterOptions(), loadNotifications()]);
});
