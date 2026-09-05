document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP
    const auth = JSON.parse(localStorage.getItem("lecturerAuth") || "null");
    const user = auth?.user || null;
    if (!user || user.role !== "LECTURER") {
        window.location.href = "index.html";
        return;
    }

    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    window.toggleLecturerPassword = (inputId, button) => {
        const input = document.getElementById(inputId);
        const icon = button.querySelector("i");
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        icon.classList.toggle("fa-eye", !isHidden);
        icon.classList.toggle("fa-eye-slash", isHidden);
        button.setAttribute("aria-label", isHidden ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    };

    // 2. XỬ LÝ LƯU HỒ SƠ
    const profileForm = document.getElementById("profileForm");
    if (profileForm) {
        profileForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const email = document.getElementById("lecturerEmail").value;
            const phone = document.getElementById("lecturerPhone").value;
            const maxGroups = document.getElementById("maxGroups").value;

            alert(`Đã cập nhật hồ sơ thành công!\n• Email: ${email}\n• SĐT: ${phone}\n• Chỉ tiêu hướng dẫn tối đa: ${maxGroups} nhóm.`);
        });
    }

    // 3. XỬ LÝ ĐỔI MẬT KHẨU
    const changePasswordForm = document.getElementById("changePasswordForm");
    const newPasswordInput = document.getElementById("newPassword");
    const passwordStrengthBar = document.getElementById("passwordStrengthBar");
    const passwordStrengthText = document.getElementById("passwordStrengthText");
    const passwordRequirements = {
        length: document.getElementById("requirementLength"),
        uppercase: document.getElementById("requirementUppercase"),
        lowercase: document.getElementById("requirementLowercase"),
        number: document.getElementById("requirementNumber"),
        special: document.getElementById("requirementSpecial")
    };

    const getPasswordRules = (password) => ({
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    });

    const updatePasswordStrength = () => {
        const rules = getPasswordRules(newPasswordInput.value);
        const score = Object.values(rules).filter(Boolean).length;
        Object.entries(rules).forEach(([rule, valid]) => {
            passwordRequirements[rule].classList.toggle("valid", valid);
        });

        const levels = [
            { max: 0, label: "Chưa nhập", color: "#e5e7eb" },
            { max: 2, label: "Yếu", color: "#ef4444" },
            { max: 3, label: "Trung bình", color: "#f59e0b" },
            { max: 4, label: "Mạnh", color: "#2563eb" },
            { max: 5, label: "Rất mạnh", color: "#16a34a" }
        ];
        const level = levels.find(item => score <= item.max);
        passwordStrengthBar.style.width = `${score * 20}%`;
        passwordStrengthBar.style.backgroundColor = level.color;
        passwordStrengthText.textContent = level.label;
        passwordStrengthText.style.color = level.color;
        return rules;
    };

    newPasswordInput.addEventListener("input", updatePasswordStrength);

    if (changePasswordForm) {
        changePasswordForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const oldPass = document.getElementById("oldPassword").value;
            const newPass = document.getElementById("newPassword").value;
            const confirmPass = document.getElementById("confirmPassword").value;
            const submitButton = changePasswordForm.querySelector('button[type="submit"]');
            const passwordRules = updatePasswordStrength();

            if (!oldPass) {
                alert("Vui lòng nhập mật khẩu hiện tại!");
                return;
            }

            if (!Object.values(passwordRules).every(Boolean)) {
                alert("Mật khẩu mới phải có ít nhất 8 ký tự, chữ hoa, chữ thường, chữ số và ký tự đặc biệt!");
                return;
            }

            if (newPass !== confirmPass) {
                alert("Xác nhận mật khẩu mới không khớp!");
                return;
            }

            const originalButtonText = submitButton ? submitButton.innerHTML : "";
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.textContent = "Đang cập nhật...";
            }

            try {
                const response = await fetch("http://localhost:5000/api/auth/change-password", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_code: user.user_code,
                        currentPassword: oldPass,
                        newPassword: newPass
                    })
                });
                const result = await response.json();

                if (!response.ok || !result.success) {
                    alert(result.message || "Đổi mật khẩu thất bại!");
                    return;
                }

                alert("Đổi mật khẩu thành công! Vui lòng sử dụng mật khẩu mới cho lần đăng nhập tiếp theo.");
                changePasswordForm.reset();
            } catch (error) {
                console.error("Lỗi đổi mật khẩu:", error);
                alert("Không thể kết nối đến máy chủ. Vui lòng thử lại!");
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.innerHTML = originalButtonText;
                }
            }
        });
    }

    // 4. ĐĂNG XUẤT
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("user");
            window.location.href = "index.html";
        });
    }
});