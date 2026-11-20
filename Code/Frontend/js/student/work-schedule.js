// Biến lưu thông tin đề tài & giảng viên thu thập từ API
let currentScheduleTopicInfo = null;
let chatRoom = "INTERNAL";
let chatPollTimer = null;

function getAuthForRole(role) {
    const activeSession = sessionStorage.getItem("activeAuth");
    if (activeSession) {
        try {
            const sessionAuth = JSON.parse(activeSession);
            if (sessionAuth?.user?.role === role) return sessionAuth;
        } catch (error) {
            sessionStorage.removeItem("activeAuth");
        }
    }

    return null;
}

document.addEventListener("DOMContentLoaded", async () => {
    // 1. KIỂM TRA ĐĂNG NHẬP
    const auth = getAuthForRole("STUDENT") || { token: null, user: null };
    const user = auth?.user;
    const token = auth?.token;

    if (!user || user.role !== "STUDENT") {
        window.location.href = "../auth/index.html";
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
    const availabilitySelect = document.getElementById("bookingAvailability");
    const availabilityHint = document.getElementById("availabilityHint");

    async function loadAvailabilitySlots() {
        if (!availabilitySelect || !currentScheduleTopicInfo?.lecturer_code) return;
        try {
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/schedule/availability/${encodeURIComponent(currentScheduleTopicInfo.lecturer_code)}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const result = await response.json();
            const slots = (result.data || []).filter(slot => (slot.booked_count || 0) < (slot.max_bookings || 3));
            availabilitySelect.innerHTML = '<option value="">-- Chọn khung giờ rảnh --</option>' + slots.map(slot => {
                const dateObj = new Date(slot.available_date);
                const date = dateObj.toLocaleDateString("vi-VN");
                const mode = slot.type === "ONLINE" ? "Online" : "Offline";
                return `<option value="${slot._id}" data-date="${slot.available_date}" data-start="${slot.time_start}" data-end="${slot.time_end}" data-type="${slot.type}" data-location="${slot.location || ""}">${date} | ${slot.time_start} - ${slot.time_end} | ${mode} | Còn ${Math.max(0, (slot.max_bookings || 3) - (slot.booked_count || 0))} chỗ</option>`;
            }).join("");
            if (availabilityHint) availabilityHint.textContent = slots.length ? "Chọn một khung giờ để đặt lịch." : "Giảng viên chưa công khai khung giờ rảnh.";
        } catch (error) {
            if (availabilityHint) availabilityHint.textContent = "Không thể tải khung giờ rảnh.";
        }
    }

    if (availabilitySelect) {
        availabilitySelect.addEventListener("change", () => {
            const option = availabilitySelect.options[availabilitySelect.selectedIndex];
            if (!option?.value) return;
            const date = new Date(option.dataset.date);
            const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            document.getElementById("bookingDate").value = localDate;
            document.getElementById("bookingTimeStart").value = option.dataset.start;
            document.getElementById("bookingTimeEnd").value = option.dataset.end;
            document.getElementById("bookingType").value = option.dataset.type;
            document.getElementById("bookingLocation").value = option.dataset.location;
        });
    }

    // Mặc định chọn ngày mai cho ô Input Date
    const dateInput = document.getElementById("bookingDate");
    if (dateInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateInput.valueAsDate = tomorrow;
    }

    const openModal = () => {
        if (modal) modal.style.display = "flex";
        loadAvailabilitySlots();
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
                showAppNotification("Bạn chưa đăng ký đề tài hoặc đề tài chưa được duyệt nên chưa thể đặt lịch hẹn!");
                return;
            }

            const title = document.getElementById("bookingTitle") ? document.getElementById("bookingTitle").value.trim() : "";
            const meetingDate = document.getElementById("bookingDate") ? document.getElementById("bookingDate").value : "";
            const timeStart = document.getElementById("bookingTimeStart") ? document.getElementById("bookingTimeStart").value : "09:00";
            const timeEnd = document.getElementById("bookingTimeEnd") ? document.getElementById("bookingTimeEnd").value : "10:00";
            const type = document.getElementById("bookingType") ? document.getElementById("bookingType").value : "ONLINE";
            const location = document.getElementById("bookingLocation") ? document.getElementById("bookingLocation").value.trim() : "";

            if (!title || !meetingDate) {
                showAppNotification("Vui lòng điền đầy đủ tiêu đề và ngày họp!");
                return;
            }

            try {
                const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/schedule/meetings/create", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        topic_id: currentScheduleTopicInfo.id,
                        availability_id: availabilitySelect ? availabilitySelect.value : "",
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
                    showAppNotification(result.message || "Đã gửi yêu cầu đặt lịch cho Giảng viên hướng dẫn!");
                    closeModal();
                    bookingForm.reset();
                    // Tải lại dữ liệu trang
                    await loadScheduleData(user.user_code);
                } else {
                    showAppNotification(result.message || "Không thể đặt lịch hẹn!");
                }
            } catch (err) {
                console.error("Lỗi gửi lịch hẹn:", err);
                showAppNotification("Lỗi kết nối máy chủ khi gửi yêu cầu đặt lịch!");
            }
        });
    }

    // 4. XỬ LÝ TODO CHECKLIST (THÊM VIỆC MỚI)
    const newTodoInput = document.getElementById("newTodoInput");
    const todoDueDate = document.getElementById("todoDueDate");
    const todoAssignee = document.getElementById("todoAssignee");
    const btnAddTodo = document.getElementById("btnAddTodo");

    const addTodo = async () => {
        if (!newTodoInput) return;
        const text = newTodoInput.value.trim();
        if (!text) return;

        // Bổ sung kiểm tra an toàn: Không cho tạo task khi đề tài chưa được duyệt
        if (!currentScheduleTopicInfo) {
            showAppNotification("Vui lòng đợi đề tài được phê duyệt để sử dụng danh sách công việc!");
            return;
        }

        try {
            const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/schedule/todos/add", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    student_code: user.user_code,
                    topic_id: currentScheduleTopicInfo.id,
                    assigned_to: todoAssignee ? todoAssignee.value : "",
                    due_date: todoDueDate ? todoDueDate.value : "",
                    title: text
                })
            });

            const result = await response.json();

            if (response.ok) {
                newTodoInput.value = "";
                if (todoDueDate) todoDueDate.value = "";
                // Tải lại dữ liệu để hiển thị task mới tạo từ DB
                await loadScheduleData(user.user_code);
            } else {
                showAppNotification(result.message || "Không thể thêm công việc!");
            }
        } catch (err) {
            console.error("Lỗi thêm task:", err);
            showAppNotification("Lỗi kết nối máy chủ khi thêm công việc!");
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
            window.location.href = "../auth/index.html";
        });
    }

    // Đóng modal khi bấm ra ngoài vùng nền mờ
    window.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
        if (e.target === logoutModal && logoutModal) logoutModal.style.display = "none";
    });
});

