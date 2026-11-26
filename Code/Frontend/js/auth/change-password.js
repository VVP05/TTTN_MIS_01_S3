document.addEventListener("DOMContentLoaded", async () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP SINH VIÊN
    const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    const user = auth?.user || null;
    if (!user || String(user.role).toUpperCase() !== "STUDENT") {
        window.location.href = "index.html";
        return;
    }

    // Gán thông tin hiển thị lên Topbar
    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    // Elements Cột Phải - Tổng quan tài khoản
    const accountDisplayName = document.getElementById("accountDisplayName");
    const accountDisplayCode = document.getElementById("accountDisplayCode");
    const accountDisplayClass = document.getElementById("accountDisplayClass");
    const accountDisplayEmail = document.getElementById("accountDisplayEmail");
    const accountAvatarLetter = document.getElementById("accountAvatarLetter");

    function getInitials(name) {
        if (!name) return "SV";
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }

    function updateAccountOverview(u) {
        const name = u.full_name || "Sinh viên";
        const code = u.user_code || "SV";
        const studentClass = u.class || "Chưa cập nhật";
        const email = u.email || "Chưa cập nhật";

        if (accountDisplayName) accountDisplayName.textContent = name;
        if (accountDisplayCode) accountDisplayCode.textContent = code;
        if (accountDisplayClass) accountDisplayClass.textContent = studentClass;
        if (accountDisplayEmail) accountDisplayEmail.textContent = email;
        if (accountAvatarLetter) accountAvatarLetter.textContent = getInitials(name);
    }

    updateAccountOverview(user);

    // Tải hồ sơ sinh viên mới nhất từ Backend
    let profileUser = user;
    try {
        const profileResponse = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/users/${encodeURIComponent(user.user_code)}`, {
            headers: { Authorization: `Bearer ${auth.token}` }
        });
        const profileResult = await profileResponse.json();
        if (profileResponse.ok && profileResult.user_code) {
            profileUser = { ...user, ...profileResult };
            const updatedAuth = { user: profileUser, token: auth.token };
            sessionStorage.setItem("activeAuth", JSON.stringify(updatedAuth));
            localStorage.setItem("studentAuth", JSON.stringify(updatedAuth));
            document.getElementById("userName").textContent = profileUser.full_name || user.full_name || "Sinh viên";
            updateAccountOverview(profileUser);
        }
    } catch (error) {
        console.error("Không thể tải hồ sơ sinh viên mới nhất:", error);
    }

    // 2. KHỞI TẠO VÀ XỬ LÝ FORM THÔNG TIN SINH VIÊN
    const profileForm = document.getElementById("profileForm");
    const profileFields = {
        code: document.getElementById("studentCode"),
        name: document.getElementById("studentName"),
        email: document.getElementById("studentEmail"),
        phone: document.getElementById("studentPhone"),
        studentClass: document.getElementById("studentClass"),
        major: document.getElementById("studentMajor")
    };

    const studentEmailError = document.getElementById("studentEmailError");
    const studentPhoneError = document.getElementById("studentPhoneError");
    const unsavedChangesNotice = document.getElementById("unsavedChangesNotice");
    const btnCancelProfile = document.getElementById("btnCancelProfile");
    const btnSaveProfile = document.getElementById("btnSaveProfile");

    // Dữ liệu ban đầu để theo dõi thay đổi (dirty state)
    let initialProfile = {
        email: profileUser.email || "",
        phone: profileUser.phone || "",
        studentClass: profileUser.class || "",
        major: profileUser.major || ""
    };

    function populateProfileForm(data) {
        if (profileFields.code) profileFields.code.value = profileUser.user_code || "";
        if (profileFields.name) profileFields.name.value = profileUser.full_name || "";
        if (profileFields.email) profileFields.email.value = data.email || "";
        if (profileFields.phone) profileFields.phone.value = data.phone || "";
        if (profileFields.studentClass) profileFields.studentClass.value = data.studentClass || "";
        if (profileFields.major) profileFields.major.value = data.major || "";
    }

    populateProfileForm(initialProfile);

    function checkProfileDirty() {
        const currentEmail = profileFields.email?.value.trim() || "";
        const currentPhone = profileFields.phone?.value.trim() || "";

        const isDirty = (
            currentEmail !== initialProfile.email ||
            currentPhone !== initialProfile.phone
        );

        if (isDirty) {
            if (unsavedChangesNotice) unsavedChangesNotice.style.display = "inline-flex";
            if (btnCancelProfile) btnCancelProfile.style.display = "inline-flex";
            if (btnSaveProfile) btnSaveProfile.disabled = false;
        } else {
            if (unsavedChangesNotice) unsavedChangesNotice.style.display = "none";
            if (btnCancelProfile) btnCancelProfile.style.display = "none";
            if (btnSaveProfile) btnSaveProfile.disabled = true;
        }

        return isDirty;
    }

    [profileFields.email, profileFields.phone].forEach(input => {
        if (input) {
            input.addEventListener("input", () => {
                checkProfileDirty();
                validateProfileInputs();
            });
        }
    });

    btnCancelProfile?.addEventListener("click", () => {
        populateProfileForm(initialProfile);
        if (studentEmailError) studentEmailError.textContent = "";
        if (studentPhoneError) studentPhoneError.textContent = "";
        checkProfileDirty();
    });

    function validateProfileInputs() {
        let valid = true;
        const email = profileFields.email?.value.trim() || "";
        const phone = profileFields.phone?.value.trim() || "";

        // Kiểm tra email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email) {
            if (studentEmailError) studentEmailError.textContent = "Vui lòng nhập email liên hệ.";
            valid = false;
        } else if (!emailRegex.test(email)) {
            if (studentEmailError) studentEmailError.textContent = "Định dạng email không hợp lệ (ví dụ: you@domain.com).";
            valid = false;
        } else {
            if (studentEmailError) studentEmailError.textContent = "";
        }

        // Kiểm tra số điện thoại (nếu có nhập)
        const phoneRegex = /^0[0-9]{9}$/;
        if (phone && !phoneRegex.test(phone)) {
            if (studentPhoneError) studentPhoneError.textContent = "Số điện thoại không hợp lệ (phải đủ 10 số và bắt đầu bằng số 0).";
            valid = false;
        } else {
            if (studentPhoneError) studentPhoneError.textContent = "";
        }

        return valid;
    }

    // Submit lưu thông tin sinh viên
    if (profileForm) {
        profileForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            if (!validateProfileInputs()) return;

            const submitButton = btnSaveProfile || profileForm.querySelector('button[type="submit"]');
            const originalText = submitButton.innerHTML;
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang lưu...</span>';

            const emailVal = profileFields.email.value.trim();
            const phoneVal = profileFields.phone.value.trim();

            try {
                const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/students/${encodeURIComponent(user.user_code)}/profile`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${auth.token}`
                    },
                    body: JSON.stringify({
                        email: emailVal,
                        phone: phoneVal
                    })
                });
                const result = await response.json();
                if (!response.ok || !result.success) throw new Error(result.message || "Cập nhật hồ sơ thất bại.");

                // Cập nhật state
                initialProfile = {
                    email: emailVal,
                    phone: phoneVal,
                    studentClass: initialProfile.studentClass,
                    major: initialProfile.major
                };

                const updatedUser = { ...user, ...result.data };
                const updatedAuth = { user: updatedUser, token: auth.token };
                sessionStorage.setItem("activeAuth", JSON.stringify(updatedAuth));
                localStorage.setItem("studentAuth", JSON.stringify(updatedAuth));

                updateAccountOverview(updatedUser);
                checkProfileDirty();

                if (window.showAppNotification) {
                    window.showAppNotification(result.message || "Đã lưu thông tin sinh viên thành công!");
                }
            } catch (error) {
                if (window.showAppNotification) {
                    window.showAppNotification(error.message || "Không thể cập nhật thông tin.");
                } else {
                    alert(error.message || "Không thể cập nhật thông tin.");
                }
            } finally {
                submitButton.disabled = false;
                submitButton.innerHTML = originalText;
                checkProfileDirty();
            }
        });
    }

    // Cảnh báo khi người dùng chuẩn bị rời trang nếu có thay đổi chưa lưu
    window.addEventListener("beforeunload", (e) => {
        if (checkProfileDirty()) {
            e.preventDefault();
            e.returnValue = "";
        }
    });

    // 3. ẨN / HIỆN MẬT KHẨU
    window.togglePassword = (inputId, btn) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        const icon = btn.querySelector("i");
        if (input.type === "password") {
            input.type = "text";
            if (icon) {
                icon.classList.remove("fa-eye");
                icon.classList.add("fa-eye-slash");
            }
            btn.setAttribute("aria-label", "Ẩn mật khẩu");
        } else {
            input.type = "password";
            if (icon) {
                icon.classList.remove("fa-eye-slash");
                icon.classList.add("fa-eye");
            }
            btn.setAttribute("aria-label", "Hiện mật khẩu");
        }
    };

    // 4. KIỂM TRA ĐỘ MẠNH MẬT KHẨU (4 PHÂN ĐOẠN) & CHECKLIST
    const newPasswordInput = document.getElementById("newPassword");
    const currentPasswordInput = document.getElementById("currentPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");

    const strengthBar = document.getElementById("strengthBar");
    const strengthText = document.getElementById("strengthText");
    const seg1 = document.getElementById("seg1");
    const seg2 = document.getElementById("seg2");
    const seg3 = document.getElementById("seg3");
    const seg4 = document.getElementById("seg4");

    const checkLength = document.getElementById("checkLength");
    const checkUpper = document.getElementById("checkUpper");
    const checkLower = document.getElementById("checkLower");
    const checkNumber = document.getElementById("checkNumber");
    const checkSpecial = document.getElementById("checkSpecial");

    const currentPasswordError = document.getElementById("currentPasswordError");
    const newPasswordError = document.getElementById("newPasswordError");
    const confirmPasswordError = document.getElementById("confirmPasswordError");

    const btnSubmitPassword = document.getElementById("btnSubmitPassword");
    const btnCancelPassword = document.getElementById("btnCancelPassword");
    const changePasswordForm = document.getElementById("changePasswordForm");

    const updateChecklist = (element, isValid) => {
        if (!element) return;
        const icon = element.querySelector("i");
        if (isValid) {
            element.classList.add("valid");
            if (icon) {
                icon.className = "fa-solid fa-circle-check";
            }
        } else {
            element.classList.remove("valid");
            if (icon) {
                icon.className = "fa-regular fa-circle";
            }
        }
    };

    function resetStrengthSegments() {
        const segs = [seg1, seg2, seg3, seg4];
        segs.forEach(s => {
            if (s) s.style.backgroundColor = "#E2E8F0";
        });
        if (strengthText) {
            strengthText.textContent = "Chưa nhập";
            strengthText.style.color = "#64748B";
        }
        if (strengthBar) strengthBar.style.width = "0%";
    }

    function checkPasswordFormReady() {
        const currentPass = currentPasswordInput?.value.trim() || "";
        const newPass = newPasswordInput?.value.trim() || "";
        const confirmPass = confirmPasswordInput?.value.trim() || "";

        const isLen = newPass.length >= 8;
        const isUp = /[A-Z]/.test(newPass);
        const isLow = /[a-z]/.test(newPass);
        const isNum = /[0-9]/.test(newPass);
        const isSpec = /[^A-Za-z0-9]/.test(newPass);
        const isNewValid = isLen && isUp && isLow && isNum && isSpec;
        const isMatch = newPass && confirmPass && newPass === confirmPass;

        if (btnSubmitPassword) {
            btnSubmitPassword.disabled = !(currentPass && isNewValid && isMatch);
        }

        return isNewValid && isMatch;
    }

    newPasswordInput?.addEventListener("input", () => {
        const val = newPasswordInput.value;
        let score = 0;

        const isLen = val.length >= 8;
        updateChecklist(checkLength, isLen);
        if (isLen) score++;

        const isUp = /[A-Z]/.test(val);
        updateChecklist(checkUpper, isUp);
        if (isUp) score++;

        const isLow = /[a-z]/.test(val);
        updateChecklist(checkLower, isLow);
        if (isLow) score++;

        const isNum = /[0-9]/.test(val);
        updateChecklist(checkNumber, isNum);
        if (isNum) score++;

        const isSpec = /[^A-Za-z0-9]/.test(val);
        updateChecklist(checkSpecial, isSpec);
        if (isSpec) score++;

        // Cập nhật 4 phân đoạn độ mạnh
        resetStrengthSegments();

        if (val.length === 0) {
            // Chưa nhập
        } else if (score <= 2) {
            if (seg1) seg1.style.backgroundColor = "#EF4444";
            if (strengthText) {
                strengthText.textContent = "Yếu";
                strengthText.style.color = "#EF4444";
            }
        } else if (score === 3) {
            if (seg1) seg1.style.backgroundColor = "#F59E0B";
            if (seg2) seg2.style.backgroundColor = "#F59E0B";
            if (strengthText) {
                strengthText.textContent = "Trung bình";
                strengthText.style.color = "#F59E0B";
            }
        } else if (score === 4) {
            if (seg1) seg1.style.backgroundColor = "#3B82F6";
            if (seg2) seg2.style.backgroundColor = "#3B82F6";
            if (seg3) seg3.style.backgroundColor = "#3B82F6";
            if (strengthText) {
                strengthText.textContent = "Khá";
                strengthText.style.color = "#3B82F6";
            }
        } else if (score === 5) {
            [seg1, seg2, seg3, seg4].forEach(s => {
                if (s) s.style.backgroundColor = "#16A34A";
            });
            if (strengthText) {
                strengthText.textContent = "Mạnh";
                strengthText.style.color = "#16A34A";
            }
        }

        // Kiểm tra khớp xác nhận mật khẩu nếu đã gõ
        if (confirmPasswordInput?.value) {
            if (confirmPasswordInput.value !== val) {
                if (confirmPasswordError) confirmPasswordError.textContent = "Mật khẩu xác nhận không khớp.";
            } else {
                if (confirmPasswordError) confirmPasswordError.textContent = "";
            }
        }

        if (newPasswordError) newPasswordError.textContent = "";
        checkPasswordFormReady();
    });

    confirmPasswordInput?.addEventListener("input", () => {
        const confirmVal = confirmPasswordInput.value;
        const newPassVal = newPasswordInput?.value || "";

        if (confirmVal && confirmVal !== newPassVal) {
            if (confirmPasswordError) confirmPasswordError.textContent = "Mật khẩu xác nhận không khớp.";
        } else {
            if (confirmPasswordError) confirmPasswordError.textContent = "";
        }
        checkPasswordFormReady();
    });

    currentPasswordInput?.addEventListener("input", () => {
        if (currentPasswordError) currentPasswordError.textContent = "";
        checkPasswordFormReady();
    });

    // Nút hủy bỏ đổi mật khẩu
    btnCancelPassword?.addEventListener("click", () => {
        changePasswordForm?.reset();
        resetStrengthSegments();
        [checkLength, checkUpper, checkLower, checkNumber, checkSpecial].forEach(el => updateChecklist(el, false));
        if (currentPasswordError) currentPasswordError.textContent = "";
        if (newPasswordError) newPasswordError.textContent = "";
        if (confirmPasswordError) confirmPasswordError.textContent = "";
        if (btnSubmitPassword) btnSubmitPassword.disabled = true;
    });

    // 5. SUBMIT ĐỔI MẬT KHẨU
    changePasswordForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        if (currentPasswordError) currentPasswordError.textContent = "";
        if (newPasswordError) newPasswordError.textContent = "";
        if (confirmPasswordError) confirmPasswordError.textContent = "";

        const currentPass = currentPasswordInput.value.trim();
        const newPass = newPasswordInput.value.trim();
        const confirmPass = confirmPasswordInput.value.trim();
        let isValid = true;

        if (!currentPass) {
            if (currentPasswordError) currentPasswordError.textContent = "Vui lòng nhập mật khẩu hiện tại.";
            isValid = false;
        }

        if (newPass.length < 8) {
            if (newPasswordError) newPasswordError.textContent = "Mật khẩu mới phải có ít nhất 8 ký tự.";
            isValid = false;
        } else if (!/[A-Z]/.test(newPass)) {
            if (newPasswordError) newPasswordError.textContent = "Mật khẩu mới phải có ít nhất 1 chữ viết hoa.";
            isValid = false;
        } else if (!/[a-z]/.test(newPass)) {
            if (newPasswordError) newPasswordError.textContent = "Mật khẩu mới phải có ít nhất 1 chữ viết thường.";
            isValid = false;
        } else if (!/[0-9]/.test(newPass)) {
            if (newPasswordError) newPasswordError.textContent = "Mật khẩu mới phải có ít nhất 1 chữ số.";
            isValid = false;
        } else if (!/[^A-Za-z0-9]/.test(newPass)) {
            if (newPasswordError) newPasswordError.textContent = "Mật khẩu mới phải có ít nhất 1 ký tự đặc biệt.";
            isValid = false;
        } else if (currentPass === newPass) {
            if (newPasswordError) newPasswordError.textContent = "Mật khẩu mới không được trùng với mật khẩu cũ.";
            isValid = false;
        }

        if (newPass !== confirmPass) {
            if (confirmPasswordError) confirmPasswordError.textContent = "Xác nhận mật khẩu mới không khớp.";
            isValid = false;
        }

        if (!isValid) return;

        const submitBtn = btnSubmitPassword || changePasswordForm.querySelector('button[type="submit"]');
        const originalBtnHtml = submitBtn ? submitBtn.innerHTML : "";
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Đang xử lý...</span>';
        }

        try {
            const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/change-password", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${auth.token}`
                },
                body: JSON.stringify({
                    currentPassword: currentPass,
                    newPassword: newPass
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                if (currentPasswordError) {
                    currentPasswordError.textContent = data.message || "Đổi mật khẩu thất bại, vui lòng kiểm tra lại mật khẩu hiện tại.";
                }
                if (window.showAppNotification) {
                    window.showAppNotification(data.message || "Đổi mật khẩu thất bại!");
                }
                return;
            }

            // Đổi mật khẩu thành công
            changePasswordForm.reset();
            resetStrengthSegments();
            [checkLength, checkUpper, checkLower, checkNumber, checkSpecial].forEach(el => updateChecklist(el, false));

            if (window.showAppNotification) {
                window.showAppNotification("Đổi mật khẩu thành công!");
            }

            // Hiển thị modal thành công
            const successModal = document.getElementById("successModal");
            if (successModal) successModal.style.display = "flex";

        } catch (error) {
            console.error("Lỗi kết nối:", error);
            if (currentPasswordError) {
                currentPasswordError.textContent = "Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!";
            }
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
                checkPasswordFormReady();
            }
        }
    });

    // 6. ĐÓNG MODAL THÀNH CÔNG
    const btnSuccessClose = document.getElementById("btnSuccessClose");
    if (btnSuccessClose) {
        btnSuccessClose.addEventListener("click", () => {
            window.location.href = "../student/student-dashboard.html";
        });
    }

    // 7. XỬ LÝ ĐĂNG XUẤT
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn) logoutBtn.addEventListener("click", () => {
        if (logoutModal) logoutModal.style.display = "flex";
    });
    if (cancelLogoutBtn) cancelLogoutBtn.addEventListener("click", () => {
        if (logoutModal) logoutModal.style.display = "none";
    });
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            localStorage.removeItem("studentAuth");
            sessionStorage.removeItem("activeAuth");
            if (localStorage.getItem("activeRole") === "STUDENT") {
                localStorage.removeItem("activeRole");
                localStorage.removeItem("token");
                localStorage.removeItem("user");
            }
            window.location.href = "index.html";
        });
    }

    window.addEventListener("click", (e) => {
        if (e.target === logoutModal) logoutModal.style.display = "none";
    });
});
