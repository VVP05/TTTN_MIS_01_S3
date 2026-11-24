document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP
    const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    const user = auth?.user || null;
    if (!user || user.role !== "LECTURER") {
        window.location.href = "../auth/index.html";
        return;
    }

    const lecturerCode = user.user_code || user.userCode || "GV01";
    const fullName = user.full_name || "TS. Nguyễn Văn A";

    // Cập nhật thông tin trên Topbar và Card Tổng quan
    const userNameEl = document.getElementById("userName");
    const userCodeEl = document.getElementById("userCode");
    const accountDisplayName = document.getElementById("accountDisplayName");
    const accountDisplayCode = document.getElementById("accountDisplayCode");
    const accountDisplayEmail = document.getElementById("accountDisplayEmail");
    const accountAvatarLetter = document.getElementById("accountAvatarLetter");
    const profileFullName = document.getElementById("profileFullName");

    if (userNameEl) userNameEl.textContent = fullName;
    if (userCodeEl) userCodeEl.textContent = lecturerCode;
    if (accountDisplayName) accountDisplayName.textContent = fullName;
    if (accountDisplayCode) accountDisplayCode.textContent = lecturerCode;
    if (profileFullName) profileFullName.value = fullName;

    const initialLetter = fullName.trim().charAt(0).toUpperCase() || "G";
    if (accountAvatarLetter) accountAvatarLetter.textContent = initialLetter;

    window.toggleLecturerPassword = (inputId, button) => {
        const input = document.getElementById(inputId);
        const icon = button.querySelector("i");
        const isHidden = input.type === "password";
        input.type = isHidden ? "text" : "password";
        icon.classList.toggle("fa-eye", !isHidden);
        icon.classList.toggle("fa-eye-slash", isHidden);
        button.setAttribute("aria-label", isHidden ? "Ẩn mật khẩu" : "Hiện mật khẩu");
    };

    // 2. THEO DÕI THAY ĐỔI TRÊN FORM HỒ SƠ
    const profileForm = document.getElementById("profileForm");
    const emailInput = document.getElementById("lecturerEmail");
    const phoneInput = document.getElementById("lecturerPhone");
    const roomInput = document.getElementById("lecturerRoom");
    const maxGroupsInput = document.getElementById("maxGroups");
    const specialtyInput = document.getElementById("lecturerSpecialty");

    const btnSaveProfile = document.getElementById("btnSaveProfile");
    const btnCancelProfile = document.getElementById("btnCancelProfile");
    const unsavedNotice = document.getElementById("unsavedChangesNotice");
    const charCounter = document.getElementById("specialtyCharCount");

    const currentGroupsEl = document.getElementById("currentGroupsCount");
    const maxGroupsDisplay = document.getElementById("maxGroupsDisplay");
    const capacityProgressBar = document.getElementById("capacityProgressBar");
    const capacityPercentText = document.getElementById("capacityPercentText");

    // Lấy số nhóm thực tế đang hướng dẫn từ Dashboard/API
    let currentActiveGroups = 0;
    async function fetchActiveGroupsCount() {
        try {
            const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/lecturer/${encodeURIComponent(lecturerCode)}`, {
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            const data = await res.json();
            if (res.ok && data.success) {
                const list = Array.isArray(data.data?.approved) ? data.data.approved : (Array.isArray(data.data) ? data.data : []);
                currentActiveGroups = list.filter(item => {
                    const status = (item.status || item.topic_status || "").toString().toUpperCase();
                    return status === "APPROVED" || status === "ĐÃ DUYỆT" || item.is_approved === true;
                }).length;
                updateCapacityUI();
            }
        } catch {
            updateCapacityUI();
        }
    }

    // Lấy chỉ tiêu và thông tin từ DB do Admin phân bổ
    async function fetchLecturerProfile() {
        try {
            const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/users/${encodeURIComponent(lecturerCode)}`, {
                headers: { Authorization: `Bearer ${auth.token}` }
            });
            const data = await res.json();
            if (res.ok && data) {
                if (data.max_quota !== undefined) {
                    const quotaVal = Number(data.max_quota) || 10;
                    if (maxGroupsInput) maxGroupsInput.value = quotaVal;
                    if (maxGroupsDisplay) maxGroupsDisplay.textContent = quotaVal;
                    initialProfileState.maxGroups = String(quotaVal);
                }
                if (data.email && emailInput) {
                    emailInput.value = data.email;
                    initialProfileState.email = data.email;
                    if (accountDisplayEmail) {
                        accountDisplayEmail.innerHTML = `<i class="fa-regular fa-envelope"></i> ${data.email}`;
                    }
                }
                if (data.phone !== undefined && phoneInput) {
                    phoneInput.value = data.phone || "";
                    initialProfileState.phone = data.phone || "";
                }
                updateCapacityUI();
            }
        } catch (error) {
            console.error("Lỗi tải thông tin chỉ tiêu giảng viên:", error);
            updateCapacityUI();
        }
    }

    fetchActiveGroupsCount();
    fetchLecturerProfile();

    function updateCapacityUI() {
        const max = parseInt(maxGroupsInput?.value, 10) || 10;
        if (currentGroupsEl) currentGroupsEl.textContent = currentActiveGroups;
        if (maxGroupsDisplay) maxGroupsDisplay.textContent = max;

        const percent = Math.min(100, Math.round((currentActiveGroups / max) * 100));
        if (capacityProgressBar) {
            capacityProgressBar.style.width = `${percent}%`;
            capacityProgressBar.className = "capacity-progress-bar";
            if (percent >= 100) capacityProgressBar.classList.add("full");
            else if (percent >= 75) capacityProgressBar.classList.add("warning");
        }
        if (capacityPercentText) capacityPercentText.textContent = `${percent}%`;
    }

    // Bộ đếm ký tự chuyên môn
    function updateCharCounter() {
        if (!specialtyInput || !charCounter) return;
        const currentLen = specialtyInput.value.length;
        charCounter.textContent = `${currentLen} / 300`;
    }
    if (specialtyInput) {
        specialtyInput.addEventListener("input", updateCharCounter);
        updateCharCounter();
    }

    // Lưu giá trị ban đầu để kiểm tra dirty state
    let initialProfileState = {
        email: emailInput?.value || "",
        phone: phoneInput?.value || "",
        room: roomInput?.value || "",
        maxGroups: maxGroupsInput?.value || "10",
        specialty: specialtyInput?.value || ""
    };

    if (accountDisplayEmail && emailInput) {
        accountDisplayEmail.innerHTML = `<i class="fa-regular fa-envelope"></i> ${emailInput.value}`;
    }

    function checkProfileDirty() {
        const isDirty = (
            (emailInput?.value || "") !== initialProfileState.email ||
            (phoneInput?.value || "") !== initialProfileState.phone ||
            (roomInput?.value || "") !== initialProfileState.room ||
            (specialtyInput?.value || "") !== initialProfileState.specialty
        );

        if (btnSaveProfile) btnSaveProfile.disabled = !isDirty;
        if (btnCancelProfile) btnCancelProfile.style.display = isDirty ? "inline-flex" : "none";
        if (unsavedNotice) unsavedNotice.style.display = isDirty ? "inline-flex" : "none";
        updateCapacityUI();
    }

    [emailInput, phoneInput, roomInput, specialtyInput].forEach(inp => {
        if (inp) {
            inp.addEventListener("input", checkProfileDirty);
            inp.addEventListener("change", checkProfileDirty);
        }
    });

    if (btnCancelProfile) {
        btnCancelProfile.addEventListener("click", () => {
            if (emailInput) emailInput.value = initialProfileState.email;
            if (phoneInput) phoneInput.value = initialProfileState.phone;
            if (roomInput) roomInput.value = initialProfileState.room;
            if (maxGroupsInput) maxGroupsInput.value = initialProfileState.maxGroups;
            if (specialtyInput) specialtyInput.value = initialProfileState.specialty;
            updateCharCounter();
            checkProfileDirty();
        });
    }

    if (profileForm) {
        profileForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const email = (emailInput?.value || "").trim();
            const phone = (phoneInput?.value || "").trim();

            if (!email || !email.includes("@")) {
                showAppNotification("Vui lòng nhập định dạng email hợp lệ!", "error");
                emailInput?.focus();
                return;
            }

            const originalBtnHtml = btnSaveProfile ? btnSaveProfile.innerHTML : "";
            try {
                if (btnSaveProfile) {
                    btnSaveProfile.disabled = true;
                    btnSaveProfile.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
                }

                const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/lecturers/${encodeURIComponent(lecturerCode)}/profile`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${auth.token}`
                    },
                    body: JSON.stringify({ email, phone })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.message || "Không thể cập nhật hồ sơ");
                }

                initialProfileState = {
                    email: email,
                    phone: phone,
                    room: roomInput?.value || "",
                    maxGroups: maxGroupsInput?.value || "10",
                    specialty: specialtyInput?.value || ""
                };

                // Cập nhật session và local storage nếu có
                if (auth.user) {
                    auth.user.email = email;
                    auth.user.phone = phone;
                    sessionStorage.setItem("activeAuth", JSON.stringify(auth));
                }
                const lecturerAuth = localStorage.getItem("lecturerAuth");
                if (lecturerAuth) {
                    try {
                        const parsed = JSON.parse(lecturerAuth);
                        if (parsed.user) {
                            parsed.user.email = email;
                            parsed.user.phone = phone;
                            localStorage.setItem("lecturerAuth", JSON.stringify(parsed));
                        }
                    } catch {}
                }

                if (accountDisplayEmail) {
                    accountDisplayEmail.innerHTML = `<i class="fa-regular fa-envelope"></i> ${email}`;
                }

                checkProfileDirty();
                showAppNotification(`Đã cập nhật hồ sơ thành công!\n• Email: ${email}\n• SĐT: ${phone}`, "success");
            } catch (error) {
                console.error("Lỗi cập nhật hồ sơ:", error);
                showAppNotification(error.message || "Lỗi khi lưu thông tin", "error");
            } finally {
                if (btnSaveProfile) {
                    btnSaveProfile.disabled = false;
                    btnSaveProfile.innerHTML = originalBtnHtml;
                }
            }
        });
    }

    // 3. XỬ LÝ ĐỔI MẬT KHẨU
    const changePasswordForm = document.getElementById("changePasswordForm");
    const oldPasswordInput = document.getElementById("oldPassword");
    const newPasswordInput = document.getElementById("newPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const passwordStrengthText = document.getElementById("passwordStrengthText");
    const passwordMatchMsg = document.getElementById("passwordMatchMsg");
    const btnUpdatePassword = document.getElementById("btnUpdatePassword");

    const seg1 = document.getElementById("seg1");
    const seg2 = document.getElementById("seg2");
    const seg3 = document.getElementById("seg3");
    const seg4 = document.getElementById("seg4");
    const segments = [seg1, seg2, seg3, seg4];

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
        const val = newPasswordInput ? newPasswordInput.value : "";
        const rules = getPasswordRules(val);
        const score = Object.values(rules).filter(Boolean).length;

        Object.entries(rules).forEach(([rule, valid]) => {
            const el = passwordRequirements[rule];
            if (el) {
                el.classList.toggle("valid", valid);
                const icon = el.querySelector("i");
                if (icon) {
                    icon.className = valid ? "fa-solid fa-circle-check" : "fa-regular fa-circle";
                }
            }
        });

        segments.forEach(seg => {
            if (seg) seg.style.backgroundColor = "#e2e8f0";
        });

        if (!val) {
            if (passwordStrengthText) {
                passwordStrengthText.textContent = "Chưa nhập";
                passwordStrengthText.style.color = "#64748b";
            }
            return rules;
        }

        let label = "Yếu";
        let color = "#ef4444";
        let activeSegments = 1;

        if (score <= 2) {
            label = "Yếu";
            color = "#ef4444";
            activeSegments = 1;
        } else if (score === 3) {
            label = "Trung bình";
            color = "#f59e0b";
            activeSegments = 2;
        } else if (score === 4) {
            label = "Khá mạnh";
            color = "#2563eb";
            activeSegments = 3;
        } else if (score === 5) {
            label = "Rất mạnh";
            color = "#16a34a";
            activeSegments = 4;
        }

        for (let i = 0; i < activeSegments; i++) {
            if (segments[i]) segments[i].style.backgroundColor = color;
        }

        if (passwordStrengthText) {
            passwordStrengthText.textContent = label;
            passwordStrengthText.style.color = color;
        }

        return rules;
    };

    function validatePasswordMatch() {
        const p1 = newPasswordInput?.value || "";
        const p2 = confirmPasswordInput?.value || "";

        if (!passwordMatchMsg) return false;

        if (!p2) {
            passwordMatchMsg.style.display = "none";
            return false;
        }

        if (p1 !== p2) {
            passwordMatchMsg.className = "password-match-status error";
            passwordMatchMsg.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Mật khẩu xác nhận không khớp.';
            return false;
        } else {
            passwordMatchMsg.className = "password-match-status match";
            passwordMatchMsg.innerHTML = '<i class="fa-solid fa-circle-check"></i> Mật khẩu xác nhận khớp.';
            return true;
        }
    }

    function checkPasswordFormValid() {
        const oldPass = oldPasswordInput?.value.trim() || "";
        const newPass = newPasswordInput?.value || "";
        const rules = updatePasswordStrength();
        const allRulesMet = Object.values(rules).every(Boolean);
        const match = validatePasswordMatch();

        const isValid = Boolean(oldPass && allRulesMet && match);
        if (btnUpdatePassword) btnUpdatePassword.disabled = !isValid;
    }

    if (newPasswordInput) newPasswordInput.addEventListener("input", checkPasswordFormValid);
    if (confirmPasswordInput) confirmPasswordInput.addEventListener("input", checkPasswordFormValid);
    if (oldPasswordInput) oldPasswordInput.addEventListener("input", checkPasswordFormValid);

    if (changePasswordForm) {
        changePasswordForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const oldPass = oldPasswordInput?.value.trim() || "";
            const newPass = newPasswordInput?.value || "";
            const confirmPass = confirmPasswordInput?.value || "";

            if (!oldPass) {
                showAppNotification("Vui lòng nhập mật khẩu hiện tại!", "error");
                return;
            }

            const rules = updatePasswordStrength();
            if (!Object.values(rules).every(Boolean)) {
                showAppNotification("Mật khẩu mới phải thỏa mãn toàn bộ 5 điều kiện bảo mật!", "error");
                return;
            }

            if (newPass !== confirmPass) {
                showAppNotification("Xác nhận mật khẩu mới không khớp!", "error");
                return;
            }

            const originalBtnHtml = btnUpdatePassword ? btnUpdatePassword.innerHTML : "";
            if (btnUpdatePassword) {
                btnUpdatePassword.disabled = true;
                btnUpdatePassword.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang cập nhật...';
            }

            try {
                const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/change-password", {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${auth.token}`
                    },
                    body: JSON.stringify({
                        currentPassword: oldPass,
                        newPassword: newPass
                    })
                });
                const result = await response.json();

                if (!response.ok || !result.success) {
                    showAppNotification(result.message || "Đổi mật khẩu thất bại!", "error");
                    return;
                }

                showAppNotification("Đổi mật khẩu thành công! Vui lòng dùng mật khẩu mới cho lần đăng nhập sau.", "success");
                changePasswordForm.reset();
                updatePasswordStrength();
                if (passwordMatchMsg) passwordMatchMsg.style.display = "none";
                if (btnUpdatePassword) btnUpdatePassword.disabled = true;
            } catch (error) {
                console.error("Lỗi đổi mật khẩu:", error);
                showAppNotification("Không thể kết nối đến máy chủ. Vui lòng thử lại!", "error");
            } finally {
                if (btnUpdatePassword) {
                    btnUpdatePassword.innerHTML = originalBtnHtml;
                }
            }
        });
    }

});
