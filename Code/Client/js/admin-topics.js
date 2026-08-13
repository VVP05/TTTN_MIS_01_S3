const API_BASE_URL = "http://localhost:5000/api/topics";

function getAuthForRole(role) {
    const roleKey = {
        STUDENT: "studentAuth",
        LECTURER: "lecturerAuth",
        ADMIN: "adminAuth"
    }[role] || "auth";

    const raw = localStorage.getItem(roleKey);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    let topicList = [];
    let currentTopicId = null;

    const auth = getAuthForRole("ADMIN") || {
        token: localStorage.getItem("token"),
        user: JSON.parse(localStorage.getItem("user") || "null")
    };

    const token = auth?.token;
    const user = auth?.user;

    if (!token || !user || user.role !== "ADMIN") {
        window.location.href = "index.html";
        return;
    }

    // DOM ELEMENTS
    const tableBody = document.getElementById("topicTableBody");
    const searchInput = document.getElementById("searchInput");
    const statusFilter = document.getElementById("statusFilter");
    const deptFilter = document.getElementById("deptFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");
    const pendingBadgeCount = document.getElementById("pendingBadgeCount");

    const topicDetailModal = document.getElementById("topicDetailModal");
    const modalDetailContent = document.getElementById("modalDetailContent");
    const closeDetailModal = document.getElementById("closeDetailModal");
    const closeDetailBtn = document.getElementById("closeDetailBtn");
    const approveBtn = document.getElementById("approveBtn");
    const rejectBtn = document.getElementById("rejectBtn");

    const rejectReasonModal = document.getElementById("rejectReasonModal");
    const closeRejectModal = document.getElementById("closeRejectModal");
    const cancelRejectBtn = document.getElementById("cancelRejectBtn");
    const confirmRejectBtn = document.getElementById("confirmRejectBtn");
    const rejectReasonInput = document.getElementById("rejectReasonInput");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    // 2. RENDER BẢNG ĐỀ TÀI
    function renderTopics(data) {
        tableBody.innerHTML = "";

        const pendingCount = topicList.filter(t => String(t.status).toUpperCase() === "PENDING").length;
        pendingBadgeCount.textContent = pendingCount;

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 20px; color: #94a3b8;">Không tìm thấy đề tài phù hợp</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 đề tài";
            return;
        }

        data.forEach(item => {
            const status = String(item.status || "PENDING").toUpperCase();
            let statusTag = `<span class="status-badge status-pending">Chờ duyệt</span>`;
            if (status === "APPROVED" || status === "REGISTERED") {
                statusTag = `<span class="status-badge status-approved">Đã duyệt</span>`;
            } else if (status === "OPEN") {
                statusTag = `<span class="status-badge status-open">Mở</span>`;
            } else if (status === "REJECTED") {
                statusTag = `<span class="status-badge status-rejected">Từ chối</span>`;
            } else if (status === "NEED_REVISION") {
                statusTag = `<span class="status-badge status-revision">Yêu cầu sửa</span>`;
            }

            const displayId = item.topic_code || (item._id ? item._id.toString().slice(-6).toUpperCase() : "N/A");
            const lecturerName = item.lecturer_name || item.lecturer || item.lecturer_code || "Chưa có";
            const dept = item.category || item.dept || "Không xác định";
            const maxGroups = item.max_groups || item.maxGroups || 1;

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><input type="checkbox"></td>
                <td><strong>${displayId}</strong></td>
                <td><a href="#" class="view-detail-link" data-id="${item._id}" style="color: #2563eb; font-weight: 600; text-decoration: none;">${item.title}</a></td>
                <td>${lecturerName}</td>
                <td>${dept}</td>
                <td class="text-center">${maxGroups} Nhóm</td>
                <td class="text-center">${statusTag}</td>
                <td class="text-center">
                    <button class="table-action-btn view-btn" data-id="${item._id}" title="Xem chi tiết & Duyệt"><i class="fa-solid fa-eye"></i></button>
                    ${status === 'PENDING' ? `
                        <button class="table-action-btn green quick-approve" data-id="${item._id}" title="Duyệt nhanh"><i class="fa-solid fa-check"></i></button>
                        <button class="table-action-btn red quick-reject" data-id="${item._id}" title="Từ chối nhanh"><i class="fa-solid fa-xmark"></i></button>
                    ` : ''}
                </td>
            `;
            tableBody.appendChild(tr);
        });

        document.getElementById("paginationInfo").textContent = `Hiển thị 1 - ${data.length} trên tổng số ${data.length} đề tài`;
        attachEvents();
    }

    // 3. LỌC VÀ TÌM KIẾM
    function handleFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedStatus = statusFilter.value;
        const selectedDept = deptFilter.value.toLowerCase();

        const filtered = topicList.filter(t => {
            const title = (t.title || "").toLowerCase();
            const lecturer = (t.lecturer_name || t.lecturer || t.lecturer_code || "").toLowerCase();
            const dept = (t.category || t.dept || "").toLowerCase();
            const status = String(t.status || "PENDING").toLowerCase();

            const matchQuery = title.includes(query) || lecturer.includes(query) || (t._id || "").toString().toLowerCase().includes(query);
            const matchStatus = selectedStatus === "" || status === selectedStatus;
            const matchDept = selectedDept === "" || dept.includes(selectedDept) || lecturer.includes(selectedDept);
            return matchQuery && matchStatus && matchDept;
        });

        renderTopics(filtered);
    }

    searchInput.addEventListener("input", handleFilter);
    statusFilter.addEventListener("change", handleFilter);
    deptFilter.addEventListener("change", handleFilter);

    resetFilterBtn.addEventListener("click", () => {
        searchInput.value = "";
        statusFilter.value = "pending";
        deptFilter.value = "";
        handleFilter();
    });

    // 4. HIỂN THỊ CHI TIẾT ĐỀ TÀI VÀ XỬ LÝ DUYỆT
    function openDetailModal(id) {
        currentTopicId = id;
        const item = topicList.find(t => t._id === id);
        if (!item) return;

        const status = String(item.status || "PENDING").toUpperCase();
        let statusText = "Chờ duyệt";
        if (status === "APPROVED" || status === "REGISTERED") {
            statusText = "Đã duyệt";
        } else if (status === "OPEN") {
            statusText = "Mở";
        } else if (status === "NEED_REVISION") {
            statusText = "Yêu cầu sửa";
        } else if (status === "REJECTED") {
            statusText = "Từ chối";
        }
        const lecturerName = item.lecturer_name || item.lecturer || item.lecturer_code || "Chưa có";
        const dept = item.category || item.dept || "Không xác định";
        const maxGroups = item.max_groups || item.maxGroups || 1;
        const rejectReason = item.feedback || item.rejectReason || "";

        modalDetailContent.innerHTML = `
            <div class="detail-row">
                <span class="detail-label">Mã & Tên đề tài</span>
                <div class="detail-value"><strong>[${item.topic_code || (item._id ? item._id.toString().slice(-6).toUpperCase() : "N/A")}] ${item.title}</strong></div>
            </div>
            <div class="detail-grid margin-top-8">
                <div class="detail-row">
                    <span class="detail-label">Giảng viên đề xuất</span>
                    <div class="detail-value">${lecturerName}</div>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Bộ môn</span>
                    <div class="detail-value">${dept}</div>
                </div>
            </div>
            <div class="detail-grid">
                <div class="detail-row">
                    <span class="detail-label">Số nhóm tối đa</span>
                    <div class="detail-value">${maxGroups} Nhóm</div>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Trạng thái hiện tại</span>
                    <div class="detail-value"><strong>${statusText}</strong></div>
                </div>
            </div>
            ${rejectReason ? `
                <div class="detail-row" style="background-color: #fef2f2; padding: 10px; border-radius: 6px;">
                    <span class="detail-label" style="color: #ef4444;">Lý do từ chối</span>
                    <div class="detail-value" style="color: #b91c1c;">${rejectReason}</div>
                </div>
            ` : ''}
            <div class="detail-row margin-top-8">
                <span class="detail-label">Mô tả chi tiết đề tài</span>
                <div class="detail-value">${item.description || "Không có mô tả"}</div>
            </div>
        `;

        if (status === "PENDING") {
            approveBtn.style.display = "inline-flex";
            rejectBtn.style.display = "inline-flex";
        } else {
            approveBtn.style.display = "none";
            rejectBtn.style.display = "none";
        }

        topicDetailModal.style.display = "flex";
    }

    // 5. ATTACH EVENTS BẢNG
    function attachEvents() {
        document.querySelectorAll(".view-btn, .view-detail-link").forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                const id = e.currentTarget.getAttribute("data-id");
                openDetailModal(id);
            };
        });

        document.querySelectorAll(".quick-approve").forEach(btn => {
            btn.onclick = async (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                await updateTopicStatus(id, "APPROVED");
            };
        });

        document.querySelectorAll(".quick-reject").forEach(btn => {
            btn.onclick = (e) => {
                currentTopicId = e.currentTarget.getAttribute("data-id");
                rejectReasonInput.value = "";
                rejectReasonModal.style.display = "flex";
            };
        });
    }

    async function updateTopicStatus(id, status, reason = "") {
        if (!id) return;

        try {
            const response = await fetch(`${API_BASE_URL}/admin/pool/${id}/status`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ status, feedback: reason })
            });

            const result = await response.json();
            if (response.ok && result.success) {
                alert(result.message || "Cập nhật trạng thái đề tài thành công!");
                await loadPoolTopics();
                topicDetailModal.style.display = "none";
                rejectReasonModal.style.display = "none";
            } else {
                alert("Lỗi cập nhật trạng thái: " + (result.message || "Không thể cập nhật trạng thái đề tài."));
            }
        } catch (error) {
            console.error("Lỗi khi cập nhật trạng thái đề tài:", error);
            alert("Lỗi kết nối máy chủ khi cập nhật trạng thái đề tài!");
        }
    }

    approveBtn.onclick = async () => {
        if (currentTopicId) {
            await updateTopicStatus(currentTopicId, "APPROVED");
        }
    };

    rejectBtn.onclick = () => {
        rejectReasonInput.value = "";
        rejectReasonModal.style.display = "flex";
    };

    confirmRejectBtn.onclick = async () => {
        const reason = rejectReasonInput.value.trim();
        if (!reason) {
            alert("Vui lòng điền lý do từ chối!");
            return;
        }
        await updateTopicStatus(currentTopicId, "REJECTED", reason);
    };

    closeDetailModal.onclick = () => topicDetailModal.style.display = "none";
    closeDetailBtn.onclick = () => topicDetailModal.style.display = "none";
    closeRejectModal.onclick = () => rejectReasonModal.style.display = "none";
    cancelRejectBtn.onclick = () => rejectReasonModal.style.display = "none";

    openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    cancelLogout.onclick = () => logoutModal.style.display = "none";
    confirmLogout.onclick = () => {
        localStorage.clear();
        window.location.href = "index.html";
    };

    async function loadPoolTopics() {
        try {
            const response = await fetch(`${API_BASE_URL}/admin/pool`, {
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            const result = await response.json();
            if (response.ok && result.success) {
                topicList = Array.isArray(result.data) ? result.data : [];
                handleFilter();
            } else {
                console.error("Lỗi khi tải danh sách đề tài kho admin:", result.message);
                tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 20px; color: #94a3b8;">Không thể tải dữ liệu đề tài. Vui lòng kiểm tra quyền truy cập.</td></tr>`;
                document.getElementById("paginationInfo").textContent = "Lỗi tải dữ liệu";
            }
        } catch (error) {
            console.error("Lỗi kết nối khi tải đề tài kho admin:", error);
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 20px; color: #94a3b8;">Lỗi kết nối đến máy chủ.</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Lỗi kết nối";
        }
    }

    loadPoolTopics();
});