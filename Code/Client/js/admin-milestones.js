document.addEventListener("DOMContentLoaded", () => {

    // 1. DỮ LIỆU MILESTONES MẪU
    let milestoneList = [
        {
            id: 1,
            name: "Đăng ký nhóm & Đề tài TTTN",
            desc: "Sinh viên hoàn tất đăng ký nhóm và nộp đề cương sơ bộ.",
            startDate: "2026-02-01T08:00",
            endDate: "2026-02-15T23:59",
            allowLate: false,
            status: "closed"
        },
        {
            id: 2,
            name: "Báo cáo Tiến độ / Giữa kỳ",
            desc: "Nộp báo cáo tiến độ tuần 6 & xác nhận từ Giảng viên hướng dẫn.",
            startDate: "2026-03-01T08:00",
            endDate: "2026-03-25T23:59",
            allowLate: true,
            status: "active"
        },
        {
            id: 3,
            name: "Nộp Báo cáo Tổng kết & Mã nguồn",
            desc: "Nộp file cuốn Báo cáo Thực tập chính thức (PDF) và đường dẫn Source code.",
            startDate: "2026-05-01T08:00",
            endDate: "2026-05-15T23:59",
            allowLate: false,
            status: "upcoming"
        }
    ];

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
    const allowLateInput = document.getElementById("allowLate");

    const deleteModal = document.getElementById("deleteModal");
    const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    // 2. TÍNH TOÁN VÀ CẬP NHẬT THỐNG KÊ
    function updateSummaryCards() {
        document.getElementById("totalCount").textContent = milestoneList.length;
        document.getElementById("activeCount").textContent = milestoneList.filter(m => m.status === 'active').length;
        document.getElementById("upcomingCount").textContent = milestoneList.filter(m => m.status === 'upcoming').length;
        document.getElementById("closedCount").textContent = milestoneList.filter(m => m.status === 'closed').length;
    }

    // FORMAT DATE DISPLAY
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

    // 3. RENDER BẢNG DỮ LIỆU
    function renderMilestones(data) {
        tableBody.innerHTML = "";

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 20px; color: #94a3b8;">Không tìm thấy milestone nào</td></tr>`;
            return;
        }

        data.forEach((item, index) => {
            const tr = document.createElement("tr");

            let statusBadge = "";
            if (item.status === "active") statusBadge = `<span class="status-badge status-active">Đang mở</span>`;
            else if (item.status === "upcoming") statusBadge = `<span class="status-badge status-upcoming">Sắp mở</span>`;
            else statusBadge = `<span class="status-badge status-closed">Đã đóng</span>`;

            const lateBadge = item.allowLate 
                ? `<span class="badge-late-yes"><i class="fa-solid fa-check"></i> Có</span>` 
                : `<span class="badge-late-no"><i class="fa-solid fa-xmark"></i> Không</span>`;

            tr.innerHTML = `
                <td class="text-center"><strong>${index + 1}</strong></td>
                <td>
                    <div class="ms-name">${item.name}</div>
                    <div class="ms-desc">${item.desc || 'Không có ghi chú'}</div>
                </td>
                <td>${formatDate(item.startDate)}</td>
                <td><strong>${formatDate(item.endDate)}</strong></td>
                <td class="text-center">${lateBadge}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center">
                    <button class="table-action-btn edit-btn" data-id="${item.id}" title="Sửa"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="table-action-btn delete delete-btn" data-id="${item.id}" title="Xóa"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        attachTableEvents();
    }

    // 4. LỌC & TÌM KIẾM
    function handleFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedStatus = statusFilter.value;

        const filtered = milestoneList.filter(m => {
            const matchQuery = m.name.toLowerCase().includes(query) || m.desc.toLowerCase().includes(query);
            const matchStatus = selectedStatus === "" || m.status === selectedStatus;
            return matchQuery && matchStatus;
        });

        renderMilestones(filtered);
    }

    searchInput.addEventListener("input", handleFilter);
    statusFilter.addEventListener("change", handleFilter);

    resetFilterBtn.addEventListener("click", () => {
        searchInput.value = "";
        statusFilter.value = "";
        handleFilter();
    });

    // 5. MỞ MODAL TẠO / SỬA
    openAddModalBtn.onclick = () => {
        modalTitle.textContent = "Tạo Milestone Mới";
        milestoneForm.reset();
        milestoneIdInput.value = "";
        milestoneModal.style.display = "flex";
    };

    function openEditModal(id) {
        const item = milestoneList.find(m => m.id === id);
        if (!item) return;

        modalTitle.textContent = "Chỉnh Sửa Milestone";
        milestoneIdInput.value = item.id;
        milestoneNameInput.value = item.name;
        milestoneDescInput.value = item.desc;
        startDateInput.value = item.startDate;
        endDateInput.value = item.endDate;
        allowLateInput.checked = item.allowLate;

        milestoneModal.style.display = "flex";
    }

    // LƯU MILESTONE
    saveMilestoneBtn.onclick = () => {
        if (!milestoneNameInput.value || !startDateInput.value || !endDateInput.value) {
            alert("Vui lòng điền đầy đủ các thông tin bắt buộc (*)");
            return;
        }

        const id = milestoneIdInput.value;
        const now = new Date();
        const start = new Date(startDateInput.value);
        const end = new Date(endDateInput.value);

        // Auto xác định trạng thái dựa trên thời gian
        let computedStatus = "upcoming";
        if (now >= start && now <= end) computedStatus = "active";
        else if (now > end) computedStatus = "closed";

        if (id) {
            // Cập nhật
            const index = milestoneList.findIndex(m => m.id === parseInt(id));
            if (index !== -1) {
                milestoneList[index] = {
                    id: parseInt(id),
                    name: milestoneNameInput.value,
                    desc: milestoneDescInput.value,
                    startDate: startDateInput.value,
                    endDate: endDateInput.value,
                    allowLate: allowLateInput.checked,
                    status: computedStatus
                };
            }
        } else {
            // Thêm mới
            const newId = milestoneList.length > 0 ? Math.max(...milestoneList.map(m => m.id)) + 1 : 1;
            milestoneList.push({
                id: newId,
                name: milestoneNameInput.value,
                desc: milestoneDescInput.value,
                startDate: startDateInput.value,
                endDate: endDateInput.value,
                allowLate: allowLateInput.checked,
                status: computedStatus
            });
        }

        updateSummaryCards();
        handleFilter();
        milestoneModal.style.display = "none";
    };

    // EVENT LỰA CHỌN TẠI BẢNG
    function attachTableEvents() {
        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = parseInt(e.currentTarget.getAttribute("data-id"));
                openEditModal(id);
            };
        });

        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = (e) => {
                deleteTargetId = parseInt(e.currentTarget.getAttribute("data-id"));
                deleteModal.style.display = "flex";
            };
        });
    }

    // XÓA MILESTONE
    confirmDeleteBtn.onclick = () => {
        if (deleteTargetId !== null) {
            milestoneList = milestoneList.filter(m => m.id !== deleteTargetId);
            updateSummaryCards();
            handleFilter();
            deleteModal.style.display = "none";
            deleteTargetId = null;
        }
    };

    // CLOSE MODALS
    closeMilestoneModal.onclick = () => milestoneModal.style.display = "none";
    cancelMilestoneBtn.onclick = () => milestoneModal.style.display = "none";
    cancelDeleteBtn.onclick = () => deleteModal.style.display = "none";

    // LOGOUT
    openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    cancelLogout.onclick = () => logoutModal.style.display = "none";
    confirmLogout.onclick = () => {
        localStorage.clear();
        window.location.href = "index.html";
    };

    // KHỞI TẠO BAN ĐẦU
    updateSummaryCards();
    handleFilter();
});