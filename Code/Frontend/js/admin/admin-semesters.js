/**
 * =========================================================
 * ADMIN SEMESTERS JS
 * Quản lý học kỳ & thời hạn đăng ký đề tài: Tạo mới, cập nhật,
 * kích hoạt, xóa, tính toán thời gian tự động, timeline trực quan.
 * =========================================================
 */

document.addEventListener("DOMContentLoaded", async () => {
    // 1. KIỂM TRA PHIÊN ĐĂNG NHẬP ADMIN
    const user = await window.verifyAuthSession("ADMIN");
    if (!user) return;

    const userName = document.getElementById("userName");
    if (userName) {
        userName.textContent = user.full_name || user.fullName || "Quản trị viên";
    }

    // Modal Đăng xuất
    const logoutModal = document.getElementById("logoutModal");
    const logoutBtn = document.getElementById("logoutBtn");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            if (logoutModal) logoutModal.style.display = "flex";
        });
    }
    if (cancelLogoutBtn) {
        cancelLogoutBtn.addEventListener("click", () => {
            if (logoutModal) logoutModal.style.display = "none";
        });
    }
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            sessionStorage.removeItem("activeAuth");
            localStorage.clear();
            window.location.href = "../auth/index.html";
        });
    }

    // 2. KHỞI TẠO DOM & BIẾN TRẠNG THÁI
    const apiUrl = window.APP_CONFIG.API_BASE_URL + "/api/semesters";
    const form = document.getElementById("semesterForm");
    const list = document.getElementById("semesterList");
    const message = document.getElementById("pageMessage");
    const messageText = document.getElementById("pageMessageText");
    const semesterId = document.getElementById("semesterId");
    const cancelEditBtn = document.getElementById("cancelEditBtn");
    const resetFormBtn = document.getElementById("resetFormBtn");
    const saveBtn = document.getElementById("saveSemesterBtn");
    const showAllSemestersBtn = document.getElementById("showAllSemestersBtn");

    const formBanner = document.getElementById("formBanner");
    const formTitle = document.getElementById("formTitle");
    const formSubtitle = document.getElementById("formSubtitle");
    const formBannerIcon = document.getElementById("formBannerIcon");

    const semesterStart = document.getElementById("semesterStart");
    const totalWeeks = document.getElementById("totalWeeks");
    const btnWeekMinus = document.getElementById("btnWeekMinus");
    const btnWeekPlus = document.getElementById("btnWeekPlus");
    const semesterEndSummary = document.getElementById("semesterEndSummary");
    const semesterEndDateText = document.getElementById("semesterEndDateText");

    const registrationStart = document.getElementById("registrationStart");
    const registrationEnd = document.getElementById("registrationEnd");
    const regDurationSummary = document.getElementById("regDurationSummary");
    const regDurationText = document.getElementById("regDurationText");

    const activateSemesterInput = document.getElementById("activateSemester");
    const activateWarningText = document.getElementById("activateWarningText");

    const semesterCountBadge = document.getElementById("semesterCountBadge");
    const semesterSearchInput = document.getElementById("semesterSearchInput");
    const semesterSearchWrapper = document.getElementById("semesterSearchWrapper");
    const semesterSelect = document.getElementById("semesterSelect");

    let semesters = [];
    let recentlyUpdatedId = null;

    let toastTimer = null;
    // Helper hiển thị thông báo toast
    const showToast = (text, isError = false) => {
        if (!text) return;
        // Nếu có hệ thống notification toàn cục, dùng nó; không hiển thị pageMessage song song
        if (window.showAppNotification) {
            window.showAppNotification(text, isError ? "error" : "success");
            return;
        }
        // Fallback: dùng pageMessage nội tuyến (bottom-right)
        if (message && messageText) {
            messageText.textContent = text;
            message.classList.toggle("error", isError);
            const icon = message.querySelector("i");
            if (icon) {
                icon.className = isError ? "fa-solid fa-triangle-exclamation" : "fa-solid fa-circle-check";
            }
            message.hidden = false;
            message.style.display = "flex";
            if (toastTimer) clearTimeout(toastTimer);
            toastTimer = setTimeout(() => {
                if (message) {
                    message.hidden = true;
                    message.style.display = "none";
                }
            }, 4000);
        }
    };

    // 3. TẢI HỌC KỲ CHO SELECT Ở TOPBAR
    async function loadTopbarSemesters() {
        if (!semesterSelect) return;
        try {
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/semesters`);
            const result = await response.json();
            if (response.ok && result.success && Array.isArray(result.data)) {
                semesterSelect.replaceChildren();
                const allOpt = document.createElement("option");
                allOpt.value = "all";
                allOpt.textContent = "Toàn bộ học kỳ";
                semesterSelect.append(allOpt);

                result.data.forEach(s => {
                    const opt = document.createElement("option");
                    opt.value = s._id;
                    opt.textContent = s.name;
                    if (s.is_active) opt.selected = true;
                    semesterSelect.append(opt);
                });
            }
        } catch (error) {
            console.warn("Lỗi tải học kỳ topbar:", error);
        }
    }

    // 4. API REQUEST WRAPPER
    const request = async (url, options = {}) => {
        const response = await apiFetch(url, {
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers
            }
        });
        const responseText = await response.text();
        let result;
        try {
            result = responseText ? JSON.parse(responseText) : {};
        } catch {
            throw new Error("Máy chủ trả về phản hồi không hợp lệ. Hãy kiểm tra API backend đang chạy.");
        }
        if (!response.ok) {
            if (result.message === "Vui lòng nhập tên học kỳ và đầy đủ các ngày hợp lệ.") {
                throw new Error("Backend đang chạy phiên bản cũ chưa hỗ trợ giờ mở/đóng đăng ký. Hãy khởi động lại backend rồi thử lại.");
            }
            throw new Error(result.message || "Yêu cầu không thành công.");
        }
        return result;
    };

    // Formatters
    const formatDateTime = value => {
        if (!value) return "Chưa cấu hình";
        return new Date(value).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    };

    const formatDateOnly = value => {
        if (!value) return "Chưa cấu hình";
        return new Date(value).toLocaleDateString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    };

    const formatLegacyDateTime = (value, isEnd = false) => {
        if (!value) return "Chưa cấu hình";
        const date = new Date(value);
        if (date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0) {
            const datePart = date.toLocaleDateString("vi-VN", { timeZone: "UTC" });
            return `${datePart} ${isEnd ? "23:59" : "00:00"}`;
        }
        return formatDateTime(value);
    };

    const registrationDateTimeValue = value => {
        if (!value) return "";
        const date = new Date(value);
        const localParts = new Intl.DateTimeFormat("sv-SE", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).format(date);
        return localParts.replace(" ", "T");
    };

    const dateInputValue = value => value ? new Date(value).toISOString().slice(0, 10) : "";

    // 5. TỰ ĐỘNG TÍNH TOÁN NGÀY KẾT THÚC & THỜI HẠN ĐĂNG KÝ
    function updateProjectedEndDate() {
        if (!semesterStart || !totalWeeks || !semesterEndSummary || !semesterEndDateText) return;
        const startDateStr = semesterStart.value;
        const weeks = parseInt(totalWeeks.value, 10);

        if (startDateStr && !isNaN(weeks) && weeks > 0) {
            const start = new Date(startDateStr);
            if (!isNaN(start.getTime())) {
                const end = new Date(start.getTime() + (weeks * 7 - 1) * 24 * 60 * 60 * 1000);
                semesterEndDateText.textContent = formatDateOnly(end);
                semesterEndSummary.style.display = "flex";
                return;
            }
        }
        semesterEndSummary.style.display = "none";
    }

    function updateRegistrationDuration() {
        if (!registrationStart || !registrationEnd || !regDurationSummary || !regDurationText) return;
        const startVal = registrationStart.value;
        const endVal = registrationEnd.value;

        if (startVal && endVal) {
            const start = new Date(startVal);
            const end = new Date(endVal);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
                const diffMs = end.getTime() - start.getTime();
                if (diffMs > 0) {
                    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    let text = "";
                    if (days > 0) text += `${days} ngày `;
                    if (hours > 0 || days > 0) text += `${hours} giờ `;
                    if (mins > 0 && days === 0) text += `${mins} phút`;
                    regDurationText.textContent = text.trim() || "Dưới 1 phút";
                    regDurationSummary.style.display = "flex";
                    regDurationSummary.style.color = "#1E40AF";
                    regDurationSummary.style.background = "#EFF6FF";
                    regDurationSummary.style.borderColor = "#DBEAFE";
                    return;
                } else {
                    regDurationText.textContent = "Thời điểm đóng phải sau thời điểm mở đăng ký!";
                    regDurationSummary.style.display = "flex";
                    regDurationSummary.style.color = "#DC2626";
                    regDurationSummary.style.background = "#FEE2E2";
                    regDurationSummary.style.borderColor = "#FECACA";
                    return;
                }
            }
        }
        regDurationSummary.style.display = "none";
    }

    function updateActivateWarning() {
        if (!activateSemesterInput || !activateWarningText) return;
        const currentActive = semesters.find(s => s.is_active && s._id !== semesterId.value);
        if (activateSemesterInput.checked && currentActive) {
            activateWarningText.style.display = "flex";
        } else {
            activateWarningText.style.display = "none";
        }
    }

    // Gán sự kiện tính toán
    if (semesterStart) semesterStart.addEventListener("input", updateProjectedEndDate);
    if (totalWeeks) {
        totalWeeks.addEventListener("input", updateProjectedEndDate);
        if (btnWeekMinus) {
            btnWeekMinus.addEventListener("click", () => {
                const val = parseInt(totalWeeks.value, 10) || 15;
                totalWeeks.value = Math.max(1, val - 1);
                updateProjectedEndDate();
            });
        }
        if (btnWeekPlus) {
            btnWeekPlus.addEventListener("click", () => {
                const val = parseInt(totalWeeks.value, 10) || 15;
                totalWeeks.value = Math.min(52, val + 1);
                updateProjectedEndDate();
            });
        }
    }

    if (registrationStart) registrationStart.addEventListener("input", updateRegistrationDuration);
    if (registrationEnd) registrationEnd.addEventListener("input", updateRegistrationDuration);
    if (activateSemesterInput) activateSemesterInput.addEventListener("change", updateActivateWarning);

    // 6. SKELETON LOADING KHI ĐANG TẢI DANH SÁCH
    const showSkeletonList = () => {
        if (!list) return;
        list.innerHTML = Array(2).fill(0).map(() => `
            <div class="skeleton-semester-card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="skeleton-box" style="width: 200px; height: 20px;"></div>
                    <div class="skeleton-box" style="width: 110px; height: 24px; border-radius: 999px;"></div>
                </div>
                <div class="skeleton-box" style="width: 100%; height: 60px; border-radius: 10px;"></div>
                <div class="skeleton-box" style="width: 100%; height: 32px; border-radius: 6px;"></div>
                <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;">
                    <div class="skeleton-box" style="width: 80px; height: 32px; border-radius: 8px;"></div>
                    <div class="skeleton-box" style="width: 80px; height: 32px; border-radius: 8px;"></div>
                </div>
            </div>
        `).join('');
    };

    // 7. RENDER DANH SÁCH HỌC KỲ
    const renderList = () => {
        if (!list) return;
        list.replaceChildren();

        const query = semesterSearchInput ? semesterSearchInput.value.toLowerCase().trim() : "";
        const filtered = semesters.filter(s => (s.name || "").toLowerCase().includes(query));

        // Cập nhật số lượng
        if (semesterCountBadge) {
            semesterCountBadge.textContent = semesters.length;
        }

        // Ẩn/hiện ô tìm kiếm nếu có từ 5 học kỳ
        if (semesterSearchWrapper) {
            semesterSearchWrapper.style.display = semesters.length >= 5 ? "block" : "none";
        }
        if (showAllSemestersBtn) {
            showAllSemestersBtn.style.display = semesters.length >= 4 ? "inline-flex" : "none";
        }

        if (!filtered.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            if (semesters.length === 0) {
                empty.innerHTML = `
                    <div class="empty-illustration" aria-hidden="true">
                        <i class="fa-solid fa-calendar-xmark"></i>
                    </div>
                    <strong>Chưa có học kỳ nào được tạo</strong>
                    <span>Hãy tạo học kỳ đầu tiên ở biểu mẫu bên trái để bắt đầu quản lý.</span>
                    <button type="button" class="empty-create-button"><i class="fa-solid fa-plus"></i> Tạo học kỳ ngay</button>
                `;
                empty.querySelector(".empty-create-button").addEventListener("click", () => {
                    const nameInput = document.getElementById("semesterName");
                    if (nameInput) {
                        nameInput.focus();
                        form.scrollIntoView({ behavior: "smooth", block: "center" });
                    }
                });
            } else {
                empty.innerHTML = `
                    <div class="empty-illustration" aria-hidden="true">
                        <i class="fa-solid fa-magnifying-glass"></i>
                    </div>
                    <strong>Không tìm thấy học kỳ phù hợp</strong>
                    <span>Không có học kỳ nào khớp với từ khóa "${query}".</span>
                `;
            }
            list.append(empty);
            return;
        }

        const now = Date.now();

        filtered.forEach(semester => {
            const card = document.createElement("article");
            card.className = `semester-item${semester.is_active ? " active" : ""}`;
            if (recentlyUpdatedId && recentlyUpdatedId === semester._id) {
                card.classList.add("highlight-updated");
            }

            // Tính toán trạng thái học kỳ
            const startTimestamp = new Date(semester.start_date).getTime();
            const weeks = Number(semester.total_weeks) || 15;
            const endTimestamp = startTimestamp + (weeks * 7) * 24 * 60 * 60 * 1000;
            const regStartTimestamp = new Date(semester.registration_start_date).getTime();
            const regEndTimestamp = new Date(semester.registration_end_date).getTime();

            // Status Pill
            let statusPillClass = "past";
            let statusPillText = "ĐÃ KẾT THÚC";
            if (semester.is_active) {
                statusPillClass = "active";
                statusPillText = "ĐANG ÁP DỤNG";
            } else if (now < startTimestamp) {
                statusPillClass = "upcoming";
                statusPillText = "SẮP TỚI";
            } else if (now >= startTimestamp && now <= endTimestamp) {
                statusPillClass = "upcoming";
                statusPillText = "ĐANG DIỄN RA";
            }

            // Registration Status Pill & Countdown
            let regPillClass = "closed";
            let regPillText = "Đã đóng đăng ký";
            let countdownHtml = "";

            if (now < regStartTimestamp) {
                regPillClass = "not-open";
                regPillText = "Chưa mở đăng ký";
            } else if (now >= regStartTimestamp && now <= regEndTimestamp) {
                regPillClass = "open";
                regPillText = "Đang mở đăng ký";
                const diffDays = Math.ceil((regEndTimestamp - now) / (1000 * 60 * 60 * 24));
                countdownHtml = `<span class="countdown-chip"><i class="fa-solid fa-hourglass-half"></i> Còn ${diffDays} ngày</span>`;
            }

            // Timeline calculations
            const m1Done = now >= startTimestamp;
            const m2Done = now >= regStartTimestamp;
            const m3Done = now >= regEndTimestamp;
            const m4Done = now >= endTimestamp;

            const m1Current = now >= startTimestamp && now < regStartTimestamp;
            const m2Current = now >= regStartTimestamp && now < regEndTimestamp;
            const m3Current = now >= regEndTimestamp && now < endTimestamp;

            const getStepClass = (isDone, isCurrent) => {
                if (isCurrent) return "current";
                if (isDone) return "completed";
                return "upcoming";
            };

            card.innerHTML = `
                <div class="semester-item-header">
                    <div class="semester-title-wrap">
                        <h3>${semester.name}</h3>
                    </div>
                    <div class="semester-badges-group">
                        <span class="status-pill ${statusPillClass}">
                            <span class="dot"></span>
                            ${statusPillText}
                        </span>
                        <span class="reg-status-pill ${regPillClass}">
                            <i class="fa-regular fa-clock"></i>
                            ${regPillText}
                        </span>
                        ${countdownHtml}
                    </div>
                </div>

                <div class="semester-meta-grid">
                    <div class="meta-item">
                        <i class="fa-regular fa-calendar-days"></i>
                        <div class="meta-content">
                            <span class="meta-label">Thời gian học kỳ:</span>
                            <span class="meta-value">${formatDateOnly(semester.start_date)} – ${formatDateOnly(new Date(endTimestamp))} (${weeks} tuần)</span>
                        </div>
                    </div>
                    <div class="meta-item">
                        <i class="fa-regular fa-calendar-check"></i>
                        <div class="meta-content">
                            <span class="meta-label">Thời hạn đăng ký đề tài:</span>
                            <span class="meta-value">
                                ${semester.registration_window_has_time
                                    ? `${formatDateTime(semester.registration_start_date)} – ${formatDateTime(semester.registration_end_date)}`
                                    : `${formatLegacyDateTime(semester.registration_start_date)} – ${formatLegacyDateTime(semester.registration_end_date, true)}`}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="semester-timeline" title="Tiến trình học kỳ">
                    <div class="timeline-track"></div>
                    <div class="timeline-step ${getStepClass(m1Done, m1Current)}">
                        <div class="timeline-dot"></div>
                        <span class="timeline-label">Bắt đầu HK</span>
                        <span class="timeline-date">${formatDateOnly(semester.start_date)}</span>
                    </div>
                    <div class="timeline-step ${getStepClass(m2Done, m2Current)}">
                        <div class="timeline-dot"></div>
                        <span class="timeline-label">Mở ĐK</span>
                        <span class="timeline-date">${formatDateOnly(semester.registration_start_date)}</span>
                    </div>
                    <div class="timeline-step ${getStepClass(m3Done, m3Current)}">
                        <div class="timeline-dot"></div>
                        <span class="timeline-label">Đóng ĐK</span>
                        <span class="timeline-date">${formatDateOnly(semester.registration_end_date)}</span>
                    </div>
                    <div class="timeline-step ${getStepClass(m4Done, false)}">
                        <div class="timeline-dot"></div>
                        <span class="timeline-label">Kết thúc</span>
                        <span class="timeline-date">${formatDateOnly(new Date(endTimestamp))}</span>
                    </div>
                </div>

                <div class="semester-actions">
                    <button type="button" class="action-btn edit" data-action="edit" title="Chỉnh sửa thông tin học kỳ">
                        <i class="fa-solid fa-pen-to-square"></i> Chỉnh sửa
                    </button>
                    ${!semester.is_active ? `
                        <button type="button" class="action-btn activate" data-action="activate" title="Kích hoạt học kỳ này">
                            <i class="fa-solid fa-circle-check"></i> Kích hoạt
                        </button>
                        <button type="button" class="action-btn delete" data-action="delete" title="Xóa học kỳ">
                            <i class="fa-solid fa-trash-can"></i> Xóa
                        </button>
                    ` : `
                        <button type="button" class="action-btn delete" disabled title="Không thể xóa học kỳ đang áp dụng">
                            <i class="fa-solid fa-lock"></i> Đang áp dụng
                        </button>
                    `}
                </div>
            `;

            // Gán sự kiện
            card.querySelector('[data-action="edit"]')?.addEventListener("click", () => beginEdit(semester));
            card.querySelector('[data-action="activate"]')?.addEventListener("click", () => activateSemester(semester._id));
            card.querySelector('[data-action="delete"]')?.addEventListener("click", () => deleteSemester(semester._id));

            list.append(card);
        });

        // Reset highlight sau 1.5s
        if (recentlyUpdatedId) {
            setTimeout(() => { recentlyUpdatedId = null; }, 1500);
        }
    };

    // Tìm kiếm tức thời trên danh sách học kỳ
    if (semesterSearchInput) {
        semesterSearchInput.addEventListener("input", renderList);
    }

    // 8. CHUYỂN FORM SANG CHẾ ĐỘ SỬA
    const beginEdit = semester => {
        semesterId.value = semester._id;
        form.elements.name.value = semester.name;
        form.elements.start_date.value = dateInputValue(semester.start_date);
        form.elements.registration_start_date.value = semester.registration_window_has_time
            ? registrationDateTimeValue(semester.registration_start_date)
            : `${dateInputValue(semester.registration_start_date)}T00:00`;
        form.elements.registration_end_date.value = semester.registration_window_has_time
            ? registrationDateTimeValue(semester.registration_end_date)
            : `${dateInputValue(semester.registration_end_date)}T23:59`;
        form.elements.total_weeks.value = semester.total_weeks || 15;

        if (activateSemesterInput) {
            activateSemesterInput.checked = Boolean(semester.is_active);
        }

        // Cập nhật giao diện Form Banner chế độ sửa
        if (formTitle) formTitle.textContent = "Chỉnh sửa học kỳ";
        if (formSubtitle) formSubtitle.textContent = "Cập nhật thông tin và thời hạn đăng ký đề tài.";
        if (formBanner) formBanner.classList.add("editing");
        if (formBannerIcon) formBannerIcon.className = "fa-solid fa-pen-to-square";

        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Lưu thay đổi';
        }
        if (cancelEditBtn) {
            cancelEditBtn.hidden = false;
        }

        updateProjectedEndDate();
        updateRegistrationDuration();
        updateActivateWarning();

        form.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // 9. ĐẶT LẠI FORM VỀ TRẠNG THÁI TẠO MỚI
    const resetForm = () => {
        form.reset();
        semesterId.value = "";
        form.elements.total_weeks.value = 15;

        if (formTitle) formTitle.textContent = "Tạo học kỳ mới";
        if (formSubtitle) formSubtitle.textContent = "Thêm học kỳ để bắt đầu quản lý thời hạn đăng ký.";
        if (formBanner) formBanner.classList.remove("editing");
        if (formBannerIcon) formBannerIcon.className = "fa-regular fa-calendar-plus";

        if (saveBtn) {
            saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Lưu học kỳ';
            saveBtn.disabled = false;
        }
        if (cancelEditBtn) {
            cancelEditBtn.hidden = true;
        }

        updateProjectedEndDate();
        updateRegistrationDuration();
        updateActivateWarning();
    };

    // 10. TẢI DỮ LIỆU TỪ BACKEND
    const loadSemesters = async () => {
        showSkeletonList();
        try {
            const result = await request(apiUrl);
            semesters = result.data || [];
            renderList();
            updateActivateWarning();
            loadTopbarSemesters();
        } catch (error) {
            console.error("Lỗi tải học kỳ:", error);
            showToast(error.message, true);
            if (list) {
                list.innerHTML = `
                    <div class="empty-state">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 36px; color: var(--danger); margin-bottom: 8px;"></i>
                        <strong>Không thể tải dữ liệu học kỳ</strong>
                        <span>${error.message || "Hãy kiểm tra backend và thử lại."}</span>
                        <button type="button" class="empty-create-button" onclick="location.reload()"><i class="fa-solid fa-rotate-right"></i> Tải lại trang</button>
                    </div>
                `;
            }
        }
    };

    // 11. KÍCH HOẠT HỌC KỲ
    const activateSemester = async id => {
        const item = semesters.find(s => s._id === id);
        const confirmed = await window.showConfirmDialog({
            title: "Xác nhận kích hoạt học kỳ",
            message: `Kích hoạt <strong>${item?.name || "học kỳ này"}</strong> sẽ áp dụng thời hạn đăng ký đề tài cho toàn bộ hệ thống và chuyển học kỳ hiện tại sang không hoạt động. Bạn có chắc chắn muốn kích hoạt?`,
            confirmText: "Kích hoạt ngay"
        });
        if (!confirmed) return;

        try {
            await request(`${apiUrl}/${encodeURIComponent(id)}/activate`, { method: "PATCH" });
            recentlyUpdatedId = id;
            await loadSemesters();
            showToast("Đã kích hoạt học kỳ. Thời hạn đăng ký đề tài đã được áp dụng.");
        } catch (error) {
            showToast(error.message, true);
        }
    };

    // 12. XÓA HỌC KỲ
    const deleteSemester = async id => {
        const item = semesters.find(s => s._id === id);
        const confirmed = await window.showConfirmDialog({
            title: "Xác nhận xóa học kỳ",
            message: `Bạn có chắc chắn muốn xóa <strong>${item?.name || "học kỳ này"}</strong> không? Thao tác này không thể hoàn tác.`,
            confirmText: "Xóa học kỳ",
            danger: true
        });
        if (!confirmed) return;

        try {
            await request(`${apiUrl}/${encodeURIComponent(id)}`, { method: "DELETE" });
            await loadSemesters();
            showToast("Đã xóa học kỳ thành công.");
        } catch (error) {
            showToast(error.message, true);
        }
    };

    // 13. XỬ LÝ SUBMIT FORM
    form.addEventListener("submit", async event => {
        event.preventDefault();
        const id = semesterId.value;

        const body = {
            name: form.elements.name.value.trim(),
            start_date: form.elements.start_date.value,
            registration_start_date: form.elements.registration_start_date.value,
            registration_end_date: form.elements.registration_end_date.value,
            total_weeks: Number(form.elements.total_weeks.value),
            is_active: activateSemesterInput ? activateSemesterInput.checked : false
        };

        const originalBtnHtml = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

        try {
            const result = await request(id ? `${apiUrl}/${encodeURIComponent(id)}` : apiUrl, {
                method: id ? "PATCH" : "POST",
                body: JSON.stringify(body)
            });

            const savedId = id || result?.data?._id;
            recentlyUpdatedId = savedId;

            resetForm();
            await loadSemesters();
            showToast(id ? "Đã cập nhật học kỳ thành công!" : "Đã tạo học kỳ mới thành công!");
        } catch (error) {
            showToast(error.message, true);
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnHtml;
        }
    });

    // Các sự kiện nút
    if (cancelEditBtn) cancelEditBtn.addEventListener("click", resetForm);
    if (resetFormBtn) resetFormBtn.addEventListener("click", resetForm);

    const closeMsgBtn = message?.querySelector(".message-close");
    if (closeMsgBtn) {
        closeMsgBtn.addEventListener("click", () => {
            if (message) {
                message.hidden = true;
                message.style.display = "none";
            }
            if (toastTimer) clearTimeout(toastTimer);
        });
    }

    if (showAllSemestersBtn) {
        showAllSemestersBtn.addEventListener("click", () => {
            if (list) list.scrollIntoView({ behavior: "smooth", block: "start" });
        });
    }

    // Khởi tạo
    updateProjectedEndDate();
    updateRegistrationDuration();
    await loadSemesters();
});
