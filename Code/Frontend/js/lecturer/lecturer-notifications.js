/**
 * =========================================================
 * LECTURER NOTIFICATIONS JS
 * Giao diện hiện đại, sạch, đầy đủ chức năng và trải nghiệm người dùng
 * =========================================================
 */

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
    // 1. KIỂM TRA ĐĂNG NHẬP & THÔNG TIN GIẢNG VIÊN
    const lecturerAuth = getAuthForRole("LECTURER");
    const auth = lecturerAuth || (function() {
        try {
            const a = JSON.parse(localStorage.getItem("lecturerAuth") || sessionStorage.getItem("activeAuth") || "null");
            if (a?.user?.role === "LECTURER") return a;
        } catch(e) {}
        return null;
    })();

    const user = auth?.user;

    if (!user || user.role !== "LECTURER") {
        window.location.href = "../auth/index.html";
        return;
    }

    const currentUserCode = user.user_code;
    const currentUserRole = user.role;

    if (user.full_name) {
        const userNameEl = document.getElementById("userName");
        if (userNameEl) userNameEl.textContent = user.full_name;
    }
    if (user.user_code) {
        const userCodeEl = document.getElementById("userCode");
        if (userCodeEl) userCodeEl.textContent = user.user_code;
    }

    // DOM Elements
    const notifContainer = document.getElementById("notifContainer");
    const emptyNotif = document.getElementById("emptyNotif");
    const sidebarNotificationBadge = document.getElementById("sidebarNotificationBadge");
    const countAll = document.getElementById("countAll");
    const countUnread = document.getElementById("countUnread");
    const btnMarkAllRead = document.getElementById("btnMarkAllRead");
    const notifSearchInput = document.getElementById("notifSearchInput");
    const btnClearSearch = document.getElementById("btnClearSearch");

    let allNotifications = []; // Biến lưu toàn bộ thông báo từ API
    let currentFilter = "ALL";  // Tab đang active: ALL, UNREAD, FACULTY
    let searchQuery = "";       // Từ khóa tìm kiếm client-side
    let displayLimit = 15;      // Số lượng hiển thị ban đầu

    // 2. PHÂN LOẠI & SUY RA ICON, MÀU SẮC THÔNG BÁO
    function getNotificationCategory(item) {
        const text = `${item.title || ""} ${item.content || ""}`.toLowerCase();

        if (/(nhắc hạn nộp|hạn nộp|hạn chót|deadline|milestone|sắp đến hạn)/.test(text)) {
            return { colorClass: "type-orange", icon: "fa-solid fa-clock", typeName: "Nhắc hạn nộp" };
        }
        if (/(mở đăng ký|đăng ký đề tài|thời gian đăng ký|bắt đầu đăng ký)/.test(text)) {
            return { colorClass: "type-blue", icon: "fa-solid fa-calendar", typeName: "Mở đăng ký" };
        }
        if (/(lịch|hẹn|gặp mặt|thời gian biểu|calendar)/.test(text)) {
            return { colorClass: "type-orange", icon: "fa-solid fa-calendar-check", typeName: "Lịch hẹn" };
        }
        if (/(tài liệu|biểu mẫu|đính kèm|file|văn bản)/.test(text) || item.attachment?.name) {
            return { colorClass: "type-purple", icon: "fa-solid fa-file", typeName: "Tài liệu mới" };
        }
        if (/(yêu cầu tham gia nhóm|xin gia nhập|gia nhập nhóm|mời vào nhóm|tham gia nhóm|thành viên mới)/.test(text)) {
            return { colorClass: "type-indigo", icon: "fa-solid fa-user-plus", typeName: "Yêu cầu tham gia nhóm" };
        }
        if (/(được chấp nhận|chấp nhận|đã được duyệt|phê duyệt|đã duyệt|đồng ý)/.test(text)) {
            return { colorClass: "type-green", icon: "fa-solid fa-circle-check", typeName: "Được chấp nhận" };
        }
        if (/(từ chối|bị từ chối|không duyệt)/.test(text)) {
            return { colorClass: "type-red", icon: "fa-solid fa-circle-xmark", typeName: "Từ chối" };
        }
        return { colorClass: "type-slate", icon: "fa-solid fa-bell", typeName: "Thông báo chung" };
    }

    // 3. XÁC ĐỊNH NGUỒN GỬI (BADGE)
    function getSenderBadge(item) {
        const type = (item.type || "").toUpperCase();
        if (type === "FACULTY") {
            return { text: "Khoa CNTT", cssClass: "faculty" };
        }
        if (type === "LECTURER") {
            return { text: item.sender_name || "Giảng viên", cssClass: "lecturer" };
        }
        if (type === "SYSTEM") {
            return { text: "Hệ thống", cssClass: "system" };
        }
        if (item.sender_name) {
            return { text: item.sender_name, cssClass: "student" };
        }
        return { text: "Hệ thống", cssClass: "system" };
    }

    // 4. ĐỊNH DẠNG THỜI GIAN
    function formatTimeAgo(dateString) {
        if (!dateString) return "Vừa xong";
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return "Vừa xong";
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} phút trước`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} giờ trước`;
        if (diffInSeconds < 172800) return "Hôm qua";
        return `${Math.floor(diffInSeconds / 86400)} ngày trước`;
    }

    function getDateGroupKey(dateString) {
        if (!dateString) return "TRƯỚC ĐÓ";
        const itemDate = new Date(dateString);
        const today = new Date();

        const isToday = itemDate.getDate() === today.getDate() &&
            itemDate.getMonth() === today.getMonth() &&
            itemDate.getFullYear() === today.getFullYear();

        if (isToday) return "HÔM NAY";

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const isYesterday = itemDate.getDate() === yesterday.getDate() &&
            itemDate.getMonth() === yesterday.getMonth() &&
            itemDate.getFullYear() === yesterday.getFullYear();

        if (isYesterday) return "HÔM QUA";

        return "TRƯỚC ĐÓ";
    }

    // 5. HIỂN THỊ SKELETON KHI TẢI
    function showSkeleton() {
        if (!notifContainer) return;
        notifContainer.innerHTML = `
            <div class="skeleton-card">
                <div class="skeleton-icon skeleton-pulse"></div>
                <div class="skeleton-lines">
                    <div class="skeleton-line-title skeleton-pulse"></div>
                    <div class="skeleton-line-desc skeleton-pulse"></div>
                    <div class="skeleton-line-meta skeleton-pulse"></div>
                </div>
            </div>
            <div class="skeleton-card">
                <div class="skeleton-icon skeleton-pulse"></div>
                <div class="skeleton-lines">
                    <div class="skeleton-line-title skeleton-pulse"></div>
                    <div class="skeleton-line-desc skeleton-pulse"></div>
                    <div class="skeleton-line-meta skeleton-pulse"></div>
                </div>
            </div>
            <div class="skeleton-card">
                <div class="skeleton-icon skeleton-pulse"></div>
                <div class="skeleton-lines">
                    <div class="skeleton-line-title skeleton-pulse"></div>
                    <div class="skeleton-line-desc skeleton-pulse"></div>
                    <div class="skeleton-line-meta skeleton-pulse"></div>
                </div>
            </div>
        `;
    }

    // 6. TẢI DỮ LIỆU TỪ SERVER API
    const fetchNotifications = async () => {
        showSkeleton();
        try {
            const endpoint = `${window.APP_CONFIG.API_BASE_URL}/api/notifications/lecturer/${currentUserCode}`;
            const response = await apiFetch(endpoint, {
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            const data = await response.json();

            if (data.success) {
                allNotifications = data.notifications || [];
                renderNotifications();
                updateBadgeCounts();
            } else {
                console.error("Lỗi lấy dữ liệu:", data.message);
                renderNotifications();
            }
        } catch (error) {
            console.error("Không thể kết nối Server:", error);
            renderNotifications();
        }
    };

    // 7. CẬP NHẬT BADGES & TRẠNG THÁI NÚT ĐÁNH DẤU TẤT CẢ
    const updateBadgeCounts = () => {
        const total = allNotifications.length;
        const unreadCount = allNotifications.filter(n => !n.is_read).length;

        if (countAll) countAll.textContent = total;
        if (countUnread) {
            countUnread.textContent = unreadCount;
            if (unreadCount > 0) {
                countUnread.classList.add("unread-badge");
            } else {
                countUnread.classList.remove("unread-badge");
            }
        }

        // Sidebar badge
        if (sidebarNotificationBadge) {
            sidebarNotificationBadge.textContent = unreadCount > 99 ? "99+" : unreadCount;
            sidebarNotificationBadge.style.display = unreadCount > 0 ? "inline-block" : "none";
        }

        // Button "Đánh dấu tất cả đã đọc"
        if (btnMarkAllRead) {
            if (unreadCount === 0) {
                btnMarkAllRead.disabled = true;
                btnMarkAllRead.classList.add("disabled");
                btnMarkAllRead.title = "Không có thông báo chưa đọc";
            } else {
                btnMarkAllRead.disabled = false;
                btnMarkAllRead.classList.remove("disabled");
                btnMarkAllRead.title = `Đánh dấu ${unreadCount} thông báo chưa đọc là đã đọc`;
            }
        }
    };

    // 8. RENDER DANH SÁCH THÔNG BÁO
    const renderNotifications = () => {
        if (!notifContainer) return;
        notifContainer.innerHTML = "";

        // Lọc dữ liệu theo Tab
        let filtered = allNotifications.filter(item => {
            if (currentFilter === "ALL") return true;
            if (currentFilter === "UNREAD") return !item.is_read;
            if (currentFilter === "FACULTY") return item.type === "FACULTY" || item.type === "SYSTEM";
            return true;
        });

        // Lọc theo Tìm kiếm client-side
        if (searchQuery.trim() !== "") {
            const query = searchQuery.trim().toLowerCase();
            filtered = filtered.filter(item => {
                const titleMatch = (item.title || "").toLowerCase().includes(query);
                const contentMatch = (item.content || "").toLowerCase().includes(query);
                const senderMatch = (item.sender_name || "").toLowerCase().includes(query);
                return titleMatch || contentMatch || senderMatch;
            });
        }

        // Xử lý Empty State
        if (filtered.length === 0) {
            if (emptyNotif) {
                emptyNotif.style.display = "block";
                const emptyTitle = emptyNotif.querySelector("h3");
                const emptyDesc = emptyNotif.querySelector("p");

                if (searchQuery.trim() !== "") {
                    emptyTitle.textContent = "Không tìm thấy thông báo phù hợp";
                    emptyDesc.innerHTML = `Không có kết quả nào chứa từ khóa "<strong>${escapeHtml(searchQuery)}</strong>".<br><button id="btnResetSearch" class="btn-reset-search"><i class="fa-solid fa-rotate-left"></i> Xóa tìm kiếm</button>`;
                    const btnReset = document.getElementById("btnResetSearch");
                    if (btnReset) {
                        btnReset.addEventListener("click", () => {
                            if (notifSearchInput) notifSearchInput.value = "";
                            if (btnClearSearch) btnClearSearch.style.display = "none";
                            searchQuery = "";
                            renderNotifications();
                        });
                    }
                } else if (currentFilter === "UNREAD") {
                    emptyTitle.textContent = "Tuyệt vời! Bạn đã đọc hết thông báo";
                    emptyDesc.textContent = "Không còn thông báo nào chưa đọc vào lúc này.";
                } else if (currentFilter === "FACULTY") {
                    emptyTitle.textContent = "Chưa có thông báo từ Khoa / Hệ thống";
                    emptyDesc.textContent = "Các thông báo chính thức từ Khoa CNTT sẽ xuất hiện tại đây.";
                } else {
                    emptyTitle.textContent = "Bạn chưa có thông báo nào";
                    emptyDesc.textContent = "Bạn sẽ nhận được thông báo khi có hoạt động mới từ Khoa hoặc sinh viên.";
                }
            }
            return;
        }

        if (emptyNotif) emptyNotif.style.display = "none";

        // Nhóm theo ngày: HÔM NAY, HÔM QUA, TRƯỚC ĐÓ
        const groups = {
            "HÔM NAY": [],
            "HÔM QUA": [],
            "TRƯỚC ĐÓ": []
        };

        const itemsToDisplay = filtered.slice(0, displayLimit);

        itemsToDisplay.forEach(item => {
            const groupKey = getDateGroupKey(item.createdAt);
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(item);
        });

        // Duyệt từng nhóm và render
        ["HÔM NAY", "HÔM QUA", "TRƯỚC ĐÓ"].forEach(groupName => {
            const groupItems = groups[groupName];
            if (!groupItems || groupItems.length === 0) return;

            // Header nhóm ngày
            const groupHeader = document.createElement("div");
            groupHeader.className = "date-group-header";
            groupHeader.textContent = groupName;
            notifContainer.appendChild(groupHeader);

            // Container cho nhóm
            const listWrapper = document.createElement("div");
            listWrapper.className = "notif-list-container";

            groupItems.forEach(item => {
                const card = createNotificationCard(item);
                listWrapper.appendChild(card);
            });

            notifContainer.appendChild(listWrapper);
        });

        // Nút "Xem thêm" nếu danh sách dài
        if (filtered.length > displayLimit) {
            const loadMoreWrapper = document.createElement("div");
            loadMoreWrapper.className = "notif-load-more-row";
            loadMoreWrapper.innerHTML = `
                <button class="btn-load-more" id="btnLoadMore">
                    <i class="fa-solid fa-angles-down"></i> Xem thêm thông báo cũ hơn (${filtered.length - displayLimit} thông báo còn lại)
                </button>
            `;
            notifContainer.appendChild(loadMoreWrapper);

            const btnLoadMore = loadMoreWrapper.querySelector("#btnLoadMore");
            if (btnLoadMore) {
                btnLoadMore.addEventListener("click", () => {
                    displayLimit += 15;
                    renderNotifications();
                });
            }
        }
    };

    // 9. TẠO THẺ CARD THÔNG BÁO
    function createNotificationCard(item) {
        const isUnread = !item.is_read;
        const timeAgo = formatTimeAgo(item.createdAt);
        const fullTime = item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN") : "";
        const category = getNotificationCategory(item);
        const senderBadge = getSenderBadge(item);

        const card = document.createElement("div");
        card.className = `notif-card-item ${isUnread ? 'unread' : ''}`;
        card.setAttribute("role", "article");
        card.setAttribute("tabindex", "0");

        card.innerHTML = `
            <div class="notif-icon-box ${category.colorClass}" title="${category.typeName}">
                <i class="${category.icon}"></i>
            </div>
            <div class="notif-body">
                <div class="notif-title-row">
                    ${isUnread ? '<span class="unread-indicator-dot" title="Chưa đọc"></span>' : ''}
                    <h4 class="notif-title">${escapeHtml(item.title || "Thông báo mới")}</h4>
                    <span class="source-badge ${senderBadge.cssClass}">${escapeHtml(senderBadge.text)}</span>
                </div>
                <p class="notif-preview-text" title="Bấm vào card để xem chi tiết">${escapeHtml(item.content || "")}</p>
                ${item.attachment && item.attachment.name ? `
                    <div class="notif-attachment-chip" title="Tải xuống tệp đính kèm: ${escapeHtml(item.attachment.name)}">
                        <i class="fa-solid fa-paperclip"></i>
                        <span>${escapeHtml(item.attachment.name)}</span>
                    </div>
                ` : ''}
            </div>
            <div class="notif-side-meta">
                <span class="notif-timestamp" title="${fullTime}">
                    <i class="fa-regular fa-clock"></i> ${timeAgo}
                </span>
                <div class="notif-actions-group">
                    ${isUnread ? `
                        <button type="button" class="btn-notif-action btn-mark-single-read" title="Đánh dấu đã đọc" aria-label="Đánh dấu đã đọc">
                            <i class="fa-solid fa-check"></i>
                        </button>
                    ` : ''}
                    <button type="button" class="btn-notif-action btn-view-detail" title="Xem chi tiết" aria-label="Xem chi tiết thông báo">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                    </button>
                </div>
            </div>
        `;

        // Sự kiện bấm vào chip đính kèm
        const attChip = card.querySelector(".notif-attachment-chip");
        if (attChip) {
            attChip.addEventListener("click", (e) => {
                e.stopPropagation();
                if (item.attachment?.url) {
                    window.open(item.attachment.url, "_blank");
                } else {
                    openNotifModal(item);
                }
            });
        }

        // Sự kiện đánh dấu đã đọc đơn lẻ
        const btnMarkSingle = card.querySelector(".btn-mark-single-read");
        if (btnMarkSingle) {
            btnMarkSingle.addEventListener("click", async (e) => {
                e.stopPropagation();
                await markSingleAsRead(item);
            });
        }

        // Sự kiện nút xem chi tiết
        const btnViewDetail = card.querySelector(".btn-view-detail");
        if (btnViewDetail) {
            btnViewDetail.addEventListener("click", (e) => {
                e.stopPropagation();
                openNotifModal(item);
            });
        }

        // Bấm vào thân card mở modal chi tiết và tự động đánh dấu đã đọc
        card.addEventListener("click", () => openNotifModal(item));

        // Hỗ trợ phím Enter để mở cho accessibility
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openNotifModal(item);
            }
        });

        return card;
    }

    // 10. ĐÁNH DẤU MỘT THÔNG BÁO ĐÃ ĐỌC
    async function markSingleAsRead(item) {
        if (item.is_read) return;
        try {
            await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/notifications/read/${item._id}`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            item.is_read = true;
            renderNotifications();
            updateBadgeCounts();
            if (typeof showAppNotification === "function") {
                showAppNotification("Đã đánh dấu thông báo là đã đọc!");
            }
        } catch (error) {
            console.error("Lỗi cập nhật trạng thái đã đọc:", error);
        }
    }

    // 11. XỬ LÝ TÌM KIẾM CLIENT-SIDE
    if (notifSearchInput) {
        notifSearchInput.addEventListener("input", (e) => {
            searchQuery = e.target.value;
            displayLimit = 15;
            if (btnClearSearch) {
                btnClearSearch.style.display = searchQuery ? "block" : "none";
            }
            renderNotifications();
        });
    }

    if (btnClearSearch) {
        btnClearSearch.addEventListener("click", () => {
            if (notifSearchInput) notifSearchInput.value = "";
            searchQuery = "";
            btnClearSearch.style.display = "none";
            renderNotifications();
        });
    }

    // 12. LỌC THEO TAB
    const tabButtons = document.querySelectorAll(".notif-tab-btn, .tab-btn");
    tabButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            tabButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");

            currentFilter = btn.getAttribute("data-filter") || "ALL";
            displayLimit = 15;
            renderNotifications();
        });
    });

    // 13. ĐÁNH DẤU TẤT CẢ ĐÃ ĐỌC
    if (btnMarkAllRead) {
        btnMarkAllRead.addEventListener("click", async () => {
            const hasUnread = allNotifications.some(n => !n.is_read);
            if (!hasUnread) {
                if (typeof showAppNotification === "function") {
                    showAppNotification("Tất cả thông báo đều đã được đọc!");
                }
                return;
            }

            try {
                const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/notifications/read-all/${currentUserCode}`, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${auth.token}` }
                });
                const data = await response.json();

                if (data.success) {
                    allNotifications.forEach(n => n.is_read = true);
                    renderNotifications();
                    updateBadgeCounts();
                    if (typeof showAppNotification === "function") {
                        showAppNotification("Đã đánh dấu tất cả thông báo là đã đọc!");
                    }
                }
            } catch (error) {
                console.error("Lỗi đánh dấu tất cả đã đọc:", error);
            }
        });
    }

    // 14. MODAL CHI TIẾT THÔNG BÁO
    const notifModal = document.getElementById("notifModal");
    const btnCloseNotifModal = document.getElementById("btnCloseNotifModal");
    const btnConfirmReadModal = document.getElementById("btnConfirmReadModal");

    const openNotifModal = async (item) => {
        const modalTitle = document.getElementById("modalTitle");
        const modalTime = document.getElementById("modalTime");
        const modalSender = document.getElementById("modalSender");
        const modalContent = document.getElementById("modalContent");
        const modalSenderTag = document.getElementById("modalSenderTag");

        if (modalTitle) modalTitle.textContent = item.title || "Thông báo";
        if (modalTime) modalTime.textContent = item.createdAt ? new Date(item.createdAt).toLocaleString("vi-VN") : "Vừa xong";
        if (modalSender) modalSender.textContent = item.sender_name || "Khoa CNTT / Hệ thống";
        if (modalContent) modalContent.textContent = item.content || "";

        if (modalSenderTag) {
            const senderBadge = getSenderBadge(item);
            modalSenderTag.className = `source-badge ${senderBadge.cssClass}`;
            modalSenderTag.textContent = senderBadge.text;
        }

        const attBox = document.getElementById("modalAttachmentBox");
        const modalFileName = document.getElementById("modalFileName");
        const modalFileDownload = document.getElementById("modalFileDownload");

        if (attBox && modalFileName && modalFileDownload) {
            if (item.attachment && item.attachment.name) {
                attBox.style.display = "flex";
                modalFileName.textContent = item.attachment.name;
                modalFileDownload.href = item.attachment.url || "#";
            } else {
                attBox.style.display = "none";
            }
        }

        if (notifModal) notifModal.style.display = "flex";

        // Đánh dấu đã đọc trên server nếu chưa đọc
        if (!item.is_read) {
            try {
                await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/notifications/read/${item._id}`, {
                    method: 'PATCH',
                    headers: { Authorization: `Bearer ${auth.token}` }
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
        if (notifModal) notifModal.style.display = "none";
    };

    if (btnCloseNotifModal) btnCloseNotifModal.addEventListener("click", closeNotifModal);
    if (btnConfirmReadModal) btnConfirmReadModal.addEventListener("click", closeNotifModal);

    // 15. ĐĂNG XUẤT MODAL
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn && logoutModal) {
        logoutBtn.addEventListener("click", () => logoutModal.style.display = "flex");
    }
    if (cancelLogoutBtn && logoutModal) {
        cancelLogoutBtn.addEventListener("click", () => logoutModal.style.display = "none");
    }
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            localStorage.removeItem(`${currentUserRole.toLowerCase()}Auth`);
            if (localStorage.getItem("activeRole") === currentUserRole) {
                localStorage.removeItem("activeRole");
            }
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            sessionStorage.clear();
            window.location.href = "../auth/index.html";
        });
    }

    // Đóng modal khi bấm ra ngoài vùng backdrop
    window.addEventListener("click", (e) => {
        if (e.target === notifModal) closeNotifModal();
        if (e.target === logoutModal) logoutModal.style.display = "none";
    });

    // Helper escape HTML
    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Tải dữ liệu ban đầu
    fetchNotifications();
});
