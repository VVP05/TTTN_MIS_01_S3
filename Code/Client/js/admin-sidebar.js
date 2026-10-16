document.addEventListener("DOMContentLoaded", async () => {
    const pendingBadges = document.querySelectorAll("#pendingTopicsBadge, #pendingBadgeCount");
    if (!pendingBadges.length) return;

    let isLoading = false;

    async function refreshPendingBadge() {
        if (isLoading) return;

        let auth;
        try {
            auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
        } catch {
            pendingBadges.forEach(badge => { badge.hidden = true; });
            return;
        }

        if (auth?.user?.role !== "ADMIN" || !auth.token) {
            pendingBadges.forEach(badge => { badge.hidden = true; });
            return;
        }

        isLoading = true;
        try {
            const response = await fetch("http://localhost:5000/api/topics/admin/pool", {
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            if (!response.ok) return;

            const result = await response.json();
            if (!result.success || !Array.isArray(result.data)) return;

            const pendingCount = result.data.filter(topic =>
                String(topic.status || "").toUpperCase() === "PENDING"
            ).length;

            pendingBadges.forEach(badge => {
                badge.textContent = pendingCount;
                badge.hidden = pendingCount === 0;
            });
        } catch (error) {
            console.error("Không thể tải số đề tài chờ duyệt:", error);
        } finally {
            isLoading = false;
        }
    }

    refreshPendingBadge();
    window.setInterval(() => {
        if (!document.hidden) refreshPendingBadge();
    }, 5000);
    window.addEventListener("focus", refreshPendingBadge);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) refreshPendingBadge();
    });
});