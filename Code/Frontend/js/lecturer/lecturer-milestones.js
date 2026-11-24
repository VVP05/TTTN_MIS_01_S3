document.addEventListener("DOMContentLoaded", () => {

    let milestoneList = [];
    let deleteTargetId = null;

    // DOM ELEMENTS
    const tableBody = document.getElementById("milestoneTableBody");
    const searchInput = document.getElementById("searchInput");
    const statusFilter = document.getElementById("statusFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");

    const milestoneModal = document.getElementById("milestoneModal");
    const modalTitle = document.getElementById("modalTitle");
    const openAddModalBtn = document.getElementById("openAddModalBtn");
    const closeMilestoneModal = document.getElementById("closeMilestoneModal");
    const cancelMilestoneBtn = document.getElementById("cancelMilestoneBtn");
    const saveMilestoneBtn = document.getElementById("saveMilestoneBtn");

    const milestoneForm = document.getElementById("milestoneForm");
    const milestoneIdInput = document.getElementById("milestoneId");
    const milestoneNameInput = document.getElementById("milestoneName");
    const milestoneDescInput = document.getElementById("milestoneDesc");
    const startDateInput = document.getElementById("startDate");
    const endDateInput = document.getElementById("endDate");
    const dateValidationMsg = document.getElementById("dateValidationMsg");

    const deleteModal = document.getElementById("deleteModal");
    const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

    const tableFooterBar = document.getElementById("tableFooterBar");
    const tableFooterInfo = document.getElementById("tableFooterInfo");

    async function requestMilestones(path, method = "GET", body) {
        const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
        if (auth?.user?.role !== "LECTURER") throw new Error("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");

        const options = {
            method,
            headers: { "Authorization": `Bearer ${auth.token}` }
        };
        if (body) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }

        const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/milestones${path}`, options);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể lưu milestone.");
        return result;
    }

    function notify(message) {
        if (typeof showAppNotification === "function") showAppNotification(message);
        else window.showMessageDialog(message);
    }

    function toDateTimeLocal(value) {
        const date = new Date(value);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        return date.toISOString().slice(0, 16);
    }

    function escapeHtml(value) {
        return String(value || "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    async function loadMilestones() {
        try {
            const result = await requestMilestones("/lecturer");
            milestoneList = result.data || [];
            updateSummaryCards();
            handleFilter();
        } catch (error) {
            notify(error.message);
        }
    }

    function updateSummaryCards() {
        const totalCount = document.getElementById("totalCount");
        const activeCount = document.getElementById("activeCount");
        const upcomingCount = document.getElementById("upcomingCount");
        const closedCount = document.getElementById("closedCount");

        const total = milestoneList.length;
        const active = milestoneList.filter(m => m.status === 'active').length;
        const upcoming = milestoneList.filter(m => m.status === 'upcoming').length;
        const closed = milestoneList.filter(m => m.status === 'closed').length;

        if (totalCount) animateCount(totalCount, total);
        if (activeCount) animateCount(activeCount, active);
        if (upcomingCount) animateCount(upcomingCount, upcoming);
        if (closedCount) animateCount(closedCount, closed);
    }

    function animateCount(element, target) {
        const start = parseInt(element.textContent, 10) || 0;
        if (start === target) {
            element.textContent = target;
            return;
        }
        const duration = 300;
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

    // Bấm vào thẻ thống kê để lọc bảng theo trạng thái
    document.querySelectorAll(".summary-card[data-filter]").forEach(card => {
        card.addEventListener("click", () => {
            const filterVal = card.getAttribute("data-filter");
            if (statusFilter) {
                statusFilter.value = filterVal;
                handleFilter();
            }
        });
    });

    function formatDateParts(dateStr) {
        if (!dateStr) return { date: "-", time: "" };
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return {
            date: `${day}/${month}/${year}`,
            time: `${hours}:${minutes}`
        };
    }

    function getCountdownBadge(endDateStr, status) {
        if (!endDateStr || status === "closed") return "";
        const now = new Date();
        const deadline = new Date(endDateStr);
        const diffMs = deadline - now;
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            const overdueDays = Math.abs(diffDays);
            return `<span class="countdown-chip countdown-red"><i class="fa-solid fa-triangle-exclamation"></i> Quá hạn ${overdueDays} ngày</span>`;
        } else if (diffDays === 0) {
            return `<span class="countdown-chip countdown-orange"><i class="fa-regular fa-clock"></i> Hạn chót hôm nay</span>`;
        } else if (diffDays <= 3) {
            return `<span class="countdown-chip countdown-orange"><i class="fa-regular fa-clock"></i> Còn ${diffDays} ngày</span>`;
        } else {
            return `<span class="countdown-chip countdown-green"><i class="fa-regular fa-calendar-check"></i> Còn ${diffDays} ngày</span>`;
        }
    }

    function renderMilestones(data) {
        if (!tableBody) return;
        tableBody.innerHTML = "";

        const query = searchInput ? searchInput.value.trim() : "";
        const selectedStatus = statusFilter ? statusFilter.value : "";
        const isFiltering = Boolean(query || selectedStatus);

        if (tableFooterBar && tableFooterInfo) {
            tableFooterBar.style.display = data.length > 0 ? "flex" : "none";
            tableFooterInfo.textContent = `Hiển thị ${data.length} trên tổng số ${milestoneList.length} milestone`;
        }

        if (data.length === 0) {
            if (isFiltering) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6">
                            <div class="empty-state-wrap">
                                <div class="empty-state-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                                <h3 class="empty-state-title">Không tìm thấy milestone phù hợp</h3>
                                <p class="empty-state-desc">Không có kết quả nào khớp với điều kiện tìm kiếm hoặc bộ lọc hiện tại.</p>
                                <button type="button" class="btn btn-outline" onclick="document.getElementById('resetFilterBtn').click()">
                                    <i class="fa-solid fa-rotate-left"></i> Xóa bộ lọc
                                </button>
                            </div>
                        </td>
                    </tr>`;
            } else {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6">
                            <div class="empty-state-wrap">
                                <div class="empty-state-icon"><i class="fa-solid fa-flag"></i></div>
                                <h3 class="empty-state-title">Chưa có milestone nào</h3>
                                <p class="empty-state-desc">Tạo milestone để đặt mốc và hạn nộp bài cho các nhóm sinh viên do bạn hướng dẫn.</p>
                                <button type="button" class="btn btn-primary" onclick="document.getElementById('openAddModalBtn').click()">
                                    <i class="fa-solid fa-plus"></i> Tạo milestone mới
                                </button>
                            </div>
                        </td>
                    </tr>`;
            }
            return;
        }

        data.forEach((item, index) => {
            const tr = document.createElement("tr");

            let statusBadge = "";
            if (item.status === "active") statusBadge = `<span class="status-badge status-active">Đang mở</span>`;
            else if (item.status === "upcoming") statusBadge = `<span class="status-badge status-upcoming">Sắp mở</span>`;
            else statusBadge = `<span class="status-badge status-closed">Đã đóng</span>`;

            const startParts = formatDateParts(item.startDate);
            const endParts = formatDateParts(item.endDate);
            const countdownHtml = getCountdownBadge(item.endDate, item.status);

            tr.innerHTML = `
                <td class="text-center">
                    <span class="stt-circle">${index + 1}</span>
                </td>
                <td>
                    <div class="ms-name">${escapeHtml(item.name)}</div>
                    <div class="ms-desc">${escapeHtml(item.desc || 'Không có ghi chú yêu cầu')}</div>
                </td>
                <td>
                    <div class="date-cell-wrap">
                        <span class="date-primary"><i class="fa-regular fa-calendar"></i> ${startParts.date}</span>
                        <span class="date-time"><i class="fa-regular fa-clock"></i> ${startParts.time}</span>
                    </div>
                </td>
                <td>
                    <div class="date-cell-wrap">
                        <span class="date-primary"><i class="fa-regular fa-calendar-check"></i> ${endParts.date}</span>
                        <span class="date-time"><i class="fa-regular fa-clock"></i> ${endParts.time}</span>
                        ${countdownHtml}
                    </div>
                </td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center">
                    <div class="action-buttons-wrap">
                        <button class="table-action-btn edit-btn" data-id="${item._id}" title="Chỉnh sửa milestone" aria-label="Chỉnh sửa"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button class="table-action-btn delete-btn" data-id="${item._id}" title="Xóa milestone" aria-label="Xóa"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        attachTableEvents();
    }

    function handleFilter() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const selectedStatus = statusFilter ? statusFilter.value : "";

        if (resetFilterBtn) {
            if (query || selectedStatus) resetFilterBtn.classList.add("has-filter");
            else resetFilterBtn.classList.remove("has-filter");
        }

        const filtered = milestoneList.filter(m => {
            const matchQuery = (m.name || "").toLowerCase().includes(query) || (m.desc || "").toLowerCase().includes(query);
            const matchStatus = selectedStatus === "" || m.status === selectedStatus;
            return matchQuery && matchStatus;
        });

        renderMilestones(filtered);
    }

    if (searchInput) searchInput.addEventListener("input", handleFilter);
    if (statusFilter) statusFilter.addEventListener("change", handleFilter);

    if (resetFilterBtn) resetFilterBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        if (statusFilter) statusFilter.value = "";
        handleFilter();
    });

    if (openAddModalBtn) openAddModalBtn.onclick = () => {
        if (!milestoneModal || !modalTitle || !milestoneForm || !milestoneIdInput) return;
        modalTitle.textContent = "Tạo milestone mới";
        milestoneForm.reset();
        milestoneIdInput.value = "";
        if (dateValidationMsg) dateValidationMsg.style.display = "none";
        milestoneModal.style.display = "flex";
    };

    function validateDates() {
        if (!startDateInput || !endDateInput) return true;
        if (startDateInput.value && endDateInput.value) {
            const start = new Date(startDateInput.value);
            const end = new Date(endDateInput.value);
            if (end <= start) {
                if (dateValidationMsg) dateValidationMsg.style.display = "block";
                return false;
            }
        }
        if (dateValidationMsg) dateValidationMsg.style.display = "none";
        return true;
    }

    if (startDateInput) startDateInput.addEventListener("change", validateDates);
    if (endDateInput) endDateInput.addEventListener("change", validateDates);

    function openEditModal(id) {
        const item = milestoneList.find(m => m._id === id);
        if (!item) return;

        if (!milestoneModal || !modalTitle || !milestoneNameInput || !milestoneDescInput || !startDateInput || !endDateInput) return;

        modalTitle.textContent = "Chỉnh sửa milestone";
        milestoneIdInput.value = item._id;
        milestoneNameInput.value = item.name;
        milestoneDescInput.value = item.desc || "";
        startDateInput.value = toDateTimeLocal(item.startDate);
        endDateInput.value = toDateTimeLocal(item.endDate);
        if (dateValidationMsg) dateValidationMsg.style.display = "none";
        milestoneModal.style.display = "flex";
    }

    if (saveMilestoneBtn) saveMilestoneBtn.onclick = async () => {
        if (!milestoneNameInput || !startDateInput || !endDateInput || !milestoneModal) return;
        if (!milestoneNameInput.value.trim() || !startDateInput.value || !endDateInput.value) {
            notify("Vui lòng điền đầy đủ các thông tin bắt buộc (*)");
            return;
        }

        if (!validateDates()) {
            notify("Hạn nộp bài phải sau thời gian bắt đầu mở.");
            return;
        }

        const id = milestoneIdInput.value;
        const payload = {
            name: milestoneNameInput.value.trim(),
            desc: milestoneDescInput ? milestoneDescInput.value.trim() : "",
            startDate: startDateInput.value,
            endDate: endDateInput.value
        };

        saveMilestoneBtn.disabled = true;
        const originalText = saveMilestoneBtn.innerHTML;
        saveMilestoneBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

        try {
            await requestMilestones(id ? `/${encodeURIComponent(id)}` : "", id ? "PATCH" : "POST", payload);
            await loadMilestones();
            milestoneModal.style.display = "none";
            notify(id ? "Cập nhật milestone thành công!" : "Tạo milestone mới thành công!");
        } catch (error) {
            notify(error.message);
        } finally {
            saveMilestoneBtn.disabled = false;
            saveMilestoneBtn.innerHTML = originalText;
        }
    };

    function attachTableEvents() {
        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                openEditModal(id);
            };
        });

        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = (e) => {
                deleteTargetId = e.currentTarget.getAttribute("data-id");
                if (deleteModal) deleteModal.style.display = "flex";
            };
        });
    }

    if (confirmDeleteBtn) confirmDeleteBtn.onclick = async () => {
        if (deleteTargetId !== null) {
            confirmDeleteBtn.disabled = true;
            const originalText = confirmDeleteBtn.innerHTML;
            confirmDeleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';
            try {
                await requestMilestones(`/${encodeURIComponent(deleteTargetId)}`, "DELETE");
                if (deleteModal) deleteModal.style.display = "none";
                deleteTargetId = null;
                await loadMilestones();
                notify("Xóa milestone thành công!");
            } catch (error) {
                notify(error.message);
            } finally {
                confirmDeleteBtn.disabled = false;
                confirmDeleteBtn.innerHTML = originalText;
            }
        }
    };

    if (closeMilestoneModal && milestoneModal) closeMilestoneModal.onclick = () => milestoneModal.style.display = "none";
    if (cancelMilestoneBtn && milestoneModal) cancelMilestoneBtn.onclick = () => milestoneModal.style.display = "none";
    if (cancelDeleteBtn && deleteModal) cancelDeleteBtn.onclick = () => deleteModal.style.display = "none";

    window.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal-overlay")) {
            e.target.style.display = "none";
        }
    });

    loadMilestones();
});
