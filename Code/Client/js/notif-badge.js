// notif-badge.js
// Script dùng chung: cập nhật số lượng thông báo CHƯA ĐỌC lên chuông thông báo
// ở header của MỌI trang (Sinh viên & Giảng viên), không phụ thuộc trang đó có
// logic riêng hay không. Chạy độc lập, không ảnh hưởng các script khác.

(function () {
    function getAuthForRole(role) {
        const roleKey = { STUDENT: "studentAuth", LECTURER: "lecturerAuth", ADMIN: "adminAuth" }[role] || "auth";
        const raw = localStorage.getItem(roleKey);
        if (!raw) return null;
        try {
            return JSON.parse(raw);
        } catch (error) {
            return null;
        }
    }

    function resolveCurrentUser() {
        const fallbackUser = JSON.parse(localStorage.getItem("user") || "null");
        const activeRole = localStorage.getItem("activeRole");

        if (activeRole) {
            const auth = getAuthForRole(activeRole);
            if (auth && auth.user) return auth.user;
        }

        // Không xác định được activeRole -> thử lần lượt Student/Lecturer/Admin
        const studentAuth = getAuthForRole("STUDENT");
        if (studentAuth && studentAuth.user) return studentAuth.user;

        const lecturerAuth = getAuthForRole("LECTURER");
        if (lecturerAuth && lecturerAuth.user) return lecturerAuth.user;

        const adminAuth = getAuthForRole("ADMIN");
        if (adminAuth && adminAuth.user) return adminAuth.user;

        return fallbackUser;
    }

    async function updateBellBadge() {
        const user = resolveCurrentUser();
        if (!user || !user.user_code || !user.role) return;

        // Trang Admin chưa có hộp thư thông báo cá nhân riêng, bỏ qua.
        if (user.role === "ADMIN") return;

        const isLecturer = user.role === "LECTURER";
        const endpoint = isLecturer
            ? `http://localhost:5000/api/notifications/lecturer/${user.user_code}`
            : `http://localhost:5000/api/notifications/${user.user_code}`;

        try {
            const response = await fetch(endpoint);
            const data = await response.json();
            if (!data.success) return;

            const unreadCount = data.unread_count || 0;

            // Cập nhật MỌI phần tử badge trên trang (id ưu tiên, class dự phòng)
            const badgeElements = document.querySelectorAll("#headerBadgeCount, .badge-count");
            badgeElements.forEach((el) => {
                el.textContent = unreadCount;
                el.style.display = unreadCount > 0 ? "inline-block" : "none";
            });
        } catch (error) {
            // Mất kết nối máy chủ: không chặn trang, chỉ bỏ qua cập nhật badge
            console.warn("Không thể tải số lượng thông báo:", error.message);
        }
    }

    function ensureBellIsClickable() {
        const user = resolveCurrentUser();
        const isLecturer = user && user.role === "LECTURER";
        const targetPage = isLecturer ? "lecturer-notifications.html" : "notifications.html";

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
        ensureBellIsClickable();
        updateBellBadge();
    });
})();
