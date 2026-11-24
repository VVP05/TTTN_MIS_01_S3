document.addEventListener("DOMContentLoaded", async () => {
    const baseUrl = window.APP_CONFIG.API_BASE_URL + "/api";
    const user = await window.verifyAuthSession("ADMIN");
    if (!user) return;

    // Load học kỳ động từ API
    await loadSemesterOptions();

    // DOM Elements
    const tableBody = document.getElementById("logsTableBody");
    const emptyState = document.getElementById("emptyState");
    const searchInput = document.getElementById("searchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");
    const roleFilter = document.getElementById("roleFilter");
    const actionTypeFilter = document.getElementById("actionTypeFilter");
    const dateRangeFilter = document.getElementById("dateRangeFilter");
    const statusFilter = document.getElementById("statusFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");
    const activeFilterChips = document.getElementById("activeFilterChips");
    const chipsList = document.getElementById("chipsList");
    const clearEmptyFilterBtn = document.getElementById("clearEmptyFilterBtn");

    const exportLogBtn = document.getElementById("exportLogBtn");
    const refreshBtn = document.getElementById("refreshBtn");
    const autoRefreshCheckbox = document.getElementById("autoRefreshCheckbox");

    const pageInfo = document.getElementById("logsPageInfo");
    const pageSizeSelect = document.getElementById("pageSizeSelect");
    const firstPageBtn = document.getElementById("firstLogsPage");
    const previousPageBtn = document.getElementById("previousLogsPage");
    const nextPageBtn = document.getElementById("nextLogsPage");
    const lastPageBtn = document.getElementById("lastLogsPage");
    const pageNumbersContainer = document.getElementById("pageNumbers");

    // Modal Detail Elements
    const logDetailModal = document.getElementById("logDetailModal");
    const closeDetailModalBtn = document.getElementById("closeDetailModalBtn");
    const confirmCloseDetailBtn = document.getElementById("confirmCloseDetailBtn");
    const copyLogDetailBtn = document.getElementById("copyLogDetailBtn");
    const detailLogId = document.getElementById("detailLogId");
    const detailTimestamp = document.getElementById("detailTimestamp");
    const detailStatusCode = document.getElementById("detailStatusCode");
    const detailUserAvatar = document.getElementById("detailUserAvatar");
    const detailUserName = document.getElementById("detailUserName");
    const detailUserMeta = document.getElementById("detailUserMeta");
    const detailUserRole = document.getElementById("detailUserRole");
    const detailActionType = document.getElementById("detailActionType");
    const detailIp = document.getElementById("detailIp");
    const detailActionText = document.getElementById("detailActionText");
    const detailEndpoint = document.getElementById("detailEndpoint");
    const detailUserAgent = document.getElementById("detailUserAgent");

    // Logout Elements
    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    // Summary Elements
    const statCards = document.querySelectorAll(".stat-card-clickable");
    const totalLogsEl = document.getElementById("totalLogs");
    const adminLogsEl = document.getElementById("adminLogs");
    const lecturerLogsEl = document.getElementById("lecturerLogs");
    const studentLogsEl = document.getElementById("studentLogs");
    const guestLogsEl = document.getElementById("guestLogs");

    const totalPercentEl = document.getElementById("totalPercent");
    const adminPercentEl = document.getElementById("adminPercent");
    const lecturerPercentEl = document.getElementById("lecturerPercent");
    const studentPercentEl = document.getElementById("studentPercent");
    const guestPercentEl = document.getElementById("guestPercent");

    // State Variables
    let currentPage = 1;
    let pageSize = 50;
    let totalFiltered = 0;
    let logList = [];
    let searchTimer = null;
    let autoRefreshTimer = null;
    let currentDetailItem = null;

    // Load danh sách học kỳ từ API để đồng bộ với toàn hệ thống
    async function loadSemesterOptions() {
        const semesterSelect = document.getElementById("semesterSelect");
        if (!semesterSelect) return;
        try {
            const res = await apiFetch(`${baseUrl}/semesters`);
            const json = await res.json();
            const semesters = json.data || json || [];
            if (Array.isArray(semesters) && semesters.length > 0) {
                semesterSelect.innerHTML = semesters.map(s => {
                    const name = s.semester_name || s.name || s.academic_year || "Học kỳ";
                    const active = s.is_active || s.status === "ACTIVE";
                    return `<option value="${s._id || s.id}" ${active ? "selected" : ""}>${name}${active ? " (Hiện tại)" : ""}</option>`;
                }).join("");
            } else {
                semesterSelect.innerHTML = '<option value="">Học kỳ 1 (2026 - 2027)</option>';
            }
        } catch (err) {
            semesterSelect.innerHTML = '<option value="">Học kỳ 1 (2026 - 2027)</option>';
        }
    }

    function getFilterParams() {
        const params = new URLSearchParams();
        const role = roleFilter?.value || "";
        const actionType = actionTypeFilter?.value || "";
        const search = searchInput?.value.trim() || "";
        const dateRange = dateRangeFilter?.value || "";
        const status = statusFilter?.value || "";

        if (role) params.set("role", role);
        if (actionType) params.set("actionType", actionType);
        if (search) params.set("search", search);
        if (dateRange) params.set("dateRange", dateRange);
        if (status) params.set("status", status);

        return params;
    }

    function formatNumber(num) {
        return (Number(num) || 0).toLocaleString("vi-VN");
    }

    function updateSummary(stats = {}) {
        const total = stats.total || 0;
        const admin = stats.ADMIN || 0;
        const lecturer = stats.LECTURER || 0;
        const student = stats.STUDENT || 0;
        const guest = stats.GUEST || 0;

        if (totalLogsEl) totalLogsEl.textContent = formatNumber(total);
        if (adminLogsEl) adminLogsEl.textContent = formatNumber(admin);
        if (lecturerLogsEl) lecturerLogsEl.textContent = formatNumber(lecturer);
        if (studentLogsEl) studentLogsEl.textContent = formatNumber(student);
        if (guestLogsEl) guestLogsEl.textContent = formatNumber(guest);

        const calcPercent = (val) => total > 0 ? `${Math.round((val / total) * 100)}% tổng` : "0% tổng";

        if (totalPercentEl) totalPercentEl.textContent = "100% tổng";
        if (adminPercentEl) adminPercentEl.textContent = calcPercent(admin);
        if (lecturerPercentEl) lecturerPercentEl.textContent = calcPercent(lecturer);
        if (studentPercentEl) studentPercentEl.textContent = calcPercent(student);
        if (guestPercentEl) guestPercentEl.textContent = calcPercent(guest);

        // Cập nhật trạng thái active của các thẻ thống kê
        const currentRole = roleFilter?.value || "";
        statCards.forEach(card => {
            const cardRole = card.getAttribute("data-role");
            if (cardRole === currentRole) {
                card.classList.add("active");
            } else {
                card.classList.remove("active");
            }
        });
    }

    function updateActiveFilterChips() {
        if (!activeFilterChips || !chipsList) return;
        const chips = [];

        const searchVal = searchInput?.value.trim();
        if (searchVal) {
            chips.push({ label: `Tìm kiếm: "${searchVal}"`, clear: () => { searchInput.value = ""; reloadFromFirstPage(); } });
        }

        const roleVal = roleFilter?.value;
        if (roleVal) {
            const roleLabels = { ADMIN: "Admin", LECTURER: "Giảng viên", STUDENT: "Sinh viên", GUEST: "Khách" };
            chips.push({ label: `Vai trò: ${roleLabels[roleVal] || roleVal}`, clear: () => { roleFilter.value = ""; reloadFromFirstPage(); } });
        }

        const actionVal = actionTypeFilter?.value;
        if (actionVal) {
            const actionLabels = { CREATE: "Tạo mới", UPDATE: "Cập nhật", DELETE: "Xóa", AUTH: "Xác thực", READ: "Xem/Tải", OTHER: "Khác" };
            chips.push({ label: `Thao tác: ${actionLabels[actionVal] || actionVal}`, clear: () => { actionTypeFilter.value = ""; reloadFromFirstPage(); } });
        }

        const dateVal = dateRangeFilter?.value;
        if (dateVal) {
            const dateLabels = { today: "Hôm nay", "7days": "7 ngày qua", "30days": "30 ngày qua" };
            chips.push({ label: `Thời gian: ${dateLabels[dateVal] || dateVal}`, clear: () => { dateRangeFilter.value = ""; reloadFromFirstPage(); } });
        }

        const statusVal = statusFilter?.value;
        if (statusVal) {
            const statusLabels = { SUCCESS: "Thành công (2xx, 3xx)", ERROR: "Lỗi (4xx, 5xx)" };
            chips.push({ label: `Kết quả: ${statusLabels[statusVal] || statusVal}`, clear: () => { statusFilter.value = ""; reloadFromFirstPage(); } });
        }

        if (chips.length > 0) {
            activeFilterChips.hidden = false;
            chipsList.innerHTML = "";
            chips.forEach(chip => {
                const tag = document.createElement("span");
                tag.className = "chip-tag";
                tag.innerHTML = `<span>${chip.label}</span> <i class="fa-solid fa-xmark chip-remove" title="Xóa điều kiện lọc này"></i>`;
                tag.querySelector(".chip-remove").addEventListener("click", chip.clear);
                chipsList.appendChild(tag);
            });
        } else {
            activeFilterChips.hidden = true;
            chipsList.innerHTML = "";
        }
    }

    function updatePagination() {
        const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
        if (pageInfo) {
            if (!totalFiltered) {
                pageInfo.textContent = "Không có nhật ký phù hợp.";
            } else {
                const first = (currentPage - 1) * pageSize + 1;
                const last = Math.min(currentPage * pageSize, totalFiltered);
                pageInfo.textContent = `Hiển thị ${formatNumber(first)}–${formatNumber(last)} trên ${formatNumber(totalFiltered)} nhật ký (trang ${currentPage}/${totalPages})`;
            }
        }

        if (firstPageBtn) firstPageBtn.disabled = currentPage <= 1;
        if (previousPageBtn) previousPageBtn.disabled = currentPage <= 1;
        if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
        if (lastPageBtn) lastPageBtn.disabled = currentPage >= totalPages;

        renderPageNumbers(totalPages);
    }

    function renderPageNumbers(totalPages) {
        if (!pageNumbersContainer) return;
        pageNumbersContainer.innerHTML = "";
        if (totalPages <= 1) return;

        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, currentPage + 2);

        if (currentPage <= 3) {
            endPage = Math.min(totalPages, 5);
        } else if (currentPage >= totalPages - 2) {
            startPage = Math.max(1, totalPages - 4);
        }

        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `page-num-btn ${i === currentPage ? "active" : ""}`;
            btn.textContent = i;
            btn.addEventListener("click", () => {
                if (currentPage !== i) {
                    currentPage = i;
                    fetchLogs();
                }
            });
            pageNumbersContainer.appendChild(btn);
        }
    }

    function renderSkeletonRows() {
        tableBody.innerHTML = "";
        for (let i = 0; i < 8; i++) {
            const tr = document.createElement("tr");
            tr.className = "skeleton-row";
            tr.innerHTML = `
                <td><div class="skeleton-box" style="width: 110px;"></div></td>
                <td><div class="skeleton-box" style="width: 140px;"></div></td>
                <td><div class="skeleton-box" style="width: 70px;"></div></td>
                <td><div class="skeleton-box" style="width: 90px;"></div></td>
                <td><div class="skeleton-box" style="width: 280px;"></div></td>
                <td><div class="skeleton-box" style="width: 50px; margin: 0 auto;"></div></td>
                <td><div class="skeleton-box" style="width: 90px; margin: 0 auto;"></div></td>
            `;
            tableBody.appendChild(tr);
        }
    }

    async function fetchLogs() {
        const params = getFilterParams();
        params.set("page", String(currentPage));
        params.set("limit", String(pageSize));

        renderSkeletonRows();
        if (emptyState) emptyState.hidden = true;

        try {
            const response = await apiFetch(`${baseUrl}/activity-logs?${params}`);
            const result = await response.json();
            if (!response.ok || !result?.success || !Array.isArray(result.data)) {
                throw new Error(result?.message || "Không tải được nhật ký hoạt động.");
            }

            currentPage = result.page;
            totalFiltered = result.total;

            logList = result.data.map(item => {
                const rawName = String(item.user_name || "").trim();
                const isGuest = !item.user_code || ["khách", "guest"].includes(rawName.toLowerCase());
                return {
                    ...item,
                    timestamp: item.createdAt || item.updatedAt,
                    userName: isGuest ? "Khách" : (rawName || item.user_code || "Người dùng"),
                    userCode: item.user_code || "-",
                    email: item.email || "-",
                    role: item.role || "GUEST",
                    actionType: item.actionType || "OTHER",
                    actionText: item.actionText || `${item.method || ""} ${item.url || ""}`,
                    endpoint: `${item.method || "GET"} ${item.url || ""}`,
                    ip: normalizeIpDisplay(item.ip),
                    statusCode: item.statusCode || 200,
                    userAgent: item.userAgent || "Không xác định"
                };
            });

            updateSummary(result.stats);
            renderLogs(logList);
            updatePagination();
            updateActiveFilterChips();
        } catch (error) {
            console.error("Lỗi tải nhật ký hoạt động:", error);
            tableBody.innerHTML = "";
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 7;
            cell.className = "text-center";
            cell.style.cssText = "padding:32px 16px;color:#ef4444;font-weight:500;";
            cell.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="font-size:24px;margin-bottom:8px;display:block;"></i>${error.message || "Không thể tải nhật ký hoạt động."}`;
            row.appendChild(cell);
            tableBody.appendChild(row);
            totalFiltered = 0;
            updatePagination();
        }
    }

    function normalizeIpDisplay(rawIp) {
        if (!rawIp) return "127.0.0.1";
        let ip = String(rawIp).trim();
        if (ip.startsWith("::ffff:")) ip = ip.replace("::ffff:", "");
        if (ip === "::1" || ip === "localhost") ip = "127.0.0.1";
        return ip;
    }

    function formatTimeRelative(dateStr) {
        if (!dateStr) return "";
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return "";
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return "Vừa xong";
        if (diffMins < 60) return `${diffMins} phút trước`;
        if (diffHours < 24) return `${diffHours} giờ trước`;
        if (diffDays < 30) return `${diffDays} ngày trước`;
        return date.toLocaleDateString("vi-VN");
    }

    function formatDateTimeParts(dateStr) {
        if (!dateStr) return { time: "-", date: "-", relative: "" };
        const date = new Date(dateStr);
        if (Number.isNaN(date.getTime())) return { time: "-", date: "-", relative: "" };

        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        const time = `${hours}:${minutes}:${seconds}`;

        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        const dateFormatted = `${day}/${month}/${year}`;

        return {
            time,
            date: dateFormatted,
            relative: formatTimeRelative(dateStr)
        };
    }

    function getInitials(name) {
        if (!name || name === "Khách") return '<i class="fa-solid fa-user"></i>';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }

    function getAvatarBgColor(role) {
        switch (role) {
            case "ADMIN": return "linear-gradient(135deg, #2563EB, #3B82F6)";
            case "LECTURER": return "linear-gradient(135deg, #7C3AED, #A855F7)";
            case "STUDENT": return "linear-gradient(135deg, #D97706, #F59E0B)";
            default: return "linear-gradient(135deg, #64748B, #94A3B8)";
        }
    }

    const roleConfig = {
        ADMIN: { label: "ADMIN", className: "role-admin" },
        LECTURER: { label: "GIẢNG VIÊN", className: "role-lecturer" },
        STUDENT: { label: "SINH VIÊN", className: "role-student" },
        GUEST: { label: "KHÁCH", className: "role-guest" }
    };

    const actionConfig = {
        CREATE: { label: "TẠO MỚI", icon: "fa-plus", className: "action-create" },
        UPDATE: { label: "CẬP NHẬT", icon: "fa-pen-to-square", className: "action-update" },
        DELETE: { label: "XÓA", icon: "fa-trash-can", className: "action-delete" },
        AUTH: { label: "XÁC THỰC", icon: "fa-right-to-bracket", className: "action-auth" },
        READ: { label: "XEM / TẢI", icon: "fa-eye", className: "action-read" },
        OTHER: { label: "KHÁC", icon: "fa-bolt", className: "action-other" }
    };

    function renderLogs(data) {
        tableBody.innerHTML = "";

        if (data.length === 0) {
            if (emptyState) emptyState.hidden = false;
            return;
        }

        if (emptyState) emptyState.hidden = true;

        data.forEach(item => {
            const tr = document.createElement("tr");

            // Đánh dấu dòng lỗi HTTP
            const statusCode = Number(item.statusCode) || 200;
            let statusGroup = "2xx";
            if (statusCode >= 500) {
                statusGroup = "5xx";
                tr.classList.add("row-error-5xx");
            } else if (statusCode >= 400) {
                statusGroup = "4xx";
                tr.classList.add("row-error-4xx");
            } else if (statusCode >= 300) {
                statusGroup = "3xx";
            }

            const dt = formatDateTimeParts(item.timestamp);
            const roleInfo = roleConfig[item.role] || roleConfig.GUEST;
            const actionInfo = actionConfig[item.actionType] || actionConfig.OTHER;
            const initials = getInitials(item.userName);
            const avatarBg = getAvatarBgColor(item.role);

            tr.innerHTML = `
                <td class="time-cell" title="${dt.relative}">
                    <div class="time-main"><i class="fa-regular fa-clock" style="font-size:12px;color:#94a3b8;"></i> ${dt.time}</div>
                    <div class="time-sub">${dt.date} • ${dt.relative}</div>
                </td>
                <td>
                    <div class="user-cell-wrapper">
                        <div class="user-initial-avatar" style="background:${avatarBg};">${initials}</div>
                        <div class="user-meta-info">
                            <span class="user-main-name" title="${item.userName}">${item.userName}</span>
                            <span class="user-sub-code">${item.userCode !== "-" ? item.userCode : (item.email !== "-" ? item.email : "Chưa đăng nhập")}</span>
                        </div>
                    </div>
                </td>
                <td>
                    <span class="role-pill ${roleInfo.className}">${roleInfo.label}</span>
                </td>
                <td>
                    <span class="action-pill ${actionInfo.className}">
                        <i class="fa-solid ${actionInfo.icon}"></i> ${actionInfo.label}
                    </span>
                </td>
                <td>
                    <div class="action-detail-wrapper" title="${item.actionText} (${item.endpoint})">
                        <div class="action-text-main">${item.actionText}</div>
                        <div class="action-text-mono">${item.endpoint}</div>
                    </div>
                </td>
                <td class="text-center">
                    <span class="status-pill status-${statusGroup}">${statusCode}</span>
                </td>
                <td class="text-center">
                    <span class="ip-code" title="Bấm để sao chép IP">${item.ip}</span>
                </td>
            `;

            // Bấm vào IP để sao chép
            const ipBadge = tr.querySelector(".ip-code");
            ipBadge.addEventListener("click", (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(item.ip).then(() => {
                    window.showAppNotification?.(`Đã sao chép địa chỉ IP: ${item.ip}`);
                }).catch(() => {});
            });

            // Bấm vào dòng để mở Modal chi tiết
            tr.addEventListener("click", () => {
                openLogDetailModal(item);
            });

            tableBody.appendChild(tr);
        });
    }

    function openLogDetailModal(item) {
        currentDetailItem = item;
        const dt = formatDateTimeParts(item.timestamp);
        const roleInfo = roleConfig[item.role] || roleConfig.GUEST;
        const actionInfo = actionConfig[item.actionType] || actionConfig.OTHER;
        const statusCode = Number(item.statusCode) || 200;

        let statusGroup = "2xx";
        if (statusCode >= 500) statusGroup = "5xx";
        else if (statusCode >= 400) statusGroup = "4xx";
        else if (statusCode >= 300) statusGroup = "3xx";

        if (detailLogId) detailLogId.textContent = `ID: ${item._id || item.id || "N/A"}`;
        if (detailTimestamp) detailTimestamp.textContent = `${dt.time} - ${dt.date} (${dt.relative})`;
        if (detailStatusCode) {
            detailStatusCode.innerHTML = `<span class="status-pill status-${statusGroup}">${statusCode}</span>`;
        }

        if (detailUserAvatar) {
            detailUserAvatar.innerHTML = getInitials(item.userName);
            detailUserAvatar.style.background = getAvatarBgColor(item.role);
        }
        if (detailUserName) detailUserName.textContent = item.userName;
        if (detailUserMeta) {
            detailUserMeta.textContent = `Mã: ${item.userCode !== "-" ? item.userCode : "Không"} | Email: ${item.email}`;
        }
        if (detailUserRole) {
            detailUserRole.className = `role-pill ${roleInfo.className}`;
            detailUserRole.textContent = roleInfo.label;
        }

        if (detailActionType) {
            detailActionType.innerHTML = `
                <span class="action-pill ${actionInfo.className}">
                    <i class="fa-solid ${actionInfo.icon}"></i> ${actionInfo.label}
                </span>
            `;
        }

        if (detailIp) detailIp.textContent = item.ip;
        if (detailActionText) detailActionText.textContent = item.actionText;
        if (detailEndpoint) detailEndpoint.textContent = `${item.method || "GET"} ${item.url || ""}`;
        if (detailUserAgent) detailUserAgent.textContent = item.userAgent || "Không có thông tin User-Agent";

        if (logDetailModal) logDetailModal.hidden = false;
    }

    function closeDetailModal() {
        if (logDetailModal) logDetailModal.hidden = true;
        currentDetailItem = null;
    }

    closeDetailModalBtn?.addEventListener("click", closeDetailModal);
    confirmCloseDetailBtn?.addEventListener("click", closeDetailModal);
    logDetailModal?.addEventListener("click", (e) => {
        if (e.target === logDetailModal) closeDetailModal();
    });

    copyLogDetailBtn?.addEventListener("click", () => {
        if (!currentDetailItem) return;
        const textToCopy = `
[NHẬT KÝ HOẠT ĐỘNG HỆ THỐNG]
ID: ${currentDetailItem._id || currentDetailItem.id || "N/A"}
Thời gian: ${formatDateTimeParts(currentDetailItem.timestamp).time} ${formatDateTimeParts(currentDetailItem.timestamp).date}
Người thực hiện: ${currentDetailItem.userName} (${currentDetailItem.userCode || "N/A"})
Vai trò: ${currentDetailItem.role}
Hành động: ${currentDetailItem.actionText}
Endpoint: ${currentDetailItem.method} ${currentDetailItem.url}
Mã HTTP: ${currentDetailItem.statusCode}
IP: ${currentDetailItem.ip}
User-Agent: ${currentDetailItem.userAgent}
`.trim();

        navigator.clipboard.writeText(textToCopy).then(() => {
            window.showAppNotification?.("Đã sao chép chi tiết nhật ký vào bộ nhớ tạm.");
        }).catch(() => {
            window.showAppNotification?.("Không thể sao chép dữ liệu.");
        });
    });

    function reloadFromFirstPage() {
        currentPage = 1;
        fetchLogs();
    }

    // Xử lý tìm kiếm với debounce
    searchInput?.addEventListener("input", () => {
        if (clearSearchBtn) clearSearchBtn.hidden = !searchInput.value.trim();
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(reloadFromFirstPage, 350);
    });

    clearSearchBtn?.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        clearSearchBtn.hidden = true;
        reloadFromFirstPage();
    });

    // Lọc vai trò, thao tác, khoảng ngày, kết quả
    roleFilter?.addEventListener("change", reloadFromFirstPage);
    actionTypeFilter?.addEventListener("change", reloadFromFirstPage);
    dateRangeFilter?.addEventListener("change", reloadFromFirstPage);
    statusFilter?.addEventListener("change", reloadFromFirstPage);

    // Bấm các thẻ thống kê nhanh để lọc vai trò
    statCards.forEach(card => {
        card.addEventListener("click", () => {
            const role = card.getAttribute("data-role") || "";
            if (roleFilter) {
                roleFilter.value = role;
                reloadFromFirstPage();
            }
        });
    });

    // Nút đặt lại bộ lọc
    function resetAllFilters() {
        if (searchInput) searchInput.value = "";
        if (clearSearchBtn) clearSearchBtn.hidden = true;
        if (roleFilter) roleFilter.value = "";
        if (actionTypeFilter) actionTypeFilter.value = "";
        if (dateRangeFilter) dateRangeFilter.value = "";
        if (statusFilter) statusFilter.value = "";
        reloadFromFirstPage();
    }

    resetFilterBtn?.addEventListener("click", resetAllFilters);
    clearEmptyFilterBtn?.addEventListener("click", resetAllFilters);

    // Phân trang
    pageSizeSelect?.addEventListener("change", () => {
        pageSize = Number(pageSizeSelect.value) || 50;
        reloadFromFirstPage();
    });

    firstPageBtn?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage = 1;
            fetchLogs();
        }
    });

    previousPageBtn?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            fetchLogs();
        }
    });

    nextPageBtn?.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
        if (currentPage < totalPages) {
            currentPage++;
            fetchLogs();
        }
    });

    lastPageBtn?.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
        if (currentPage < totalPages) {
            currentPage = totalPages;
            fetchLogs();
        }
    });

    // Nút làm mới thủ công
    refreshBtn?.addEventListener("click", () => {
        refreshBtn.classList.add("spinning");
        fetchLogs().finally(() => {
            window.setTimeout(() => {
                refreshBtn.classList.remove("spinning");
            }, 600);
        });
    });

    // Tự động làm mới mỗi 30 giây
    autoRefreshCheckbox?.addEventListener("change", () => {
        if (autoRefreshCheckbox.checked) {
            autoRefreshTimer = window.setInterval(() => {
                fetchLogs();
            }, 30000);
            window.showAppNotification?.("Đã bật tự động làm mới mỗi 30 giây.");
        } else {
            if (autoRefreshTimer) {
                window.clearInterval(autoRefreshTimer);
                autoRefreshTimer = null;
            }
            window.showAppNotification?.("Đã tắt tự động làm mới.");
        }
    });

    // Xuất log ra file CSV
    exportLogBtn?.addEventListener("click", async () => {
        const originalContent = exportLogBtn.innerHTML;
        exportLogBtn.disabled = true;
        exportLogBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang xuất...</span>';
        try {
            const params = getFilterParams();
            const response = await apiFetch(`${baseUrl}/activity-logs/export?${params}`);
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.message || "Không thể xuất nhật ký hoạt động.");
            }

            const blob = await response.blob();
            if (!blob.size) throw new Error("File nhật ký tải về đang trống.");
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `system-activity-logs-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            window.showAppNotification?.("Đã xuất file nhật ký CSV thành công.");
        } catch (error) {
            console.error("Lỗi xuất nhật ký hoạt động:", error);
            window.showAppNotification?.(error.message || "Không thể xuất nhật ký hoạt động.");
        } finally {
            exportLogBtn.disabled = false;
            exportLogBtn.innerHTML = originalContent;
        }
    });

    // Đăng xuất Modal
    openLogoutBtn?.addEventListener("click", () => {
        if (logoutModal) logoutModal.style.display = "flex";
    });

    cancelLogout?.addEventListener("click", () => {
        if (logoutModal) logoutModal.style.display = "none";
    });

    confirmLogout?.addEventListener("click", () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "../auth/index.html";
    });

    // Tải dữ liệu ban đầu
    await fetchLogs();
});
