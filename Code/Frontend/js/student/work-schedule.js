// Biến lưu thông tin đề tài & giảng viên thu thập từ API
let currentScheduleTopicInfo = null;
let chatRoom = "INTERNAL";
let chatPollTimer = null;

const CHAT_AVATAR_PALETTE = [
    { background: "#EAF1FF", color: "#48638E" },
    { background: "#EAF5EE", color: "#4E7259" },
    { background: "#FBF2E5", color: "#8A6A3F" },
    { background: "#F1ECF8", color: "#6C5A8A" },
    { background: "#F8ECEF", color: "#875C69" },
    { background: "#E8F3F3", color: "#4C7070" },
    { background: "#EEF1F4", color: "#536474" },
    { background: "#E8F2F6", color: "#4A6978" }
];

function getChatAvatarColors(identifier) {
    const key = String(identifier || "").trim().toUpperCase();
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        hash = key.charCodeAt(i) + ((hash << 5) - hash);
    }
    return CHAT_AVATAR_PALETTE[Math.abs(hash) % CHAT_AVATAR_PALETTE.length];
}

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
    const bookingDateInput = document.getElementById("bookingDate");
    const bookingTimeStartInput = document.getElementById("bookingTimeStart");
    const bookingTimeEndInput = document.getElementById("bookingTimeEnd");

    async function loadAvailabilitySlots() {
        if (!availabilitySelect) return;
        availabilitySelect.value = "";
        bookingDateInput.value = "";
        bookingTimeStartInput.value = "";
        bookingTimeEndInput.value = "";
        if (!currentScheduleTopicInfo?.lecturer_code) {
            if (availabilityHint) availabilityHint.textContent = "Giảng viên chưa công khai khung giờ rảnh.";
            return;
        }

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
            if (availabilityHint) availabilityHint.textContent = slots.length
                ? "Ngày và giờ sẽ tự cập nhật theo khung giờ đã chọn."
                : "Giảng viên chưa công khai khung giờ rảnh.";
        } catch (error) {
            console.error("Lỗi tải khung giờ GVHD:", error);
            if (availabilityHint) availabilityHint.textContent = "Không thể tải khung giờ rảnh.";
        }
    }

    if (availabilitySelect) {
        availabilitySelect.addEventListener("change", () => {
            const option = availabilitySelect.options[availabilitySelect.selectedIndex];
            if (!option?.value) {
                bookingDateInput.value = "";
                bookingTimeStartInput.value = "";
                bookingTimeEndInput.value = "";
                return;
            }

            const slotDate = option.dataset.date || "";
            bookingDateInput.value = /^\d{4}-\d{2}-\d{2}/.test(slotDate) ? slotDate.slice(0, 10) : "";
            bookingTimeStartInput.value = option.dataset.start || "";
            bookingTimeEndInput.value = option.dataset.end || "";
            document.getElementById("bookingType").value = option.dataset.type;
            document.getElementById("bookingLocation").value = option.dataset.location;
        });
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
            const availabilityId = availabilitySelect ? availabilitySelect.value : "";
            const meetingDate = bookingDateInput ? bookingDateInput.value : "";
            const timeStart = bookingTimeStartInput ? bookingTimeStartInput.value : "";
            const timeEnd = bookingTimeEndInput ? bookingTimeEndInput.value : "";
            const type = document.getElementById("bookingType") ? document.getElementById("bookingType").value : "ONLINE";
            const location = document.getElementById("bookingLocation") ? document.getElementById("bookingLocation").value.trim() : "";

            if (!title || !availabilityId || !meetingDate || !timeStart || !timeEnd) {
                showAppNotification("Vui lòng điền tiêu đề và chọn khung giờ rảnh của giảng viên!");
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
                        availability_id: availabilityId,
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
            renderTopStats(data.stats, data.meetings || []);

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
    if (meetings) meetings.innerHTML = `<div class="empty-state-box"><div class="empty-state-icon muted"><i class="fa-solid fa-triangle-exclamation"></i></div><h4>Lỗi tải dữ liệu</h4><p style="color:#dc2626;">${escapeChatText(message)}</p></div>`;
    if (todos) todos.innerHTML = `<p style="text-align:center;color:#dc2626;padding:15px 0;font-size:13px;">${escapeChatText(message)}</p>`;
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
        newTodoInput.placeholder = "Nhập tên công việc cần làm...";
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
            container.innerHTML = `
                <div class="chat-empty">
                    <i class="fa-regular fa-comments" style="font-size: 38px; color: #94A3B8; margin-bottom: 10px; display: block;"></i>
                    Chưa có tin nhắn nào. Hãy gửi lời chào đầu tiên!
                </div>
            `;
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
            const avatarName = message.sender_name || message.sender_code;
            const avatarNameParts = String(avatarName || "").trim().split(/\s+/).filter(Boolean);
            const initialLetter = (avatarNameParts.length ? avatarNameParts[avatarNameParts.length - 1].charAt(0) : "U").toLocaleUpperCase("vi-VN");
            const avatarColors = getChatAvatarColors(message.sender_code || avatarName);
            const avatarStyle = mine ? "" : `background-color: ${avatarColors.background}; color: ${avatarColors.color};`;

            return `
                ${dayDivider}
                <div class="chat-message ${mine ? "mine" : ""}">
                    <span class="chat-avatar" style="${avatarStyle}">${mine ? '<i class="fa-solid fa-user"></i>' : escapeChatText(initialLetter)}</span>
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

    const members = Array.isArray(topic.members) ? topic.members : [];
    const memberCodes = [topic.leader_code, topic.member2_code, topic.member3_code]
        .filter(Boolean)
        .filter((code, index, codes) => codes.indexOf(code) === index);

    const options = ['<option value="">Cả nhóm</option>'];
    memberCodes.forEach(code => {
        const found = members.find(m => String(m.user_code).toUpperCase() === String(code).toUpperCase());
        const isMe = String(code).toUpperCase() === String(currentStudentCode).toUpperCase();
        const fullName = found?.full_name || code;
        const label = isMe ? `${fullName} (Tôi)` : fullName;
        options.push(`<option value="${code}" ${isMe ? "selected" : ""}>${escapeChatText(label)}</option>`);
    });

    todoAssignee.innerHTML = options.join("");
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
    if (chatMessages) chatMessages.innerHTML = '<div class="chat-empty"><i class="fa-solid fa-lock" style="font-size:32px;color:#94a3b8;margin-bottom:8px;display:block;"></i>Tính năng Chat sẽ mở sau khi đề tài được phê duyệt.</div>';
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
            <div class="empty-state-box" style="background: #FFFBEB; border-color: #FDE68A;">
                <div class="empty-state-icon" style="background: #FEF3C7; color: #D97706;">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                </div>
                <h4 style="color: #92400E;">Đề tài đang chờ phê duyệt</h4>
                <p style="color: #78350F;">
                    Đề tài của bạn hiện đang ở trạng thái <strong>Chờ duyệt</strong>. Tính năng Đặt lịch hẹn và Theo dõi lịch làm việc sẽ tự động kích hoạt sau khi Giảng viên hướng dẫn chấp nhận đề tài.
                </p>
                <a href="my-topic.html" class="btn-primary" style="background: #D97706; text-decoration: none;">
                    <i class="fa-solid fa-eye"></i> Kiểm tra trạng thái đề tài
                </a>
            </div>
        `;
    } else if (reason === "REJECTED") {
        messageHTML = `
            <div class="empty-state-box" style="background: #FEF2F2; border-color: #FECACA;">
                <div class="empty-state-icon" style="background: #FEE2E2; color: #DC2626;">
                    <i class="fa-solid fa-circle-xmark"></i>
                </div>
                <h4 style="color: #991B1B;">Đề tài đã bị từ chối</h4>
                <p style="color: #7F1D1D;">
                    Đăng ký đề tài của bạn không được chấp nhận. Vui lòng cập nhật lại đề tài hoặc liên hệ Giảng viên để biết thêm chi tiết.
                </p>
                <a href="student-dashboard.html" class="btn-primary" style="background: #DC2626; text-decoration: none;">
                    <i class="fa-solid fa-pen-to-square"></i> Cập nhật lại đề tài
                </a>
            </div>
        `;
    } else { // CHUA_DANG_KY
        messageHTML = `
            <div class="empty-state-box">
                <div class="empty-state-icon muted">
                    <i class="fa-solid fa-folder-plus"></i>
                </div>
                <h4>Bạn chưa đăng ký đề tài</h4>
                <p>
                    Bạn cần hoàn tất đăng ký đề tài thực tập tốt nghiệp trước khi sử dụng tính năng quản lý lịch làm việc và trao đổi với Giảng viên.
                </p>
                <a href="student-dashboard.html" class="btn-primary" style="text-decoration: none;">
                    <i class="fa-solid fa-paper-plane"></i> Đăng ký đề tài ngay
                </a>
            </div>
        `;
    }

    if (meetingsContainer) meetingsContainer.innerHTML = messageHTML;
    if (todoList) todoList.innerHTML = `<p style="color: #94a3b8; font-size: 13px; text-align: center; padding: 20px 0;">Tính năng tạm khóa cho đến khi đề tài được duyệt.</p>`;
}

