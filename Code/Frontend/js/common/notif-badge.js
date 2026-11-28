// notif-badge.js
// Script dùng chung: cập nhật số lượng thông báo CHƯA ĐỌC trên mọi trang
// của Sinh viên và Giảng viên, không phụ thuộc trang đó có
// logic riêng hay không. Chạy độc lập, không ảnh hưởng các script khác.

(function () {
    function getAuthForRole(role) {
        const activeSession = sessionStorage.getItem("activeAuth");
        if (activeSession) {
            try {
                const parsedSession = JSON.parse(activeSession);
                if (parsedSession?.user?.role === role) return parsedSession;
            } catch (error) {
                sessionStorage.removeItem("activeAuth");
            }
        }

        return null;
    }

    function resolveCurrentUser() {
        const pathname = window.location.pathname.toLowerCase();
        const pageName = pathname.split("/").pop();
        const pageRole = (pathname.startsWith("/lecturer") || pageName.startsWith("lecturer-")) ? "LECTURER" : "STUDENT";
        const pageAuth = getAuthForRole(pageRole);

        if (pageAuth && pageAuth.user) return pageAuth.user;

        return null;
    }

    function hashText(value) {
        let hash = 2166136261;
        for (let index = 0; index < value.length; index++) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function showRegistrationAnnouncement(title, content, user, auth) {
        const sessionHash = hashText(user.user_code);
        const announcementHash = hashText(title);
        const marker = `registrationPopup:${sessionHash}:${announcementHash}`;
        if (sessionStorage.getItem(marker)) return;
        sessionStorage.setItem(marker, "shown");

        const overlay = document.createElement("div");
        overlay.className = "registration-announcement-overlay";
        overlay.setAttribute("role", "presentation");
        overlay.innerHTML = `
            <section class="registration-announcement" role="dialog" aria-modal="true" aria-labelledby="registrationAnnouncementTitle">
                <button class="registration-announcement-close" type="button" aria-label="Đóng thông báo">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <div class="registration-announcement-icon"><i class="fa-solid fa-bullhorn"></i></div>
                <span class="registration-announcement-eyebrow">THÔNG BÁO QUAN TRỌNG</span>
                <h2 id="registrationAnnouncementTitle"></h2>
                <p class="registration-announcement-content"></p>
                <div class="registration-announcement-actions">
                    <a class="registration-announcement-primary" href="../student/student-dashboard.html#topicRegisterForm">
                        Đăng ký đề tài ngay <i class="fa-solid fa-arrow-right"></i>
                    </a>
                    <button class="registration-announcement-dismiss" type="button">Để sau</button>
                </div>
            </section>
        `;
        overlay.querySelector("#registrationAnnouncementTitle").textContent = title;
        overlay.querySelector(".registration-announcement-content").textContent = content;

        const close = () => {
            overlay.classList.add("is-closing");
            window.setTimeout(() => overlay.remove(), 180);
        };
        overlay.querySelector(".registration-announcement-close").addEventListener("click", close);
        overlay.querySelector(".registration-announcement-dismiss").addEventListener("click", close);
        overlay.querySelector(".registration-announcement-primary").addEventListener("click", event => {
            event.preventDefault();
            const target = new URL(event.currentTarget.href, window.location.href);
            overlay.remove();
            if (target.pathname === window.location.pathname) {
                window.history.replaceState(null, "", target.hash);
                document.getElementById("topicRegisterForm")?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            } else {
                window.location.assign(target.href);
            }
        });
        overlay.addEventListener("click", event => {
            if (event.target === overlay) close();
        });
        document.body.appendChild(overlay);
        overlay.querySelector(".registration-announcement-primary").focus();
    }

    async function checkActiveRegistrationWindow(user, auth) {
        if (user?.role !== "STUDENT" || !auth?.user) return;
        try {
            const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/semesters/registration-status", {
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            const result = await response.json();
            const semester = result?.data?.semester;
            if (!response.ok || !result.success || !result.data?.is_open ||
                !result.data?.eligible_for_registration_announcement || !semester) return;

            const startDate = new Date(semester.registration_start_date);
            const endDate = new Date(semester.registration_end_date);
            const dateFormat = { timeZone: "Asia/Ho_Chi_Minh" };
            const start = semester.registration_window_has_time
                ? startDate
                : new Date(`${startDate.toISOString().slice(0, 10)}T00:00:00+07:00`);
            const end = semester.registration_window_has_time
                ? endDate
                : new Date(`${endDate.toISOString().slice(0, 10)}T23:59:59.999+07:00`);
            const title = `Đã mở đăng ký đề tài — ${semester.name}`;
            const content = `Thời gian đăng ký đề tài cho ${semester.name} đang mở từ ${start.toLocaleString("vi-VN", dateFormat)} đến ${end.toLocaleString("vi-VN", dateFormat)}. Vào trang Đăng ký đề tài để đăng ký ngay.`;
            showRegistrationAnnouncement(title, content, user, auth);
        } catch (error) {
            console.warn("Không thể kiểm tra đợt đăng ký đang mở:", error.message);
        }
    }

    async function updateBellBadge() {
        const user = resolveCurrentUser();
        const auth = getAuthForRole(user?.role);
        if (!user || !user.user_code || !user.role || !auth?.user) return;

        // Trang Admin chưa có hộp thư thông báo cá nhân riêng, bỏ qua.
        if (user.role === "ADMIN") return;

        const isLecturer = user.role === "LECTURER";
        const endpoint = isLecturer
            ? `${window.APP_CONFIG.API_BASE_URL}/api/notifications/lecturer/${user.user_code}`
            : `${window.APP_CONFIG.API_BASE_URL}/api/notifications/${user.user_code}`;

        try {
            const response = await apiFetch(endpoint, {
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            const data = await response.json();
            if (!data.success) return;

            const unreadCount = data.unread_count || 0;
            const seenKey = `seenNotifications:${user.role}:${user.user_code}`;
            const hasBaseline = sessionStorage.getItem(seenKey) !== null;
            const savedSeenIds = JSON.parse(sessionStorage.getItem(seenKey) || "[]");
            const seenIds = new Set(Array.isArray(savedSeenIds) ? savedSeenIds : []);
            const notifications = data.notifications || [];
            const pendingNotifications = hasBaseline
                ? notifications.filter(item => !seenIds.has(item._id) && !item.is_read)
                : notifications.filter(item => !item.is_read);
            const registrationNotices = pendingNotifications.filter(item =>
                item.title?.startsWith("Đã mở đăng ký đề tài")
            );
            const visibleNotifications = [
                ...pendingNotifications.filter(item => !registrationNotices.includes(item))
            ];
            visibleNotifications
                .slice(0, 3)
                .reverse()
                .forEach(item => window.showAppNotification?.(
                    item.content ? `${item.title}\n${item.content}` : item.title,
                    item.title?.startsWith("Đã mở đăng ký đề tài") ? "warning" : "info",
                    false
                ));
            if (!hasBaseline && visibleNotifications.length > 3) {
                window.showAppNotification?.(
                    `Bạn còn ${visibleNotifications.length - 3} thông báo chưa đọc. Vào mục Thông báo để xem tất cả.`,
                    "info",
                    false
                );
            }
            sessionStorage.setItem(seenKey, JSON.stringify(
                notifications.slice(0, 100).map(item => item._id)
            ));

            // Cập nhật MỌI phần tử badge trên trang (id ưu tiên, class dự phòng)
            const badgeElements = document.querySelectorAll(
                "#headerBadgeCount, #sidebarNotificationBadge, .badge-count"
            );
            badgeElements.forEach((el) => {
                el.textContent = unreadCount;
                el.style.display = unreadCount > 0 ? "inline-block" : "none";
            });
        } catch (error) {
            // Mất kết nối máy chủ: không chặn trang, chỉ bỏ qua cập nhật badge
            console.warn("Không thể tải số lượng thông báo:", error.message);
        }
    }

    function ensureNotificationLinkIsClickable() {
        const user = resolveCurrentUser();
        const isLecturer = user && user.role === "LECTURER";
        const targetPage = isLecturer ? "../lecturer/lecturer-notifications.html" : "../shared/notifications.html";

        document.querySelectorAll(".notification-btn").forEach((el) => {
            // Nếu chuông thông báo hiện là <div> (không bấm được) -> chuyển thành link thật
            if (el.tagName.toLowerCase() !== "a") {
                el.style.cursor = "pointer";
                el.addEventListener("click", () => {
                    window.location.href = targetPage;
                });
            }
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        ensureNotificationLinkIsClickable();
        const user = resolveCurrentUser();
        checkActiveRegistrationWindow(user, getAuthForRole(user?.role));
        updateBellBadge();
        window.setInterval(updateBellBadge, 10000);
    });

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) updateBellBadge();
    });
})();
