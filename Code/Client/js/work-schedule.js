// Biến lưu thông tin đề tài & giảng viên thu thập từ API
let currentScheduleTopicInfo = null;

// CẤU HÌNH NGÀY BẮT ĐẦU ĐỢT THỰC TẬP
// Thay đổi ngày này theo đúng ngày bắt đầu học kỳ thực tập của trường bạn
const INTERNSHIP_START_DATE = "2026-06-15"; 

function getAuthForRole(role) {
    const roleKey = {
        STUDENT: "studentAuth",
        LECTURER: "lecturerAuth",
        ADMIN: "adminAuth"
    }[role] || "auth";

    const raw = localStorage.getItem(roleKey);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    // 1. KIỂM TRA ĐĂNG NHẬP
    const auth = getAuthForRole("STUDENT") || { token: localStorage.getItem("token"), user: JSON.parse(localStorage.getItem("user") || "null") };
    const user = auth?.user;
    const token = auth?.token || localStorage.getItem("token");

    if (!user || user.role !== "STUDENT") {
        window.location.href = "index.html";
        return;
    }

    if (user.full_name) {
        const userNameEl = document.getElementById("userName");
        if (userNameEl) userNameEl.textContent = user.full_name;
    }
    if (user.user_code) {
        const userCodeEl = document.getElementById("userCode");
        if (userCodeEl) userCodeEl.textContent = user.user_code;
    }

    // 2. TẢI DỮ LIỆU TỪ BACKEND
    await loadScheduleData(user.user_code);

    // 3. XỬ LÝ MODAL ĐĂNG KÝ LỊCH HẸN
    const modal = document.getElementById("bookingModal");
    const btnOpen = document.getElementById("btnOpenBookingModal");
    const btnClose = document.getElementById("btnCloseModal");
    const btnCancel = document.getElementById("btnCancelModal");
    const bookingForm = document.getElementById("bookingForm");

    // Mặc định chọn ngày mai cho ô Input Date
    const dateInput = document.getElementById("bookingDate");
    if (dateInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.valueAsDate = tomorrow;
    }

    const openModal = () => {
        if (modal) modal.style.display = "flex";
    };
    const closeModal = () => {
        if (modal) modal.style.display = "none";
    };

    if (btnOpen) btnOpen.addEventListener("click", openModal);
    if (btnClose) btnClose.addEventListener("click", closeModal);
    if (btnCancel) btnCancel.addEventListener("click", closeModal);

    // Gửi Form Đăng ký lịch hẹn lên Server
    if (bookingForm) {
        bookingForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (!currentScheduleTopicInfo) {
                alert("Bạn chưa đăng ký đề tài hoặc đề tài chưa được duyệt nên chưa thể đặt lịch hẹn!");
                return;
            }

            const title = document.getElementById("bookingTitle") ? document.getElementById("bookingTitle").value.trim() : "";
            const meetingDate = document.getElementById("bookingDate") ? document.getElementById("bookingDate").value : "";
            const timeStart = document.getElementById("bookingTimeStart") ? document.getElementById("bookingTimeStart").value : "09:00";
            const timeEnd = document.getElementById("bookingTimeEnd") ? document.getElementById("bookingTimeEnd").value : "10:00";
            const type = document.getElementById("bookingType") ? document.getElementById("bookingType").value : "ONLINE";
            const location = document.getElementById("bookingLocation") ? document.getElementById("bookingLocation").value.trim() : "";

            if (!title || !meetingDate) {
                alert("Vui lòng điền đầy đủ tiêu đề và ngày họp!");
                return;
            }

            try {
                const response = await fetch("http://localhost:5000/api/schedule/meetings/create", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        topic_id: currentScheduleTopicInfo.id,
                        student_code: user.user_code,
                        lecturer_code: currentScheduleTopicInfo.lecturer_code,
                        title,
                        meeting_date: meetingDate,
                        time_start: timeStart,
                        time_end: timeEnd,
                        type,
                        location: location || (type === "ONLINE" ? "Google Meet (Sẽ cập nhật)" : "Văn phòng Khoa")
                    })
                });

                const result = await response.json();

                if (response.ok) {
                    alert(result.message || "Đã gửi yêu cầu đặt lịch cho Giảng viên hướng dẫn!");
                    closeModal();
                    bookingForm.reset();
                    // Tải lại dữ liệu trang
                    await loadScheduleData(user.user_code);
                } else {
                    alert(result.message || "Không thể đặt lịch hẹn!");
                }
            } catch (err) {
                console.error("Lỗi gửi lịch hẹn:", err);
                alert("Lỗi kết nối máy chủ khi gửi yêu cầu đặt lịch!");
            }
        });
    }

    // 4. XỬ LÝ TODO CHECKLIST (THÊM VIỆC MỚI)
    const newTodoInput = document.getElementById("newTodoInput");
    const btnAddTodo = document.getElementById("btnAddTodo");

    const addTodo = async () => {
        if (!newTodoInput) return;
        const text = newTodoInput.value.trim();
        if (!text) return;

        // Bổ sung kiểm tra an toàn: Không cho tạo task khi đề tài chưa được duyệt
        if (!currentScheduleTopicInfo) {
            alert("Vui lòng đợi đề tài được phê duyệt để sử dụng danh sách công việc!");
            return;
        }

        try {
            const response = await fetch("http://localhost:5000/api/schedule/todos/add", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    student_code: user.user_code,
                    title: text
                })
            });

            const result = await response.json();

            if (response.ok) {
                newTodoInput.value = "";
                // Tải lại dữ liệu để hiển thị task mới tạo từ DB
                await loadScheduleData(user.user_code);
            } else {
                alert(result.message || "Không thể thêm công việc!");
            }
        } catch (err) {
            console.error("Lỗi thêm task:", err);
            alert("Lỗi kết nối máy chủ khi thêm công việc!");
        }
    };

    if (btnAddTodo) btnAddTodo.addEventListener("click", addTodo);
    if (newTodoInput) {
        newTodoInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") addTodo();
        });
    }

    // 5. XỬ LÝ ĐĂNG XUẤT
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
            if (localStorage.getItem("activeRole") === "STUDENT") {
                localStorage.removeItem("activeRole");
            }
            if (localStorage.getItem("token") && JSON.parse(localStorage.getItem("user") || "null")?.role === "STUDENT") {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
            }
            sessionStorage.clear();
            window.location.href = "index.html";
        });
    }

    // Đóng modal khi bấm ra ngoài vùng nền mờ
    window.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
        if (e.target === logoutModal && logoutModal) logoutModal.style.display = "none";
    });
});

