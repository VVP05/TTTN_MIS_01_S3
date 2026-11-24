/**
 * =========================================================
 * ADMIN LECTURERS JS
 * Quản lý danh sách giảng viên: Tìm kiếm, lọc, phân trang, thêm, sửa, xóa,
 * cập nhật chỉ tiêu hàng loạt, đồng bộ giao diện quản trị hiện đại.
 * =========================================================
 */

document.addEventListener("DOMContentLoaded", async () => {
    // 1. KIỂM TRA PHIÊN ĐĂNG NHẬP ADMIN
    const verifiedAdminUser = await window.verifyAuthSession("ADMIN");
    if (!verifiedAdminUser) return;

    let lecturerList = [];
    let currentEditingId = null;
    const selectedLecturerIds = new Set();
    let pageSize = 10;
    let currentPage = 1;
    let activeQuickFilter = "ALL";
    let filteredLecturers = [];
    let currentPageLecturers = [];

    // DOM ELEMENTS
    const tableBody = document.getElementById("lecturerTableBody");
    const paginationControls = document.getElementById("lecturersPagination");
    const paginationInfo = document.getElementById("paginationInfo");
    const pageSizeSelect = document.getElementById("pageSizeSelect");
    const checkAll = document.getElementById("checkAll");
    
    // Bulk Quota Elements
    const bulkQuotaToolbar = document.getElementById("bulkQuotaToolbar");
    const bulkSelectionCount = document.getElementById("bulkSelectionCount");
    const bulkQuotaInput = document.getElementById("bulkQuotaInput");
    const applyBulkQuotaBtn = document.getElementById("applyBulkQuotaBtn");
    const deleteSelectedLecturersBtn = document.getElementById("deleteSelectedLecturersBtn");
    const clearLecturerSelectionBtn = document.getElementById("clearLecturerSelectionBtn");

    // Filter Elements
    const searchInput = document.getElementById("searchInput");
    const deptFilter = document.getElementById("deptFilter");
    const degreeFilter = document.getElementById("degreeFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");
    const activeFilterChips = document.getElementById("activeFilterChips");

    // Stat Cards
    const statTotalEl = document.getElementById("statTotalLecturers");
    const statActiveEl = document.getElementById("statActiveLecturers");
    const statAvailableEl = document.getElementById("statAvailableLecturers");
    const statFullEl = document.getElementById("statFullLecturers");

    // Topbar & Modals
    const semesterSelect = document.getElementById("semesterSelect");
    const lecturerModal = document.getElementById("lecturerModal");
    const lecturerForm = document.getElementById("lecturerForm");
    const openAddBtn = document.getElementById("openAddBtn");
    const closeLecturerModal = document.getElementById("closeLecturerModal");
    const cancelLecturerModal = document.getElementById("cancelLecturerModal");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    const avatarPalette = ["#2563EB", "#059669", "#D97706", "#7C3AED", "#DB2777", "#0891B2", "#4F46E5"];

    function getAvatarColor(name = "") {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const index = Math.abs(hash) % avatarPalette.length;
        return avatarPalette[index];
    }

    function getAvatarInitials(name, fallback) {
        const words = String(name || "").trim().split(/\s+/).filter(Boolean);
        return words.length
            ? words.slice(-2).map(word => word.charAt(0).toLocaleUpperCase("vi-VN")).join("")
            : fallback;
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function hasAdminSession() {
        return Boolean(verifiedAdminUser);
    }

    // 2. TẢI HỌC KỲ ĐỘNG TỪ DATABASE (ĐỒNG BỘ TOÀN HỆ THỐNG)
    async function loadSemesterOptions() {
        if (!semesterSelect) return;
        try {
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/semesters`);
            const result = await response.json();
            if (response.ok && result.success && Array.isArray(result.data)) {
                const semesters = result.data.filter(s => s?._id && s.name);
                semesterSelect.replaceChildren();

                const allOption = document.createElement("option");
                allOption.value = "all";
                allOption.textContent = "Toàn bộ học kỳ";
                semesterSelect.append(allOption);

                semesters.forEach(s => {
                    const opt = document.createElement("option");
                    opt.value = s._id;
                    opt.textContent = s.name;
                    semesterSelect.append(opt);
                });

                const activeSemester = semesters.find(s => s.is_active);
                semesterSelect.value = activeSemester?._id || "all";
            }
        } catch (error) {
            console.error("Lỗi tải danh sách học kỳ:", error);
        }
    }

    // 3. HIỂN THỊ SKELETON KHI TẢI BẢNG
    function showSkeletonRows() {
        if (!tableBody) return;
        tableBody.innerHTML = Array(5).fill(0).map(() => `
            <tr class="skeleton-row">
                <td><div class="skeleton-cell-bar" style="width: 16px;"></div></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="skeleton-cell-bar" style="width: 34px; height: 34px; border-radius: 50%;"></div>
                        <div>
                            <div class="skeleton-cell-bar" style="width: 120px; height: 14px; margin-bottom: 4px;"></div>
                            <div class="skeleton-cell-bar" style="width: 60px; height: 12px;"></div>
                        </div>
                    </div>
                </td>
                <td><div class="skeleton-cell-bar" style="width: 60px; height: 24px; border-radius: 12px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 110px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 130px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 100px; height: 20px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 60px; margin: auto;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 60px; margin: auto;"></div></td>
            </tr>
        `).join('');
    }

    // 4. TẢI DỮ LIỆU GIẢNG VIÊN TỪ API
    async function fetchLecturers() {
        showSkeletonRows();
        try {
            const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/lecturers");
            const result = await response.json();

            if (!response.ok || !result || (!Array.isArray(result) && !Array.isArray(result.data))) {
                throw new Error(result?.message || "Không tải được dữ liệu giảng viên");
            }

            const rawList = Array.isArray(result) ? result : result.data || [];

            lecturerList = rawList.map(item => ({
                id: item.user_code || item.id || "",
                name: item.full_name || item.name || "Chưa cập nhật",
                degree: item.degree || "Chưa cập nhật",
                dept: item.dept || "Chưa cập nhật",
                email: item.email || "Chưa cập nhật",
                groupsCount: Number(item.groupsCount || 0),
                topicsCount: Number(item.topicsCount || 0),
                maxQuota: Number(item.max_quota ?? 5)
            }));

            const availableIds = new Set(lecturerList.map(item => item.id));
            selectedLecturerIds.forEach(id => {
                if (!availableIds.has(id)) selectedLecturerIds.delete(id);
            });

            populateDeptFilterOptions();
            updateQuickStats();
            handleFilter(false);
        } catch (error) {
            console.error("Lỗi tải giảng viên:", error);
            if (tableBody) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="text-center" style="padding: 40px 20px;">
                            <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; color: var(--danger); margin-bottom: 8px; display: block;"></i>
                            <span style="color: var(--danger); font-weight: 600;">Không thể tải dữ liệu giảng viên từ máy chủ.</span>
                            <div style="margin-top: 12px;">
                                <button type="button" class="btn btn-outline" onclick="location.reload()"><i class="fa-solid fa-rotate-right"></i> Tải lại trang</button>
                            </div>
                        </td>
                    </tr>
                `;
            }
            if (paginationInfo) paginationInfo.textContent = "Hiển thị 0 / 0 giảng viên";
            currentPageLecturers = [];
            if (window.renderAdminPagination && paginationControls) {
                window.renderAdminPagination(paginationControls, 0, 0, () => {});
            }
            syncSelectionControls();
        }
    }

    // 5. CẬP NHẬT 4 THẺ THỐNG KÊ NHANH (QUICK STATS)
    function updateQuickStats() {
        const total = lecturerList.length;
        const active = lecturerList.filter(l => (l.groupsCount || 0) > 0).length;
        const available = lecturerList.filter(l => (l.groupsCount || 0) < (l.maxQuota || 0)).length;
        const full = lecturerList.filter(l => (l.groupsCount || 0) >= (l.maxQuota || 0) && (l.maxQuota || 0) > 0).length;

        if (statTotalEl) statTotalEl.textContent = total;
        if (statActiveEl) statActiveEl.textContent = active;
        if (statAvailableEl) statAvailableEl.textContent = available;
        if (statFullEl) statFullEl.textContent = full;
    }

    // Click quick stats cards để lọc nhanh
    document.querySelectorAll(".stat-card-mini").forEach(card => {
        card.addEventListener("click", () => {
            const filterKey = card.getAttribute("data-quick-filter");
            document.querySelectorAll(".stat-card-mini").forEach(c => c.classList.remove("active-filter"));

            if (activeQuickFilter === filterKey && filterKey !== "ALL") {
                activeQuickFilter = "ALL";
            } else {
                activeQuickFilter = filterKey || "ALL";
                if (activeQuickFilter !== "ALL") {
                    card.classList.add("active-filter");
                }
            }
            handleFilter(true);
        });
    });

    // 6. NẠP TỰ ĐỘNG BỘ MÔN VÀO SELECT
    function populateDeptFilterOptions() {
        if (!deptFilter) return;
        const currentSelected = deptFilter.value;
        const uniqueDepts = Array.from(new Set(lecturerList.map(l => l.dept).filter(Boolean))).sort();

        // Giữ lại option đầu tiên "Tất cả Bộ môn"
        deptFilter.innerHTML = '<option value="">Tất cả Bộ môn</option>';

        // Thêm các bộ môn mặc định nếu chưa có
        const defaultDepts = [
            "Công nghệ phần mềm",
            "Hệ thống thông tin",
            "Mạng máy tính & Viễn thông",
            "Khoa học máy tính"
        ];
        const combined = Array.from(new Set([...defaultDepts, ...uniqueDepts])).sort();

        combined.forEach(dept => {
            const opt = document.createElement("option");
            opt.value = dept;
            opt.textContent = dept;
            deptFilter.appendChild(opt);
        });

        if (currentSelected && combined.includes(currentSelected)) {
            deptFilter.value = currentSelected;
        }
    }

    // 7. CẬP NHẬT TÓM TẮT PHÂN TRANG
    function updatePageSummary(start, end, total) {
        if (!paginationInfo) return;
        paginationInfo.textContent = total
            ? `Hiển thị ${start} - ${end} trên tổng số ${total} giảng viên`
            : "Hiển thị 0 / 0 giảng viên";
    }

    // 8. RENDER BẢNG GIẢNG VIÊN
    function renderLecturers(data) {
        filteredLecturers = data;
        if (!tableBody) return;
        tableBody.innerHTML = "";
        const totalPages = Math.ceil(data.length / pageSize);
        currentPage = Math.max(1, Math.min(currentPage, totalPages || 1));

        if (data.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center" style="padding: 48px 20px;">
                        <div class="table-empty-box">
                            <i class="fa-solid fa-users-slash"></i>
                            <h4>Không tìm thấy giảng viên phù hợp</h4>
                            <p>Không có kết quả nào khớp với tiêu chí tìm kiếm hoặc bộ lọc hiện tại.</p>
                            <button type="button" class="btn btn-outline" id="btnEmptyReset"><i class="fa-solid fa-rotate-left"></i> Xóa bộ lọc</button>
                        </div>
                    </td>
                </tr>
            `;
            const btnEmptyReset = document.getElementById("btnEmptyReset");
            if (btnEmptyReset) {
                btnEmptyReset.addEventListener("click", () => {
                    if (searchInput) searchInput.value = "";
                    if (deptFilter) deptFilter.value = "";
                    if (degreeFilter) degreeFilter.value = "";
                    activeQuickFilter = "ALL";
                    document.querySelectorAll(".stat-card-mini").forEach(c => c.classList.remove("active-filter"));
                    handleFilter();
                });
            }
            updatePageSummary(0, 0, 0);
            currentPageLecturers = [];
            if (window.renderAdminPagination && paginationControls) {
                window.renderAdminPagination(paginationControls, 0, 0, () => {});
            }
            syncSelectionControls();
            return;
        }

        const startIndex = (currentPage - 1) * pageSize;
        currentPageLecturers = data.slice(startIndex, startIndex + pageSize);

        currentPageLecturers.forEach(item => {
            const isChecked = selectedLecturerIds.has(item.id);
            const avatarChar = getAvatarInitials(item.name, "G");
            const avatarBg = getAvatarColor(item.name || item.id);

            // Tính toán tiến độ & màu chỉ tiêu
            const maxQuota = Number(item.maxQuota) > 0 ? Number(item.maxQuota) : 1;
            const groupsCount = Number(item.groupsCount) || 0;
            const percent = Math.min(100, Math.round((groupsCount / maxQuota) * 100));

            let barClass = "empty";
            let statusClass = "empty";
            let statusText = "Chưa có nhóm";

            if (groupsCount === 0) {
                barClass = "empty";
                statusClass = "empty";
                statusText = "Chưa có nhóm";
            } else if (percent < 70) {
                barClass = "available";
                statusClass = "available";
                statusText = "Còn trống";
            } else if (percent < 100) {
                barClass = "near-full";
                statusClass = "near-full";
                statusText = "Gần đầy";
            } else {
                barClass = "full";
                statusClass = "full";
                statusText = "Đã đủ";
            }

            // Học vị badge
            let degreeClass = "degree-other";
            const degUpper = (item.degree || "").toUpperCase();
            if (degUpper.includes("PGS") || degUpper.includes("GS")) {
                degreeClass = "degree-pgs";
            } else if (degUpper.includes("TS") || degUpper.includes("TIẾN SĨ") || degUpper.includes("TIEN SI")) {
                degreeClass = "degree-ts";
            } else if (degUpper.includes("THS") || degUpper.includes("THẠC SĨ") || degUpper.includes("THAC SI")) {
                degreeClass = "degree-ths";
            }

            const tr = document.createElement("tr");
            if (isChecked) tr.classList.add("row-selected");

            tr.innerHTML = `
                <td>
                    <input type="checkbox" class="lecturer-select" data-id="${escapeHtml(item.id)}" ${isChecked ? 'checked' : ''} aria-label="Chọn giảng viên ${escapeHtml(item.name)}">
                </td>
                <td>
                    <div class="lecturer-name-box">
                        <span class="lecturer-avatar" style="background-color: ${avatarBg};">${escapeHtml(avatarChar)}</span>
                        <div class="lecturer-meta">
                            <span class="lecturer-fullname">${escapeHtml(item.name)}</span>
                            <span class="lecturer-code-cell">${escapeHtml(item.id)}</span>
                        </div>
                    </div>
                </td>
                <td><span class="badge-degree ${degreeClass}">${escapeHtml(item.degree)}</span></td>
                <td><div class="dept-cell" title="${escapeHtml(item.dept)}">${escapeHtml(item.dept)}</div></td>
                <td>
                    <span style="font-size: 13px; color: var(--text-muted); display: inline-flex; align-items: center; gap: 6px;">
                        <i class="fa-regular fa-envelope" style="color: #94A3B8;"></i>
                        ${escapeHtml(item.email)}
                    </span>
                </td>
                <td>
                    <div class="quota-progress-cell">
                        <div class="quota-header-row">
                            <span><strong>${groupsCount}</strong> / ${item.maxQuota} nhóm</span>
                            <span class="quota-status-label ${statusClass}">${statusText}</span>
                        </div>
                        <div class="quota-bar-track">
                            <div class="quota-bar-fill ${barClass}" style="width: ${percent}%;"></div>
                        </div>
                    </div>
                </td>
                <td class="text-center">
                    <span class="topic-count-cell ${item.topicsCount === 0 ? 'muted' : ''}">
                        <i class="fa-solid fa-book-bookmark"></i> ${item.topicsCount} đề tài
                    </span>
                </td>
                <td class="text-center">
                    <div class="table-actions-group">
                        <button type="button" class="table-action-btn edit-btn" data-id="${escapeHtml(item.id)}" title="Sửa thông tin" aria-label="Sửa thông tin">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button type="button" class="table-action-btn red delete-btn" data-id="${escapeHtml(item.id)}" title="Xóa giảng viên" aria-label="Xóa giảng viên">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        updatePageSummary(startIndex + 1, startIndex + currentPageLecturers.length, data.length);

        if (window.renderAdminPagination && paginationControls) {
            window.renderAdminPagination(paginationControls, currentPage, totalPages, page => {
                currentPage = page;
                renderLecturers(filteredLecturers);
            });
        }
        syncSelectionControls();
        attachEvents();
    }

    // 9. ĐỒNG BỘ TRẠNG THÁI CHECKBOX VÀ THANH HÀNH ĐỘNG HÀNG LOẠT
    function syncSelectionControls() {
        const selectedVisibleCount = currentPageLecturers.filter(item => selectedLecturerIds.has(item.id)).length;
        if (checkAll) {
            checkAll.checked = currentPageLecturers.length > 0 && selectedVisibleCount === currentPageLecturers.length;
            checkAll.indeterminate = selectedVisibleCount > 0 && selectedVisibleCount < currentPageLecturers.length;
        }
        const hasSelection = selectedLecturerIds.size > 0;
        if (bulkQuotaToolbar) {
            bulkQuotaToolbar.style.display = hasSelection ? "flex" : "none";
            bulkQuotaToolbar.hidden = !hasSelection;
        }
        if (bulkSelectionCount) {
            bulkSelectionCount.innerHTML = `Đã chọn <strong>${selectedLecturerIds.size}</strong> giảng viên`;
        }
        if (!hasSelection && bulkQuotaInput) {
            bulkQuotaInput.value = "";
        }
    }

    // 10. LỌC & TÌM KIẾM
    function handleFilter(resetPage = true) {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const selectedDept = deptFilter ? deptFilter.value : "";
        const selectedDegree = degreeFilter ? degreeFilter.value : "";

        // Highlight nút Reset
        if (resetFilterBtn) {
            if (query || selectedDept || selectedDegree || activeQuickFilter !== "ALL") {
                resetFilterBtn.classList.add("highlighted");
            } else {
                resetFilterBtn.classList.remove("highlighted");
            }
        }

        renderActiveFilterChips(query, selectedDept, selectedDegree, activeQuickFilter);

        const filtered = lecturerList.filter(l => {
            const matchQuery = (l.id || "").toLowerCase().includes(query) ||
                               (l.name || "").toLowerCase().includes(query) ||
                               (l.email || "").toLowerCase().includes(query) ||
                               (l.dept || "").toLowerCase().includes(query);
            const matchDept = selectedDept === "" || (l.dept || "").toLowerCase().includes(selectedDept.toLowerCase());
            const matchDegree = selectedDegree === "" || (l.degree || "").toLowerCase().includes(selectedDegree.toLowerCase());

            let matchQuick = true;
            if (activeQuickFilter === "ACTIVE") {
                matchQuick = (l.groupsCount || 0) > 0;
            } else if (activeQuickFilter === "AVAILABLE") {
                matchQuick = (l.groupsCount || 0) < (l.maxQuota || 0);
            } else if (activeQuickFilter === "FULL") {
                matchQuick = (l.groupsCount || 0) >= (l.maxQuota || 0) && (l.maxQuota || 0) > 0;
            }

            return matchQuery && matchDept && matchDegree && matchQuick;
        });

        if (resetPage) currentPage = 1;
        renderLecturers(filtered);
    }

    // Hiển thị Chip bộ lọc đang hoạt động
    function renderActiveFilterChips(query, selectedDept, selectedDegree, quickFilter) {
        if (!activeFilterChips) return;
        activeFilterChips.innerHTML = "";

        const chips = [];
        if (query) {
            chips.push({
                label: `Tìm: "${query}"`,
                clear: () => { if (searchInput) searchInput.value = ""; handleFilter(); }
            });
        }
        if (selectedDept) {
            chips.push({
                label: `Bộ môn: ${selectedDept}`,
                clear: () => { if (deptFilter) deptFilter.value = ""; handleFilter(); }
            });
        }
        if (selectedDegree) {
            chips.push({
                label: `Học vị: ${selectedDegree}`,
                clear: () => { if (degreeFilter) degreeFilter.value = ""; handleFilter(); }
            });
        }
        if (quickFilter && quickFilter !== "ALL") {
            const quickNames = {
                ACTIVE: "Đang hướng dẫn",
                AVAILABLE: "Còn chỗ nhận nhóm",
                FULL: "Đã đủ chỉ tiêu"
            };
            chips.push({
                label: `Trạng thái: ${quickNames[quickFilter] || quickFilter}`,
                clear: () => {
                    activeQuickFilter = "ALL";
                    document.querySelectorAll(".stat-card-mini").forEach(c => c.classList.remove("active-filter"));
                    handleFilter();
                }
            });
        }

        if (chips.length === 0) {
            activeFilterChips.style.display = "none";
            return;
        }

        activeFilterChips.style.display = "flex";
        activeFilterChips.innerHTML = `<span class="label-chip">Đang lọc theo:</span>`;

        chips.forEach(chip => {
            const badge = document.createElement("span");
            badge.className = "filter-badge-chip";
            badge.innerHTML = `${escapeHtml(chip.label)} <i class="fa-solid fa-xmark btn-remove-chip" title="Xóa điều kiện"></i>`;
            badge.querySelector(".btn-remove-chip").addEventListener("click", chip.clear);
            activeFilterChips.appendChild(badge);
        });
    }

    if (searchInput) searchInput.addEventListener("input", () => handleFilter(true));
    if (deptFilter) deptFilter.addEventListener("change", () => handleFilter(true));
    if (degreeFilter) degreeFilter.addEventListener("change", () => handleFilter(true));

    if (resetFilterBtn) {
        resetFilterBtn.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            if (deptFilter) deptFilter.value = "";
            if (degreeFilter) degreeFilter.value = "";
            activeQuickFilter = "ALL";
            document.querySelectorAll(".stat-card-mini").forEach(c => c.classList.remove("active-filter"));
            handleFilter(true);
        });
    }

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", (e) => {
            pageSize = parseInt(e.target.value, 10) || 10;
            currentPage = 1;
            handleFilter(true);
        });
    }

    // 11. XỬ LÝ CHỌN CHECKBOX & HÀNH ĐỘNG HÀNG LOẠT
    if (checkAll) {
        checkAll.addEventListener("change", () => {
            currentPageLecturers.forEach(item => {
                if (checkAll.checked) selectedLecturerIds.add(item.id);
                else selectedLecturerIds.delete(item.id);
            });
            renderLecturers(filteredLecturers);
        });
    }

    if (clearLecturerSelectionBtn) {
        clearLecturerSelectionBtn.addEventListener("click", () => {
            selectedLecturerIds.clear();
            renderLecturers(filteredLecturers);
        });
    }

    if (applyBulkQuotaBtn) {
        applyBulkQuotaBtn.addEventListener("click", async () => {
            const userCodes = [...selectedLecturerIds];
            const quotaText = bulkQuotaInput.value.trim();
            const maxQuota = Number(quotaText);
            if (userCodes.length === 0) {
                showAppNotification("Hãy chọn ít nhất một giảng viên.");
                return;
            }
            if (!quotaText || !Number.isInteger(maxQuota) || maxQuota < 0) {
                showAppNotification("Số nhóm tối đa phải là số nguyên không âm.");
                return;
            }

            const confirmed = await window.showConfirmDialog({
                title: "Cập nhật chỉ tiêu hàng loạt",
                message: `Đặt chỉ tiêu tối đa ${maxQuota} nhóm cho ${userCodes.length} giảng viên đã chọn? Thao tác sẽ bị từ chối nếu chỉ tiêu thấp hơn số nhóm họ đang hướng dẫn.`,
                confirmText: "Cập nhật"
            });
            if (!confirmed) return;

            const originalBtnText = applyBulkQuotaBtn.innerHTML;
            applyBulkQuotaBtn.disabled = true;
            applyBulkQuotaBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang cập nhật...';

            try {
                const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/lecturers/bulk-quota`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_codes: userCodes, max_quota: maxQuota })
                });
                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Không thể cập nhật chỉ tiêu hàng loạt.");
                }

                await fetchLecturers();
                const allUpdated = userCodes.every(code =>
                    lecturerList.some(item => item.id === code && item.maxQuota === maxQuota)
                );
                if (!allUpdated) {
                    throw new Error("Máy chủ chưa cập nhật đủ chỉ tiêu. Hãy tải lại trang rồi kiểm tra.");
                }

                selectedLecturerIds.clear();
                bulkQuotaInput.value = "";
                handleFilter(false);
                showAppNotification(result.message || "Đã cập nhật chỉ tiêu giảng viên thành công!");
            } catch (error) {
                console.error("Lỗi cập nhật chỉ tiêu hàng loạt:", error);
                showAppNotification(error.message || "Không thể cập nhật chỉ tiêu hàng loạt.");
            } finally {
                applyBulkQuotaBtn.disabled = false;
                applyBulkQuotaBtn.innerHTML = originalBtnText;
            }
        });
    }

    if (deleteSelectedLecturersBtn) {
        deleteSelectedLecturersBtn.addEventListener("click", async () => {
            const userCodes = [...selectedLecturerIds];
            if (!userCodes.length) {
                showAppNotification("Hãy chọn ít nhất một giảng viên.");
                return;
            }

            const selectedLecturers = userCodes
                .map(code => lecturerList.find(item => item.id === code))
                .filter(Boolean);
            const assignedGroupCount = selectedLecturers.reduce((total, item) => total + item.groupsCount, 0);
            const lecturerNames = selectedLecturers
                .slice(0, 5)
                .map(item => `${item.name} (${item.id})`)
                .join(", ");
            const moreCount = Math.max(0, selectedLecturers.length - 5);
            const assignedWarning = assignedGroupCount > 0
                ? `\n\nLưu ý: các giảng viên đã chọn hiện đang hướng dẫn ${assignedGroupCount} nhóm. Việc xóa có thể làm gián đoạn các nhóm này.`
                : "";
            const confirmed = await window.showConfirmDialog({
                title: "Xác nhận xóa giảng viên đã chọn",
                message: `Bạn sắp xóa ${userCodes.length} giảng viên: ${lecturerNames}${moreCount ? ` và ${moreCount} người khác` : ""}. Thao tác này không thể hoàn tác.${assignedWarning}`,
                confirmText: `Xóa ${userCodes.length} giảng viên`,
                danger: true
            });
            if (!confirmed) return;

            const originalButtonText = deleteSelectedLecturersBtn.innerHTML;
            deleteSelectedLecturersBtn.disabled = true;
            deleteSelectedLecturersBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';

            const failures = [];
            let deletedCount = 0;
            try {
                for (const id of userCodes) {
                    try {
                        const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/lecturers/${encodeURIComponent(id)}`, {
                            method: "DELETE"
                        });
                        const result = await response.json();
                        if (!response.ok || !result.success) {
                            throw new Error(result.message || "Xóa giảng viên thất bại.");
                        }
                        selectedLecturerIds.delete(id);
                        deletedCount += 1;
                    } catch (error) {
                        failures.push({ id, message: error.message || "Không thể xóa giảng viên." });
                    }
                }

                await fetchLecturers();
                if (failures.length) {
                    const failureDetails = failures
                        .slice(0, 3)
                        .map(item => `${item.id}: ${item.message}`)
                        .join("; ");
                    showAppNotification(
                        `Đã xóa ${deletedCount}/${userCodes.length} giảng viên. Các mục chưa xóa vẫn được giữ chọn. ${failureDetails}`
                    );
                } else {
                    showAppNotification(`Đã xóa ${deletedCount} giảng viên đã chọn.`);
                }
            } catch (error) {
                console.error("Lỗi tải lại danh sách sau khi xóa giảng viên:", error);
                showAppNotification(error.message || "Đã xóa nhưng không thể tải lại danh sách giảng viên.");
            } finally {
                deleteSelectedLecturersBtn.disabled = false;
                deleteSelectedLecturersBtn.innerHTML = originalButtonText;
            }
        });
    }

    // 12. THÊM / SỬA GIẢNG VIÊN
    if (openAddBtn) {
        openAddBtn.onclick = () => {
            currentEditingId = null;
            document.getElementById("modalTitle").textContent = "Thêm Giảng viên mới";
            if (lecturerForm) lecturerForm.reset();
            const idInput = document.getElementById("lecturerIdInput");
            if (idInput) idInput.disabled = false;
            const quotaInput = document.getElementById("lecturerQuotaInput");
            if (quotaInput) quotaInput.value = "5";
            if (lecturerModal) lecturerModal.style.display = "flex";
        };
    }

    if (lecturerForm) {
        lecturerForm.onsubmit = async (e) => {
            e.preventDefault();

            const id = document.getElementById("lecturerIdInput").value.trim();
            const name = document.getElementById("lecturerNameInput").value.trim();
            const degree = document.getElementById("lecturerDegreeInput").value;
            const dept = document.getElementById("lecturerDeptInput").value;
            const email = document.getElementById("lecturerEmailInput").value.trim();
            const maxQuota = Number(document.getElementById("lecturerQuotaInput").value);

            if (!id || !name || !degree || !dept || !email) {
                showAppNotification("Vui lòng điền đầy đủ các trường thông tin bắt buộc (*).");
                return;
            }
            if (!Number.isInteger(maxQuota) || maxQuota < 0) {
                showAppNotification("Số nhóm tối đa phải là số nguyên không âm.");
                return;
            }

            const submitBtn = lecturerForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.innerHTML : "Lưu thông tin";
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
            }

            try {
                const payload = {
                    user_code: id,
                    full_name: name,
                    degree,
                    dept,
                    email,
                    max_quota: maxQuota
                };

                let response;
                if (currentEditingId) {
                    response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/lecturers/${currentEditingId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/lecturers", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }

                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Lỗi khi lưu dữ liệu giảng viên.');
                }

                await fetchLecturers();
                const savedLecturer = lecturerList.find(item => item.id === id);
                if (!savedLecturer || savedLecturer.maxQuota !== maxQuota) {
                    throw new Error("Máy chủ chưa cập nhật chỉ tiêu. Hãy khởi động lại backend rồi thử lưu lại.");
                }

                if (lecturerModal) lecturerModal.style.display = "none";
                showAppNotification(result.message || "Đã lưu thông tin giảng viên thành công!");
            } catch (error) {
                console.error('Lỗi lưu giảng viên:', error);
                showAppNotification(error.message || 'Không thể lưu giảng viên.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalBtnText;
                }
            }
        };
    }

    // 13. GÁN SỰ KIỆN CHO DÒNG DỮ LIỆU BẢNG (CHECKBOX, SỬA, XÓA)
    function attachEvents() {
        document.querySelectorAll(".lecturer-select").forEach(checkbox => {
            checkbox.addEventListener("change", event => {
                const id = event.currentTarget.getAttribute("data-id");
                if (!id) return;
                if (event.currentTarget.checked) {
                    selectedLecturerIds.add(id);
                    event.currentTarget.closest("tr")?.classList.add("row-selected");
                } else {
                    selectedLecturerIds.delete(id);
                    event.currentTarget.closest("tr")?.classList.remove("row-selected");
                }
                syncSelectionControls();
            });
        });

        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const item = lecturerList.find(l => l.id === id);
                if (item) {
                    currentEditingId = id;
                    document.getElementById("modalTitle").textContent = "Chỉnh sửa Giảng viên";
                    document.getElementById("lecturerIdInput").value = item.id;
                    document.getElementById("lecturerIdInput").disabled = true;
                    document.getElementById("lecturerNameInput").value = item.name;
                    document.getElementById("lecturerDegreeInput").value = item.degree;
                    document.getElementById("lecturerDeptInput").value = item.dept;
                    document.getElementById("lecturerEmailInput").value = item.email;
                    document.getElementById("lecturerQuotaInput").value = item.maxQuota;

                    if (lecturerModal) lecturerModal.style.display = "flex";
                }
            };
        });

        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const item = lecturerList.find(l => l.id === id);
                const hasGroups = item && item.groupsCount > 0;

                const message = hasGroups
                    ? `Giảng viên ${item?.name || id} đang hướng dẫn ${item.groupsCount} nhóm đề tài. Xóa giảng viên có thể làm gián đoạn các nhóm này. Bạn có chắc chắn muốn xóa không?`
                    : `Bạn có chắc chắn muốn xóa giảng viên ${item?.name || id} (Mã: ${id})? Thao tác này không thể hoàn tác.`;

                const confirmed = await window.showConfirmDialog({
                    title: "Xác nhận xóa giảng viên",
                    message,
                    confirmText: "Xóa giảng viên",
                    danger: true
                });
                if (!confirmed) return;

                if (!hasAdminSession()) {
                    showAppNotification("Phiên đăng nhập Admin không hợp lệ. Vui lòng đăng nhập lại.");
                    return;
                }

                try {
                    const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/lecturers/${encodeURIComponent(id)}`, {
                        method: "DELETE"
                    });
                    const result = await response.json();

                    if (!response.ok || !result.success) {
                        throw new Error(result.message || "Xóa giảng viên thất bại.");
                    }

                    lecturerList = lecturerList.filter(lecturer => lecturer.id !== id);
                    selectedLecturerIds.delete(id);
                    updateQuickStats();
                    handleFilter(false);
                    showAppNotification(result.message || "Đã xóa giảng viên thành công!");
                } catch (error) {
                    console.error("Lỗi xóa giảng viên:", error);
                    showAppNotification(error.message || "Không thể xóa giảng viên.");
                }
            };
        });
    }

    // Modal close events
    if (closeLecturerModal) closeLecturerModal.onclick = () => lecturerModal.style.display = "none";
    if (cancelLecturerModal) cancelLecturerModal.onclick = () => lecturerModal.style.display = "none";

    // Logout Modal
    if (openLogoutBtn) openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    if (cancelLogout) cancelLogout.onclick = () => logoutModal.style.display = "none";
    if (confirmLogout) {
        confirmLogout.onclick = () => {
            localStorage.clear();
            window.location.href = "../auth/index.html";
        };
    }

    window.addEventListener("users-imported", fetchLecturers);

    // Khởi tạo
    loadSemesterOptions();
    fetchLecturers();
});
