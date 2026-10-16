document.addEventListener("DOMContentLoaded", () => {
    let auth;
    try {
        auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    } catch {
        return;
    }

    const user = auth?.user;
    if (!auth?.token || user?.role !== "LECTURER" || !user.user_code) return;

    const lecturerCode = encodeURIComponent(user.user_code);
    const topicLinks = document.querySelectorAll(
        '.sidebar-menu a[href="lecturer-topics.html"], .menu-item a[href="lecturer-topics.html"]'
    );
    const notificationBells = document.querySelectorAll(".notification-btn");

    notificationBells.forEach(bell => {
        if (!bell.dataset.defaultHref) bell.dataset.defaultHref = bell.getAttribute("href") || "lecturer-notifications.html";
    });

    let isChecking = false;

    async function refreshPendingReviewAlert() {
        if (document.hidden || isChecking) return;
        isChecking = true;

        try {
            const response = await fetch(
                `http://localhost:5000/api/topics/lecturer/${lecturerCode}/pending-review`,
                { headers: { Authorization: `Bearer ${auth.token}` } }
            );
            if (!response.ok) return;

            const result = await response.json();
            if (!result.success || typeof result.hasPendingReview !== "boolean") return;

            topicLinks.forEach(link => link.classList.toggle("has-pending-review", result.hasPendingReview));
            notificationBells.forEach(bell => {
                bell.classList.toggle("has-pending-review", result.hasPendingReview);
                bell.setAttribute(
                    "aria-label",
                    result.hasPendingReview ? "Có đề tài cần duyệt" : "Xem thông báo"
                );
                bell.title = result.hasPendingReview ? "Có đề tài cần duyệt" : "Xem thông báo";
                bell.href = result.hasPendingReview ? "lecturer-topics.html" : bell.dataset.defaultHref;
            });
        } catch (error) {
            console.warn("Không thể kiểm tra đề tài cần duyệt:", error.message);
        } finally {
            isChecking = false;
        }
    }

    refreshPendingReviewAlert();
    window.setInterval(refreshPendingReviewAlert, 5000);
    window.addEventListener("focus", refreshPendingReviewAlert);
    document.addEventListener("visibilitychange", refreshPendingReviewAlert);
});