/**
 * =========================================================
 * ADMIN STUDENTS JS
 * Quản lý danh sách sinh viên: Tìm kiếm, lọc, phân trang, thêm, sửa, xóa
 * =========================================================
 */

document.addEventListener("DOMContentLoaded", async () => {
    // 1. KIỂM TRA PHIÊN ĐĂNG NHẬP ADMIN
    const verifiedAdminUser = await window.verifyAuthSession("ADMIN");
    if (!verifiedAdminUser) return;

    let studentList = [];
    let currentEditingId = null;
    let selectedIds = new Set();
    let pageSize = 10;
    let currentPage = 1;

    // DOM Elements
    const tableBody = document.getElementById("studentTableBody");
    const paginationControls = document.getElementById("studentsPagination");
    const paginationInfo = document.getElementById("paginationInfo");
    const searchInput = document.getElementById("searchInput");
    const classFilter = document.getElementById("classFilter");
    const statusFilter = document.getElementById("statusFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");
    const checkAll = document.getElementById("checkAll");
    const bulkToolbar = document.getElementById("bulkActionsToolbar");
    const bulkCountText = document.getElementById("bulkCountText");
    const btnDeselectAll = document.getElementById("btnDeselectAll");
    const btnBulkDelete = document.getElementById("btnBulkDelete");
    const pageSizeSelect = document.getElementById("pageSizeSelect");
    const activeFilterChips = document.getElementById("activeFilterChips");

    // Modal Thêm / Sửa Sinh Viên
    const studentModal = document.getElementById("studentModal");
    const studentForm = document.getElementById("studentForm");
    const openAddBtn = document.getElementById("openAddBtn");
    const closeStudentModal = document.getElementById("closeStudentModal");
    const cancelStudentModal = document.getElementById("cancelStudentModal");

    // Topbar & Logout
    const semesterSelect = document.getElementById("semesterSelect");
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

    // 2. TẢI HỌC KỲ ĐỘNG TỪ DATABASE (KHẮC PHỤC LỆCH HỌC KỲ TĨNH)
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

    // 3. HIỂN THỊ SKELETON LOADING KHI ĐANG TẢI BẢNG
    function showSkeletonRows() {
        if (!tableBody) return;
        tableBody.innerHTML = Array(5).fill(0).map(() => `
            <tr class="skeleton-row">
                <td><div class="skeleton-cell-bar" style="width: 16px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 70px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 140px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 60px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 110px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 130px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 90px; height: 24px; border-radius: 12px;"></div></td>
                <td><div class="skeleton-cell-bar" style="width: 60px; margin: auto;"></div></td>
            </tr>
        `).join('');
    }

    // 4. TẢI DỮ LIỆU SINH VIÊN TỪ API
    async function fetchStudents() {
        showSkeletonRows();
        try {
            const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/students");
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "Không tải được dữ liệu sinh viên");
            }

            studentList = Array.isArray(result.data) ? result.data.map(item => ({
                id: item.user_code || item.id || "",
                name: item.full_name || item.name || "Chưa cập nhật",
                class: item.class || "",
                major: item.major || "",
                email: item.email || "",
                status: (item.status || "NONE").toUpperCase()
            })) : [];

            populateClassFilterOptions();
            updateQuickStats();
            handleFilter(false);
        } catch (error) {
            console.error("Lỗi tải sinh viên:", error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center" style="padding: 40px 20px;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 32px; color: var(--danger); margin-bottom: 8px; display: block;"></i>
                        <span style="color: var(--danger); font-weight: 600;">Không thể tải dữ liệu sinh viên từ máy chủ.</span>
                        <div style="margin-top: 12px;">
                            <button type="button" class="btn btn-outline" onclick="location.reload()"><i class="fa-solid fa-rotate-right"></i> Tải lại trang</button>
                        </div>
                    </td>
                </tr>
            `;
            if (paginationInfo) paginationInfo.textContent = "Hiển thị 0 / 0 sinh viên";
            if (window.renderAdminPagination && paginationControls) {
                window.renderAdminPagination(paginationControls, 0, 0, () => {});
            }
        }
    }

    // 5. CẬP NHẬT 4 THẺ THỐNG KÊ NHANH (QUICK STATS)
    function updateQuickStats() {
        const total = studentList.length;
        const approved = studentList.filter(s => s.status === "APPROVED").length;
        const pending = studentList.filter(s => s.status === "PENDING").length;
        const none = studentList.filter(s => s.status === "NONE" || !s.status).length;

        const statTotalEl = document.getElementById("statTotalStudents");
        const statApprovedEl = document.getElementById("statApprovedStudents");
        const statPendingEl = document.getElementById("statPendingStudents");
        const statNoneEl = document.getElementById("statNoneStudents");

        if (statTotalEl) statTotalEl.textContent = total;
        if (statApprovedEl) statApprovedEl.textContent = approved;
        if (statPendingEl) statPendingEl.textContent = pending;
        if (statNoneEl) statNoneEl.textContent = none;
    }

    // Gán sự kiện click vào các thẻ quick stat để lọc nhanh
    document.querySelectorAll(".stat-card-mini").forEach(card => {
        card.addEventListener("click", () => {
            const filterType = card.getAttribute("data-quick-status");
            document.querySelectorAll(".stat-card-mini").forEach(c => c.classList.remove("active-filter"));

            if (filterType === "ALL") {
                if (statusFilter) statusFilter.value = "";
            } else if (filterType) {
                if (statusFilter) {
                    if (statusFilter.value === filterType) {
                        statusFilter.value = ""; // Toggle off
                    } else {
                        statusFilter.value = filterType;
                        card.classList.add("active-filter");
                    }
                }
            }
            handleFilter();
        });
    });

    // 6. NẠP TỰ ĐỘNG DANH SÁCH LỚP HỌC VÀO SELECT
    function populateClassFilterOptions() {
        if (!classFilter) return;
        const currentSelected = classFilter.value;
        const uniqueClasses = Array.from(new Set(studentList.map(s => s.class).filter(Boolean))).sort();

        // Giữ lại option đầu tiên "Tất cả Lớp"
        classFilter.innerHTML = '<option value="">Tất cả Lớp</option>';

        uniqueClasses.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c;
            opt.textContent = `Lớp ${c}`;
            classFilter.appendChild(opt);
        });

        if (currentSelected && uniqueClasses.includes(currentSelected)) {
            classFilter.value = currentSelected;
        }
    }

    // 7. CẬP NHẬT TÓM TẮT PHÂN TRANG
    function updatePageSummary(start, end, total) {
        if (!paginationInfo) return;
        paginationInfo.textContent = total
            ? `Hiển thị ${start} - ${end} trên tổng số ${total} sinh viên`
            : "Hiển thị 0 / 0 sinh viên";
    }

    // 8. RENDER DANH SÁCH SINH VIÊN RA BẢNG
    function renderStudents(data) {
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
                            <h4>Không tìm thấy sinh viên phù hợp</h4>
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
                    if (classFilter) classFilter.value = "";
                    if (statusFilter) statusFilter.value = "";
                    handleFilter();
                });
            }
            updatePageSummary(0, 0, 0);
            if (window.renderAdminPagination && paginationControls) {
                window.renderAdminPagination(paginationControls, 0, 0, () => {});
            }
            updateBulkToolbar();
            return;
        }

        const startIndex = (currentPage - 1) * pageSize;
        const pageData = data.slice(startIndex, startIndex + pageSize);

        pageData.forEach(item => {
            let statusBadge = "";
            if (item.status === "APPROVED") {
                statusBadge = `<span class="badge-status green"><span class="status-dot"></span>Đã có đề tài</span>`;
            } else if (item.status === "PENDING") {
                statusBadge = `<span class="badge-status orange"><span class="status-dot"></span>Chờ phê duyệt</span>`;
            } else {
                statusBadge = `<span class="badge-status gray"><span class="status-dot"></span>Chưa có nhóm</span>`;
            }

            const isChecked = selectedIds.has(item.id);
            const avatarChar = getAvatarInitials(item.name, "S");
            const avatarBg = getAvatarColor(item.name || item.id);

            const tr = document.createElement("tr");
            if (isChecked) tr.classList.add("row-selected");

            tr.innerHTML = `
                <td>
                    <input type="checkbox" class="student-checkbox" data-id="${escapeHtml(item.id)}" ${isChecked ? 'checked' : ''} aria-label="Chọn sinh viên ${escapeHtml(item.name)}">
                </td>
                <td><span class="student-code-cell">${escapeHtml(item.id)}</span></td>
                <td>
                    <div class="student-name-box">
                        <span class="student-avatar" style="background-color: ${avatarBg};">${escapeHtml(avatarChar)}</span>
                        <div class="student-meta">
                            <span class="student-fullname">${escapeHtml(item.name)}</span>
                            <span class="student-email-sub">${escapeHtml(item.email || 'Chưa cập nhật')}</span>
                        </div>
                    </div>
                </td>
                <td><span class="class-chip">${escapeHtml(item.class || 'Chưa rõ')}</span></td>
                <td><div class="major-cell" title="${escapeHtml(item.major || 'Chưa cập nhật')}">${escapeHtml(item.major || 'Chưa cập nhật')}</div></td>
                <td><span class="student-email-sub" style="font-size: 13px;">${escapeHtml(item.email || '—')}</span></td>
                <td>${statusBadge}</td>
                <td class="text-center">
                    <div class="table-actions-group">
                        <button type="button" class="table-action-btn edit-btn" data-id="${escapeHtml(item.id)}" title="Sửa thông tin" aria-label="Sửa thông tin">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button type="button" class="table-action-btn red delete-btn" data-id="${escapeHtml(item.id)}" title="Xóa sinh viên" aria-label="Xóa sinh viên">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        updatePageSummary(startIndex + 1, startIndex + pageData.length, data.length);

        if (window.renderAdminPagination && paginationControls) {
            window.renderAdminPagination(paginationControls, currentPage, totalPages, page => {
                currentPage = page;
                renderStudents(data);
            });
        }

        attachEvents();
        updateCheckAllState(pageData);
        updateBulkToolbar();
    }

    // 9. LỌC & TÌM KIẾM
    function handleFilter(resetPage = true) {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const selectedClass = classFilter ? classFilter.value : "";
        const selectedStatus = statusFilter ? statusFilter.value : "";

        // Highlight nút Reset
        if (resetFilterBtn) {
            if (query || selectedClass || selectedStatus) {
                resetFilterBtn.classList.add("highlighted");
            } else {
                resetFilterBtn.classList.remove("highlighted");
            }
        }

        renderActiveFilterChips(query, selectedClass, selectedStatus);

        const filtered = studentList.filter(s => {
            const matchQuery = (s.id || '').toLowerCase().includes(query) || (s.name || '').toLowerCase().includes(query) || (s.email || '').toLowerCase().includes(query);
            const matchClass = selectedClass === "" || s.class === selectedClass;
            const matchStatus = selectedStatus === "" || s.status === selectedStatus;
            return matchQuery && matchClass && matchStatus;
        });

        if (resetPage) currentPage = 1;
        renderStudents(filtered);
    }

    // Hiển thị Chip bộ lọc đang hoạt động
    function renderActiveFilterChips(query, selectedClass, selectedStatus) {
        if (!activeFilterChips) return;
        activeFilterChips.innerHTML = "";

        const chips = [];
        if (query) {
            chips.push({
                label: `Tìm: "${query}"`,
                clear: () => { if (searchInput) searchInput.value = ""; handleFilter(); }
            });
        }
        if (selectedClass) {
            chips.push({
                label: `Lớp: ${selectedClass}`,
                clear: () => { if (classFilter) classFilter.value = ""; handleFilter(); }
            });
        }
        if (selectedStatus) {
            const statusNames = { APPROVED: "Đã có đề tài", PENDING: "Chờ phê duyệt", NONE: "Chưa có nhóm" };
            chips.push({
                label: `Trạng thái: ${statusNames[selectedStatus] || selectedStatus}`,
                clear: () => { 
                    if (statusFilter) statusFilter.value = ""; 
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
    if (classFilter) classFilter.addEventListener("change", () => handleFilter(true));
    if (statusFilter) statusFilter.addEventListener("change", () => {
        document.querySelectorAll(".stat-card-mini").forEach(c => c.classList.remove("active-filter"));
        handleFilter(true);
    });

    if (resetFilterBtn) {
        resetFilterBtn.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            if (classFilter) classFilter.value = "";
            if (statusFilter) statusFilter.value = "";
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

    // 10. CHỌN HÀNG LOẠT (BULK SELECTION)
    function updateCheckAllState(pageData) {
        if (!checkAll) return;
        if (pageData.length === 0) {
            checkAll.checked = false;
            checkAll.indeterminate = false;
            return;
        }
        const checkedCount = pageData.filter(item => selectedIds.has(item.id)).length;
        if (checkedCount === 0) {
            checkAll.checked = false;
            checkAll.indeterminate = false;
        } else if (checkedCount === pageData.length) {
            checkAll.checked = true;
            checkAll.indeterminate = false;
        } else {
            checkAll.checked = false;
            checkAll.indeterminate = true;
        }
    }

    function updateBulkToolbar() {
        if (!bulkToolbar || !bulkCountText) return;
        if (selectedIds.size > 0) {
            bulkToolbar.style.display = "flex";
            bulkCountText.innerHTML = `Đã chọn <strong>${selectedIds.size}</strong> sinh viên`;
        } else {
            bulkToolbar.style.display = "none";
        }
    }

    if (checkAll) {
        checkAll.addEventListener("change", (e) => {
            const isChecked = e.target.checked;
            const checkboxes = document.querySelectorAll(".student-checkbox");
            checkboxes.forEach(cb => {
                const id = cb.getAttribute("data-id");
                cb.checked = isChecked;
                if (isChecked) {
                    selectedIds.add(id);
                    cb.closest("tr")?.classList.add("row-selected");
                } else {
                    selectedIds.delete(id);
                    cb.closest("tr")?.classList.remove("row-selected");
                }
            });
            updateBulkToolbar();
        });
    }

    if (btnDeselectAll) {
        btnDeselectAll.addEventListener("click", () => {
            selectedIds.clear();
            document.querySelectorAll(".student-checkbox").forEach(cb => {
                cb.checked = false;
                cb.closest("tr")?.classList.remove("row-selected");
            });
            if (checkAll) {
                checkAll.checked = false;
                checkAll.indeterminate = false;
            }
            updateBulkToolbar();
        });
    }

    if (btnBulkDelete) {
        btnBulkDelete.addEventListener("click", async () => {
            if (selectedIds.size === 0) return;
            const confirmed = await window.showConfirmDialog({
                title: "Xác nhận xóa hàng loạt",
                message: `Bạn có chắc chắn muốn xóa ${selectedIds.size} sinh viên đã chọn không? Thao tác này không thể hoàn tác.`,
                confirmText: `Xóa ${selectedIds.size} sinh viên`,
                danger: true
            });
            if (!confirmed) return;

            const idsToDelete = Array.from(selectedIds);
            let successCount = 0;

            for (const id of idsToDelete) {
                try {
                    const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/students/${encodeURIComponent(id)}`, {
                        method: "DELETE"
                    });
                    if (res.ok) successCount++;
                } catch (e) {
                    console.error("Lỗi xóa sinh viên:", id, e);
                }
            }

            selectedIds.clear();
            showAppNotification(`Đã xóa thành công ${successCount} sinh viên.`);
            await fetchStudents();
        });
    }

    // 11. THÊM / SỬA SINH VIÊN
    if (openAddBtn) {
        openAddBtn.onclick = () => {
            currentEditingId = null;
            document.getElementById("modalTitle").textContent = "Thêm Sinh viên mới";
            if (studentForm) studentForm.reset();
            const idInput = document.getElementById("studentIdInput");
            if (idInput) idInput.disabled = false;
            if (studentModal) studentModal.style.display = "flex";
        };
    }

    if (studentForm) {
        studentForm.onsubmit = async (e) => {
            e.preventDefault();

            const id = document.getElementById("studentIdInput").value.trim();
            const name = document.getElementById("studentNameInput").value.trim();
            const studentClass = document.getElementById("studentClassInput").value.trim();
            const major = document.getElementById("studentMajorInput").value;
            const email = document.getElementById("studentEmailInput").value.trim();

            if (!id || !name || !studentClass || !email) {
                showAppNotification("Vui lòng điền đầy đủ các trường thông tin bắt buộc (*).");
                return;
            }

            const submitBtn = studentForm.querySelector('button[type="submit"]');
            const originalText = submitBtn ? submitBtn.innerHTML : "Lưu thông tin";
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
            }

            try {
                const payload = {
                    user_code: id,
                    full_name: name,
                    class: studentClass,
                    major,
                    email
                };

                let response;
                if (currentEditingId) {
                    response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/students/${currentEditingId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/students", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }

                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Lỗi khi lưu dữ liệu sinh viên.');
                }

                if (studentModal) studentModal.style.display = "none";
                showAppNotification(currentEditingId ? "Đã cập nhật sinh viên thành công!" : "Đã thêm sinh viên mới thành công!");
                await fetchStudents();
            } catch (error) {
                console.error('Lỗi lưu sinh viên:', error);
                showAppNotification(error.message || 'Không thể lưu sinh viên.');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = originalText;
                }
            }
        };
    }

    // 12. GÁN SỰ KIỆN CHO DÒNG BẢNG (SỬA, XÓA, CHECKBOX)
    function attachEvents() {
        // Checkbox dòng
        document.querySelectorAll(".student-checkbox").forEach(cb => {
            cb.addEventListener("change", (e) => {
                const id = e.target.getAttribute("data-id");
                if (e.target.checked) {
                    selectedIds.add(id);
                    e.target.closest("tr")?.classList.add("row-selected");
                } else {
                    selectedIds.delete(id);
                    e.target.closest("tr")?.classList.remove("row-selected");
                }
                const pageData = studentList.slice((currentPage - 1) * pageSize, currentPage * pageSize);
                updateCheckAllState(pageData);
                updateBulkToolbar();
            });
        });

        // Nút sửa
        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const item = studentList.find(s => s.id === id);
                if (item) {
                    currentEditingId = id;
                    document.getElementById("modalTitle").textContent = "Chỉnh sửa sinh viên";
                    const idInput = document.getElementById("studentIdInput");
                    if (idInput) {
                        idInput.value = item.id;
                        idInput.disabled = true;
                    }
                    document.getElementById("studentNameInput").value = item.name;
                    document.getElementById("studentClassInput").value = item.class || "";
                    document.getElementById("studentMajorInput").value = item.major || "Kỹ thuật Phần mềm";
                    document.getElementById("studentEmailInput").value = item.email || "";

                    if (studentModal) studentModal.style.display = "flex";
                }
            };
        });

        // Nút xóa
        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const item = studentList.find(s => s.id === id);
                const displayName = item ? `${item.name} (${item.id})` : id;

                const confirmed = await window.showConfirmDialog({
                    title: "Xác nhận xóa sinh viên",
                    message: `Bạn có chắc chắn muốn xóa sinh viên ${displayName} không? Thao tác này sẽ xóa toàn bộ dữ liệu liên quan và không thể hoàn tác.`,
                    confirmText: "Xóa sinh viên",
                    danger: true
                });
                if (!confirmed) return;

                try {
                    const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/students/${encodeURIComponent(id)}`, {
                        method: "DELETE"
                    });
                    const result = await response.json();

                    if (!response.ok || !result.success) {
                        throw new Error(result.message || "Xóa sinh viên thất bại.");
                    }

                    selectedIds.delete(id);
                    studentList = studentList.filter(student => student.id !== id);
                    updateQuickStats();
                    handleFilter();
                    showAppNotification(result.message || "Đã xóa sinh viên thành công!");
                } catch (error) {
                    console.error("Lỗi xóa sinh viên:", error);
                    showAppNotification(error.message || "Không thể xóa sinh viên.");
                }
            };
        });
    }

    // Đóng Modal Sinh Viên
    if (closeStudentModal) closeStudentModal.onclick = () => { if (studentModal) studentModal.style.display = "none"; };
    if (cancelStudentModal) cancelStudentModal.onclick = () => { if (studentModal) studentModal.style.display = "none"; };

    // Đăng xuất Modal
    if (openLogoutBtn) openLogoutBtn.onclick = () => { if (logoutModal) logoutModal.style.display = "flex"; };
    if (cancelLogout) cancelLogout.onclick = () => { if (logoutModal) logoutModal.style.display = "none"; };
    if (confirmLogout) {
        confirmLogout.onclick = () => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../auth/index.html";
        };
    }

    // Modal click outside to close
    window.addEventListener("click", (e) => {
        if (e.target === studentModal) studentModal.style.display = "none";
        if (e.target === logoutModal) logoutModal.style.display = "none";
    });

    // Helper escape HTML
    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Lắng nghe sự kiện import thành công từ admin-user-import.js
    window.addEventListener("users-imported", fetchStudents);

    // Khởi chạy
    await loadSemesterOptions();
    fetchStudents();
});
