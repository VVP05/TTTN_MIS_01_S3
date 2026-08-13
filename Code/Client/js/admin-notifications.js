document.addEventListener("DOMContentLoaded", () => {

    const API_BASE_URL = "http://localhost:5000/api/notifications";
    let notificationList = [];

    let deleteTargetId = null;

    // DOM ELEMENTS
    const tableBody = document.getElementById("notifTableBody");
    const searchInput = document.getElementById("searchInput");
    const targetFilter = document.getElementById("targetFilter");
    const statusFilter = document.getElementById("statusFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");

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

    const saveDraftBtn = document.getElementById("saveDraftBtn");
    const publishBtn = document.getElementById("publishBtn");

    const viewModal = document.getElementById("viewModal");
    const closeViewModal = document.getElementById("closeViewModal");
    const closeViewBtn = document.getElementById("closeViewBtn");

    const deleteModal = document.getElementById("deleteModal");
    const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
    const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    async function loadNotifications() {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/all`);
            const result = await response.json();
            if (response.ok && result.success) {
                notificationList = Array.isArray(result.notifications) ? result.notifications : [];
                updateSummaryCards();
                handleFilter();
            } else {
                console.error('Lỗi tải thông báo:', result.message);
                notificationList = [];
                updateSummaryCards();
                renderNotifications([]);
            }
        } catch (error) {
            console.error('Lỗi kết nối khi tải thông báo:', error);
            notificationList = [];
            updateSummaryCards();
            renderNotifications([]);
        }
    }

    // 2. CẬP NHẬT CARDS THỐNG KÊ
    function updateSummaryCards() {
        document.getElementById("totalCount").textContent = notificationList.length;
        document.getElementById("pinnedCount").textContent = notificationList.filter(n => n.isPinned).length;
        document.getElementById("publishedCount").textContent = notificationList.filter(n => n.status === "published").length;
        document.getElementById("draftCount").textContent = notificationList.filter(n => n.status === "draft").length;
    }

    // FORMAT DATETIME
    function formatDate(dateStr) {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes} - ${day}/${month}/${year}`;
    }

    // 3. RENDER BẢNG DỮ LIỆU
    function renderNotifications(data) {
        tableBody.innerHTML = "";

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 20px; color: #94a3b8;">Không tìm thấy thông báo nào</td></tr>`;
            return;
        }

        // Sắp xếp: Tin ghim đưa lên trước
        const sortedData = [...data].sort((a, b) => b.isPinned - a.isPinned);

        sortedData.forEach(item => {
            const tr = document.createElement("tr");

            // Pin icon
            const pinClass = item.isPinned ? "fa-solid fa-thumbtack pin-icon pinned" : "fa-solid fa-thumbtack pin-icon";

            // Priority Badge
            let priorityBadge = "";
            if (item.priority === "danger") priorityBadge = `<span class="priority-badge priority-danger">Khẩn cấp</span>`;
            else if (item.priority === "warning") priorityBadge = `<span class="priority-badge priority-warning">Quan trọng</span>`;
            else priorityBadge = `<span class="priority-badge priority-info">Chung</span>`;

            // Target Text
            let targetText = "Tất cả";
            if (item.target === "students") targetText = "Sinh viên";
            if (item.target === "lecturers") targetText = "Giảng viên";

            // Status Badge
            const statusBadge = item.status === "published"
                ? `<span class="status-badge status-published">Đã đăng</span>`
                : `<span class="status-badge status-draft">Bản nháp</span>`;

            const notificationId = item._id || item.id;
            tr.innerHTML = `
                <td class="text-center"><i class="${pinClass}" data-id="${notificationId}" title="Ghim / Bỏ ghim"></i></td>
                <td>
                    <div class="notif-title-text view-btn" data-id="${notificationId}">${item.title}</div>
                </td>
                <td><span class="target-badge">${targetText}</span></td>
                <td>${priorityBadge}</td>
                <td>${formatDate(item.createdAt)}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center">
                    <button class="table-action-btn view-btn" data-id="${notificationId}" title="Xem"><i class="fa-solid fa-eye"></i></button>
                    <button class="table-action-btn edit-btn" data-id="${notificationId}" title="Sửa"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="table-action-btn delete delete-btn" data-id="${notificationId}" title="Xóa"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        attachTableEvents();
    }

    // 4. LỌC VÀ TÌM KIẾM
    function handleFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedTarget = targetFilter.value;
        const selectedStatus = statusFilter.value;

        const filtered = notificationList.filter(n => {
            const matchQuery = n.title.toLowerCase().includes(query) || n.content.toLowerCase().includes(query);
            const matchTarget = selectedTarget === "" || n.target === selectedTarget;
            const matchStatus = selectedStatus === "" || n.status === selectedStatus;
            return matchQuery && matchTarget && matchStatus;
        });

        renderNotifications(filtered);
    }

    searchInput.addEventListener("input", handleFilter);
    targetFilter.addEventListener("change", handleFilter);
    statusFilter.addEventListener("change", handleFilter);

    resetFilterBtn.addEventListener("click", () => {
        searchInput.value = "";
        targetFilter.value = "";
        statusFilter.value = "";
        handleFilter();
    });

    // 5. MỞ MODAL TẠO / SỬA
    openAddModalBtn.onclick = () => {
        modalTitle.textContent = "Soạn Thông Báo Mới";
        notifForm.reset();
        notifIdInput.value = "";
        notifModal.style.display = "flex";
    };

    function openEditModal(id) {
        const item = notificationList.find(n => n._id === id || n.id === id);
        if (!item) return;

        modalTitle.textContent = "Chỉnh Sửa Thông Báo";
        notifIdInput.value = item._id || item.id;
        notifTitleInput.value = item.title;
        notifTargetSelect.value = item.target;
        notifPrioritySelect.value = item.priority;
        notifContentInput.value = item.content;
        notifPinnedCheckbox.checked = item.isPinned;

        notifModal.style.display = "flex";
    }

    // XỬ LÝ LƯU THÔNG BÁO (NHÁP HOẶC PHÁT HÀNH)
    async function saveNotification(status) {
        if (!notifTitleInput.value || !notifContentInput.value) {
            alert("Vui lòng nhập đầy đủ Tiêu đề và Nội dung thông báo!");
            return;
        }

        const id = notifIdInput.value;
        const payload = {
            title: notifTitleInput.value,
            content: notifContentInput.value,
            target: notifTargetSelect.value,
            priority: notifPrioritySelect.value,
            isPinned: notifPinnedCheckbox.checked,
            status: status
        };

        try {
            let response;
            if (id) {
                response = await fetch(`${API_BASE_URL}/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                response = await fetch(API_BASE_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            const result = await response.json();
            if (response.ok && result.success) {
                notifModal.style.display = "none";
                loadNotifications();
                return;
            }
            alert(result.message || 'Lỗi khi lưu thông báo');
        } catch (error) {
            console.error('Lỗi khi gửi thông báo:', error);
            alert('Lỗi khi gửi thông báo. Vui lòng thử lại.');
        }
    }

    saveDraftBtn.addEventListener('click', () => saveNotification('draft'));
    publishBtn.addEventListener('click', () => saveNotification('published'));

    // 6. XEM CHI TIẾT THÔNG BÁO
    function openViewModal(id) {
        const item = notificationList.find(n => n._id === id || n.id === id);
        if (!item) return;

        const priorityBadge = document.getElementById("viewPriorityBadge");
        if (item.priority === "danger") {
            priorityBadge.className = "priority-badge priority-danger";
            priorityBadge.textContent = "Khẩn cấp";
        } else if (item.priority === "warning") {
            priorityBadge.className = "priority-badge priority-warning";
            priorityBadge.textContent = "Quan trọng";
        } else {
            priorityBadge.className = "priority-badge priority-info";
            priorityBadge.textContent = "Thông tin chung";
        }

        let targetText = "Tất cả người dùng";
        if (item.target === "students") targetText = "Chỉ Sinh viên";
        if (item.target === "lecturers") targetText = "Chỉ Giảng viên";
        document.getElementById("viewTargetBadge").textContent = targetText;

        document.getElementById("viewPinnedBadge").style.display = item.isPinned ? "inline-block" : "none";
        document.getElementById("viewTitle").textContent = item.title;
        document.getElementById("viewDate").textContent = formatDate(item.createdAt);
        document.getElementById("viewContent").textContent = item.content;

        viewModal.style.display = "flex";
    }

    // EVENT GẮN VÀO BẢNG
    function attachTableEvents() {
        // Toggle Pin
        document.querySelectorAll(".pin-icon").forEach(icon => {
            icon.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const item = notificationList.find(n => n._id === id || n.id === id);
                if (item) {
                    item.isPinned = !item.isPinned;
                    updateSummaryCards();
                    handleFilter();
                }
            };
        });

        // View
        document.querySelectorAll(".view-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                openViewModal(id);
            };
        });

        // Edit
        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                openEditModal(id);
            };
        });

        // Delete
        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = (e) => {
                deleteTargetId = e.currentTarget.getAttribute("data-id");
                deleteModal.style.display = "flex";
            };
        });
    }

    // XÓA THÔNG BÁO
    confirmDeleteBtn.onclick = async () => {
        if (deleteTargetId !== null) {
            try {
                const response = await fetch(`${API_BASE_URL}/${deleteTargetId}`, {
                    method: 'DELETE'
                });
                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Lỗi xóa thông báo');
                }
                await loadNotifications();
                deleteModal.style.display = "none";
                deleteTargetId = null;
            } catch (error) {
                console.error('Lỗi xóa thông báo:', error);
                alert(error.message || 'Không thể xóa thông báo hiện tại.');
            }
        }
    };

    // ĐÓNG MODALS
    closeNotifModal.onclick = () => notifModal.style.display = "none";
    closeViewModal.onclick = () => viewModal.style.display = "none";
    closeViewBtn.onclick = () => viewModal.style.display = "none";
    cancelDeleteBtn.onclick = () => deleteModal.style.display = "none";

    // LOGOUT
    openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    cancelLogout.onclick = () => logoutModal.style.display = "none";
    confirmLogout.onclick = () => {
        localStorage.clear();
        window.location.href = "index.html";
    };

    // KHỞI TẠO BAN ĐẦU
    loadNotifications();
});