// =========================================================
// HÀM CALL API LẤY TOÀN BỘ DỮ LIỆU ĐỂ RENDER
// =========================================================
async function loadScheduleData(studentCode) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 12000);
    try {
        const token = getAuthForRole("STUDENT")?.token;
        const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/schedule/my-schedule/${studentCode}`, {
            signal: controller.signal,
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
            let errorMessage = "Không thể tải dữ liệu lịch làm việc.";
            try {
                const errorData = await res.json();
                errorMessage = errorData.message || errorMessage;
            } catch {}
            renderScheduleLoadError(errorMessage);
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
            renderTodoAssigneeOptions(data.topic, studentCode);
            unlockScheduleControls();
            setupGroupChat(data.topic, studentCode);

            // Render các con số thống kê ở Top-bar
            renderTopStats(data.stats);

            // Render danh sách Cuộc họp / Báo cáo
            renderMeetingsList(data.meetings || []);

            // Render danh sách To-do list
            renderTodoList(data.todos || []);
            renderTodoProgress(data.todos || []);
        }
    } catch (err) {
        console.error("Lỗi khi kết nối API schedule:", err);
        renderScheduleLoadError(err.name === "AbortError"
            ? "Máy chủ không phản hồi. Vui lòng thử tải lại trang."
            : "Lỗi kết nối máy chủ. Vui lòng thử lại.");
    } finally {
        window.clearTimeout(timeoutId);
    }
}

function renderScheduleLoadError(message) {
    const meetings = document.getElementById("meetingsListContainer");
    const todos = document.getElementById("todoList");
    const chatMessages = document.getElementById("chatMessages");
    if (meetings) meetings.innerHTML = `<p style="text-align:center;color:#dc2626;padding:20px;">${escapeChatText(message)}</p>`;
    if (todos) todos.innerHTML = `<p style="text-align:center;color:#dc2626;padding:15px 0;">${escapeChatText(message)}</p>`;
    if (chatMessages) chatMessages.innerHTML = `<p class="chat-empty">${escapeChatText(message)}</p>`;
    const chatInput = document.getElementById("chatInput");
    const chatForm = document.getElementById("chatForm");
    if (chatInput) chatInput.disabled = true;
    if (chatForm?.querySelector('button[type="submit"]')) chatForm.querySelector('button[type="submit"]').disabled = true;
}

// =========================================================
// HÀM MỞ KHÓA GIAO DIỆN KHI ĐỀ TÀI HỢP LỆ (APPROVED)
// =========================================================
function unlockScheduleControls() {
    const btnOpenBooking = document.getElementById("btnOpenBookingModal");
    const newTodoInput = document.getElementById("newTodoInput");
    const btnAddTodo = document.getElementById("btnAddTodo");
    const todoAssignee = document.getElementById("todoAssignee");
    const chatInput = document.getElementById("chatInput");
    const chatForm = document.getElementById("chatForm");

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
    if (todoAssignee) todoAssignee.disabled = false;
    if (chatInput) chatInput.disabled = false;
    if (chatForm?.querySelector('button[type="submit"]')) chatForm.querySelector('button[type="submit"]').disabled = false;
}

function setupGroupChat(topic, studentCode) {
    const chatInput = document.getElementById("chatInput");
    const chatForm = document.getElementById("chatForm");
    const chatSubtitle = document.getElementById("chatSubtitle");
    const lecturerTab = document.getElementById("lecturerChatTab");
    const isLeader = String(topic.leader_code || "").toUpperCase() === String(studentCode || "").toUpperCase();

    if (lecturerTab) lecturerTab.disabled = !isLeader;
    if (!isLeader) {
        chatRoom = "INTERNAL";
    }

    document.querySelectorAll(".chat-tab").forEach(tab => {
        tab.classList.toggle("active", tab.dataset.chatRoom === chatRoom);
        tab.onclick = () => {
            if (tab.disabled) return;
            chatRoom = tab.dataset.chatRoom;
            document.querySelectorAll(".chat-tab").forEach(item => item.classList.toggle("active", item === tab));
            if (chatSubtitle) chatSubtitle.textContent = chatRoom === "LECTURER"
                ? "Trao đổi riêng giữa trưởng nhóm và giảng viên hướng dẫn"
                : "Trao đổi nhanh với thành viên trong nhóm";
            loadChatMessages(topic);
        };
    });

    if (chatForm) {
        chatForm.onsubmit = async event => {
            event.preventDefault();
            const content = chatInput?.value.trim();
            if (!content) return;
            await sendChatMessage(topic, content);
        };
    }

    loadChatMessages(topic);
    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = setInterval(() => loadChatMessages(topic), 5000);
}

async function loadChatMessages(topic) {
    const container = document.getElementById("chatMessages");
    const topicId = topic?._id || topic?.id;
    if (!container || !topicId) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);
    try {
        const auth = getAuthForRole("STUDENT");
        const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/chat/topics/${encodeURIComponent(topicId)}?room=${chatRoom}`, {
            signal: controller.signal,
            headers: { "Authorization": `Bearer ${auth?.token || ""}` }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể tải tin nhắn.");
        if (window.refreshChatUnreadSidebar) await window.refreshChatUnreadSidebar();
        const messages = result.data || [];
        if (!messages.length) {
            container.innerHTML = '<p class="chat-empty">Chưa có tin nhắn nào.</p>';
            return;
        }

        const userCode = String(auth?.user?.user_code || "").toUpperCase();
        let previousDay = "";
        container.innerHTML = messages.map(message => {
            const mine = String(message.sender_code || "").toUpperCase() === userCode;
            const createdAt = new Date(message.created_at);
            const time = createdAt.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
            const dayKey = createdAt.toLocaleDateString("vi-VN");
            const dayDivider = dayKey !== previousDay
                ? `<div class="chat-day-separator"><span>${formatChatDay(createdAt)}</span></div>`
                : "";
            previousDay = dayKey;
            const senderName = mine ? "Bạn" : (message.sender_name || message.sender_code);
            return `
                ${dayDivider}
                <div class="chat-message ${mine ? "mine" : ""}">
                    <span class="chat-avatar"><i class="fa-solid fa-user"></i></span>
                    <div class="chat-message-body">
                        <div class="chat-meta"><span>${escapeChatText(senderName)}</span><span>${time}</span></div>
                        <div class="chat-bubble">${escapeChatText(message.content)}</div>
                    </div>
                </div>
            `;
        }).join("");
        container.scrollTop = container.scrollHeight;
    } catch (error) {
        container.innerHTML = `<p class="chat-empty">${escapeChatText(error.message)}</p>`;
    } finally {
        window.clearTimeout(timeoutId);
    }
}