// =========================================================
// RENDER KHỐI THỐNG KÊ TOP-BAR & 15 TUẦN LỘ TRÌNH
// =========================================================
function renderTopStats(stats, meetings = []) {
    if (!stats) return;
    const upcomingEl = document.getElementById("statUpcomingMeetings");
    const weekProgressEl = document.getElementById("statWeekProgress");
    const weekPercentBadge = document.getElementById("statWeekPercentBadge");
    const weekProgressBar = document.getElementById("statWeekProgressBar");
    const semesterLabel = document.getElementById("activeSemesterLabel");
    const upcomingDetailText = document.getElementById("statUpcomingDetailText");

    if (upcomingEl) {
        upcomingEl.textContent = `${String(stats.upcoming_meetings || 0).padStart(2, '0')} buổi`;
    }

    // Cập nhật thông tin buổi họp tới gần nhất nếu có
    if (upcomingDetailText) {
        const upcomingList = (meetings || []).filter(m => m.status === "APPROVED" || m.status === "PENDING");
        if (upcomingList.length > 0) {
            const nextM = upcomingList[0];
            const d = new Date(nextM.meeting_date);
            const dateStr = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
            upcomingDetailText.textContent = `Buổi tới: ${dateStr} (${nextM.time_start || ""})`;
        } else {
            upcomingDetailText.textContent = "Chưa có lịch họp sắp tới";
        }
    }

    const configuredWeeks = Number(stats.total_weeks);
    const totalWeeks = Number.isInteger(configuredWeeks) && configuredWeeks > 0 ? configuredWeeks : 15;
    const configuredCurrentWeek = Number(stats.current_week);
    const currentWeek = totalWeeks
        ? Math.min(totalWeeks, Math.max(1, Number.isInteger(configuredCurrentWeek) ? configuredCurrentWeek : 1))
        : 1;

    const weekPercent = Math.min(100, Math.round((currentWeek / totalWeeks) * 100));

    if (weekProgressEl) {
        weekProgressEl.innerHTML = `Tuần ${String(currentWeek).padStart(2, "0")} <small>/ ${totalWeeks}</small>`;
    }
    if (weekPercentBadge) {
        weekPercentBadge.textContent = `${weekPercent}%`;
    }
    if (weekProgressBar) {
        weekProgressBar.style.width = `${weekPercent}%`;
    }

    if (semesterLabel) {
        semesterLabel.innerHTML = `<i class="fa-regular fa-clock"></i> ${escapeChatText(stats.semester_name || "Học kỳ đang áp dụng")}`;
    }

    // Render lưới 15 tuần thực tập
    renderInternshipWeeks(currentWeek, totalWeeks);
}

