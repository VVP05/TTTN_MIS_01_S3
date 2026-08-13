document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user || user.role !== "STUDENT") {
        window.location.href = "index.html";
        return;
    }

    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    // 2. ẨN / HIỆN MẬT KHẨU (TOGGLE EYE ICON)
    window.togglePassword = (inputId, btn) => {
        const input = document.getElementById(inputId);
        const icon = btn.querySelector("i");
        if (input.type === "password") {
            input.type = "text";
            icon.classList.replace("fa-eye", "fa-eye-slash");
        } else {
            input.type = "password";
            icon.classList.replace("fa-eye-slash", "fa-eye");
        }
    };

    // 3. PASSWORD STRENGTH METER & CHECKLIST VALIDATION
    const newPasswordInput = document.getElementById("newPassword");
    const strengthBar = document.getElementById("strengthBar");
    const strengthText = document.getElementById("strengthText");

    // Các mục checklist
    const checkLength = document.getElementById("checkLength");
    const checkUpper = document.getElementById("checkUpper");
    const checkLower = document.getElementById("checkLower");
    const checkNumber = document.getElementById("checkNumber");
    const checkSpecial = document.getElementById("checkSpecial");

    const updateChecklist = (element, isValid) => {
        const icon = element.querySelector("i");
        if (isValid) {
            element.classList.add("valid");
            icon.classList.replace("fa-circle", "fa-circle-check");
            icon.classList.replace("fa-regular", "fa-solid");
        } else {
            element.classList.remove("valid");
            icon.classList.replace("fa-circle-check", "fa-circle");
            icon.classList.replace("fa-solid", "fa-regular");
        }
    };

    newPasswordInput.addEventListener("input", () => {
        const val = newPasswordInput.value;
        let score = 0;

        // Tiêu chí 1: Độ dài >= 8
        const isLength = val.length >= 8;
        updateChecklist(checkLength, isLength);
        if (isLength) score++;

        // Tiêu chí 2: Có chữ hoa
        const isUpper = /[A-Z]/.test(val);
        updateChecklist(checkUpper, isUpper);
        if (isUpper) score++;

        // Tiêu chí 3: Có chữ thường
        const isLower = /[a-z]/.test(val);
        updateChecklist(checkLower, isLower);
        if (isLower) score++;

        // Tiêu chí 4: Có số
        const isNumber = /[0-9]/.test(val);
        updateChecklist(checkNumber, isNumber);
        if (isNumber) score++;

        // Tiêu chí 5: Có ký tự đặc biệt
        const isSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(val);
        updateChecklist(checkSpecial, isSpecial);
        if (isSpecial) score++;

        // Cập nhật thanh sức mạnh
        strengthBar.className = "strength-bar";
        if (val.length === 0) {
            strengthBar.style.width = "0%";
            strengthText.textContent = "Chưa nhập";
            strengthText.style.color = "#64748b";
        } else if (score <= 2) {
            strengthBar.classList.add("strength-weak");
            strengthText.textContent = "Yếu";
            strengthText.style.color = "#ef4444";
        } else if (score === 3) {
            strengthBar.classList.add("strength-medium");
            strengthText.textContent = "Trung bình";
            strengthText.style.color = "#f59e0b";
        } else if (score === 4) {
            strengthBar.classList.add("strength-strong");
            strengthText.textContent = "Mạnh";
            strengthText.style.color = "#3b82f6";
        } else if (score === 5) {
            strengthBar.classList.add("strength-very-strong");
            strengthText.textContent = "Rất mạnh";
            strengthText.style.color = "#10b981";
        }
    });

    // 4. VALIDATE & XỬ LÝ SUBMIT FORM
    const changePasswordForm = document.getElementById("changePasswordForm");
    const currentPasswordInput = document.getElementById("currentPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");

    const currentPasswordError = document.getElementById("currentPasswordError");
    const newPasswordError = document.getElementById("newPasswordError");
    const confirmPasswordError = document.getElementById("confirmPasswordError");

    const clearErrors = () => {
        currentPasswordError.textContent = "";
        newPasswordError.textContent = "";
        confirmPasswordError.textContent = "";
    };

    changePasswordForm.addEventListener("submit", (e) => {
        e.preventDefault();
        clearErrors();

        const currentPass = currentPasswordInput.value.trim();
        const newPass = newPasswordInput.value.trim();
        const confirmPass = confirmPasswordInput.value.trim();
        let isValid = true;

        if (!currentPass) {
            currentPasswordError.textContent = "Vui lòng nhập mật khẩu hiện tại.";
            isValid = false;
        }

        if (newPass.length < 8) {
            newPasswordError.textContent = "Mật khẩu mới phải có ít nhất 8 ký tự.";
            isValid = false;
        } else if (currentPass === newPass) {
            newPasswordError.textContent = "Mật khẩu mới không được trùng với mật khẩu cũ.";
            isValid = false;
        }

        if (newPass !== confirmPass) {
            confirmPasswordError.textContent = "Xác nhận mật khẩu mới không khớp.";
            isValid = false;
        }

        if (!isValid) return;

        // Mô phỏng đổi mật khẩu thành công -> Hiển thị Modal
        document.getElementById("successModal").style.display = "flex";
        changePasswordForm.reset();
        strengthBar.style.width = "0%";
        strengthText.textContent = "Chưa nhập";
        document.querySelectorAll(".password-checklist li").forEach((li) => {
            li.classList.remove("valid");
            const icon = li.querySelector("i");
            icon.classList.replace("fa-circle-check", "fa-circle");
            icon.classList.replace("fa-solid", "fa-regular");
        });
    });

    // 5. ĐÓNG MODAL THÀNH CÔNG VÀ CHUYỂN HOẶC Ở LẠI
    const btnSuccessClose = document.getElementById("btnSuccessClose");
    if (btnSuccessClose) {
        btnSuccessClose.addEventListener("click", () => {
            window.location.href = "student-dashboard.html";
        });
    }

    // 6. XỬ LÝ ĐĂNG XUẤT
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn) logoutBtn.addEventListener("click", () => logoutModal.style.display = "flex");
    if (cancelLogoutBtn) cancelLogoutBtn.addEventListener("click", () => logoutModal.style.display = "none");
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "index.html";
        });
    }

    window.addEventListener("click", (e) => {
        if (e.target === logoutModal) logoutModal.style.display = "none";
    });
});