async function sendChatMessage(topic, content) {
    const auth = getAuthForRole("STUDENT");
    const input = document.getElementById("chatInput");
    const topicId = topic?._id || topic?.id;
    if (!topicId) return;
    try {
        const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/chat/topics/${encodeURIComponent(topicId)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${auth?.token || ""}`
            },
            body: JSON.stringify({ room_type: chatRoom, content })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể gửi tin nhắn.");
        if (input) input.value = "";
        await loadChatMessages(topic);
    } catch (error) {
        showAppNotification(error.message);
    }
}

function escapeChatText(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatChatDay(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const formatDate = value => value.toLocaleDateString("vi-VN");
    if (formatDate(date) === formatDate(today)) return `Hôm nay, ${formatDate(date)}`;
    if (formatDate(date) === formatDate(yesterday)) return `Hôm qua, ${formatDate(date)}`;
    return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

window.addEventListener("chat:unread-updated", event => {
    const roomCounts = new Map((event.detail.rooms || []).map(room => [
        room.room_type,
        Number(room.unread_count) || 0
    ]));
    setChatUnreadBadge("internalChatBadge", roomCounts.get("INTERNAL") || 0);
    setChatUnreadBadge("lecturerChatBadge", roomCounts.get("LECTURER") || 0);
});

function setChatUnreadBadge(elementId, count) {
    const badge = document.getElementById(elementId);
    if (!badge) return;
    const unreadCount = Math.max(0, Number(count) || 0);
    badge.hidden = unreadCount === 0;
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.setAttribute("aria-label", `${unreadCount} tin nhắn chưa đọc`);
}

function renderTodoAssigneeOptions(topic, currentStudentCode) {
    const todoAssignee = document.getElementById("todoAssignee");
    if (!todoAssignee || !topic) return;

    const memberCodes = [topic.leader_code, topic.member2_code, topic.member3_code]
        .filter(Boolean)
        .filter((code, index, codes) => codes.indexOf(code) === index);

    todoAssignee.innerHTML = '<option value="">Cả nhóm</option>' + memberCodes
        .map(code => `<option value="${code}" ${code === currentStudentCode ? "selected" : ""}>${code === currentStudentCode ? "Tôi" : code}</option>`)
        .join("");
}

// =========================================================
// HÀM KHÓA TRANG LỊCH LÀM VIỆC KHI ĐỀ TÀI CHƯA ĐƯỢC DUYỆT
// =========================================================
function renderScheduleLockedState(reason) {
    currentScheduleTopicInfo = null;
    if (chatPollTimer) clearInterval(chatPollTimer);
    const chatMessages = document.getElementById("chatMessages");
    const chatInput = document.getElementById("chatInput");
    const chatForm = document.getElementById("chatForm");
    const lecturerChatTab = document.getElementById("lecturerChatTab");
    if (chatMessages) chatMessages.innerHTML = '<p class="chat-empty">Chat sẽ mở sau khi đề tài được duyệt.</p>';
    if (chatInput) chatInput.disabled = true;
    if (chatForm) chatForm.querySelector("button").disabled = true;
    if (lecturerChatTab) lecturerChatTab.disabled = true;

    const btnOpenBooking = document.getElementById("btnOpenBookingModal");
    const meetingsContainer = document.getElementById("meetingsListContainer") || document.getElementById("meetingsContainer");
    const todoList = document.getElementById("todoList");
    const todoCounter = document.getElementById("todoCounter");
    const newTodoInput = document.getElementById("newTodoInput");
    const btnAddTodo = document.getElementById("btnAddTodo");
    const todoAssignee = document.getElementById("todoAssignee");

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
    if (todoAssignee) todoAssignee.disabled = true;

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
    const semesterLabel = document.getElementById("activeSemesterLabel");
    const timelineTotalWeeks = document.getElementById("timelineTotalWeeks");

    if (upcomingEl) {
        upcomingEl.textContent = `${String(stats.upcoming_meetings || 0).padStart(2, '0')} buổi`;
    }
    const configuredWeeks = Number(stats.total_weeks);
    const totalWeeks = Number.isInteger(configuredWeeks) && configuredWeeks > 0 ? configuredWeeks : 0;
    const configuredCurrentWeek = Number(stats.current_week);
    const currentWeek = totalWeeks
        ? Math.min(totalWeeks, Math.max(1, Number.isInteger(configuredCurrentWeek) ? configuredCurrentWeek : 1))
        : 0;
    if (weekProgressEl) {
        if (totalWeeks) {
            const currentWeekLabel = document.createTextNode(`Tuần ${String(currentWeek).padStart(2, "0")} `);
            const totalLabel = document.createElement("small");
            totalLabel.style.cssText = "font-size: 14px; color: #64748b; font-weight: normal;";
            totalLabel.textContent = `/ ${totalWeeks}`;
            weekProgressEl.replaceChildren(currentWeekLabel, totalLabel);
        } else {
            weekProgressEl.textContent = "Chưa cấu hình";
        }
    }
    if (semesterLabel) {
        semesterLabel.textContent = stats.semester_name || "Chưa có học kỳ áp dụng";
    }
    if (timelineTotalWeeks) timelineTotalWeeks.textContent = totalWeeks || "--";
    renderInternshipTimeline(currentWeek, totalWeeks);
}

function renderInternshipTimeline(currentWeek, totalWeeks) {
    const timelineItems = [...document.querySelectorAll(".timeline-item[data-phase]")];
    if (!totalWeeks) {
        timelineItems.forEach(item => { item.hidden = true; });
        return;
    }

    const phaseCount = Math.min(timelineItems.length, totalWeeks);
    const endRatios = [0.2, 0.6, 13 / 15];
    let previousEnd = 0;

    timelineItems.forEach((item, index) => {
        if (index >= phaseCount) {
            item.hidden = true;
            return;
        }

        item.hidden = false;
        const endWeek = index < phaseCount - 1
            ? Math.min(totalWeeks - (phaseCount - index - 1), Math.max(previousEnd + 1, Math.round(totalWeeks * endRatios[index])))
            : totalWeeks;
        const startWeek = previousEnd + 1;
        const weekRange = startWeek === endWeek ? `Tuần ${startWeek}` : `Tuần ${startWeek} - Tuần ${endWeek}`;
        const title = item.querySelector("h5");
        if (title) {
            const phaseTitle = title.dataset.phaseTitle || title.textContent.replace(/^Tuần \d+(?: - Tuần \d+)?:\s*/, "");
            title.dataset.phaseTitle = phaseTitle;
            title.textContent = `${weekRange}: ${phaseTitle}`;
        }

        item.classList.toggle("done", currentWeek > endWeek);
        item.classList.toggle("active", currentWeek >= startWeek && currentWeek <= endWeek);
        previousEnd = endWeek;
    });
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
        const completedCount = todos.filter(todo => getTodoStatus(todo) === "COMPLETED").length;
        todoCounter.textContent = `${completedCount}/${todos.length}`;
    }

    if (todos.length === 0) {
        todoList.innerHTML = `<p style="color: #94a3b8; font-size: 13px; text-align: center; padding: 10px 0;">Chưa có việc cần làm.</p>`;
        return;
    }

    const currentStudentCode = String(getAuthForRole("STUDENT")?.user?.user_code || "").trim().toUpperCase();
    const leaderCode = String(currentScheduleTopicInfo?.leader_code || "").trim().toUpperCase();
    todoList.innerHTML = todos.map((item, index) => {
        const status = getTodoStatus(item);
        const isCompleted = status === "COMPLETED";
        const creatorCode = String(item.created_by || item.student_code || "").trim().toUpperCase();
        const canDelete = currentStudentCode && (currentStudentCode === creatorCode || currentStudentCode === leaderCode);
        const dueDay = getTodoDueDay(item.due_date);
        const now = new Date();
        const todayOrdinal = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        const dueOrdinal = dueDay ? Date.UTC(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate()) : null;
        const daysUntilDue = dueOrdinal === null ? null : Math.round((dueOrdinal - todayOrdinal) / 86400000);
        const isOverdue = !isCompleted && daysUntilDue !== null && daysUntilDue < 0;
        const isDueSoon = !isCompleted && daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 2;
        const statusClass = status === "COMPLETED" ? "completed" : status === "IN_PROGRESS" ? "in-progress" : "pending";
        const dueLabel = dueDay
            ? isOverdue
                ? `Quá hạn ${dueDay.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
                : `Hạn ${dueDay.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}`
            : 'Chưa đặt hạn';
        const dueClass = !dueDay ? 'none' : isCompleted ? 'completed' : isOverdue ? 'overdue' : isDueSoon ? 'soon' : 'pending';

        return `
        <div class="todo-item todo-tone-${index % 4} ${isCompleted ? 'done' : ''} ${isOverdue ? 'todo-overdue' : ''}" data-id="${item._id}">
            <div class="todo-content">
                <div class="todo-title-row">
                    <strong class="todo-title">${item.title}</strong>
                    <select class="todo-status-select ${statusClass}" aria-label="Trạng thái công việc" onchange="updateTodoStatus('${item._id}', this.value)">
                        <option value="NOT_STARTED" ${status === "NOT_STARTED" ? "selected" : ""}>Chưa hoàn thành</option>
                        <option value="IN_PROGRESS" ${status === "IN_PROGRESS" ? "selected" : ""}>Đang thực hiện</option>
                        <option value="COMPLETED" ${status === "COMPLETED" ? "selected" : ""}>Đã hoàn thành</option>
                    </select>
                </div>
                <small class="todo-meta">${item.assigned_to ? `Phụ trách: ${item.assigned_to}` : "Phụ trách: Cả nhóm"}${item.created_by ? ` · Tạo bởi ${item.created_by}` : ""}</small>
                <small class="todo-deadline ${dueClass}"><i class="fa-regular fa-calendar"></i> ${dueLabel}</small>
            </div>
            ${canDelete ? `<button type="button" class="todo-delete-btn" aria-label="Xóa công việc" title="Xóa công việc" onclick="deleteTodo('${item._id}')"><i class="fa-regular fa-trash-can"></i></button>` : ""}
        </div>
    `;
    }).join("");
}

function getTodoStatus(todo) {
    if (["NOT_STARTED", "IN_PROGRESS", "COMPLETED"].includes(todo.status)) return todo.status;
    return todo.is_completed === true ? "COMPLETED" : "NOT_STARTED";
}

function getTodoDueDay(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const dueDay = new Date(year, month, day);
    if (dueDay.getFullYear() !== year || dueDay.getMonth() !== month || dueDay.getDate() !== day) return null;
    return dueDay;
}

// =========================================================
// HÀM TOGGLE CẬP NHẬT TRẠNG THÁI CHECKBOX KHI USER CLICK
// =========================================================
async function updateTodoStatus(todoId, status) {
    try {
        const token = getAuthForRole("STUDENT")?.token;
        const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/schedule/todos/toggle/${todoId}`, {
            method: "PATCH",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status })
        });

        if (res.ok) {
            const auth = getAuthForRole("STUDENT");
            const user = auth?.user || null;
            if (user && user.user_code) {
                // Tải lại tiến độ công việc
                await loadScheduleData(user.user_code);
            }
        } else {
            const result = await res.json();
            throw new Error(result.message || "Không thể cập nhật trạng thái công việc.");
        }
    } catch (err) {
        console.error("Lỗi cập nhật trạng thái công việc:", err);
        showAppNotification(err.message || "Không thể cập nhật trạng thái công việc.");
    }
}

async function deleteTodo(todoId) {
    try {
        if (typeof window.showConfirmDialog !== "function") {
            throw new Error("Không thể mở hộp thoại xác nhận xóa.");
        }
        const confirmed = await window.showConfirmDialog({
            title: "Xóa công việc?",
            message: "Công việc này sẽ bị xóa khỏi danh sách của cả nhóm.",
            confirmText: "Xóa công việc",
            danger: true
        });
        if (!confirmed) return;

        const auth = getAuthForRole("STUDENT");
        const userCode = auth?.user?.user_code;
        if (!userCode) throw new Error("Vui lòng đăng nhập lại để xóa công việc.");

        const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/schedule/todos/${encodeURIComponent(todoId)}`, {
            method: "DELETE"
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.message || "Không thể xóa công việc.");

        await loadScheduleData(userCode);
        showAppNotification(result.message || "Đã xóa công việc.", "success");
    } catch (err) {
        console.error("Lỗi xóa công việc:", err);
        showAppNotification(err.message || "Không thể xóa công việc.");
    }
}

function renderTodoProgress(todos) {
    const progressEl = document.getElementById("statTodoProgress");
    if (!progressEl) return;

    const completedCount = todos.filter(todo => getTodoStatus(todo) === "COMPLETED").length;
    progressEl.innerHTML = `${completedCount} <small>/ ${todos.length}</small>`;
}