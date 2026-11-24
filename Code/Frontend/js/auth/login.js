document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    const userCodeInput = document.getElementById("userCode");
    const passwordInput = document.getElementById("password");
    const togglePassword = document.getElementById("togglePassword");
    const errorMessage = document.getElementById("errorMessage");
    const submitBtn = document.getElementById("submitBtn");
    const loginLoadingOverlay = document.getElementById("loginLoadingOverlay");

    const btnText = submitBtn ? submitBtn.querySelector(".btn-text") : null;
    const btnSpinner = submitBtn ? submitBtn.querySelector(".btn-spinner") : null;

    const setLoginLoading = (isLoading) => {
        if (submitBtn) submitBtn.disabled = isLoading;
        if (loginLoadingOverlay) loginLoadingOverlay.hidden = !isLoading;
        if (btnText) {
            btnText.textContent = isLoading ? "Đang đăng nhập..." : "Đăng nhập hệ thống";
        }
        if (btnSpinner) btnSpinner.hidden = !isLoading;
    };

    if (togglePassword && passwordInput) {
        togglePassword.addEventListener("click", () => {
            const isPasswordHidden = passwordInput.type === "password";
            passwordInput.type = isPasswordHidden ? "text" : "password";
            togglePassword.classList.toggle("is-visible", isPasswordHidden);
            const label = isPasswordHidden ? "Ẩn mật khẩu" : "Hiện mật khẩu";
            togglePassword.setAttribute("aria-label", label);
            togglePassword.setAttribute("title", label);
        });
    }

    // Hàm hiển thị lỗi (dùng banner inline đỏ nhạt)
    const showError = (message) => {
        if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.hidden = false;
        }
    };

    // Hàm ẩn lỗi
    const clearError = () => {
        if (errorMessage) {
            errorMessage.textContent = "";
            errorMessage.hidden = true;
        }
    };

    // Bắt sự kiện khi Submit Form
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault(); // Chặn hành vi tải lại trang mặc định của Form
            clearError();

            const user_code = userCodeInput ? userCodeInput.value.trim() : "";
            const password = passwordInput ? passwordInput.value.trim() : "";

            if (!user_code || !password) {
                showError("Vui lòng nhập đầy đủ mã định danh và mật khẩu!");
                return;
            }

            setLoginLoading(true);

            try {
                // Gửi request tới Backend API
                const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/login", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ user_code, password })
                });

                const data = await response.json();

                // Nếu Server trả về lỗi (400, 401, 404, 500...)
                if (!response.ok) {
                    showError(data.message || "Tài khoản hoặc mật khẩu không chính xác!");
                    setLoginLoading(false);
                    return;
                }

                // --- NẾU ĐĂNG NHẬP THÀNH CÔNG ---
                window.storeAuthUser(data.user);
                window.resetAuthInactivityTimer();

                // Điều hướng trang theo Role (STUDENT, LECTURER, ADMIN)
                setTimeout(() => {
                    if (data.user.must_change_password) {
                        window.location.href = "../auth/force-change-password.html";
                        return;
                    }

                    const role = data.user.role;
                    if (role === "STUDENT") {
                        window.location.href = "../student/student-dashboard.html";
                    } else if (role === "LECTURER") {
                        window.location.href = "../lecturer/lecturer-dashboard.html";
                    } else if (role === "ADMIN") {
                        window.location.href = "../admin/admin-dashboard.html";
                    } else {
                        showError("Quyền truy cập không hợp lệ!");
                        setLoginLoading(false);
                    }
                }, 500); // Trễ nửa giây để trải nghiệm chuyển trang mượt hơn

            } catch (error) {
                console.error("Lỗi kết nối:", error);
                showError("Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!");
                setLoginLoading(false);
            }
        });
    }

    // ===== XỬ LÝ MODAL "QUÊN MẬT KHẨU" =====
    const forgotPasswordModal = document.getElementById("forgotPasswordModal");
    const openForgotPasswordBtn = document.getElementById("openForgotPasswordBtn");
    const closeForgotPasswordBtn = document.getElementById("closeForgotPasswordBtn");
    const forgotPasswordForm = document.getElementById("forgotPasswordForm");
    const fpUserCodeInput = document.getElementById("fpUserCode");
    const fpEmailInput = document.getElementById("fpEmail");
    const forgotPasswordMessage = document.getElementById("forgotPasswordMessage");
    const fpSubmitBtn = document.getElementById("fpSubmitBtn");
    const fpBtnText = fpSubmitBtn ? fpSubmitBtn.querySelector(".btn-text") : null;
    const fpBtnSpinner = fpSubmitBtn ? fpSubmitBtn.querySelector(".btn-spinner") : null;

    const openForgotModal = () => {
        if (forgotPasswordMessage) {
            forgotPasswordMessage.textContent = "";
            forgotPasswordMessage.className = "fp-message";
        }
        if (forgotPasswordForm) forgotPasswordForm.reset();
        if (forgotPasswordModal) forgotPasswordModal.classList.add("active");
    };

    const closeForgotModal = () => {
        if (forgotPasswordModal) forgotPasswordModal.classList.remove("active");
    };

    if (openForgotPasswordBtn) {
        openForgotPasswordBtn.addEventListener("click", (e) => {
            e.preventDefault();
            openForgotModal();
        });
    }

    if (closeForgotPasswordBtn) {
        closeForgotPasswordBtn.addEventListener("click", closeForgotModal);
    }

    window.addEventListener("click", (e) => {
        if (e.target === forgotPasswordModal) closeForgotModal();
    });

    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const user_code = fpUserCodeInput ? fpUserCodeInput.value.trim() : "";
            const email = fpEmailInput ? fpEmailInput.value.trim() : "";

            if (forgotPasswordMessage) {
                forgotPasswordMessage.textContent = "";
                forgotPasswordMessage.className = "fp-message";
            }

            if (!user_code || !email) {
                if (forgotPasswordMessage) {
                    forgotPasswordMessage.textContent = "Vui lòng nhập đầy đủ Mã định danh và Email!";
                    forgotPasswordMessage.classList.add("error");
                }
                return;
            }

            if (fpSubmitBtn) fpSubmitBtn.disabled = true;
            if (fpBtnText) fpBtnText.textContent = "Đang xử lý...";
            if (fpBtnSpinner) fpBtnSpinner.hidden = false;

            try {
                const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/forgot-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_code, email })
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    if (forgotPasswordMessage) {
                        forgotPasswordMessage.textContent = data.message || "Không thể khôi phục mật khẩu, vui lòng thử lại!";
                        forgotPasswordMessage.classList.add("error");
                    }
                    return;
                }

                if (forgotPasswordMessage) {
                    forgotPasswordMessage.textContent = data.message;
                    forgotPasswordMessage.classList.add("success");
                }
                forgotPasswordForm.reset();
            } catch (error) {
                console.error("Lỗi kết nối:", error);
                if (forgotPasswordMessage) {
                    forgotPasswordMessage.textContent = "Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!";
                    forgotPasswordMessage.classList.add("error");
                }
            } finally {
                if (fpSubmitBtn) fpSubmitBtn.disabled = false;
                if (fpBtnText) fpBtnText.textContent = "Xác nhận khôi phục";
                if (fpBtnSpinner) fpBtnSpinner.hidden = true;
            }
        });
    }
});