function renderInternshipWeeks(currentWeek, totalWeeks) {
    const grid = document.getElementById("weeksGridContainer");
    if (!grid) return;

    const weeksCount = totalWeeks || 15;
    let html = "";
    for (let w = 1; w <= weeksCount; w++) {
        let stateClass = "upcoming";
        let stateTitle = `Tuần ${w}: Chưa diễn ra`;
        if (w < currentWeek) {
            stateClass = "done";
            stateTitle = `Tuần ${w}: Đã hoàn thành`;
        } else if (w === currentWeek) {
            stateClass = "active";
            stateTitle = `Tuần ${w}: Đang thực hiện`;
        }

        html += `
            <div class="week-cell ${stateClass}" title="${stateTitle}">
                <span class="week-num">T${String(w).padStart(2, '0')}</span>
                <span class="week-indicator"></span>
            </div>
        `;
    }
    grid.innerHTML = html;
}

// =========================================================
// RENDER DANH SÁCH LỊCH HỌP / BÁO CÁO
// =========================================================
function renderMeetingsList(meetings) {
    const container = document.getElementById("meetingsListContainer") || document.getElementById("meetingsContainer");
    if (!container) return;

    if (!meetings || meetings.length === 0) {
        container.innerHTML = `
            <div class="empty-state-box">
                <div class="empty-state-icon">
                    <i class="fa-regular fa-calendar-xmark"></i>
                </div>
                <h4>Chưa có lịch họp nào</h4>
                <p>Đặt lịch hẹn với giảng viên hướng dẫn để báo cáo tiến độ và nhận phản hồi định kỳ.</p>
                <button type="button" class="btn-primary" onclick="document.getElementById('btnOpenBookingModal')?.click()">
                    <i class="fa-solid fa-calendar-plus"></i> Đăng ký lịch hẹn ngay
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = meetings.map(item => {
        const dateObj = new Date(item.meeting_date);
        const day = dateObj.getDate();
        const monthYear = `Tháng ${dateObj.getMonth() + 1}, ${dateObj.getFullYear()}`;

        // Phân loại badge trạng thái
        let badgeClass = "badge-pending";
        let badgeText = "Chờ duyệt";

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
                ? `<p><i class="fa-solid fa-video text-blue"></i> Online: <a href="${item.location}" target="_blank" rel="noopener noreferrer">${item.location}</a></p>`
                : `<p><i class="fa-solid fa-video text-blue"></i> Hình thức: Online (${escapeChatText(item.location)})</p>`;
        } else {
            const locText = item.location.includes("Trực tiếp") ? item.location : `Trực tiếp (${item.location})`;
            locationHTML = `<p><i class="fa-solid fa-location-dot" style="color: #64748b;"></i> ${escapeChatText(locText)}</p>`;
        }

        // Khối Ghi chú sau họp (nếu có)
        const notesHTML = item.notes ? `
            <div class="meeting-notes">
                <strong><i class="fa-regular fa-note-sticky"></i> Ghi chú sau họp:</strong> ${escapeChatText(item.notes)}
            </div>
        ` : "";

        return `
            <div class="meeting-card ${item.status.toLowerCase()}">
                <div class="meeting-time-box">
                    <span class="m-day-large">${String(day).padStart(2, '0')}</span>
                    <span class="m-month-year">${monthYear}</span>
                    <span class="m-time-range"><i class="fa-regular fa-clock"></i> ${item.time_start} - ${item.time_end}</span>
                </div>
                <div class="meeting-details">
                    <div class="m-header">
                        <h4 class="m-title">${escapeChatText(item.title)}</h4>
                        <span class="m-status-badge ${badgeClass}">
                            <span class="badge-dot"></span>
                            <span>${badgeText}</span>
                        </span>
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

const TODO_AVATAR_PALETTE = ["#2563EB", "#059669", "#D97706", "#7C3AED", "#DB2777", "#0891B2", "#E11D48"];

function getTodoAvatarColor(str = "", isGroup = false) {
    if (isGroup) return "#64748B";
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return TODO_AVATAR_PALETTE[Math.abs(hash) % TODO_AVATAR_PALETTE.length];
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
        todoCounter.textContent = `${completedCount}/${todos.length} việc`;
    }

    if (!todos || todos.length === 0) {
        todoList.innerHTML = `
            <div class="empty-state-box" style="padding: 24px 16px;">
                <div class="empty-state-icon muted" style="width: 44px; height: 44px; font-size: 20px; margin-bottom: 8px;">
                    <i class="fa-solid fa-clipboard-check"></i>
                </div>
                <h4 style="font-size: 14.5px;">Tuần này chưa có việc nào</h4>
                <p style="font-size: 12.5px; margin-bottom: 0;">Thêm công việc đầu tiên ở form bên dưới để cùng nhau theo dõi.</p>
            </div>
        `;
        return;
    }

    const currentStudentCode = String(getAuthForRole("STUDENT")?.user?.user_code || "").trim().toUpperCase();
    const leaderCode = String(currentScheduleTopicInfo?.leader_code || "").trim().toUpperCase();

    const memberNameMap = new Map();
    if (Array.isArray(currentScheduleTopicInfo?.members)) {
        currentScheduleTopicInfo.members.forEach(m => {
            if (m.user_code && m.full_name) {
                memberNameMap.set(String(m.user_code).trim().toUpperCase(), m.full_name);
            }
        });
    }

    todoList.innerHTML = todos.map((item) => {
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
        
        let dueLabel = "Chưa đặt hạn";
        if (dueDay) {
            const dateStr = dueDay.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
            if (isCompleted) {
                dueLabel = `Đã xong (${dateStr})`;
            } else if (isOverdue) {
                dueLabel = `Quá hạn: ${dateStr}`;
            } else if (isDueSoon) {
                dueLabel = `Sắp hạn: ${dateStr}`;
            } else {
                dueLabel = `Hạn: ${dateStr}`;
            }
        }

        const dueClass = !dueDay ? 'none' : isCompleted ? 'completed' : isOverdue ? 'overdue' : isDueSoon ? 'soon' : 'pending';

        const assignedCode = String(item.assigned_to || "").trim().toUpperCase();
        let assigneeDisplay = "Cả nhóm";
        let isGroup = true;
        if (assignedCode) {
            isGroup = false;
            assigneeDisplay = item.assigned_to_name || memberNameMap.get(assignedCode) || item.assigned_to;
        }

        const words = String(assigneeDisplay || "").trim().split(/\s+/).filter(Boolean);
        const avatarInitials = isGroup
            ? '<i class="fa-solid fa-users" style="font-size: 8px;"></i>'
            : (words.length ? words.slice(-2).map(w => w.charAt(0).toLocaleUpperCase("vi-VN")).join("") : "U");
        const avatarBg = getTodoAvatarColor(assigneeDisplay, isGroup);

        return `
            <div class="todo-item ${isCompleted ? 'done' : ''}" data-id="${item._id}">
                <div class="todo-content">
                    <div class="todo-title-row">
                        <strong class="todo-title" title="${escapeChatText(item.title)}">${escapeChatText(item.title)}</strong>
                        <select class="todo-status-select ${statusClass}" aria-label="Trạng thái công việc" onchange="updateTodoStatus('${item._id}', this.value)">
                            <option value="NOT_STARTED" ${status === "NOT_STARTED" ? "selected" : ""}>Chưa hoàn thành</option>
                            <option value="IN_PROGRESS" ${status === "IN_PROGRESS" ? "selected" : ""}>Đang thực hiện</option>
                            <option value="COMPLETED" ${status === "COMPLETED" ? "selected" : ""}>Đã hoàn thành</option>
                        </select>
                    </div>
                    <div class="todo-meta-row">
                        <span class="todo-assignee-badge">
                            <span class="todo-assignee-avatar" style="background-color: ${avatarBg};">${avatarInitials}</span>
                            <span>${escapeChatText(assigneeDisplay)}</span>
                        </span>
                        <span class="todo-deadline ${dueClass}">
                            <i class="fa-regular fa-calendar"></i> ${dueLabel}
                        </span>
                    </div>
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
    const percentBadge = document.getElementById("statTodoPercentBadge");
    const progressBar = document.getElementById("statTodoProgressBar");
    const miniProgressBar = document.getElementById("todoMiniProgressBar");

    const total = todos.length;
    const completedCount = todos.filter(todo => getTodoStatus(todo) === "COMPLETED").length;
    const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;

    if (progressEl) {
        progressEl.innerHTML = `${completedCount} <small>/ ${total}</small>`;
    }
    if (percentBadge) {
        percentBadge.textContent = `${percent}%`;
    }
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
    if (miniProgressBar) {
        miniProgressBar.style.width = `${percent}%`;
    }
}
