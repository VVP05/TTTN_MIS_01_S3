(function () {
    let activeAuth;
    try {
        activeAuth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    } catch (error) {
        console.error("Không thể đọc phiên đăng nhập để hiển thị số chat chưa đọc:", error);
        return;
    }

    const role = String(activeAuth?.user?.role || "").toUpperCase();
    const targetPath = role === "STUDENT"
        ? "/student/work-schedule.html"
        : role === "LECTURER"
            ? "/lecturer/lecturer-groups.html"
            : null;
    if (!targetPath) return;

    const targetLink = Array.from(document.querySelectorAll(".sidebar-menu a"))
        .find(link => new URL(link.getAttribute("href"), document.baseURI).pathname.endsWith(targetPath));
    if (!targetLink) return;

    let badge = targetLink.querySelector(".chat-sidebar-unread-badge");
    if (!badge) {
        badge = document.createElement("span");
        badge.className = "chat-unread-badge chat-sidebar-unread-badge";
        badge.hidden = true;
        targetLink.appendChild(badge);
    }
    if (role === "LECTURER" || role === "STUDENT") badge.classList.add("chat-sidebar-unread-dot");

    const stylesheetUrl = new URL("../../css/common/chat-unread.css", document.baseURI).href;
    const stylesheetLoaded = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .some(link => link.href === stylesheetUrl);
    if (!stylesheetLoaded) {
        const stylesheet = document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = stylesheetUrl;
        document.head.appendChild(stylesheet);
    }

    function updateBadge(count) {
        const unreadCount = Math.max(0, Number(count) || 0);
        badge.hidden = unreadCount === 0;
        badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
        badge.setAttribute("aria-label", `${unreadCount} tin nhắn chưa đọc`);
        if (role === "LECTURER" || role === "STUDENT") {
            targetLink.classList.toggle("has-unread-chat", unreadCount > 0);
        }
    }

    let refreshPromise = null;
    window.refreshChatUnreadSidebar = async function () {
        if (refreshPromise) await refreshPromise;
        refreshPromise = (async function () {
            try {
                const response = await window.apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/chat/unread`);
                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || "Không thể tải số tin nhắn chưa đọc.");
                }
                updateBadge(result.data.total_unread);
                window.dispatchEvent(new CustomEvent("chat:unread-updated", { detail: result.data }));
            } catch (error) {
                console.error("Lỗi tải số chat chưa đọc:", error);
            } finally {
                refreshPromise = null;
            }
        })();
        await refreshPromise;
    };

    document.addEventListener("DOMContentLoaded", function () {
        window.refreshChatUnreadSidebar();
        const pollTimer = window.setInterval(function () {
            if (!document.hidden) window.refreshChatUnreadSidebar();
        }, 5000);
        window.addEventListener("beforeunload", function () {
            window.clearInterval(pollTimer);
        });
        document.addEventListener("visibilitychange", function () {
            if (!document.hidden) window.refreshChatUnreadSidebar();
        });
    });
})();
