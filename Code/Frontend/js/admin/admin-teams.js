document.addEventListener("DOMContentLoaded", async () => {
    const verifiedAdminUser = await window.verifyAuthSession("ADMIN");
    if (!verifiedAdminUser) return;
    const authHeaders = {};

    // ── STATE ──────────────────────────────────────────────────
    let lecturerList = [];
    let teamList = [];
    let filteredList = [];
    let selectedTeamId = null;
    let selectedTeamIds = new Set();
    let currentPage = 1;
    let pageSize = 10;
    let activeQuickFilter = ""; // "", "assigned", "unassigned"

    // ── DOM REFS (GIỮ NGUYÊN ID GỐC) ──────────────────────────
    const tableBody          = document.getElementById("teamTableBody");
    const paginationControls = document.getElementById("teamsPagination");
    const searchInput        = document.getElementById("searchInput");
    const statusFilter       = document.getElementById("statusFilter");
    const resetFilterBtn     = document.getElementById("resetFilterBtn");

    const assignModal        = document.getElementById("assignModal");
    const closeAssignModal   = document.getElementById("closeAssignModal");
    const cancelAssignBtn    = document.getElementById("cancelAssignBtn");
    const saveAssignBtn      = document.getElementById("saveAssignBtn");
    const modalTeamTitle     = document.getElementById("modalTeamTitle");
    const lecturerHDSelect   = document.getElementById("lecturerHDSelect");
    const saveAssignText     = document.getElementById("saveAssignText");

    const logoutModal        = document.getElementById("logoutModal");
    const openLogoutBtn      = document.getElementById("openLogoutBtn");
    const cancelLogout       = document.getElementById("cancelLogout");
    const confirmLogout      = document.getElementById("confirmLogout");

    // ── UI REFS (MỚI THÊM) ────────────────────────────────────
    const semesterSelect        = document.getElementById("semesterSelect");
    const pageSizeSelect        = document.getElementById("pageSizeSelect");
    const bulkAssignBtn         = document.getElementById("bulkAssignBtn");
    const bulkToolbar           = document.getElementById("bulkToolbar");
    const bulkSelectionCount    = document.getElementById("bulkSelectionCount");
    const clearTeamSelectionBtn = document.getElementById("clearTeamSelectionBtn");
    const bulkAssignToolbarBtn  = document.getElementById("bulkAssignToolbarBtn");
    const checkAll              = document.getElementById("checkAll");
    const activeFilterChips     = document.getElementById("activeFilterChips");
    const lecturerSearchInput   = document.getElementById("lecturerSearchInput");
    const assignChangeNote      = document.getElementById("assignChangeNote");
    const assignModalSubtitle   = document.getElementById("assignModalSubtitle");

    // ── LOAD HỌC KỲ ĐỘNG ──────────────────────────────────────
    async function loadSemesterOptions() {
        try {
            const res = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/semesters", { headers: authHeaders });
            const result = await res.json();
            const list = Array.isArray(result) ? result : (result.data || []);
            if (!semesterSelect) return;
            semesterSelect.innerHTML = "";
            const allOption = document.createElement("option");
            allOption.value = "all";
            allOption.textContent = "Toàn bộ học kỳ";
            semesterSelect.appendChild(allOption);
            list.forEach(s => {
                const opt = document.createElement("option");
                opt.value = s._id || s.id || "";
                let name = s.semesterName || s.name || "Học kỳ";
                name = name.replace(/Học kì/gi, "Học kỳ");
                opt.textContent = name;
                if (s.is_active || s.isActive) opt.selected = true;
                semesterSelect.appendChild(opt);
            });
            if (!list.some(s => s.is_active || s.isActive)) {
                semesterSelect.value = "all";
            }
            if (semesterSelect.options.length === 0) {
                semesterSelect.innerHTML = `<option value="">Chưa có học kỳ</option>`;
            }
        } catch {
            if (semesterSelect) semesterSelect.innerHTML = `<option value="">Lỗi tải học kỳ</option>`;
        }
    }

    // ── HELPERS ───────────────────────────────────────────────
    function getInitials(name = "") {
        return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() || "").slice(-2).join("") || "?";
    }

    function getTopicStatusInfo(item) {
        const status = String(item.topicStatus || "").toLowerCase();
        if (status.includes("pending") || status.includes("chờ") || status.includes("wait")) {
            return { cls: "topic-pending",    dot: "", label: "Chờ duyệt" };
        }
        if (status.includes("approved") || status.includes("registered") || status.includes("duyệt") || status.includes("accept")) {
            return { cls: "topic-approved",   dot: "", label: "Đã duyệt" };
        }
        if (status.includes("revision") || status.includes("sửa")) {
            return { cls: "topic-pending",    dot: "", label: "Yêu cầu chỉnh sửa" };
        }
        if (status.includes("rejected") || status.includes("từ chối")) {
            return { cls: "topic-rejected",   dot: "", label: "Đã từ chối" };
        }
        if (status.includes("open")) {
            return { cls: "topic-inprogress", dot: "", label: "Mở đăng ký" };
        }
        if (status.includes("progress") || status.includes("thực hiện") || status.includes("active")) {
            return { cls: "topic-inprogress", dot: "", label: "Đang thực hiện" };
        }
        return null;
    }

    function renderMemberChips(students = []) {
        if (!students.length) return `<em style="color:#94A3B8;font-size:13px;">Chưa có thành viên</em>`;
        const max = 3;
        const visible = students.slice(0, max);
        const rest = students.length - max;

        const chips = visible.map(s => {
            const initials = getInitials(s.name || "?");
            if (s.isLeader) {
                return `<span class="member-chip leader" title="${s.name} — Trưởng nhóm (${s.code || ""})">
                    <span class="member-crown"><i class="fa-solid fa-crown"></i></span>
                    <span class="member-avatar">${initials}</span>
                    <span>${s.name}</span>
                </span>`;
            }
            return `<span class="member-chip regular" title="${s.name} (${s.code || ""})">
                <span class="member-avatar">${initials}</span>
                <span>${s.name}</span>
            </span>`;
        }).join("");

        const moreBadge = rest > 0 ? `<span class="members-more" title="${rest} thành viên khác">+${rest}</span>` : "";
        return chips + moreBadge;
    }

    function renderLecturerCell(item) {
        if (!item.lecturerHD) {
            return `<div class="unassigned-placeholder">
                <i class="fa-regular fa-user"></i>
                <span>Chưa có giảng viên</span>
            </div>`;
        }
        const initials = getInitials(item.lecturerHD);
        const lec = lecturerList.find(l => l.user_code === item.lecturer_code || l.name === item.lecturerHD);
        const metaLine = item.lecturer_code ? `<div class="lec-meta">${item.lecturer_code}${lec ? "" : ""}</div>` : "";
        return `<div class="lecturer-cell">
            <div class="lecturer-avatar">${initials}</div>
            <div class="lecturer-info">
                <div class="lec-name">${item.lecturerHD}</div>
                ${metaLine}
            </div>
        </div>`;
    }

    // ── QUICK STATS ───────────────────────────────────────────
    function updateQuickStats() {
        const total      = teamList.length;
        const assigned   = teamList.filter(t => !!t.lecturerHD).length;
        const unassigned = total - assigned;
        const lecSet     = new Set(teamList.filter(t => !!t.lecturerHD).map(t => t.lecturer_code || t.lecturerHD));

        const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.firstChild.textContent = val; };
        document.getElementById("statTotal").textContent     = total;
        document.getElementById("statAssigned").textContent  = assigned;
        document.getElementById("statLecturers").textContent = lecSet.size;

        // statUnassigned has nested pulse-dot
        const unassignedEl = document.getElementById("statUnassigned");
        if (unassignedEl) {
            unassignedEl.childNodes[0].textContent = unassigned;
        }

        const pulse = document.getElementById("unassignedPulse");
        if (pulse) pulse.style.display = unassigned > 0 ? "inline-block" : "none";

        // Nổi bật thẻ "Chưa phân công" khi > 0
        const urgentCard = document.querySelector(".stat-card.stat-urgent");
        if (urgentCard) {
            if (unassigned > 0) urgentCard.style.boxShadow = "0 4px 20px rgba(217,119,6,0.18)";
            else urgentCard.style.boxShadow = "";
        }
    }

    // ── FILTER CHIPS DISPLAY ──────────────────────────────────
    function renderFilterChips() {
        if (!activeFilterChips) return;
        const chips = [];
        const q = searchInput?.value.trim();
        const s = statusFilter?.value;

        if (q) chips.push(`<span class="filter-chip" data-clear="search">
            <i class="fa-solid fa-magnifying-glass"></i> "${q}"
            <i class="fa-solid fa-xmark"></i>
        </span>`);
        if (s === "assigned")   chips.push(`<span class="filter-chip" data-clear="status">
            <i class="fa-solid fa-check"></i> Đã phân công <i class="fa-solid fa-xmark"></i>
        </span>`);
        if (s === "unassigned") chips.push(`<span class="filter-chip" data-clear="status">
            <i class="fa-solid fa-clock"></i> Chưa phân công <i class="fa-solid fa-xmark"></i>
        </span>`);

        activeFilterChips.innerHTML = chips.join("");
        activeFilterChips.style.display = chips.length ? "flex" : "none";

        activeFilterChips.querySelectorAll(".filter-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                const type = chip.dataset.clear;
                if (type === "search" && searchInput) searchInput.value = "";
                if (type === "status" && statusFilter) statusFilter.value = "";
                handleFilter();
            });
        });

        if (resetFilterBtn) {
            resetFilterBtn.classList.toggle("active", !!(q || s));
        }
    }

    // ── RENDER TEAMS ──────────────────────────────────────────
    function renderTeams(data) {
        filteredList = data;
        tableBody.innerHTML = "";
        const totalPages = Math.ceil(data.length / pageSize);
        currentPage = Math.max(1, Math.min(currentPage, totalPages || 1));

        // All assigned banner
        const bannerEl = document.querySelector(".banner-all-assigned");
        if (bannerEl) bannerEl.remove();

        if (data.length === 0) {
            const hasFilter = searchInput?.value.trim() || statusFilter?.value || activeQuickFilter;
            tableBody.innerHTML = `
                <tr><td colspan="7">
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fa-solid fa-users-slash"></i></div>
                        <div class="empty-title">${hasFilter ? "Không tìm thấy nhóm phù hợp" : "Chưa có nhóm nào trong học kỳ này"}</div>
                        <div class="empty-desc">${hasFilter ? "Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm." : "Dữ liệu nhóm sẽ xuất hiện sau khi sinh viên đăng ký đề tài."}</div>
                        ${hasFilter ? `<button class="btn-action btn-action-outline btn-sm" onclick="document.getElementById('resetFilterBtn').click()">
                            <i class="fa-solid fa-rotate-left"></i> Xóa bộ lọc
                        </button>` : ""}
                    </div>
                </td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 nhóm";
            window.renderAdminPagination(paginationControls, 0, 0, () => {});
            syncSelectionControls();
            return;
        }

        const startIndex = (currentPage - 1) * pageSize;
        const pageData   = data.slice(startIndex, startIndex + pageSize);

        pageData.forEach(item => {
            const tr = document.createElement("tr");
            const isAssigned = !!item.lecturerHD;
            const isChecked  = selectedTeamIds.has(item._id || item.id);
            if (!isAssigned) tr.classList.add("unassigned-row");
            if (isChecked)   tr.classList.add("row-selected");

            const topicStatus = getTopicStatusInfo(item);
            const topicStatusHtml = topicStatus
                ? `<span class="topic-status-badge ${topicStatus.cls}"><span class="dot"></span>${topicStatus.label}</span>`
                : `<span style="color:#94A3B8;font-size:13px;">—</span>`;

            const gvhdBadge = isAssigned
                ? `<span class="gvhd-badge gvhd-assigned"><span class="dot"></span>Đã phân công</span>`
                : `<span class="gvhd-badge gvhd-unassigned"><span class="dot"></span>Chưa phân công</span>`;

            const actionBtn = isAssigned
                ? `<button class="btn-assign assign-change assign-btn" data-id="${item._id || item.id}"
                        title="Đổi giảng viên hướng dẫn" aria-label="Đổi GVHD nhóm ${item.id}">
                        <i class="fa-solid fa-arrows-rotate"></i> Đổi GV
                   </button>`
                : `<button class="btn-assign assign-new assign-btn" data-id="${item._id || item.id}"
                        title="Phân công giảng viên hướng dẫn" aria-label="Phân công GVHD nhóm ${item.id}">
                        <i class="fa-solid fa-user-plus"></i> Phân công
                   </button>`;

            tr.innerHTML = `
                <td class="col-check" style="text-align:center;">
                    <input type="checkbox" class="row-checkbox" data-id="${item._id || item.id}"
                        ${isChecked ? "checked" : ""} aria-label="Chọn nhóm ${item.id}">
                </td>
                <td><span class="team-code">${item.id}</span></td>
                <td>
                    <div class="topic-title">${item.topicTitle}</div>
                    <div class="members-row">${renderMemberChips(item.students || [])}</div>
                </td>
                <td>${topicStatusHtml}</td>
                <td>${renderLecturerCell(item)}</td>
                <td class="text-center">${gvhdBadge}</td>
                <td class="text-center"><div class="action-wrap">${actionBtn}</div></td>
            `;
            tableBody.appendChild(tr);
        });

        // Banner thông báo nếu tất cả nhóm đã có GVHD (đã loại bỏ dòng table row chèn vào bảng để tránh vỡ bố cục)

        const infoEl = document.getElementById("paginationInfo");
        if (infoEl) {
            infoEl.textContent = `Hiển thị ${startIndex + 1} – ${startIndex + pageData.length} trên tổng số ${data.length} nhóm`;
        }

        window.renderAdminPagination(paginationControls, currentPage, totalPages, page => {
            currentPage = page;
            renderTeams(data);
        });

        attachEvents();
        syncSelectionControls();
    }

    // ── SELECTION SYNC ────────────────────────────────────────
    function syncSelectionControls() {
        const count = selectedTeamIds.size;
        if (bulkSelectionCount) bulkSelectionCount.textContent = count;
        if (bulkToolbar) bulkToolbar.style.display = count > 0 ? "flex" : "none";
        if (bulkAssignBtn) {
            bulkAssignBtn.disabled = count === 0;
            bulkAssignBtn.title = count === 0 ? "Chọn ít nhất một nhóm" : `Phân công hàng loạt (${count} nhóm)`;
        }
        // Sync checkAll
        if (checkAll) {
            const pageIds = Array.from(tableBody.querySelectorAll(".row-checkbox")).map(c => c.dataset.id);
            const allChecked = pageIds.length > 0 && pageIds.every(id => selectedTeamIds.has(id));
            checkAll.checked = allChecked;
            checkAll.indeterminate = !allChecked && pageIds.some(id => selectedTeamIds.has(id));
        }
    }

    // ── ATTACH ROW EVENTS ─────────────────────────────────────
    function attachEvents() {
        // Assign buttons
        tableBody.querySelectorAll(".assign-btn").forEach(btn => {
            btn.onclick = e => {
                const id = e.currentTarget.getAttribute("data-id");
                openAssignModal(id);
            };
        });

        // Row checkboxes
        tableBody.querySelectorAll(".row-checkbox").forEach(cb => {
            cb.onchange = () => {
                const id = cb.dataset.id;
                if (cb.checked) selectedTeamIds.add(id);
                else selectedTeamIds.delete(id);
                syncSelectionControls();
            };
        });
    }

    // Check all handler
    if (checkAll) {
        checkAll.addEventListener("change", () => {
            const checkboxes = tableBody.querySelectorAll(".row-checkbox");
            checkboxes.forEach(cb => {
                cb.checked = checkAll.checked;
                const id = cb.dataset.id;
                if (checkAll.checked) selectedTeamIds.add(id);
                else selectedTeamIds.delete(id);
            });
            syncSelectionControls();
        });
    }

    if (clearTeamSelectionBtn) {
        clearTeamSelectionBtn.onclick = () => {
            selectedTeamIds.clear();
            tableBody.querySelectorAll(".row-checkbox").forEach(cb => cb.checked = false);
            syncSelectionControls();
        };
    }

    // Page size
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", () => {
            pageSize = parseInt(pageSizeSelect.value, 10) || 10;
            currentPage = 1;
            renderTeams(filteredList);
        });
    }

    // ── FILTER HANDLER ────────────────────────────────────────
    function handleFilter() {
        const query = searchInput?.value.toLowerCase().trim() || "";
        const selectedStatus = statusFilter?.value || "";
        const effectiveStatus = activeQuickFilter || selectedStatus;

        const filtered = teamList.filter(t => {
            const matchQuery =
                (t.id || "").toString().toLowerCase().includes(query) ||
                (t.topicTitle || "").toLowerCase().includes(query) ||
                (t.lecturerHD && t.lecturerHD.toLowerCase().includes(query)) ||
                (t.students || []).some(s =>
                    (s.name || "").toLowerCase().includes(query) ||
                    (s.code || "").toLowerCase().includes(query)
                );

            let matchStatus = true;
            if (effectiveStatus === "assigned")   matchStatus = !!t.lecturerHD;
            if (effectiveStatus === "unassigned") matchStatus = !t.lecturerHD;

            return matchQuery && matchStatus;
        });

        currentPage = 1;
        renderFilterChips();
        renderTeams(filtered);
    }

    if (searchInput) searchInput.addEventListener("input", handleFilter);
    if (statusFilter) statusFilter.addEventListener("change", handleFilter);

    if (resetFilterBtn) {
        resetFilterBtn.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            if (statusFilter) statusFilter.value = "";
            activeQuickFilter = "";
            document.querySelectorAll(".tab-btn").forEach(b => {
                b.classList.toggle("active", b.dataset.tabFilter === "");
                b.setAttribute("aria-pressed", b.dataset.tabFilter === "" ? "true" : "false");
            });
            handleFilter();
        });
    }

    // Quick filter tabs
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            activeQuickFilter = btn.dataset.tabFilter;
            if (statusFilter) statusFilter.value = "";
            document.querySelectorAll(".tab-btn").forEach(b => {
                b.classList.toggle("active", b === btn);
                b.setAttribute("aria-pressed", b === btn ? "true" : "false");
            });
            currentPage = 1;
            handleFilter();
        });
    });

    // Stat cards quick filter
    document.querySelectorAll(".stat-card[data-quick-filter]").forEach(card => {
        card.addEventListener("click", () => {
            const filter = card.dataset.quickFilter;
            activeQuickFilter = filter;
            if (statusFilter) statusFilter.value = "";
            document.querySelectorAll(".tab-btn").forEach(b => {
                b.classList.toggle("active", b.dataset.tabFilter === filter);
                b.setAttribute("aria-pressed", b.dataset.tabFilter === filter ? "true" : "false");
            });
            document.querySelectorAll(".stat-card").forEach(c => c.classList.remove("active-filter"));
            card.classList.add("active-filter");
            currentPage = 1;
            handleFilter();
        });
        card.addEventListener("keydown", e => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.click(); }
        });
    });

    // ── FETCH LECTURERS ───────────────────────────────────────
    async function fetchLecturers() {
        try {
            const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/lecturers", {
                headers: authHeaders
            });
            const result = await response.json();
            const rawList = Array.isArray(result) ? result : (result.data || []);
            lecturerList = rawList.map(item => ({
                id: item.user_code || item.id || "",
                name: item.full_name || item.name || "Chưa cập nhật",
                user_code: item.user_code || item.id || "",
                degree: item.degree || item.academic_rank || "",
                department: item.department || item.bomon || ""
            }));
        } catch (error) {
            console.error("Lỗi tải danh sách giảng viên:", error);
            lecturerList = [];
        }
    }

    // ── FETCH TEAMS ───────────────────────────────────────────
    async function fetchTeams() {
        try {
            const semesterId = semesterSelect?.value;
            const semesterQuery = semesterId ? `?semester=${encodeURIComponent(semesterId)}` : "";
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/admin/all${semesterQuery}`, {
                headers: authHeaders
            });
            const result = await response.json();

            if (!response.ok || !result || !Array.isArray(result.data)) {
                throw new Error(result?.message || "Không tải được dữ liệu nhóm");
            }

            teamList = result.data.map(item => ({
                _id: item._id,
                id: item.id || item._id,
                topicTitle: item.topicTitle || "Chưa có tiêu đề",
                lecturerHD: item.lecturerHD || null,
                lecturer_code: item.lecturer_code || null,
                students: Array.isArray(item.students) ? item.students : [],
                status: item.status || "",
                topicStatus: item.topicStatus || ""
            }));

            updateQuickStats();
            handleFilter();
        } catch (error) {
            console.error("Lỗi tải nhóm:", error);
            tableBody.innerHTML = `
                <tr><td colspan="7">
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fa-solid fa-triangle-exclamation" style="color:#EF4444;"></i></div>
                        <div class="empty-title">Không thể tải dữ liệu</div>
                        <div class="empty-desc">${error.message || "Lỗi kết nối máy chủ. Vui lòng thử lại."}</div>
                    </div>
                </td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 nhóm";
            window.renderAdminPagination(paginationControls, 0, 0, () => {});
        }
    }

    // ── OPEN ASSIGN MODAL ─────────────────────────────────────
    function openAssignModal(teamId) {
        selectedTeamId = teamId;
        const team = teamList.find(t => t._id === teamId || t.id === teamId);
        if (!team) return;

        const isChange = !!team.lecturerHD;

        // Update title
        if (assignModalSubtitle) {
            assignModalSubtitle.textContent = isChange
                ? `Đổi giảng viên hướng dẫn — Nhóm ${team.id}`
                : `Phân công giảng viên hướng dẫn — Nhóm ${team.id}`;
        }
        if (saveAssignText) {
            saveAssignText.textContent = isChange ? "Xác nhận đổi GV" : "Xác nhận phân công";
        }

        // Team summary
        if (modalTeamTitle) {
            const membersText = (team.students || []).map(s =>
                `${s.name}${s.isLeader ? " (Trưởng nhóm)" : ""}`
            ).join(", ") || "Chưa có thành viên";

            modalTeamTitle.innerHTML = `
                <div class="team-summary-box">
                    <div class="summary-row">
                        <span class="summary-label">Mã nhóm:</span>
                        <span class="summary-value"><strong>${team.id}</strong></span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">Đề tài:</span>
                        <span class="summary-value">${team.topicTitle}</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">Thành viên:</span>
                        <span class="summary-value">${membersText}</span>
                    </div>
                    ${isChange ? `<div class="summary-row">
                        <span class="summary-label">GVHD hiện tại:</span>
                        <span class="summary-value" style="color:var(--warning,#D97706);font-weight:600;">${team.lecturerHD}</span>
                    </div>` : ""}
                </div>`;
        }

        // Assign change note
        if (assignChangeNote) {
            if (isChange) {
                assignChangeNote.style.display = "flex";
                assignChangeNote.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i>
                    Bạn đang thay đổi GVHD từ <strong>${team.lecturerHD}</strong> sang giảng viên mới.`;
            } else {
                assignChangeNote.style.display = "none";
            }
        }

        // Populate lecturer select
        lecturerHDSelect.innerHTML = `<option value="">-- Chọn Giảng Viên Hướng Dẫn --</option>`;
        lecturerList.forEach(lec => {
            const selected = (team.lecturer_code || team.lecturerHD) === lec.user_code ||
                             team.lecturerHD === lec.name ? "selected" : "";
            const meta = [lec.degree, lec.department].filter(Boolean).join(" · ");
            lecturerHDSelect.innerHTML += `<option value="${lec.user_code}" ${selected}>${lec.name}${meta ? " — " + meta : ""}</option>`;
        });

        // Clear lecturer search
        if (lecturerSearchInput) lecturerSearchInput.value = "";

        assignModal.style.display = "flex";
    }

    // Lecturer search in modal
    if (lecturerSearchInput) {
        lecturerSearchInput.addEventListener("input", () => {
            const q = lecturerSearchInput.value.toLowerCase().trim();
            Array.from(lecturerHDSelect.options).forEach(opt => {
                if (!opt.value) return;
                opt.style.display = opt.textContent.toLowerCase().includes(q) ? "" : "none";
            });
        });
    }

    // ── SAVE ASSIGN ───────────────────────────────────────────
    if (saveAssignBtn) {
        saveAssignBtn.onclick = async () => {
            const selectedLecturer = lecturerHDSelect.value;
            if (!selectedLecturer) {
                showAppNotification("Vui lòng chọn Giảng viên hướng dẫn!");
                return;
            }
            if (!selectedTeamId) {
                showAppNotification("Không tìm thấy nhóm cần phân công!");
                return;
            }

            // Loading state
            saveAssignBtn.disabled = true;
            if (saveAssignText) saveAssignText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...`;

            try {
                const res = await apiFetch(
                    `${window.APP_CONFIG.API_BASE_URL}/api/topics/admin/assign-lecturer/${selectedTeamId}`,
                    {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json", ...authHeaders },
                        body: JSON.stringify({ lecturer_code: selectedLecturer })
                    }
                );
                const data = await res.json();
                if (!res.ok || !data.success) throw new Error(data.message || "Không thể phân công giảng viên");

                showAppNotification(data.message || "Phân công thành công!");
                assignModal.style.display = "none";
                await fetchTeams();

                // Highlight row
                setTimeout(() => {
                    const rows = tableBody.querySelectorAll("tr");
                    rows.forEach(row => {
                        const codeEl = row.querySelector(".team-code");
                        const team   = teamList.find(t => t._id === selectedTeamId || t.id === selectedTeamId);
                        if (codeEl && team && codeEl.textContent === team.id) {
                            row.classList.add("row-highlight");
                            setTimeout(() => row.classList.remove("row-highlight"), 1500);
                        }
                    });
                }, 300);

            } catch (error) {
                console.error("Lỗi phân công giảng viên:", error);
                showAppNotification(error.message || "Lỗi phân công giảng viên!");
            } finally {
                saveAssignBtn.disabled = false;
                if (saveAssignText) saveAssignText.textContent = "Xác nhận phân công";
            }
        };
    }

    // Export Grades
    const exportGradesBtn = document.getElementById("exportGradesBtn");
    if (exportGradesBtn) {
        exportGradesBtn.addEventListener("click", async () => {
            const originalHtml = exportGradesBtn.innerHTML;
            exportGradesBtn.disabled = true;
            exportGradesBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất...';
            try {
                const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/grades/export`);
                if (!response.ok) {
                    const result = await response.json().catch(() => ({}));
                    throw new Error(result.message || "Không thể xuất bảng điểm.");
                }

                const blob = await response.blob();
                if (!blob.size) throw new Error("File Excel tải về đang trống.");
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = `bang-diem-tong-ket-${new Date().toISOString().slice(0, 10)}.xlsx`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                showAppNotification("Đã xuất bảng điểm tổng kết Excel thành công!");
            } catch (error) {
                console.error("Lỗi xuất bảng điểm:", error);
                showAppNotification(error.message || "Không thể xuất bảng điểm.");
            } finally {
                exportGradesBtn.disabled = false;
                exportGradesBtn.innerHTML = originalHtml;
            }
        });
    }

    // Modal close
    if (closeAssignModal) closeAssignModal.onclick = () => assignModal.style.display = "none";
    if (cancelAssignBtn)  cancelAssignBtn.onclick  = () => assignModal.style.display = "none";
    assignModal?.addEventListener("click", e => { if (e.target === assignModal) assignModal.style.display = "none"; });

    // Bulk assign (placeholder - opens first unassigned)
    const handleBulkAssign = () => {
        if (selectedTeamIds.size === 0) return;
        showAppNotification(`Phân công hàng loạt ${selectedTeamIds.size} nhóm (tính năng đang phát triển).`);
    };
    if (bulkAssignBtn)        bulkAssignBtn.onclick        = handleBulkAssign;
    if (bulkAssignToolbarBtn) bulkAssignToolbarBtn.onclick = handleBulkAssign;

    // Logout
    if (openLogoutBtn) openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    if (cancelLogout)  cancelLogout.onclick  = () => logoutModal.style.display = "none";
    if (confirmLogout) {
        confirmLogout.onclick = () => {
            localStorage.clear();
            window.location.href = "../auth/index.html";
        };
    }
    logoutModal?.addEventListener("click", e => { if (e.target === logoutModal) logoutModal.style.display = "none"; });

    if (semesterSelect) {
        semesterSelect.addEventListener("change", () => {
            currentPage = 1;
            selectedTeamIds.clear();
            syncSelectionControls();
            fetchTeams();
        });
    }

    // ── INIT ──────────────────────────────────────────────────
    await Promise.all([loadSemesterOptions(), fetchLecturers()]);
    await fetchTeams();
});
