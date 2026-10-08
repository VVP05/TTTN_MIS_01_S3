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

    const deleteModal = document.getElementById("deleteModal");
    const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("logoutBtn");
    const cancelLogout = document.getElementById("cancelLogoutBtn");
    const confirmLogout = document.getElementById("confirmLogoutBtn");

    async function requestMilestones(path, method = "GET", body) {
        const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
        if (!auth?.token) throw new Error("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");

        const options = {
            method,
            headers: { "Authorization": `Bearer ${auth.token}` }
        };
        if (body) {
            options.headers["Content-Type"] = "application/json";
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`http://localhost:5000/api/milestones${path}`, options);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể lưu milestone.");
        return result;
    }

    function notify(message) {
        if (typeof showAppNotification === "function") showAppNotification(message);
        else window.alert(message);
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

        if (totalCount) totalCount.textContent = milestoneList.length;
        if (activeCount) activeCount.textContent = milestoneList.filter(m => m.status === 'active').length;
        if (upcomingCount) upcomingCount.textContent = milestoneList.filter(m => m.status === 'upcoming').length;
    }

    function formatDate(dateStr) {
        if (!dateStr) return "-";
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes} - ${day}/${month}/${year}`;
    }

    function renderMilestones(data) {
        if (!tableBody) return;
        tableBody.innerHTML = "";

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px; color: #94a3b8;">Không tìm thấy milestone nào</td></tr>`;
            return;
        }

        data.forEach((item, index) => {
            const tr = document.createElement("tr");

            let statusBadge = "";
            if (item.status === "active") statusBadge = `<span class="status-badge status-active">Đang mở</span>`;
            else if (item.status === "upcoming") statusBadge = `<span class="status-badge status-upcoming">Sắp mở</span>`;
            else statusBadge = `<span class="status-badge status-closed">Đã đóng</span>`;

            tr.innerHTML = `
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>
                    <div class="ms-name">${escapeHtml(item.name)}</div>
                    <div class="ms-desc">${escapeHtml(item.desc || 'Không có ghi chú')}</div>
                </td>
                <td>${formatDate(item.startDate)}</td>
                <td><strong>${formatDate(item.endDate)}</strong></td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center">
                    <button class="table-action-btn edit-btn" data-id="${item._id}" title="Sửa"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="table-action-btn delete delete-btn" data-id="${item._id}" title="Xóa"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        attachTableEvents();
    }

    function handleFilter() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        const selectedStatus = statusFilter ? statusFilter.value : "";

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
        modalTitle.textContent = "Tạo Milestone Mới";
        milestoneForm.reset();
        milestoneIdInput.value = "";
        milestoneModal.style.display = "flex";
    };

    function openEditModal(id) {
        const item = milestoneList.find(m => m._id === id);
        if (!item) return;

        if (!milestoneModal || !modalTitle || !milestoneNameInput || !milestoneDescInput || !startDateInput || !endDateInput) return;

        modalTitle.textContent = "Chỉnh Sửa Milestone";
        milestoneIdInput.value = item._id;
        milestoneNameInput.value = item.name;
        milestoneDescInput.value = item.desc;
        startDateInput.value = toDateTimeLocal(item.startDate);
        endDateInput.value = toDateTimeLocal(item.endDate);
        milestoneModal.style.display = "flex";
    }

    if (saveMilestoneBtn) saveMilestoneBtn.onclick = async () => {
        if (!milestoneNameInput || !startDateInput || !endDateInput || !milestoneModal) return;
        if (!milestoneNameInput.value || !startDateInput.value || !endDateInput.value) {
            if (typeof showAppNotification === "function") {
                showAppNotification("Vui lòng điền đầy đủ các thông tin bắt buộc (*)");
            }
            return;
        }

        const id = milestoneIdInput.value;
        const payload = {
            name: milestoneNameInput.value,
            desc: milestoneDescInput ? milestoneDescInput.value : "",
            startDate: startDateInput.value,
            endDate: endDateInput.value
        };

        saveMilestoneBtn.disabled = true;
        try {
            await requestMilestones(id ? `/${encodeURIComponent(id)}` : "", id ? "PATCH" : "POST", payload);
            await loadMilestones();
            milestoneModal.style.display = "none";
        } catch (error) {
            notify(error.message);
        } finally {
            saveMilestoneBtn.disabled = false;
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
            try {
                await requestMilestones(`/${encodeURIComponent(deleteTargetId)}`, "DELETE");
                if (deleteModal) deleteModal.style.display = "none";
                deleteTargetId = null;
                await loadMilestones();
            } catch (error) {
                notify(error.message);
            } finally {
                confirmDeleteBtn.disabled = false;
            }
        }
    };

    if (closeMilestoneModal && milestoneModal) closeMilestoneModal.onclick = () => milestoneModal.style.display = "none";
    if (cancelMilestoneBtn && milestoneModal) cancelMilestoneBtn.onclick = () => milestoneModal.style.display = "none";
    if (cancelDeleteBtn && deleteModal) cancelDeleteBtn.onclick = () => deleteModal.style.display = "none";

    if (openLogoutBtn && logoutModal) openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    if (cancelLogout && logoutModal) cancelLogout.onclick = () => logoutModal.style.display = "none";
    if (confirmLogout) confirmLogout.onclick = () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "index.html";
    };

    loadMilestones();
});
