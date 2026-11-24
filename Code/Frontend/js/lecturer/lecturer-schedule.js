document.addEventListener("DOMContentLoaded", () => {
    
    // =========================================================
    // 1. KIỂM TRA QUYỀN TRUY CẬP & CẤU HÌNH API
    // =========================================================
    const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    const token = auth?.token || "";
    const user = auth?.user || null;

    if (!user || user.role !== "LECTURER") {
        window.location.href = "../auth/index.html";
        return;
    }

    // Hiển thị thông tin giảng viên
    const userNameEl = document.getElementById("userName");
    const userCodeEl = document.getElementById("userCode");
    if (userNameEl) userNameEl.textContent = user.full_name || "Giảng viên";
    if (userCodeEl) userCodeEl.textContent = user.user_code || "GV";

    // Địa chỉ API
    const API_BASE_URL = window.APP_CONFIG.API_BASE_URL + "/api/schedule";
    const API_TOPICS_URL = window.APP_CONFIG.API_BASE_URL + "/api/topics";
    const API_MILESTONES_URL = window.APP_CONFIG.API_BASE_URL + "/api/milestones";

    // Hàm tạo Header có kèm Token xác thực (JWT)
    const getAuthHeaders = () => ({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    });

    let allMeetings = []; // Lưu trữ danh sách họp từ Backend để filter tại client
    let progressMilestones = [];

    const availabilityForm = document.getElementById("availabilityForm");
    const availabilityList = document.getElementById("availabilityList");
    const availabilityCount = document.getElementById("availabilityCount");
    const availabilityModal = document.getElementById("availabilityModal");
    const closeAvailabilityConfirmModal = document.getElementById("closeAvailabilityConfirmModal");
    const cancelCloseAvailabilityBtn = document.getElementById("cancelCloseAvailabilityBtn");
    const confirmCloseAvailabilityBtn = document.getElementById("confirmCloseAvailabilityBtn");
    const availabilityModalTitle = availabilityModal?.querySelector(".availability-modal-heading h3");
    const availabilityModalDescription = document.getElementById("availabilityModalDescription");
    const availabilitySubmitBtn = document.getElementById("availabilitySubmitBtn");
    const availabilityDateInput = document.getElementById("availabilityDate");
    const availabilityStartInput = document.getElementById("availabilityStart");
    const availabilityEndInput = document.getElementById("availabilityEnd");
    const availabilityCapacityInput = document.getElementById("availabilityCapacity");
    const availabilityTypeInput = document.getElementById("availabilityType");
    const availabilityLocationInput = document.getElementById("availabilityLocation");
    let editingAvailabilitySlotId = null;
    let pendingCloseAvailabilitySlotId = null;
    let availabilitySlots = [];

    function getVietnamDate(value) {
        return new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Ho_Chi_Minh",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }).format(new Date(value));
    }

    function setAvailabilityFormMode(slot = null) {
        editingAvailabilitySlotId = slot?._id || null;
        const isEditing = Boolean(slot);
        const hasBookings = (slot?.booked_count || 0) > 0;
        const tomorrow = new Date();
        tomorrow.setHours(12, 0, 0, 0);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (availabilityDateInput) {
            availabilityDateInput.min = getVietnamDate(tomorrow);
            availabilityDateInput.disabled = hasBookings;
        }
        if (availabilityStartInput) availabilityStartInput.disabled = hasBookings;
        if (availabilityEndInput) availabilityEndInput.disabled = hasBookings;
        if (availabilityTypeInput) availabilityTypeInput.disabled = hasBookings;
        if (availabilityLocationInput) availabilityLocationInput.disabled = hasBookings;
        if (availabilityCapacityInput) {
            availabilityCapacityInput.min = String(slot?.booked_count || 1);
            availabilityCapacityInput.value = String(slot?.max_bookings || 3);
        }
        if (availabilityDateInput) {
            availabilityDateInput.value = slot ? getVietnamDate(slot.available_date) : getVietnamDate(tomorrow);
        }
        if (availabilityStartInput) availabilityStartInput.value = slot?.time_start || "09:00";
        if (availabilityEndInput) availabilityEndInput.value = slot?.time_end || "10:00";
        if (availabilityTypeInput) availabilityTypeInput.value = slot?.type || "ONLINE";
        if (availabilityLocationInput) availabilityLocationInput.value = slot?.location || "";
        if (availabilityModalTitle) availabilityModalTitle.textContent = isEditing ? "Chỉnh sửa khung giờ rảnh" : "Công khai khung giờ rảnh";
        if (availabilityModalDescription) {
            availabilityModalDescription.textContent = hasBookings
                ? "Khung giờ đã có nhóm đặt; chỉ có thể thay đổi số nhóm tối đa."
                : isEditing ? "Cập nhật thông tin khung giờ đã công khai." : "Thêm khung giờ để sinh viên có thể đăng ký.";
        }
        if (availabilitySubmitBtn) {
            availabilitySubmitBtn.innerHTML = isEditing
                ? '<i class="fa-solid fa-floppy-disk"></i> Lưu thay đổi'
                : '<i class="fa-solid fa-plus"></i> Mở giờ rảnh';
        }
    }

    const openAvailabilityModalBtn = document.getElementById("openAvailabilityModalBtn");
    if (openAvailabilityModalBtn) openAvailabilityModalBtn.addEventListener("click", () => {
        if (availabilityForm) availabilityForm.reset();
        setAvailabilityFormMode();
        if (availabilityModal) availabilityModal.style.display = "flex";
    });
    document.querySelectorAll("#availabilityModal .btn-close-modal").forEach(button => button.addEventListener("click", () => {
        if (availabilityModal) availabilityModal.style.display = "none";
    }));

    async function loadAvailability() {
        if (!availabilityList) return;
        try {
            const res = await apiFetch(`${API_BASE_URL}/availability/${encodeURIComponent(user.user_code)}`, { headers: getAuthHeaders() });
            const result = await res.json();
            if (!res.ok || !result.success) throw new Error(result.message || "Không thể tải khung giờ rảnh.");
            availabilitySlots = result.data || [];
            if (availabilityCount) availabilityCount.textContent = `${availabilitySlots.length} khung giờ`;
            availabilityList.innerHTML = availabilitySlots.length ? availabilitySlots.map(slot => {
                const dateText = new Date(slot.available_date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
                const modeText = slot.type === "ONLINE" ? "Online (Meet)" : "Offline (Trường)";
                const booked = slot.booked_count || 0;
                const capacity = slot.max_bookings || 3;
                return `
                <div class="availability-row">
                    <div class="availability-detail date-detail"><span class="availability-row-icon blue"><i class="fa-regular fa-calendar-days"></i></span><div><small>Ngày</small><strong>${dateText}</strong></div></div>
                    <div class="availability-detail"><span class="availability-row-icon purple"><i class="fa-regular fa-clock"></i></span><div><small>Giờ bắt đầu</small><strong>${slot.time_start}</strong></div></div>
                    <div class="availability-detail"><span class="availability-row-icon purple"><i class="fa-regular fa-clock"></i></span><div><small>Giờ kết thúc</small><strong>${slot.time_end}</strong></div></div>
                    <div class="availability-detail"><span class="availability-row-icon blue"><i class="fa-solid fa-video"></i></span><div><small>Hình thức</small><strong>${modeText}</strong></div></div>
                    <div class="availability-detail capacity-detail"><span class="availability-row-icon green"><i class="fa-solid fa-users"></i></span><div><small>Số nhóm tối đa</small><strong>${capacity}</strong><em><i class="fa-solid fa-circle"></i> Đã đặt ${booked}/${capacity}</em></div></div>
                    <div class="availability-actions">
                        <button type="button" class="availability-action-edit" data-availability-action="edit" data-slot-id="${slot._id}"><i class="fa-solid fa-pen"></i> Sửa</button>
                        <button type="button" class="availability-action-close" data-availability-action="close" data-slot-id="${slot._id}"><i class="fa-solid fa-xmark"></i> Ngừng mở</button>
                    </div>
                </div>`;
            }).join("") : `
                <div class="availability-empty-box">
                    <div class="availability-empty-icon"><i class="fa-solid fa-clock"></i></div>
                    <h4 class="availability-empty-title">Chưa có khung giờ nào đang mở</h4>
                    <p class="availability-empty-desc">Sinh viên chỉ có thể đặt lịch hẹn vào các khung giờ bạn đã công khai.</p>
                    <button type="button" class="btn-open-availability-empty" onclick="document.getElementById('openAvailabilityModalBtn').click()">
                        <i class="fa-solid fa-plus"></i> Mở giờ rảnh ngay
                    </button>
                </div>`;
        } catch (error) {
            console.error("Lỗi tải khung giờ rảnh:", error);
            if (availabilityList) availabilityList.innerHTML = '<p class="availability-empty-hint">Không thể tải danh sách khung giờ. Vui lòng thử tải lại trang.</p>';
            showAppNotification(error.message || "Không thể tải khung giờ rảnh.", "error", false);
        }
    }

    if (availabilityList) availabilityList.addEventListener("click", async event => {
        const button = event.target.closest("[data-availability-action]");
        if (!button) return;
        if (button.dataset.availabilityAction === "edit") {
            const selectedSlot = availabilitySlots.find(item => item._id === button.dataset.slotId);
            if (!selectedSlot) {
                showAppNotification("Không tìm thấy khung giờ cần chỉnh sửa. Vui lòng tải lại trang.", "error", false);
                return;
            }
            setAvailabilityFormMode(selectedSlot);
            if (availabilityModal) availabilityModal.style.display = "flex";
            return;
        }

        pendingCloseAvailabilitySlotId = button.dataset.slotId;
        if (closeAvailabilityConfirmModal) closeAvailabilityConfirmModal.style.display = "flex";
    });

    if (cancelCloseAvailabilityBtn) cancelCloseAvailabilityBtn.addEventListener("click", () => {
        pendingCloseAvailabilitySlotId = null;
        if (closeAvailabilityConfirmModal) closeAvailabilityConfirmModal.style.display = "none";
    });

    if (closeAvailabilityConfirmModal) closeAvailabilityConfirmModal.addEventListener("click", event => {
        if (event.target === closeAvailabilityConfirmModal) {
            pendingCloseAvailabilitySlotId = null;
        }
    });

    if (confirmCloseAvailabilityBtn) confirmCloseAvailabilityBtn.addEventListener("click", async () => {
        const slotId = pendingCloseAvailabilitySlotId;
        if (!slotId) return;
        confirmCloseAvailabilityBtn.disabled = true;
        confirmCloseAvailabilityBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
        if (closeAvailabilityConfirmModal) closeAvailabilityConfirmModal.style.display = "none";
        try {
            const response = await apiFetch(`${API_BASE_URL}/lecturer/availability/${encodeURIComponent(slotId)}/close`, {
                method: "PATCH",
                headers: getAuthHeaders()
            });
            const result = await response.json();
            showAppNotification(result.message || "Không thể đóng khung giờ.", response.ok ? "success" : "error", response.ok);
            if (response.ok) await loadAvailability();
        } catch (error) {
            console.error("Lỗi đóng khung giờ:", error);
            showAppNotification("Không thể kết nối máy chủ để đóng khung giờ.", "error", false);
        } finally {
            pendingCloseAvailabilitySlotId = null;
            confirmCloseAvailabilityBtn.disabled = false;
            confirmCloseAvailabilityBtn.innerHTML = "Ngừng mở";
        }
    });

    if (availabilityForm) availabilityForm.addEventListener("submit", async event => {
        event.preventDefault();
        try {
            const payload = {
                available_date: availabilityDateInput.value,
                time_start: availabilityStartInput.value,
                time_end: availabilityEndInput.value,
                max_bookings: availabilityCapacityInput.value,
                type: availabilityTypeInput.value,
                location: availabilityLocationInput.value.trim()
            };
            const isEditing = Boolean(editingAvailabilitySlotId);
            if (!isEditing) payload.lecturer_code = user.user_code;
            const response = await apiFetch(
                isEditing
                    ? `${API_BASE_URL}/lecturer/availability/${encodeURIComponent(editingAvailabilitySlotId)}`
                    : `${API_BASE_URL}/lecturer/availability`,
                {
                    method: isEditing ? "PATCH" : "POST",
                    headers: getAuthHeaders(),
                    body: JSON.stringify(payload)
                }
            );
            const result = await response.json();
            showAppNotification(result.message || "Không thể lưu khung giờ.", response.ok ? "success" : "error", response.ok);
            if (response.ok) {
                availabilityForm.reset();
                setAvailabilityFormMode();
                if (availabilityModal) availabilityModal.style.display = "none";
                await loadAvailability();
            }
        } catch (error) {
            console.error("Lỗi lưu khung giờ:", error);
            showAppNotification("Không thể kết nối máy chủ để lưu khung giờ.", "error", false);
        }
    });

    loadAvailability();

    // =========================================================
    // 2. LẤY DỮ LIỆU TỪ BACKEND & RENDER LỊCH HỌP
    // =========================================================
    async function loadMeetings() {
        try {
            const res = await apiFetch(`${API_BASE_URL}/lecturer/meetings/${user.user_code}`, {
                method: "GET",
                headers: getAuthHeaders()
            });

            const result = await res.json();

            if (res.ok && result.success) {
                allMeetings = (result.data || []).filter(item => item.source !== "LECTURER");
                updateStats(allMeetings);
                renderMeetingCards(allMeetings);
            } else {
                showEmptyError(result.message || "Không thể lấy danh sách lịch họp.");
            }
        } catch (error) {
            console.error("Lỗi gọi API lịch họp:", error);
            showEmptyError("Lỗi kết nối máy chủ! Vui lòng thử lại sau.");
        }
    }

    function updateStats(meetings) {
        const total = meetings.length;
        const pending = meetings.filter(m => m.status === "PENDING").length;
        const approved = meetings.filter(m => m.status === "APPROVED").length;
        const completed = meetings.filter(m => m.status === "COMPLETED").length;

        const elTotal = document.getElementById("totalMeetingsCount");
        const elPending = document.getElementById("pendingMeetingsCount");
        const elApproved = document.getElementById("approvedMeetingsCount");
        const elCompleted = document.getElementById("completedMeetingsCount");

        if (elTotal) animateCount(elTotal, total, "buổi");
        if (elPending) {
            animateCount(elPending, pending, "yêu cầu");
            const orangeBox = elPending.closest(".stat-box");
            if (orangeBox) {
                if (pending > 0) orangeBox.classList.add("has-pending");
                else orangeBox.classList.remove("has-pending");
            }
        }
        if (elApproved) animateCount(elApproved, approved, "buổi");
        if (elCompleted) animateCount(elCompleted, completed, "buổi");
    }

    function animateCount(element, target, unit = "") {
        const currentText = element.textContent || "0";
        const start = parseInt(currentText, 10) || 0;
        if (start === target) {
            element.innerHTML = `${target} <small>${unit}</small>`;
            return;
        }
        const duration = 300;
        const stepTime = 30;
        const steps = Math.ceil(duration / stepTime);
        const increment = (target - start) / steps;
        let current = start;
        let stepCount = 0;

        const timer = setInterval(() => {
            stepCount++;
            current += increment;
            if (stepCount >= steps) {
                clearInterval(timer);
                element.innerHTML = `${target} <small>${unit}</small>`;
            } else {
                element.innerHTML = `${Math.round(current)} <small>${unit}</small>`;
            }
        }, stepTime);
    }

    // Bấm vào thẻ thống kê để lọc
    document.querySelectorAll(".schedule-stats-bar .stat-box[data-filter]").forEach(box => {
        box.addEventListener("click", () => {
            const filterVal = box.getAttribute("data-filter");
            const targetChip = document.querySelector(`.view-filter .filter-chip[data-filter="${filterVal}"]`);
            if (targetChip) {
                targetChip.click();
            } else if (filterVal === "APPROVED") {
                filterChips.forEach(c => c.classList.remove("active"));
                renderMeetingCards(allMeetings.filter(m => m.status === "APPROVED"));
            } else if (filterVal === "COMPLETED") {
                filterChips.forEach(c => c.classList.remove("active"));
                renderMeetingCards(allMeetings.filter(m => m.status === "COMPLETED"));
            }
        });
    });

    function renderMeetingCards(meetings) {
        const container = document.getElementById("meetingCardsContainer");
        if (!container) return;

        if (!meetings || meetings.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; background: #ffffff; border-radius: 16px; border: 1px dashed #cbd5e1;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; background: #eff6ff; color: #2563eb; display: grid; place-items: center; font-size: 24px; margin: 0 auto 14px;">
                        <i class="fa-regular fa-calendar-xmark"></i>
                    </div>
                    <h3 style="font-size: 16px; font-weight: 600; color: #0f172a; margin: 0 0 6px;">Chưa có lịch hẹn nào</h3>
                    <p style="font-size: 14px; color: #64748b; margin: 0 0 16px; max-width: 420px; margin-left: auto; margin-right: auto;">
                        Lịch hẹn do sinh viên đặt sẽ hiển thị tại đây. Hãy mở khung giờ rảnh để sinh viên có thể đăng ký lịch.
                    </p>
                    <button type="button" class="btn-open-availability-empty" onclick="document.getElementById('openAvailabilityModalBtn').click()">
                        <i class="fa-solid fa-clock"></i> Mở giờ rảnh ngay
                    </button>
                </div>`;
            return;
        }

        container.innerHTML = meetings.map(item => {
            const isPending = item.status === "PENDING";
            const isOnline = item.type === "ONLINE";

            // Xử lý định dạng ngày và giờ
            const dateObj = new Date(item.meeting_date);
            const dayNum = String(dateObj.getDate()).padStart(2, '0');
            const monthNum = dateObj.getMonth() + 1;
            const yearNum = dateObj.getFullYear();
            const timeRangeStr = `${item.time_start} - ${item.time_end}`;

            // Hiển thị Tên sinh viên (nếu có) hoặc Tên nhóm / Mã SV
            const studentDisplayName = item.student_name || item.student_code || "";
            const groupDisplay = studentDisplayName 
                ? `SV: ${studentDisplayName}` 
                : (item.topic_id?.group_code ? `Nhóm ${item.topic_id.group_code}` : "Sinh viên");

            // --- THẺ YÊU CẦU ĐẶT LỊCH CHỜ DUYỆT (PENDING) ---
            if (isPending) {
                return `
                    <div class="meeting-card pending-card" data-status="PENDING" data-type="${item.type}">
                        <div class="meeting-time-badge">
                            <div class="calendar-date-header">
                                <span class="calendar-day date">${dayNum}</span>
                                <span class="calendar-month">Tháng ${monthNum}, ${yearNum}</span>
                            </div>
                            <div class="calendar-time-chip time">
                                <i class="fa-regular fa-clock"></i> ${timeRangeStr}
                            </div>
                        </div>
                        <div class="meeting-content">
                            <div class="meeting-top">
                                <span class="badge-group"><i class="fa-solid fa-users"></i> ${groupDisplay}</span>
                                <span class="meeting-type" style="background: #fef3c7; color: #d97706;">
                                    <i class="fa-solid fa-clock"></i> Chờ duyệt
                                </span>
                            </div>
                            <h3>${item.title}</h3>
                            <p class="meeting-desc">
                                Hình thức: <strong>${isOnline ? 'Online (Meet)' : 'Offline'}</strong> | Địa điểm: ${item.location || 'Chưa xác định'}
                                ${item.notes ? `<br><em>Ghi chú: ${item.notes}</em>` : ''}
                            </p>
                            
                            <div class="meeting-actions-row">
                                <button class="btn-approve-request" data-id="${item._id}" data-group="${groupDisplay}">
                                    <i class="fa-solid fa-check"></i> Đồng ý
                                </button>
                                <button class="btn-reject-request" data-id="${item._id}" data-group="${groupDisplay}">
                                    <i class="fa-solid fa-xmark"></i> Từ chối
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }

            // --- THẺ LỊCH CHÍNH THỨC (APPROVED / COMPLETED) ---
            const isCompleted = item.status === "COMPLETED";

            return `
                <div class="meeting-card ${isOnline ? 'online' : 'offline'}" data-status="${item.status}" data-type="${item.type}" style="${isCompleted ? 'opacity: 0.8;' : ''}">
                    <div class="meeting-time-badge">
                        <div class="calendar-date-header">
                            <span class="calendar-day date">${dayNum}</span>
                            <span class="calendar-month">Tháng ${monthNum}, ${yearNum}</span>
                        </div>
                        <div class="calendar-time-chip time">
                            <i class="fa-regular fa-clock"></i> ${timeRangeStr}
                        </div>
                    </div>
                    <div class="meeting-content">
                        <div class="meeting-top">
                            <span class="badge-group"><i class="fa-solid fa-users"></i> ${groupDisplay}</span>
                            <div class="meeting-top-right">
                                <span class="meeting-type ${isOnline ? 'type-online' : 'type-offline'}">
                                    <i class="fa-solid ${isOnline ? 'fa-video' : 'fa-location-dot'}"></i> ${isOnline ? 'Google Meet' : 'Phòng học'}
                                </span>
                                
                                <div class="card-action-dropdown">
                                    <button class="btn-more-options" aria-label="Tùy chọn lịch"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                                    <div class="dropdown-menu-small">
                                        ${!isCompleted ? `<button class="action-complete-meeting" data-id="${item._id}"><i class="fa-solid fa-circle-check"></i> Đánh dấu Hoàn thành</button>` : ''}
                                        <button class="action-cancel-meeting" data-id="${item._id}" data-group="${groupDisplay}"><i class="fa-solid fa-trash"></i> Xóa buổi họp</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <h3>${item.title} ${isCompleted ? '<span style="color: #16a34a; font-size: 13px; font-weight: normal;">(Đã hoàn thành)</span>' : ''}</h3>
                        <p class="meeting-desc">${item.notes || 'Lịch hướng dẫn định kỳ.'}</p>
                        <div class="meeting-footer">
                            ${isOnline 
                                ? `<a href="${item.location && item.location.startsWith('http') ? item.location : 'https://' + (item.location || 'meet.google.com')}" target="_blank" class="btn-meet-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> Vào phòng Meet</a>` 
                                : `<span class="location-note"><i class="fa-solid fa-building-columns"></i> ${item.location || 'Phòng gặp'}</span>`
                            }
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        attachMeetingEvents();
    }

    function showEmptyError(msg) {
        const container = document.getElementById("meetingCardsContainer");
        if (container) {
            container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #ef4444; padding: 32px;">${msg}</p>`;
        }
    }

    function askScheduleAction({ title, message, confirmText = "Xác nhận", withReason = false, defaultReason = "" }) {
        let modal = document.getElementById("scheduleActionModal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "scheduleActionModal";
            modal.className = "schedule-action-modal";
            modal.innerHTML = `
                <div class="schedule-action-box" role="dialog" aria-modal="true" aria-labelledby="scheduleActionTitle">
                    <div class="schedule-action-icon"><i class="fa-solid fa-calendar-check"></i></div>
                    <div class="schedule-action-content">
                        <h3 id="scheduleActionTitle"></h3>
                        <p id="scheduleActionMessage"></p>
                        <textarea id="scheduleActionReason" rows="4" placeholder="Nhập lý do hoặc gợi ý khung giờ khác"></textarea>
                    </div>
                    <div class="schedule-action-buttons">
                        <button type="button" class="schedule-action-cancel">Hủy</button>
                        <button type="button" class="schedule-action-confirm"></button>
                    </div>
                </div>`;
            document.body.appendChild(modal);
        }

        const reasonInput = modal.querySelector("#scheduleActionReason");
        modal.querySelector("#scheduleActionTitle").textContent = title;
        modal.querySelector("#scheduleActionMessage").textContent = message;
        modal.querySelector(".schedule-action-confirm").textContent = confirmText;
        reasonInput.value = defaultReason;
        reasonInput.style.display = withReason ? "block" : "none";
        modal.style.display = "flex";

        return new Promise(resolve => {
            const close = value => {
                modal.style.display = "none";
                resolve(value);
            };
            modal.querySelector(".schedule-action-cancel").onclick = () => close(null);
            modal.querySelector(".schedule-action-confirm").onclick = () => close(withReason ? reasonInput.value.trim() : true);
            modal.onclick = event => {
                if (event.target === modal) close(null);
            };
        });
    }

    // =========================================================
    // 3. CÁC HÀM XỬ LÝ SỰ KIỆN: DUYỆT / TỪ CHỐI / HOÀN THÀNH / XÓA
    // =========================================================
    function attachMeetingEvents() {
        
        // 1. Giảng viên bấm [Đồng ý lịch]
        document.querySelectorAll(".btn-approve-request").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-id");
                const groupName = btn.getAttribute("data-group");

                const approved = await askScheduleAction({
                    title: "Xác nhận đồng ý lịch",
                    message: `Bạn có chắc muốn đồng ý buổi hẹn với ${groupName}?`,
                    confirmText: "Đồng ý lịch"
                });
                if (approved) {
                    await updateMeetingStatusApi(id, "APPROVED");
                }
            });
        });

        // 2. Giảng viên bấm [Từ chối / Báo bận]
        document.querySelectorAll(".btn-reject-request").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-id");
                const groupName = btn.getAttribute("data-group");

                const reason = await askScheduleAction({
                    title: "Từ chối / Báo bận",
                    message: `Nhập lý do từ chối hoặc gợi ý khung giờ khác cho ${groupName}.`,
                    confirmText: "Gửi phản hồi",
                    withReason: true,
                    defaultReason: "Thầy bận họp khoa khung giờ này, các em chọn lại ca khác nhé."
                });
                if (reason !== null) {
                    await updateMeetingStatusApi(id, "CANCELLED", reason);
                }
            });
        });

        // 3. Đánh dấu [Hoàn thành]
        document.querySelectorAll(".action-complete-meeting").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-id");
                await updateMeetingStatusApi(id, "COMPLETED");
            });
        });

        // 4. Xóa buổi họp
        document.querySelectorAll(".action-cancel-meeting").forEach(btn => {
            btn.addEventListener("click", async () => {
                const id = btn.getAttribute("data-id");
                const groupName = btn.getAttribute("data-group");

                const shouldDelete = await askScheduleAction({
                    title: "Xóa lịch hẹn",
                    message: `Bạn chắc chắn muốn xóa vĩnh viễn lịch hẹn với ${groupName}?`,
                    confirmText: "Xóa lịch"
                });
                if (shouldDelete) {
                    try {
                        const res = await apiFetch(`${API_BASE_URL}/lecturer/meetings/${id}`, {
                            method: "DELETE",
                            headers: getAuthHeaders()
                        });
                        const data = await res.json();
                        if (data.success) {
                            showAppNotification(data.message);
                            loadMeetings();
                        } else {
                            showAppNotification("Lỗi khi xóa: " + data.message);
                        }
                    } catch (err) {
                        showAppNotification("Lỗi hệ thống khi xóa lịch!");
                    }
                }
            });
        });

        // 5. Quản lý Dropdown 3 chấm
        document.querySelectorAll(".btn-more-options").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                document.querySelectorAll(".card-action-dropdown").forEach(dropdown => {
                    if (dropdown !== btn.parentElement) dropdown.classList.remove("active");
                });
                btn.parentElement.classList.toggle("active");
            });
        });
    }

    // Hàm gọi API PATCH thay đổi trạng thái
    async function updateMeetingStatusApi(id, status, notes = "") {
        try {
            const res = await apiFetch(`${API_BASE_URL}/lecturer/meetings/status/${id}`, {
                method: "PATCH",
                headers: getAuthHeaders(),
                body: JSON.stringify({ status, notes })
            });

            const data = await res.json();
            if (data.success) {
                showAppNotification(data.message);
                loadMeetings();
            } else {
                showAppNotification("Lỗi: " + data.message);
            }
        } catch (error) {
            console.error("Lỗi cập nhật trạng thái:", error);
            showAppNotification("Lỗi kết nối máy chủ!");
        }
    }

    // Đóng Dropdown khi click ra ngoài
    window.addEventListener("click", () => {
        document.querySelectorAll(".card-action-dropdown").forEach(dropdown => {
            dropdown.classList.remove("active");
        });
    });

    // =========================================================
    // 4. BỘ LỌC CHIP TRẠNG THÁI / HÌNH THỨC
    // =========================================================
    const filterChips = document.querySelectorAll(".filter-chip");
    filterChips.forEach(chip => {
        chip.addEventListener("click", () => {
            filterChips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");

            const filterType = chip.getAttribute("data-filter");
            if (filterType === "ALL") {
                renderMeetingCards(allMeetings);
            } else if (filterType === "PENDING") {
                renderMeetingCards(allMeetings.filter(m => m.status === "PENDING"));
            } else if (filterType === "ONLINE" || filterType === "OFFLINE") {
                renderMeetingCards(allMeetings.filter(m => m.type === filterType));
            }
        });
    });

    // =========================================================
    // 5. XỬ LÝ MA TRẬN TIẾN ĐỘ THEO CÁC MỐC ĐÃ CẤU HÌNH
    // =========================================================
    async function loadMilestoneHeaders() {
        const headerRow = document.getElementById("progressMatrixHeader");
        const statusHeader = document.getElementById("matrixStatusHeader");
        if (!headerRow || !statusHeader) return;

        try {
            const response = await apiFetch(`${API_MILESTONES_URL}/lecturer`, { headers: getAuthHeaders() });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || "Không thể tải milestone.");

            progressMilestones = (result.data || []).sort((a, b) => Number(a.step) - Number(b.step));
            progressMilestones.forEach(milestone => {
                const header = document.createElement("th");
                header.className = "col-week";
                header.style.textAlign = "center";
                header.textContent = `Mốc ${milestone.step}`;
                const subtitle = document.createElement("small");
                subtitle.textContent = milestone.name;
                header.appendChild(document.createElement("br"));
                header.appendChild(subtitle);
                headerRow.insertBefore(header, statusHeader);
            });
        } catch (error) {
            console.error("Lỗi khi tải tên milestone:", error);
            progressMilestones = [];
        }
    }

    async function loadProgressMatrix() {
        const tbody = document.getElementById("progressMatrixBody");
        if (!tbody) return;

        try {
            await loadMilestoneHeaders();
            const emptyRowColspan = 4 + progressMilestones.length;
            const res = await apiFetch(`${API_TOPICS_URL}/lecturer-matrix/${user.user_code}`, {
                method: "GET",
                headers: getAuthHeaders()
            });

            const result = await res.json();

            if (res.ok && result.success && result.data && result.data.length > 0) {
                renderMatrixRows(result.data);
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="${emptyRowColspan}" style="text-align: center; color: #64748b; padding: 32px;">
                            Chưa có đề tài nào được phê duyệt hoặc đang hướng dẫn.
                        </td>
                    </tr>`;
            }
        } catch (err) {
            console.error("Lỗi khi tải ma trận tiến độ:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="${4 + progressMilestones.length}" style="text-align: center; color: #ef4444; padding: 32px;">
                        Không thể kết nối với máy chủ để lấy ma trận tiến độ!
                    </td>
                </tr>`;
        }
    }

    function renderMatrixRows(topics) {
        const tbody = document.getElementById("progressMatrixBody");
        if (!tbody) return;

        tbody.innerHTML = "";

        topics.forEach(topic => {
            let completedCount = 0;
            let activeFound = false;

            const milestoneCells = progressMilestones.map(milestone => {
                const i = Number(milestone.step);
                const mData = topic.milestones ? topic.milestones[`milestone${i}`] : null;

                if (mData && mData.submitted) {
                    completedCount++;
                    const downloadPath = mData.file_path ? `${window.APP_CONFIG.API_BASE_URL}/${mData.file_path}` : '#';
                    return `
                        <td style="text-align: center;">
                            <a href="${downloadPath}" target="_blank" title="Tải file: ${mData.file_name || 'Bài nộp'}" 
                               style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: #dcfce7; color: #15803d; border-radius: 6px; font-size: 12px; font-weight: 600; text-decoration: none;">
                                <i class="fa-solid fa-file-arrow-down"></i> Đã nộp
                            </a>
                        </td>`;
                } else if (!activeFound) {
                    activeFound = true;
                    return `
                        <td style="text-align: center;">
                            <span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; background: #fef3c7; color: #b45309; border-radius: 6px; font-size: 12px; font-weight: 600;">
                                <i class="fa-solid fa-spinner fa-spin"></i> Đang làm
                            </span>
                        </td>`;
                } else {
                    return `
                        <td style="text-align: center;">
                            <span style="color: #94a3b8; font-size: 12px; display: inline-flex; align-items: center; gap: 4px;">
                                <i class="fa-solid fa-lock"></i> Chưa mở
                            </span>
                        </td>`;
                }
            }).join('');

            // Badge trạng thái tổng quan tiến độ đề tài
            let statusBadge = '<span class="matrix-badge-pill badge-on-track"><span class="badge-dot"></span>Đúng tiến độ</span>';
            if (progressMilestones.length === 0) {
                statusBadge = '<span class="matrix-badge-pill badge-unconfigured"><span class="badge-dot"></span>Chưa cấu hình mốc</span>';
            } else if (completedCount === 0 && activeFound) {
                statusBadge = '<span class="matrix-badge-pill badge-warning"><span class="badge-dot"></span>Cần nhắc nhở</span>';
            } else if (completedCount === progressMilestones.length) {
                statusBadge = '<span class="matrix-badge-pill badge-completed"><span class="badge-dot"></span>Hoàn thành</span>';
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="col-code"><span class="matrix-code-badge"><i class="fa-solid fa-hashtag"></i> ${topic.topic_code || "N/A"}</span></td>
                <td class="col-title">${topic.title || ""}</td>
                ${milestoneCells}
                <td style="text-align: center;">${statusBadge}</td>
                <td style="text-align: center;">
                    <a href="lecturer-progress-detail.html?topicId=${topic._id}" class="btn-table-action">
                        <span>Chi tiết</span> <i class="fa-solid fa-arrow-right"></i>
                    </a>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // Đóng modal khi bấm X hoặc hủy
    document.querySelectorAll(".btn-close-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            if (availabilityModal) availabilityModal.style.display = "none";
        });
    });

    window.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal-overlay")) {
            e.target.style.display = "none";
        }
    });

    // =========================================================
    // KHỞI ĐỘNG: Tải lịch họp và Ma trận tiến độ từ Backend
    // =========================================================
    loadMeetings();
    loadProgressMatrix();
});
