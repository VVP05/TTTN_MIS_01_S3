document.addEventListener("DOMContentLoaded", () => {
    
    // =========================================================
    // 1. KIỂM TRA QUYỀN TRUY CẬP & CẤU HÌNH API
    // =========================================================
    const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    const token = auth?.token || "";
    const user = auth?.user || null;

    if (!user || user.role !== "LECTURER") {
        window.location.href = "index.html";
        return;
    }

    // Hiển thị thông tin giảng viên
    const userNameEl = document.getElementById("userName");
    const userCodeEl = document.getElementById("userCode");
    if (userNameEl) userNameEl.textContent = user.full_name || "Giảng viên";
    if (userCodeEl) userCodeEl.textContent = user.user_code || "GV";

    // Địa chỉ API
    const API_BASE_URL = "http://localhost:5000/api/schedule";
    const API_TOPICS_URL = "http://localhost:5000/api/topics";

    // Hàm tạo Header có kèm Token xác thực (JWT)
    const getAuthHeaders = () => ({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    });

    let allMeetings = []; // Lưu trữ danh sách họp từ Backend để filter tại client

    const availabilityForm = document.getElementById("availabilityForm");
    const availabilityList = document.getElementById("availabilityList");
    const availabilityCount = document.getElementById("availabilityCount");
    const availabilityModal = document.getElementById("availabilityModal");
    const openAvailabilityModalBtn = document.getElementById("openAvailabilityModalBtn");
    if (openAvailabilityModalBtn) openAvailabilityModalBtn.addEventListener("click", () => {
        const dateInput = document.getElementById("availabilityDate");
        if (dateInput) {
            const tomorrow = new Date();
            tomorrow.setHours(12, 0, 0, 0);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowValue = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
            dateInput.min = tomorrowValue;
            if (!dateInput.value || dateInput.value < tomorrowValue) dateInput.value = tomorrowValue;
        }
        if (availabilityModal) availabilityModal.style.display = "flex";
    });
    document.querySelectorAll("#availabilityModal .btn-close-modal").forEach(button => button.addEventListener("click", () => {
        if (availabilityModal) availabilityModal.style.display = "none";
    }));
    async function loadAvailability() {
        if (!availabilityList) return;
        const res = await fetch(`${API_BASE_URL}/availability/${encodeURIComponent(user.user_code)}`, { headers: getAuthHeaders() });
        const result = await res.json();
        const slots = result.data || [];
        if (availabilityCount) availabilityCount.textContent = `${slots.length} khung giờ`;
        availabilityList.innerHTML = slots.length ? slots.map(slot => {
            const date = new Date(slot.available_date);
            const dateText = date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
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
            </div>`;
        }).join("") : '<p class="availability-empty-hint">Chưa có khung giờ nào đang mở.</p>';
    }
    if (availabilityForm) availabilityForm.addEventListener("submit", async event => {
        event.preventDefault();
        const response = await fetch(`${API_BASE_URL}/lecturer/availability`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify({ lecturer_code: user.user_code, available_date: document.getElementById("availabilityDate").value, time_start: document.getElementById("availabilityStart").value, time_end: document.getElementById("availabilityEnd").value, max_bookings: document.getElementById("availabilityCapacity").value, type: document.getElementById("availabilityType").value, location: document.getElementById("availabilityLocation").value.trim() }) });
        const result = await response.json();
        showAppNotification(result.message || "Đã cập nhật khung giờ!");
        if (response.ok) { availabilityForm.reset(); if (availabilityModal) availabilityModal.style.display = "none"; loadAvailability(); }
    });
    loadAvailability();

    // =========================================================
    // 2. LẤY DỮ LIỆU TỪ BACKEND & RENDER LỊCH HỌP
    // =========================================================
    async function loadMeetings() {
        try {
            const res = await fetch(`${API_BASE_URL}/lecturer/meetings/${user.user_code}`, {
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

        if (elTotal) elTotal.innerHTML = `${total} <small>buổi</small>`;
        if (elPending) elPending.innerHTML = `${pending} <small>yêu cầu</small>`;
        if (elApproved) elApproved.innerHTML = `${approved} <small>buổi</small>`;
        if (elCompleted) elCompleted.innerHTML = `${completed} <small>buổi</small>`;
    }

    function renderMeetingCards(meetings) {
        const container = document.getElementById("meetingCardsContainer");
        if (!container) return;

        if (!meetings || meetings.length === 0) {
            container.innerHTML = `
                <p style="grid-column: 1/-1; text-align: center; color: #6b7280; padding: 32px;">
                    Chưa có lịch hẹn nào được tạo hoặc chờ duyệt.
                </p>`;
            return;
        }

        container.innerHTML = meetings.map(item => {
            const isPending = item.status === "PENDING";
            const isOnline = item.type === "ONLINE";

            // Xử lý định dạng ngày và giờ
            const dateObj = new Date(item.meeting_date);
            const dateStr = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
            const timeRangeStr = `${item.time_start} - ${item.time_end}`;

            // Hiển thị tên Nhóm (nếu có từ populate) hoặc Mã SV
            const groupDisplay = item.topic_id?.group_code 
                ? `Nhóm ${item.topic_id.group_code}` 
                : `SV: ${item.student_code}`;

            // --- THẺ YÊU CẦU ĐẶT LỊCH CHỜ DUYỆT (PENDING) ---
            if (isPending) {
                return `
                    <div class="meeting-card pending-card" data-status="PENDING" data-type="${item.type}" style="border-left: 4px solid #f59e0b; background: #fffbeb;">
                        <div class="meeting-time-badge" style="background: #fef3c7; color: #b45309;">
                            <span class="date">${dateStr}</span>
                            <span class="time">${timeRangeStr}</span>
                        </div>
                        <div class="meeting-content">
                            <div class="meeting-top">
                                <span class="badge-group">${groupDisplay}</span>
                                <span class="badge-status-pending" style="color: #d97706; font-weight: 600; font-size: 13px;">
                                    <i class="fa-solid fa-clock"></i> Sinh viên đề xuất
                                </span>
                            </div>
                            <h3>${item.title}</h3>
                            <p class="meeting-desc">
                                Hình thức: <strong>${isOnline ? 'Online (Meet)' : 'Offline'}</strong> | Địa điểm: ${item.location}
                                ${item.notes ? `<br><em>Ghi chú: ${item.notes}</em>` : ''}
                            </p>
                            
                            <div class="meeting-actions-row" style="margin-top: 12px; display: flex; gap: 8px;">
                                <button class="btn-approve-request" data-id="${item._id}" data-group="${groupDisplay}" style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500;">
                                    <i class="fa-solid fa-check"></i> Đồng ý lịch
                                </button>
                                <button class="btn-reject-request" data-id="${item._id}" data-group="${groupDisplay}" style="background: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; font-weight: 500;">
                                    <i class="fa-solid fa-xmark"></i> Từ chối / Báo bận
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }

            // --- THẺ LỊCH CHÍNH THỨC (APPROVED / COMPLETED) ---
            const isCompleted = item.status === "COMPLETED";

            return `
                <div class="meeting-card ${isOnline ? 'online' : 'offline'}" data-status="${item.status}" data-type="${item.type}" style="${isCompleted ? 'opacity: 0.75;' : ''}">
                    <div class="meeting-time-badge">
                        <span class="date">${dateStr}</span>
                        <span class="time">${timeRangeStr}</span>
                    </div>
                    <div class="meeting-content">
                        <div class="meeting-top">
                            <span class="badge-group">${groupDisplay}</span>
                            <div class="meeting-top-right">
                                <span class="meeting-type ${isOnline ? 'type-online' : 'type-offline'}">
                                    <i class="fa-solid ${isOnline ? 'fa-video' : 'fa-location-dot'}"></i> ${isOnline ? 'Google Meet' : 'Phòng học'}
                                </span>
                                
                                <div class="card-action-dropdown">
                                    <button class="btn-more-options" aria-label="Tùy chọn lịch"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                                    <div class="dropdown-menu-small">
                                        ${!isCompleted ? `<button class="action-complete-meeting" data-id="${item._id}"><i class="fa-solid fa-check-double"></i> Đánh dấu Hoàn thành</button>` : ''}
                                        <button class="action-cancel-meeting" data-id="${item._id}" data-group="${groupDisplay}"><i class="fa-solid fa-trash"></i> Xóa buổi họp</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <h3>${item.title} ${isCompleted ? '<span style="color: #10b981; font-size: 14px;">(Đã hoàn thành)</span>' : ''}</h3>
                        <p class="meeting-desc">${item.notes || 'Lịch hướng dẫn định kỳ.'}</p>
                        <div class="meeting-footer">
                            ${isOnline 
                                ? `<a href="${item.location.startsWith('http') ? item.location : 'https://' + item.location}" target="_blank" class="btn-meet-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> Vào phòng Meet</a>` 
                                : `<span class="location-note"><i class="fa-solid fa-building-columns"></i> ${item.location}</span>`
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
                        const res = await fetch(`${API_BASE_URL}/lecturer/meetings/${id}`, {
                            method: "DELETE",
                            headers: getAuthHeaders()
                        });
                        const data = await res.json();
                        if (data.success) {
                            showAppNotification(data.message);
                            loadMeetings(); // Load lại từ DB sau khi xóa
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
            const res = await fetch(`${API_BASE_URL}/lecturer/meetings/status/${id}`, {
                method: "PATCH",
                headers: getAuthHeaders(),
                body: JSON.stringify({ status, notes })
            });

            const data = await res.json();
            if (data.success) {
                showAppNotification(data.message);
                loadMeetings(); // Load lại dữ liệu từ DB
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
    // 5. XỬ LÝ MA TRẬN TIẾN ĐỘ 5 MỐC BÁO CÁO (TẢI TỪ DATABASE)
    // =========================================================
    async function loadProgressMatrix() {
        const tbody = document.getElementById("progressMatrixBody");
        if (!tbody) return;

        try {
            const res = await fetch(`${API_TOPICS_URL}/lecturer-matrix/${user.user_code}`, {
                method: "GET",
                headers: getAuthHeaders()
            });

            const result = await res.json();

            if (res.ok && result.success && result.data && result.data.length > 0) {
                renderMatrixRows(result.data);
            } else {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="9" style="text-align: center; color: #64748b; padding: 24px;">
                            Chưa có đề tài nào được phê duyệt hoặc đang hướng dẫn.
                        </td>
                    </tr>`;
            }
        } catch (err) {
            console.error("Lỗi khi tải ma trận tiến độ:", err);
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; color: #ef4444; padding: 24px;">
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

            const milestoneCells = [1, 2, 3, 4, 5].map(i => {
                const mData = topic.milestones ? topic.milestones[`milestone${i}`] : null;

                if (mData && mData.submitted) {
                    completedCount++;
                    const downloadPath = mData.file_path ? `http://localhost:5000/${mData.file_path}` : '#';
                    return `
                        <td style="text-align: center;">
                            <a href="${downloadPath}" target="_blank" title="Tải file: ${mData.file_name || 'Bài nộp'}" 
                               style="display: inline-block; padding: 4px 8px; background: #dcfce7; color: #15803d; border-radius: 4px; font-size: 12px; font-weight: 600; text-decoration: none;">
                                <i class="fa-solid fa-file-arrow-down"></i> Đã nộp
                            </a>
                        </td>`;
                } else if (!activeFound) {
                    activeFound = true;
                    return `
                        <td style="text-align: center;">
                            <span style="padding: 4px 8px; background: #fef3c7; color: #b45309; border-radius: 4px; font-size: 12px; font-weight: 600;">
                                <i class="fa-solid fa-spinner fa-spin"></i> Đang làm
                            </span>
                        </td>`;
                } else {
                    return `
                        <td style="text-align: center;">
                            <span style="color: #94a3b8; font-size: 12px;">
                                <i class="fa-solid fa-lock"></i> Chưa mở
                            </span>
                        </td>`;
                }
            }).join('');

            // Badge trạng thái tổng quan tiến độ đề tài
            let statusBadge = '<span class="badge badge-success">Đúng tiến độ</span>';
            if (completedCount === 0 && activeFound) {
                statusBadge = '<span class="badge badge-warning" style="background:#fef3c7; color:#b45309; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Cần nhắc nhở</span>';
            } else if (completedCount === 5) {
                statusBadge = '<span class="badge badge-success" style="background:#10b981; color:white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">Hoàn thành</span>';
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${topic.topic_code}</strong></td>
                <td>${topic.title}</td>
                ${milestoneCells}
                <td style="text-align: center;">${statusBadge}</td>
                <td style="text-align: center;">
                    <a href="lecturer-progress-detail.html?topicId=${topic._id}" class="btn-link" style="color: #2563eb; font-weight: 500; text-decoration: none;">Chi tiết</a>
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

    // Đăng xuất
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "index.html";
        });
    }

    // =========================================================
    // KHỞI ĐỘNG: Tải lịch họp và Ma trận tiến độ từ Backend
    // =========================================================
    loadMeetings();
    loadProgressMatrix();
});