function getAuthForRole(role) {
    const activeSession = sessionStorage.getItem("activeAuth");
    if (activeSession) {
        try {
            const sessionAuth = JSON.parse(activeSession);
            if (sessionAuth?.user?.role === role) return sessionAuth;
        } catch (error) {
            sessionStorage.removeItem("activeAuth");
        }
    }
    return null;
}

document.addEventListener("DOMContentLoaded", () => {
    const pathname = window.location.pathname.toLowerCase();
    const pageName = pathname.split('/').pop();
    const isLecturerPage = pathname.startsWith('/lecturer') || pageName === 'lecturer-notifications.html';
    const studentAuth = getAuthForRole("STUDENT");
    const lecturerAuth = getAuthForRole("LECTURER");
    const auth = isLecturerPage ? lecturerAuth : studentAuth;
    const user = auth?.user;

    if (!user) {
        window.location.href = "../auth/index.html";
        return;
    }
    if (isLecturerPage && user.role !== "LECTURER") {
        window.location.href = "../auth/index.html";
        return;
    }
    if (!isLecturerPage && user.role !== "STUDENT") {
        window.location.href = "../auth/index.html";
        return;
    }

    const currentUserCode = user.user_code;
    const currentUserRole = user.role;
    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    const notifContainer = document.getElementById("notifContainer");
    const emptyNotif = document.getElementById("emptyNotif");
    const sidebarNotificationBadge = document.getElementById("sidebarNotificationBadge");
    const countAll = document.getElementById("countAll");
    const countUnread = document.getElementById("countUnread");
    const btnMarkAllRead = document.getElementById("btnMarkAllRead");
    const notifSearchInput = document.getElementById("notifSearchInput");
    const btnClearSearch = document.getElementById("btnClearSearch");

    let allNotifications = [];
    let currentFilter = "ALL";
    let searchQuery = "";
    let displayLimit = 15;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, char => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        }[char]));
    }

    function formatTimeAgo(dateString) {
        if (!dateString) return "Vừa xong";
        const date = new Date(dateString);
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return "Vừa xong";
        if (seconds < 3600) return `${Math.floor(seconds / 60)} phút trước`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} giờ trước`;
        if (seconds < 172800) return "Hôm qua";
        return `${Math.floor(seconds / 86400)} ngày trước`;
    }

    function getDateGroup(dateString) {
        if (!dateString) return "TRƯỚC ĐÓ";
        const date = new Date(dateString);
        const today = new Date();
        if (date.toDateString() === today.toDateString()) return "HÔM NAY";
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return "HÔM QUA";
        return "TRƯỚC ĐÓ";
    }

    function getNotificationCategory(item) {
        const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();
        if (/(yêu cầu tham gia nhóm|xin gia nhập|gia nhập nhóm|mời vào nhóm|tham gia nhóm|thành viên mới|nhóm hướng dẫn)/.test(text)) {
            return { css: "type-indigo", icon: "fa-solid fa-user-plus", name: "Yêu cầu tham gia nhóm" };
        }
        if (/(được chấp nhận|chấp nhận|đã được duyệt|phê duyệt|đã duyệt|đồng ý)/.test(text)) {
            return { css: "type-green", icon: "fa-solid fa-circle-check", name: "Được chấp nhận" };
        }
        if (/(nhắc hạn nộp|hạn nộp|hạn chót|deadline|milestone|sắp đến hạn)/.test(text)) {
            return { css: "type-orange", icon: "fa-solid fa-clock", name: "Nhắc hạn nộp" };
        }
        if (/(mở đăng ký|đăng ký đề tài|thời gian đăng ký|bắt đầu đăng ký)/.test(text)) {
            return { css: "type-blue", icon: "fa-solid fa-calendar", name: "Mở đăng ký" };
        }
        if (/(tài liệu|biểu mẫu|đính kèm|file|văn bản)/.test(text) || item.attachment?.name) {
            return { css: "type-purple", icon: "fa-solid fa-file", name: "Tài liệu mới" };
        }
        if (/(từ chối|bị từ chối|không duyệt)/.test(text)) {
            return { css: "type-red", icon: "fa-solid fa-circle-xmark", name: "Từ chối" };
        }
        return { css: "type-slate", icon: "fa-solid fa-bell", name: "Thông báo chung" };
    }

    function getSenderBadge(item) {
        const type = String(item.type || "").toUpperCase();
        if (type === "LECTURER") return { text: "Giảng viên", css: "lecturer" };
        if (type === "FACULTY") return { text: "Khoa", css: "faculty" };
        return { text: "Hệ thống", css: "system" };
    }

    function showSkeleton() {
        notifContainer.innerHTML = [0, 1, 2].map(() => `
            <div class="skeleton-card">
                <div class="skeleton-icon skeleton-pulse"></div>
                <div class="skeleton-lines">
                    <div class="skeleton-line-title skeleton-pulse"></div>
                    <div class="skeleton-line-desc skeleton-pulse"></div>
                    <div class="skeleton-line-meta skeleton-pulse"></div>
                </div>
            </div>
        `).join("");
    }

    const fetchNotifications = async () => {
        showSkeleton();
        try {
            const endpoint = isLecturerPage
                ? `${window.APP_CONFIG.API_BASE_URL}/api/notifications/lecturer/${currentUserCode}`
                : `${window.APP_CONFIG.API_BASE_URL}/api/notifications/${currentUserCode}`;
            const response = await apiFetch(endpoint, {
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            const data = await response.json();
            allNotifications = data.success ? dedupeNotifications(data.notifications || []) : [];
            renderNotifications();
            updateBadgeCounts();
        } catch (error) {
            console.error("Không thể kết nối Server:", error);
            allNotifications = [];
            renderNotifications();
            updateBadgeCounts();
        }
    };

    function dedupeNotifications(items) {
        const seen = new Set();
        return items.filter(item => {
            const key = [
                item.event_key || "",
                item.type || "",
                item.title || "",
                item.content || "",
                item.sender_name || ""
            ].join("|").toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function updateBadgeCounts() {
        const unreadCount = allNotifications.filter(n => !n.is_read).length;
        if (countAll) countAll.textContent = allNotifications.length;
        if (countUnread) {
            countUnread.textContent = unreadCount;
            countUnread.classList.toggle("unread-badge", unreadCount > 0);
        }
        if (sidebarNotificationBadge) {
            sidebarNotificationBadge.textContent = unreadCount > 99 ? "99+" : unreadCount;
            sidebarNotificationBadge.style.display = unreadCount > 0 ? "inline-block" : "none";
        }
        if (btnMarkAllRead) {
            btnMarkAllRead.disabled = unreadCount === 0;
            btnMarkAllRead.title = unreadCount === 0
                ? "Không có thông báo chưa đọc"
                : `Đánh dấu ${unreadCount} thông báo chưa đọc là đã đọc`;
        }
    }

    function renderNotifications() {
        notifContainer.innerHTML = "";

        let filtered = allNotifications.filter(item => {
            if (currentFilter === "ALL") return true;
            if (currentFilter === "UNREAD") return !item.is_read;
            if (currentFilter === "LECTURER") return String(item.type || "").toUpperCase() === "LECTURER";
            if (currentFilter === "FACULTY") return ["FACULTY", "SYSTEM"].includes(String(item.type || "").toUpperCase());
            return true;
        });

        if (searchQuery.trim()) {
            const query = searchQuery.trim().toLowerCase();
            filtered = filtered.filter(item =>
                `${item.title || ""} ${item.content || ""} ${item.sender_name || ""}`.toLowerCase().includes(query)
            );
        }

        if (!filtered.length) {
            emptyNotif.style.display = "block";
            const title = emptyNotif.querySelector("h3");
            const desc = emptyNotif.querySelector("p");
            if (searchQuery.trim()) {
                title.textContent = "Không tìm thấy thông báo phù hợp";
                desc.innerHTML = `Không có kết quả nào cho tìm kiếm hiện tại.<br><button id="btnResetSearch" class="btn-reset-search" type="button">Xóa tìm kiếm</button>`;
                document.getElementById("btnResetSearch")?.addEventListener("click", clearSearch);
            } else if (currentFilter === "UNREAD") {
                title.textContent = "Tuyệt vời! Bạn đã đọc hết thông báo";
                desc.textContent = "Không còn thông báo nào chưa đọc vào lúc này.";
            } else {
                title.textContent = "Bạn chưa có thông báo nào";
                desc.textContent = "Bạn sẽ nhận được thông báo khi có cập nhật mới từ Giảng viên hoặc Khoa.";
            }
            return;
        }

        emptyNotif.style.display = "none";
        const groups = { "HÔM NAY": [], "HÔM QUA": [], "TRƯỚC ĐÓ": [] };
        filtered.slice(0, displayLimit).forEach(item => {
            groups[getDateGroup(item.createdAt)].push(item);
        });

        Object.entries(groups).forEach(([groupName, items]) => {
            if (!items.length) return;
            const header = document.createElement("div");
            header.className = "date-group-header";
            header.textContent = groupName;
            notifContainer.appendChild(header);

            const wrapper = document.createElement("div");
            wrapper.className = "notif-list-container";
            items.forEach(item => wrapper.appendChild(createNotificationCard(item)));
            notifContainer.appendChild(wrapper);
        });

        if (filtered.length > displayLimit) {
            const row = document.createElement("div");
            row.className = "notif-load-more-row";
            row.innerHTML = `<button type="button" class="btn-load-more" id="btnLoadMore"><i class="fa-solid fa-angles-down"></i> Tải thêm thông báo cũ hơn</button>`;
            notifContainer.appendChild(row);
            document.getElementById("btnLoadMore").addEventListener("click", () => {
                displayLimit += 15;
                renderNotifications();
            });
        }
    }

    function createNotificationCard(item) {
        const isUnread = !item.is_read;
        const category = getNotificationCategory(item);
        const senderBadge = getSenderBadge(item);
        const fullTime = item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN") : "";
        const card = document.createElement("article");
        card.className = `notif-card-item ${isUnread ? "unread" : "read"}`;
        card.setAttribute("tabindex", "0");
        card.setAttribute("role", "article");

        card.innerHTML = `
            <div class="notif-icon-box ${category.css}" title="${escapeHtml(category.name)}">
                <i class="${category.icon}"></i>
            </div>
            <div class="notif-body">
                <div class="notif-title-row">
                    ${isUnread ? '<span class="unread-indicator-dot" title="Chưa đọc"></span>' : ''}
                    <h4>${escapeHtml(item.title || "Thông báo mới")}</h4>
                    <span class="source-badge ${senderBadge.css}">
                        <span class="badge-source-title">${escapeHtml(senderBadge.text)}</span>
                        ${item.sender_name ? `<span class="badge-sender-name">${escapeHtml(item.sender_name)}</span>` : ''}
                    </span>
                </div>
                <p class="notif-preview-text">${escapeHtml(item.content || "")}</p>
                ${item.attachment?.name ? `
                    <button type="button" class="notif-attachment-chip" title="Tải xuống ${escapeHtml(item.attachment.name)}">
                        <i class="fa-solid fa-paperclip"></i><span>${escapeHtml(item.attachment.name)}</span>
                    </button>
                ` : ''}
            </div>
            <div class="notif-side-meta">
                <span class="notif-timestamp" title="${escapeHtml(fullTime)}">${formatTimeAgo(item.createdAt)}</span>
                <div class="notif-actions-group">
                    ${isUnread ? `<button type="button" class="btn-notif-action btn-mark-single" title="Đánh dấu đã đọc" aria-label="Đánh dấu đã đọc"><i class="fa-solid fa-check"></i></button>` : ''}
                    <button type="button" class="btn-notif-action btn-view-detail" title="Xem chi tiết" aria-label="Xem chi tiết thông báo"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
                </div>
            </div>
        `;

        card.addEventListener("click", () => openNotifModal(item));
        card.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openNotifModal(item);
            }
        });
        card.querySelector(".btn-view-detail")?.addEventListener("click", event => {
            event.stopPropagation();
            openNotifModal(item);
        });
        card.querySelector(".btn-mark-single")?.addEventListener("click", event => {
            event.stopPropagation();
            markSingleAsRead(item);
        });
        card.querySelector(".notif-attachment-chip")?.addEventListener("click", event => {
            event.stopPropagation();
            if (item.attachment?.url) window.open(item.attachment.url, "_blank");
            else openNotifModal(item);
        });
        card.querySelector(".notif-preview-text")?.addEventListener("click", event => {
            event.stopPropagation();
            card.classList.toggle("expanded");
        });
        return card;
    }

    async function markSingleAsRead(item) {
        if (item.is_read) return;
        try {
            await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/notifications/read/${item._id}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            item.is_read = true;
            renderNotifications();
            updateBadgeCounts();
            showToast("Đã đánh dấu thông báo là đã đọc!");
        } catch (error) {
            console.error("Lỗi cập nhật trạng thái đã đọc:", error);
        }
    }

    function showToast(message) {
        if (typeof showAppNotification === "function") showAppNotification(message);
    }

    function clearSearch() {
        if (notifSearchInput) notifSearchInput.value = "";
        searchQuery = "";
        if (btnClearSearch) btnClearSearch.style.display = "none";
        displayLimit = 15;
        renderNotifications();
    }

    if (notifSearchInput) {
        notifSearchInput.addEventListener("input", event => {
            searchQuery = event.target.value;
            displayLimit = 15;
            if (btnClearSearch) btnClearSearch.style.display = searchQuery ? "block" : "none";
            renderNotifications();
        });
    }
    if (btnClearSearch) btnClearSearch.addEventListener("click", clearSearch);

    document.querySelectorAll(".notif-tab-btn, .tab-btn").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".notif-tab-btn, .tab-btn").forEach(item => item.classList.remove("active"));
            button.classList.add("active");
            currentFilter = button.dataset.filter || "ALL";
            displayLimit = 15;
            renderNotifications();
        });
    });

    if (btnMarkAllRead) {
        btnMarkAllRead.addEventListener("click", async () => {
            if (!allNotifications.some(item => !item.is_read)) return;
            try {
                const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/notifications/read-all/${currentUserCode}`, {
                    method: "PATCH",
                    headers: { Authorization: `Bearer ${auth.token}` }
                });
                const data = await response.json();
                if (data.success) {
                    allNotifications.forEach(item => item.is_read = true);
                    renderNotifications();
                    updateBadgeCounts();
                    showToast("Đã đánh dấu tất cả thông báo là đã đọc!");
                }
            } catch (error) {
                console.error("Lỗi đánh dấu tất cả đã đọc:", error);
            }
        });
    }

    const notifModal = document.getElementById("notifModal");
    const btnCloseNotifModal = document.getElementById("btnCloseNotifModal");
    const btnConfirmReadModal = document.getElementById("btnConfirmReadModal");

    async function openNotifModal(item) {
        document.getElementById("modalTitle").textContent = item.title || "Thông báo";
        document.getElementById("modalTime").textContent = item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN") : "Vừa xong";
        document.getElementById("modalSender").textContent = item.sender_name || "Hệ thống";
        document.getElementById("modalContent").textContent = item.content || "";

        const senderBadge = getSenderBadge(item);
        const modalSenderTag = document.getElementById("modalSenderTag");
        modalSenderTag.className = `sender-tag ${senderBadge.css}`;
        modalSenderTag.textContent = senderBadge.text;

        const attBox = document.getElementById("modalAttachmentBox");
        const modalFileName = document.getElementById("modalFileName");
        const modalFileDownload = document.getElementById("modalFileDownload");
        if (item.attachment?.name) {
            attBox.style.display = "flex";
            modalFileName.textContent = item.attachment.name;
            modalFileDownload.href = item.attachment.url || "#";
        } else {
            attBox.style.display = "none";
        }

        notifModal.style.display = "flex";
        if (!item.is_read) await markSingleAsRead(item);
    }

    const closeNotifModal = () => {
        if (notifModal) notifModal.style.display = "none";
    };
    btnCloseNotifModal?.addEventListener("click", closeNotifModal);
    btnConfirmReadModal?.addEventListener("click", closeNotifModal);

    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");
    logoutBtn?.addEventListener("click", () => logoutModal.style.display = "flex");
    cancelLogoutBtn?.addEventListener("click", () => logoutModal.style.display = "none");
    confirmLogoutBtn?.addEventListener("click", () => {
        localStorage.removeItem(`${currentUserRole.toLowerCase()}Auth`);
        if (localStorage.getItem("activeRole") === currentUserRole) localStorage.removeItem("activeRole");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        sessionStorage.clear();
        window.location.href = "../auth/index.html";
    });

    window.addEventListener("click", event => {
        if (event.target === notifModal) closeNotifModal();
        if (event.target === logoutModal) logoutModal.style.display = "none";
    });

    fetchNotifications();
});
