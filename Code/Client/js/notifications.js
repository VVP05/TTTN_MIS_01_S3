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
    // 1. KIỂM TRA ĐĂNG NHẬP & THÔNG TIN USER
    const pageName = window.location.pathname.split('/').pop().toLowerCase();
    const isLecturerPage = pageName === 'lecturer-notifications.html';

    const studentAuth = getAuthForRole("STUDENT");
    const lecturerAuth = getAuthForRole("LECTURER");
    const adminAuth = getAuthForRole("ADMIN");
    const fallbackUser = JSON.parse(localStorage.getItem("user") || "null");

    const auth = isLecturerPage
        ? (lecturerAuth || adminAuth || studentAuth || { user: fallbackUser })
        : (studentAuth || adminAuth || lecturerAuth || { user: fallbackUser });

    const user = auth?.user;

    if (!user) {
        window.location.href = "index.html";
        return;
    }

    if (isLecturerPage && user.role !== "LECTURER") {
        window.location.href = "index.html";
        return;
    }

    if (!isLecturerPage && user.role !== "STUDENT") {
        window.location.href = "index.html";
        return;
    }

    const currentUserCode = user.user_code;
    const currentUserRole = user.role;

    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    // DOM Elements
    const notifContainer = document.getElementById("notifContainer");
    const emptyNotif = document.getElementById("emptyNotif");
    const headerBadgeCount = document.getElementById("headerBadgeCount");
    const countAll = document.getElementById("countAll");
    const countUnread = document.getElementById("countUnread");

    let allNotifications = []; // Biến lưu danh sách thông báo từ API
    let currentFilter = "ALL";  // Tab đang chọn

    // 2. HÀM TẢI DỮ LIỆU THÔNG BÁO TỪ BACKEND API
    const fetchNotifications = async () => {
        try {
            const endpoint = isLecturerPage
                ? `http://localhost:5000/api/notifications/lecturer/${currentUserCode}`
                : `http://localhost:5000/api/notifications/${currentUserCode}`;
            const response = await fetch(endpoint);
            const data = await response.json();

            if (data.success) {
                allNotifications = data.notifications || [];
                renderNotifications();
                updateBadgeCounts();
            } else {
                console.error("Lỗi lấy dữ liệu:", data.message);
            }
        } catch (error) {
            console.error("Không thể kết nối Server:", error);
            renderNotifications(); // Gọi render để hiện Empty State nếu lỗi mạng
        }
    };

    // 3. HÀM RENDER DANH SÁCH THÔNG BÁO RA MÀN HÌNH
    const renderNotifications = () => {
        // Xóa tất cả các thẻ card cũ trong container
        notifContainer.innerHTML = "";

        // Lọc dữ liệu theo Tab đang active
        const filteredList = allNotifications.filter(item => {
            if (currentFilter === "ALL") return true;
            if (currentFilter === "UNREAD") return !item.is_read;
            if (currentFilter === "LECTURER") return item.type === "LECTURER";
            if (currentFilter === "FACULTY") return item.type === "FACULTY" || item.type === "SYSTEM";
            return true;
        });

        // Kiểm tra nếu danh sách sau khi lọc bị RỖNG
        if (filteredList.length === 0) {
            if (emptyNotif) emptyNotif.style.display = "block";
            return;
        }

        // Nếu có dữ liệu thì ẩn Empty State đi
        if (emptyNotif) emptyNotif.style.display = "none";

        // Render từng card thông báo
        filteredList.forEach(item => {
            const isUnread = !item.is_read;
            const timeAgo = formatTimeAgo(item.createdAt);

            let iconClass = "fa-circle-info";
            let typeClass = "system";
            let typeName = "Hệ thống";

            if (item.type === "LECTURER") {
                iconClass = "fa-user-tie";
                typeClass = "lecturer";
                typeName = "Giảng viên";
            } else if (item.type === "FACULTY") {
                iconClass = "fa-building-columns";
                typeClass = "faculty";
                typeName = "Khoa CNTT";
            }

            const senderLabel = item.sender_name ? item.sender_name : typeName;

            const card = document.createElement("div");
            card.className = `notif-card ${isUnread ? 'unread' : ''}`;
            card.innerHTML = `
                <div class="notif-icon ${typeClass}">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="notif-content">
                    <div class="notif-header">
                        <span class="sender-tag ${typeClass}">${typeName}</span>
                        <span class="notif-time"><i class="fa-regular fa-clock"></i> ${timeAgo}</span>
                    </div>
                    <h4 class="notif-title">${item.title}</h4>
                    <p class="notif-preview">${item.content}</p>
                    <p class="notif-sender">Từ: ${senderLabel}</p>
                    ${item.attachment && item.attachment.name ? `
                        <div class="notif-attachment">
                            <i class="fa-solid fa-paperclip"></i> <span>${item.attachment.name}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="notif-action">
                    ${isUnread ? '<span class="unread-dot" title="Chưa đọc"></span>' : ''}
                </div>
            `;

            card.addEventListener("click", () => openNotifModal(item));
            notifContainer.appendChild(card);
        });
    };

    // 4. CẬP NHẬT SỐ LƯỢNG HUY HIỆU (BADGE COUNTS)
    const updateBadgeCounts = () => {
        const total = allNotifications.length;
        const unreadCount = allNotifications.filter(n => !n.is_read).length;

        if (countAll) countAll.textContent = total;
        if (countUnread) countUnread.textContent = unreadCount;

        if (headerBadgeCount) {
            headerBadgeCount.textContent = unreadCount;
            headerBadgeCount.style.display = unreadCount > 0 ? "inline-block" : "none";
        }
    };

    // 5. LỌC THÔNG BÁO THEO TAB
    const tabButtons = document.querySelectorAll(".tab-btn");
    tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            tabButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            currentFilter = btn.getAttribute("data-filter");
            renderNotifications();
        });
    });

    // 6. ĐÁNH DẤU TẤT CẢ ĐÃ ĐỌC
    const btnMarkAllRead = document.getElementById("btnMarkAllRead");
    if (btnMarkAllRead) {
        btnMarkAllRead.addEventListener("click", async () => {
            const hasUnread = allNotifications.some(n => !n.is_read);
            if (!hasUnread) {
                alert("Tất cả thông báo đều đã được đọc!");
                return;
            }

            try {
                const response = await fetch(`http://localhost:5000/api/notifications/read-all/${currentUserCode}?role=${currentUserRole}`, {
                    method: 'PATCH'
                });
                const data = await response.json();

                if (data.success) {
                    allNotifications.forEach(n => n.is_read = true);
                    renderNotifications();
                    updateBadgeCounts();
                    alert("Đã đánh dấu tất cả thông báo là đã đọc!");
                }
            } catch (error) {
                console.error("Lỗi đánh dấu tất cả đã đọc:", error);
            }
        });
    }

    // 7. XỬ LÝ MỞ MODAL CHI TIẾT THÔNG BÁO & ĐÁNH DẤU ĐÃ ĐỌC
    const notifModal = document.getElementById("notifModal");
    const btnCloseNotifModal = document.getElementById("btnCloseNotifModal");
    const btnConfirmReadModal = document.getElementById("btnConfirmReadModal");

    const openNotifModal = async (item) => {
        document.getElementById("modalTitle").textContent = item.title;
        document.getElementById("modalTime").textContent = new Date(item.createdAt).toLocaleString("vi-VN");
        document.getElementById("modalSender").textContent = item.sender_name || "Hệ thống";
        document.getElementById("modalContent").textContent = item.content;

        const modalSenderTag = document.getElementById("modalSenderTag");
        if (item.type === "LECTURER") {
            modalSenderTag.className = "sender-tag lecturer";
            modalSenderTag.textContent = item.sender_name || "Giảng viên hướng dẫn";
        } else if (item.type === "FACULTY") {
            modalSenderTag.className = "sender-tag faculty";
            modalSenderTag.textContent = item.sender_name || "Khoa CNTT";
        } else {
            modalSenderTag.className = "sender-tag system";
            modalSenderTag.textContent = item.sender_name || "Hệ thống";
        }

        const attBox = document.getElementById("modalAttachmentBox");
        const modalFileName = document.getElementById("modalFileName");
        const modalFileDownload = document.getElementById("modalFileDownload");

        if (item.attachment && item.attachment.name) {
            attBox.style.display = "flex";
            modalFileName.textContent = item.attachment.name;
            modalFileDownload.href = item.attachment.url || "#";
        } else {
            attBox.style.display = "none";
        }

        notifModal.style.display = "flex";

        if (!item.is_read) {
            try {
                await fetch(`http://localhost:5000/api/notifications/read/${item._id}?user_code=${encodeURIComponent(currentUserCode)}`, {
                    method: 'PATCH'
                });
                item.is_read = true;
                renderNotifications();
                updateBadgeCounts();
            } catch (error) {
                console.error("Lỗi cập nhật trạng thái đã đọc:", error);
            }
        }
    };

    const closeNotifModal = () => {
        notifModal.style.display = "none";
    };

    if (btnCloseNotifModal) btnCloseNotifModal.addEventListener("click", closeNotifModal);
    if (btnConfirmReadModal) btnConfirmReadModal.addEventListener("click", closeNotifModal);

    // 8. XỬ LÝ ĐĂNG XUẤT
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn) logoutBtn.addEventListener("click", () => logoutModal.style.display = "flex");
    if (cancelLogoutBtn) cancelLogoutBtn.addEventListener("click", () => logoutModal.style.display = "none");
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            localStorage.removeItem("studentAuth");
            if (localStorage.getItem("activeRole") === "STUDENT") {
                localStorage.removeItem("activeRole");
            }
            if (localStorage.getItem("token") && JSON.parse(localStorage.getItem("user") || "null")?.role === "STUDENT") {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
            }
            sessionStorage.clear();
            window.location.href = "index.html";
        });
    }

    window.addEventListener("click", (e) => {
        if (e.target === notifModal) closeNotifModal();
        if (e.target === logoutModal) logoutModal.style.display = "none";
    });

    function formatTimeAgo(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return "Vừa xong";
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} phút trước`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} giờ trước`;
        return `${Math.floor(diffInSeconds / 86400)} ngày trước`;
    }

    // Tải dữ liệu
    fetchNotifications();
});