// =========================================================
// HÀM TÍNH TUẦN THỰC TẬP TỰ ĐỘNG THEO THỜI GIAN THỰC
// =========================================================
function calculateCurrentWeek(startDateStr, totalWeeks = 15) {
    const startDate = new Date(startDateStr);
    const today = new Date();

    // Đặt giờ về 00:00:00 để so sánh chính xác theo ngày
    startDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);

    // Nếu ngày hiện tại trước ngày bắt đầu
    if (today < startDate) return 1;

    const diffTime = Math.abs(today - startDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const calculatedWeek = Math.floor(diffDays / 7) + 1;

    if (calculatedWeek > totalWeeks) return totalWeeks;
    return calculatedWeek;
}

// =========================================================
// HÀM CALL API LẤY TOÀN BỘ DỮ LIỆU ĐỂ RENDER
// =========================================================
async function loadScheduleData(studentCode) {
    try {
        const token = JSON.parse(localStorage.getItem("studentAuth") || "null")?.token;
        const res = await fetch(`http://localhost:5000/api/schedule/my-schedule/${studentCode}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        // 1. Trường hợp chưa có đề tài trong hệ thống (HTTP 404)
        if (res.status === 404) {
            renderScheduleLockedState("CHUA_DANG_KY");
            return;
        }

        if (!res.ok) {
            console.warn("Chưa tải được dữ liệu tiến độ.");
            return;
        }

        const data = await res.json();

        if (data.success) {
            // 2. Kiểm tra trạng thái đề tài (bao phủ các trường hợp trống hoặc chưa đăng ký hợp lệ)
            if (data.topic) {
                const topicStatus = data.topic.status;

                if (!topicStatus || topicStatus === "NONE") {
                    renderScheduleLockedState("CHUA_DANG_KY");
                    return;
                } else if (topicStatus === "PENDING") {
                    renderScheduleLockedState("PENDING");
                    return;
                } else if (topicStatus === "REJECTED") {
                    renderScheduleLockedState("REJECTED");
                    return;
                }
            } else {
                renderScheduleLockedState("CHUA_DANG_KY");
                return;
            }

            // 3. Đề tài đã được duyệt (APPROVED) -> Mở khóa hiển thị toàn bộ
            currentScheduleTopicInfo = data.topic;
            unlockScheduleControls();

            // Render các con số thống kê ở Top-bar
            renderTopStats(data.stats);

            // Render danh sách Cuộc họp / Báo cáo
            renderMeetingsList(data.meetings || []);

            // Render danh sách To-do list
            renderTodoList(data.todos || []);
        }
    } catch (err) {
        console.error("Lỗi khi kết nối API schedule:", err);
    }
}

// =========================================================
// HÀM MỞ KHÓA GIAO DIỆN KHI ĐỀ TÀI HỢP LỆ (APPROVED)
// =========================================================
function unlockScheduleControls() {
    const btnOpenBooking = document.getElementById("btnOpenBookingModal");
    const newTodoInput = document.getElementById("newTodoInput");
    const btnAddTodo = document.getElementById("btnAddTodo");

    if (btnOpenBooking) {
        btnOpenBooking.disabled = false;
        btnOpenBooking.style.opacity = "1";
        btnOpenBooking.style.cursor = "pointer";
        btnOpenBooking.title = "";
    }
    if (newTodoInput) {
        newTodoInput.disabled = false;
        newTodoInput.placeholder = "Nhập công việc cần làm...";
    }
    if (btnAddTodo) {
        btnAddTodo.disabled = false;
        btnAddTodo.style.opacity = "1";
        btnAddTodo.style.cursor = "pointer";
    }
}

// =========================================================
// HÀM KHÓA TRANG LỊCH LÀM VIỆC KHI ĐỀ TÀI CHƯA ĐƯỢC DUYỆT
// =========================================================
function renderScheduleLockedState(reason) {
    currentScheduleTopicInfo = null;

    const btnOpenBooking = document.getElementById("btnOpenBookingModal");
    const meetingsContainer = document.getElementById("meetingsListContainer") || document.getElementById("meetingsContainer");
    const todoList = document.getElementById("todoList");
    const todoCounter = document.getElementById("todoCounter");
    const newTodoInput = document.getElementById("newTodoInput");
    const btnAddTodo = document.getElementById("btnAddTodo");

    // Khóa toàn bộ các nút thao tác giao diện
    if (btnOpenBooking) {
        btnOpenBooking.disabled = true;
        btnOpenBooking.style.opacity = "0.6";
        btnOpenBooking.style.cursor = "not-allowed";
        btnOpenBooking.title = "Đề tài phải được phê duyệt mới có thể đặt lịch hẹn!";
    }
    if (newTodoInput) {
        newTodoInput.disabled = true;
        newTodoInput.placeholder = "Tạm khóa...";
    }
    if (btnAddTodo) {
        btnAddTodo.disabled = true;
        btnAddTodo.style.opacity = "0.6";
        btnAddTodo.style.cursor = "not-allowed";
    }

    if (todoCounter) todoCounter.textContent = "0/0";

    let messageHTML = "";

    if (reason === "PENDING") {
        messageHTML = `
            <div style="text-align: center; padding: 40px 20px; background: #fff8e6; border: 1px dashed #ffe082; border-radius: 12px; margin: 20px 0;">
                <i class="fa-solid fa-clock-rotate-left" style="font-size: 48px; color: #f59e0b; margin-bottom: 16px;"></i>
                <h3 style="color: #b45309; margin-bottom: 8px;">Đề tài đang chờ phê duyệt</h3>
                <p style="color: #78350f; max-width: 520px; margin: 0 auto 16px; font-size: 14px; line-height: 1.5;">
                    Đề tài của bạn hiện đang ở trạng thái <strong>Chờ duyệt</strong>. Tính năng Đặt lịch hẹn và Theo dõi lịch làm việc sẽ tự động kích hoạt sau khi Giảng viên hướng dẫn chấp nhận đề tài.
                </p>
                <a href="my-topic.html" style="display: inline-block; background-color: #f59e0b; color: #fff; padding: 9px 18px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
                    <i class="fa-solid fa-eye"></i> Kiểm tra trạng thái đề tài
                </a>
            </div>
        `;
    } else if (reason === "REJECTED") {
        messageHTML = `
            <div style="text-align: center; padding: 40px 20px; background: #fef2f2; border: 1px dashed #fca5a5; border-radius: 12px; margin: 20px 0;">
                <i class="fa-solid fa-circle-xmark" style="font-size: 48px; color: #ef4444; margin-bottom: 16px;"></i>
                <h3 style="color: #991b1b; margin-bottom: 8px;">Đề tài đã bị từ chối</h3>
                <p style="color: #7f1d1d; max-width: 520px; margin: 0 auto 16px; font-size: 14px; line-height: 1.5;">
                    Đăng ký đề tài của bạn không được chấp nhận. Vui lòng cập nhật lại đề tài hoặc liên hệ Giảng viên để biết thêm chi tiết.
                </p>
                <a href="student-dashboard.html" style="display: inline-block; background-color: #dc2626; color: #fff; padding: 9px 18px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
                    <i class="fa-solid fa-pen-to-square"></i> Cập nhật lại đề tài
                </a>
            </div>
        `;
    } else { // CHUA_DANG_KY
        messageHTML = `
            <div style="text-align: center; padding: 40px 20px; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; margin: 20px 0;">
                <i class="fa-solid fa-folder-plus" style="font-size: 48px; color: #94a3b8; margin-bottom: 16px;"></i>
                <h3 style="color: #334155; margin-bottom: 8px;">Bạn chưa đăng ký đề tài</h3>
                <p style="color: #64748b; max-width: 520px; margin: 0 auto 16px; font-size: 14px; line-height: 1.5;">
                    Bạn cần hoàn tất đăng ký đề tài thực tập tốt nghiệp trước khi sử dụng tính năng quản lý lịch làm việc và trao đổi với Giảng viên.
                </p>
                <a href="student-dashboard.html" style="display: inline-block; background-color: #2563eb; color: #fff; padding: 9px 18px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: 500;">
                    <i class="fa-solid fa-paper-plane"></i> Đăng ký đề tài ngay
                </a>
            </div>
        `;
    }

    if (meetingsContainer) meetingsContainer.innerHTML = messageHTML;
    if (todoList) todoList.innerHTML = `<p style="color: #94a3b8; font-size: 13px; text-align: center; padding: 15px 0;">Tính năng tạm khóa cho đến khi đề tài được duyệt.</p>`;
}

// =========================================================
// RENDER KHỐI THỐNG KÊ TOP-BAR
// =========================================================
function renderTopStats(stats) {
    if (!stats) return;
    const upcomingEl = document.getElementById("statUpcomingMeetings");
    const weekProgressEl = document.getElementById("statWeekProgress");

    if (upcomingEl) {
        upcomingEl.textContent = `${String(stats.upcoming_meetings || 0).padStart(2, '0')} buổi`;
    }
    if (weekProgressEl) {
        const totalWeeks = stats.total_weeks || 15;
        // Tính số tuần thực tế dựa trên ngày khởi tạo INTERNSHIP_START_DATE
        const computedWeek = calculateCurrentWeek(INTERNSHIP_START_DATE, totalWeeks);
        const currentWeekStr = String(computedWeek).padStart(2, '0');

        weekProgressEl.innerHTML = `Tuần ${currentWeekStr} <small style="font-size: 14px; color: #64748b; font-weight: normal;">/ ${totalWeeks}</small>`;
    }
}

// =========================================================
// RENDER DANH SÁCH LỊCH HỌP / BÁO CÁO
// =========================================================
function renderMeetingsList(meetings) {
    const container = document.getElementById("meetingsListContainer") || document.getElementById("meetingsContainer");
    if (!container) return;

    if (meetings.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 30px; color: #64748b;">Chưa có lịch họp nào được ghi nhận.</div>`;
        return;
    }

    container.innerHTML = meetings.map(item => {
        const dateObj = new Date(item.meeting_date);
        const formattedDate = dateObj.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

        // Phân loại badge trạng thái
        let badgeClass = "badge-pending";
        let badgeText = "Chờ GV duyệt";

        if (item.status === "APPROVED") {
            badgeClass = "badge-approved";
            badgeText = "Đã xác nhận";
        } else if (item.status === "COMPLETED") {
            badgeClass = "badge-completed";
            badgeText = "Đã hoàn thành";
        } else if (item.status === "CANCELLED") {
            badgeClass = "badge-cancelled";
            badgeText = "Đã hủy";
        }

        // Định dạng vị trí/địa điểm họp
        let locationHTML = "";
        if (item.type === "ONLINE") {
            const isUrl = item.location && (item.location.startsWith("http://") || item.location.startsWith("https://"));
            locationHTML = isUrl 
                ? `<p><i class="fa-solid fa-link" style="color: #2563eb;"></i> <a href="${item.location}" target="_blank" style="color: #2563eb; text-decoration: underline;">${item.location}</a></p>`
                : `<p><i class="fa-solid fa-video" style="color: #2563eb;"></i> Hình thức: Online (${item.location})</p>`;
        } else {
            locationHTML = `<p><i class="fa-solid fa-location-dot" style="color: #64748b;"></i> Hình thức: ${item.location.includes("Trực tiếp") ? item.location : 'Trực tiếp - ' + item.location}</p>`;
        }

        // Khối Ghi chú sau họp (nếu có)
        const notesHTML = item.notes ? `
            <div class="meeting-notes" style="margin-top: 10px; padding: 10px 14px; background: #fffbeb; border-radius: 6px; border-left: 3px solid #f59e0b; font-size: 13px; color: #92400e;">
                <strong>Ghi chú sau họp:</strong> ${item.notes}
            </div>
        ` : "";

        return `
            <div class="meeting-card ${item.status.toLowerCase()}">
                <div class="meeting-time-box">
                    <span class="m-date">${formattedDate}</span>
                    <span class="m-time">${item.time_start} - ${item.time_end}</span>
                </div>
                <div class="meeting-details">
                    <div class="m-header">
                        <h4 class="m-title">${item.title}</h4>
                        <span class="m-status-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <div class="m-info">
                        ${locationHTML}
                    </div>
                    ${notesHTML}
                </div>
            </div>
        `;
    }).join("");
}

// =========================================================
// RENDER DANH SÁCH TO-DO LIST & CẬP NHẬT TRẠNG THÁI
// =========================================================
function renderTodoList(todos) {
    const todoList = document.getElementById("todoList");
    const todoCounter = document.getElementById("todoCounter");

    if (!todoList) return;

    if (todoCounter) {
        const completedCount = todos.filter(t => t.is_completed).length;
        todoCounter.textContent = `${completedCount}/${todos.length}`;
    }

    if (todos.length === 0) {
        todoList.innerHTML = `<p style="color: #94a3b8; font-size: 13px; text-align: center; padding: 10px 0;">Chưa có việc cần làm.</p>`;
        return;
    }

    todoList.innerHTML = todos.map(item => `
        <label class="todo-item ${item.is_completed ? 'done' : ''}" data-id="${item._id}">
            <input type="checkbox" ${item.is_completed ? 'checked' : ''} onchange="toggleTodoStatus('${item._id}')" />
            <span>${item.title}</span>
        </label>
    `).join("");
}

// =========================================================
// HÀM TOGGLE CẬP NHẬT TRẠNG THÁI CHECKBOX KHI USER CLICK
// =========================================================
async function toggleTodoStatus(todoId) {
    try {
        const token = JSON.parse(localStorage.getItem("studentAuth") || "null")?.token;
        const res = await fetch(`http://localhost:5000/api/schedule/todos/toggle/${todoId}`, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (res.ok) {
            const auth = JSON.parse(localStorage.getItem("studentAuth") || "null");
            const user = auth?.user || null;
            if (user && user.user_code) {
                // Tải lại tiến độ công việc
                await loadScheduleData(user.user_code);
            }
        } else {
            alert("Không thể cập nhật trạng thái công việc!");
        }
    } catch (err) {
        console.error("Lỗi toggle todo:", err);
    }
}