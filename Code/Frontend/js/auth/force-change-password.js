document.addEventListener("DOMContentLoaded", async () => {
    const user = await window.verifyAuthSession();
    if (!user) return;

    const rolePages = {
        ADMIN: "../admin/admin-dashboard.html",
        LECTURER: "../lecturer/lecturer-dashboard.html",
        STUDENT: "../student/student-dashboard.html"
    };
    if (!user.must_change_password) {
        window.location.replace(rolePages[String(user.role || "").toUpperCase()] || "index.html");
        return;
    }

    const form = document.getElementById("forceChangePasswordForm");
    const currentPasswordInput = document.getElementById("currentPassword");
    const newPasswordInput = document.getElementById("newPassword");
    const confirmInput = document.getElementById("confirmPassword");
    const message = document.getElementById("forceChangeMessage");
    const submitButton = document.getElementById("forceChangeSubmit");
    let passwordUpdated = false;

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (passwordUpdated) {
            await window.logoutSession();
            window.location.replace(window.resolveAppRoute("/login", "index.html"));
            return;
        }

        const currentPassword = currentPasswordInput.value;
        const newPassword = newPasswordInput.value;
        if (newPassword !== confirmInput.value) {
            message.textContent = "Mật khẩu nhập lại không khớp.";
            return;
        }
        if (newPassword === currentPassword) {
            message.textContent = "Mật khẩu mới không được trùng với mật khẩu hiện tại.";
            return;
        }

        submitButton.disabled = true;
        message.textContent = "";
        message.classList.remove("success");
        try {
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/change-password`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || "Không thể đổi mật khẩu.");
            }

            form.reset();
            form.querySelectorAll("input").forEach(input => {
                input.disabled = true;
            });
            passwordUpdated = true;
            message.textContent = "Đổi mật khẩu thành công! Hãy đăng nhập lại bằng mật khẩu mới.";
            message.classList.add("success");
            submitButton.textContent = "Đến trang đăng nhập";
        } catch (error) {
            message.textContent = error.message || "Không thể kết nối đến máy chủ.";
        } finally {
            submitButton.disabled = false;
        }
    });
});
