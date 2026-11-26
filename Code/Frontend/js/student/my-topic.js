// Biến toàn cục lưu thông tin đề tài sau khi load
let currentTopicData = null;
let lecturerMilestones = [];
let milestoneSubmissionHistory = [];
let milestoneLoadError = false;
const pendingMilestoneFiles = {};

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

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

document.addEventListener("DOMContentLoaded", async () => {
    
    // 1. KIỂM TRA PHIÊN ĐĂNG NHẬP
    const auth = getAuthForRole("STUDENT") || { token: null, user: null };
    const user = auth?.user;
    const token = auth?.token;
    document.addEventListener("click", async event => {
        const link = event.target.closest(".protected-submission-file");
        if (!link) return;
        event.preventDefault();
        try {
            const fileName = link.dataset.fileName || "bao-cao";
            const isPdf = /\.pdf$/i.test(fileName);
            const response = await apiFetch(link.href, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Không thể tải tệp báo cáo.");
            const blob = await response.blob();
            const fileBlob = isPdf ? new Blob([blob], { type: "application/pdf" }) : blob;
            const fileUrl = URL.createObjectURL(fileBlob);

            if (isPdf) {
                // Với file PDF: Mở tab mới để xem trực tiếp
                window.open(fileUrl, "_blank");
                window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60000);
            } else {
                // Với các file khác (.docx, .zip,...): Tự động tải về máy
                const downloadLink = document.createElement("a");
                downloadLink.href = fileUrl;
                downloadLink.download = fileName;
                downloadLink.click();
                window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
            }
        } catch (error) {
            showAppNotification(error.message || "Không thể tải tệp báo cáo.");
        }
    });

    if (!user || user.role !== "STUDENT") {
        window.location.href = "../auth/index.html";
        return;
    }

    // Hiển thị thông tin Header
    if (user.full_name) {
        const userNameEl = document.getElementById("userName");
        if (userNameEl) userNameEl.textContent = user.full_name;
    }
    if (user.user_code) {
        const userCodeEl = document.getElementById("userCode");
        if (userCodeEl) userCodeEl.textContent = user.user_code;
    }

    // 2. TẢI DỮ LIỆU ĐỀ TÀI TỪ BACKEND
    await loadMyTopic(user.user_code);

    // 3. SỰ KIỆN HỦY ĐĂNG KÝ ĐỀ TÀI
    const btnCancelTopic = document.getElementById("btnCancelTopic");
    if (btnCancelTopic) {
        const isLeader = String(currentTopicData?.leader_code || '').toUpperCase() ===
            String(user.user_code || '').toUpperCase();
        btnCancelTopic.hidden = !isLeader;
        btnCancelTopic.addEventListener("click", async () => {
            if (!currentTopicData || !currentTopicData._id) {
                showAppNotification("Bạn chưa có đề tài nào để hủy!");
                return;
            }
            if (String(currentTopicData.leader_code || '').toUpperCase() !== String(user.user_code || '').toUpperCase()) {
                showAppNotification("Chỉ Trưởng nhóm mới có thể hủy đề tài.");
                return;
            }

            if (currentTopicData.status === "APPROVED") {
                showAppNotification("Đề tài đã được phê duyệt! Bạn không thể tự hủy, vui lòng liên hệ Giảng viên.");
                return;
            }

            const confirmCancel = await window.showConfirmDialog({
                title: "Xác nhận hủy đăng ký đề tài",
                message: "Bạn có chắc chắn muốn hủy đăng ký đề tài này để đăng ký đề tài khác không?",
                confirmText: "Hủy đăng ký",
                danger: true
            });
            if (confirmCancel) {
                try {
                    const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/delete/${currentTopicData._id}`, {
                        method: "DELETE",
                        headers: {
                            "Authorization": `Bearer ${token}`
                        }
                    });
                    
                    const result = await res.json();

                    if (res.ok) {
                        showAppNotification(result.message || "Đã hủy đề tài thành công!");
                        window.location.href = "student-dashboard.html";
                    } else {
                        showAppNotification(result.message || "Không thể hủy đề tài!");
                    }
                } catch (err) {
                    console.error("Lỗi khi hủy đề tài:", err);
                    showAppNotification("Lỗi kết nối máy chủ khi hủy đề tài!");
                }
            }
        });
    }

    // 4. XỬ LÝ ĐĂNG XUẤT (MODAL CONFIRMATION)
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
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

    window.addEventListener("click", (e) => {
        if (e.target === logoutModal) {
            logoutModal.style.display = "none";
        }
    });
});

// =========================================================
// HÀM CHUYỂN ĐỔI MSSV -> "HỌ VÀ TÊN (MSSV)"
// =========================================================
async function getUserDisplayName(userCode, includeCode = true) {
    if (!userCode || userCode === "N/A" || userCode === "null") {
        return includeCode ? "Không có" : "Giảng viên hướng dẫn";
    }
    
    try {
        const token = getAuthForRole("STUDENT")?.token;
        const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/users/${userCode}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data && data.full_name) {
                return includeCode ? `${data.full_name} (${userCode})` : data.full_name;
            }
        }
    } catch (err) {
        console.error("Lỗi khi lấy thông tin người dùng:", err);
    }
    
    return includeCode ? userCode : "Giảng viên hướng dẫn";
}

// =========================================================
// HÀM ĐỊNH DẠNG HÀNG THÀNH VIÊN / GIẢNG VIÊN ĐỒNG BỘ
// =========================================================
function formatMemberItem(rowElId, avatarElId, valueElId, displayText, roleType) {
    const rowEl = document.getElementById(rowElId);
    const avatarEl = document.getElementById(avatarElId);
    const valueEl = document.getElementById(valueElId);
    if (!valueEl) return;

    const trimmed = String(displayText || "").trim();
    const isNone = !trimmed || trimmed === "--" || trimmed.includes("Không có") || trimmed === "Chưa đăng ký" || trimmed === "null" || trimmed === "N/A";

    if (isNone) {
        if (rowEl) {
            rowEl.classList.add("is-empty-placeholder");
            rowEl.classList.remove("is-filled");
        }
        if (avatarEl) {
            avatarEl.innerHTML = '<i class="fa-solid fa-user-slash"></i>';
            avatarEl.className = "member-avatar avatar-empty";
        }
        valueEl.innerHTML = `<span class="member-empty-text">${escapeHtml(trimmed || "Không có")}</span>`;
        return;
    }

    if (rowEl) {
        rowEl.classList.remove("is-empty-placeholder");
        rowEl.classList.add("is-filled");
    }

    // Tách "Họ và Tên (Mã SV / GV)"
    const match = trimmed.match(/^(.*?)(?:\s*\(([^)]+)\))?$/);
    const fullName = match && match[1] ? match[1].trim() : trimmed;
    const code = match && match[2] ? match[2].trim() : "";

    // Ký tự đại diện Avatar (chữ cái đầu của từ cuối)
    const words = fullName.split(/\s+/).filter(Boolean);
    const lastWord = words.length > 0 ? words[words.length - 1] : fullName;
    const initial = lastWord ? lastWord.charAt(0).toUpperCase() : "?";

    if (avatarEl) {
        if (roleType === "lecturer") {
            avatarEl.className = "member-avatar avatar-purple";
            avatarEl.innerHTML = '<i class="fa-solid fa-chalkboard-user"></i>';
        } else if (roleType === "leader") {
            avatarEl.className = "member-avatar avatar-gold";
            avatarEl.innerHTML = `<span class="avatar-initial">${escapeHtml(initial)}</span>`;
        } else {
            avatarEl.className = "member-avatar avatar-blue";
            avatarEl.innerHTML = `<span class="avatar-initial">${escapeHtml(initial)}</span>`;
        }
    }

    let codeHtml = "";
    if (code) {
        codeHtml = `<span class="member-code-badge font-mono">${escapeHtml(code)}</span>`;
    }

    valueEl.innerHTML = `<span class="member-fullname">${escapeHtml(fullName)}</span> ${codeHtml}`;
}

// =========================================================
// HÀM GỌI API LẤY THÔNG TIN ĐỀ TÀI
// =========================================================
async function loadMyTopic(userCode) {
    try {
        const token = getAuthForRole("STUDENT")?.token;
        const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/my-topic/${userCode}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            if (response.status === 404) {
                renderEmptyState();
            } else {
                const errorData = await response.json().catch(() => ({}));
                showAppNotification(errorData.message || "Không thể tải đề tài của bạn từ máy chủ.");
            }
            return;
        }

        const data = await response.json();
        
        if (data && data._id) {
            currentTopicData = data;
            await loadStudentMilestones();
            await loadMilestoneSubmissionHistory(data._id);

            if (document.getElementById("topicTitle")) 
                document.getElementById("topicTitle").textContent = data.title || "Chưa đặt tên đề tài";
            
            if (document.getElementById("topicDesc")) 
                document.getElementById("topicDesc").textContent = data.description || "Chưa có mô tả.";
            
            if (document.getElementById("topicCode")) 
                document.getElementById("topicCode").textContent = data.topic_code || "DT-" + data._id.substring(0, 6).toUpperCase();

            const leaderCode = data.leader_code || userCode;
            const [leaderName, member2Name, member3Name, lecturerName] = await Promise.all([
                getUserDisplayName(leaderCode),
                getUserDisplayName(data.member2_code),
                getUserDisplayName(data.member3_code),
                getUserDisplayName(data.lecturer_code, false)
            ]);

            currentTopicData.lecturer_name = lecturerName;
            syncMilestoneCards();

            formatMemberItem("rowLecturer", "avatarLecturer", "topicLecturer", lecturerName, "lecturer");
            formatMemberItem("rowLeader", "avatarLeader", "topicLeader", leaderName, "leader");
            formatMemberItem("rowMember2", "avatarMember2", "topicMember2", member2Name, "member");
            formatMemberItem("rowMember3", "avatarMember3", "topicMember3", member3Name, "member");

            const feedbackContainer = document.getElementById("topicFeedback");
            const feedbackText = document.getElementById("topicFeedbackText");
            const feedbackVal = String(data.feedback || "").trim();

            if (feedbackText) {
                feedbackText.textContent = feedbackVal || "Chưa có nhận xét mới từ giảng viên hướng dẫn.";
            } else if (feedbackContainer) {
                feedbackContainer.innerHTML = feedbackVal 
                    ? `<i class="fa-regular fa-comment-dots"></i> ${escapeHtml(feedbackVal)}` 
                    : `<i class="fa-regular fa-comment-dots"></i> Chưa có nhận xét mới từ giảng viên hướng dẫn.`;
            }

            if (feedbackContainer) {
                feedbackContainer.classList.toggle("is-approved", data.status === "APPROVED");
            }

            if (data.createdAt) {
                const formattedDate = new Date(data.createdAt).toLocaleDateString('vi-VN', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                const dateElement = document.getElementById("topicCreatedDate") || document.getElementById("topicDate");
                if (dateElement) dateElement.textContent = formattedDate;
            }

            // Cập nhật Banner trạng thái & nút Hủy đề tài
            const banner = document.getElementById("topicStatusBanner");
            const btnCancel = document.getElementById("btnCancelTopic");

            if (banner) {
                if (data.status === "APPROVED") {
                    banner.className = "status-banner approved";
                    banner.innerHTML = '<span class="status-dot"></span> <span class="status-banner-text">Trạng thái: <strong>Đã phê duyệt</strong></span>';
                    
                    if (btnCancel) btnCancel.style.display = "none";

                    // Render quy trình milestone theo dữ liệu thực từ Backend
                    renderMilestonesWorkflow(data);

                } else if (data.status === "PENDING") {
                    banner.className = "status-banner pending";
                    banner.innerHTML = '<span class="status-dot"></span> <span class="status-banner-text">Trạng thái: <strong>Chờ phê duyệt</strong></span>';
                    
                    if (btnCancel) btnCancel.style.display = "inline-flex";
                    disableAllMilestones("Đề tài đang chờ phê duyệt");

                } else if (data.status === "REJECTED") {
                    banner.className = "status-banner rejected";
                    banner.innerHTML = '<span class="status-dot"></span> <span class="status-banner-text">Trạng thái: <strong>Bị từ chối</strong></span>';
                    
                    if (btnCancel) btnCancel.style.display = "none";
                    disableAllMilestones("Đề tài bị từ chối");
                }
            }
            updateProgressStepper(data);
        } else if (data?.status?.startsWith("JOIN_")) {
            await renderJoinRequestState(data);
        } else {
            renderEmptyState();
        }
    } catch (error) {
        console.error("Lỗi khi kết nối đến Server:", error);
        showAppNotification("Không thể tải đề tài của bạn. Vui lòng kiểm tra kết nối máy chủ.");
    }
}

async function renderJoinRequestState(data) {
    currentTopicData = null;
    syncMilestoneCards();
    const isAccepted = data.status === "JOIN_ACCEPTED";
    const banner = document.getElementById("topicStatusBanner");
    if (banner) {
        banner.className = "status-banner pending";
        const bannerMsg = isAccepted
            ? "Trưởng nhóm đã chấp nhận yêu cầu. Đang chờ trưởng nhóm đăng ký đề tài."
            : data.status === "JOIN_REJECTED"
                ? "Yêu cầu tham gia nhóm đã bị từ chối."
                : "Yêu cầu tham gia nhóm đang chờ trưởng nhóm xác nhận.";
        banner.innerHTML = `<span class="status-dot"></span> <span class="status-banner-text">Trạng thái: <strong>${escapeHtml(bannerMsg)}</strong></span>`;
    }

    if (document.getElementById("topicTitle")) {
        document.getElementById("topicTitle").textContent = isAccepted
            ? "Đã được chấp nhận vào nhóm"
            : "Đang chờ xác nhận tham gia nhóm";
    }
    if (document.getElementById("topicDesc")) {
        document.getElementById("topicDesc").textContent = `Mã trưởng nhóm: ${data.leader_code || "Chưa xác định"}.`;
    }
    if (document.getElementById("topicCode")) document.getElementById("topicCode").textContent = "--";
    const leaderDisplayName = await getUserDisplayName(data.leader_code);
    formatMemberItem("rowLecturer", "avatarLecturer", "topicLecturer", "Chưa phân công", "lecturer");
    formatMemberItem("rowLeader", "avatarLeader", "topicLeader", leaderDisplayName, "leader");
    formatMemberItem("rowMember2", "avatarMember2", "topicMember2", "--", "member");
    formatMemberItem("rowMember3", "avatarMember3", "topicMember3", "--", "member");

    const cancelButton = document.getElementById("btnCancelTopic");
    if (cancelButton) cancelButton.style.display = "none";
    disableAllMilestones("Đề tài sẽ hiển thị sau khi trưởng nhóm đăng ký.");
    updateProgressStepper(data);
}

async function loadMilestoneSubmissionHistory(topicId) {
    try {
        const token = getAuthForRole("STUDENT")?.token;
        const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/submissions/topic/${encodeURIComponent(topicId)}`, {
            headers: { Authorization: `Bearer ${token || ""}` }
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
            throw new Error(result.message || "Không thể tải lịch sử bài nộp.");
        }
        milestoneSubmissionHistory = result.data || [];
    } catch (error) {
        milestoneSubmissionHistory = [];
        console.error("Lỗi tải lịch sử bài nộp:", error);
        showAppNotification(error.message || "Không thể tải lịch sử bài nộp.");
    }
}

async function loadStudentMilestones() {
    try {
        const token = getAuthForRole("STUDENT")?.token;
        const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/milestones/student", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "Không thể tải hạn nộp bài.");
        lecturerMilestones = result.data || [];
        milestoneLoadError = false;
    } catch (error) {
        console.error("Lỗi tải milestone của giảng viên:", error);
        lecturerMilestones = [];
        milestoneLoadError = true;
    }
}

function syncMilestoneCards() {
    const emptyState = document.getElementById("milestoneEmptyState");
    const list = document.getElementById("milestoneList");
    const milestones = lecturerMilestones
        .filter(item => Number.isInteger(Number(item.step)) && Number(item.step) > 0)
        .sort((a, b) => Number(a.step) - Number(b.step));
    updateMilestoneHeaderSummary(milestones);

    if (list) {
        list.replaceChildren();
        milestones.forEach(milestone => {
            const step = Number(milestone.step);
            const card = document.createElement("div");
            card.className = "milestone-card locked";
            card.id = `milestoneCard${step}`;
            card.innerHTML = `
                <div class="milestone-header">
                    <div class="m-title">
                        <h4>Mốc ${step}: ${escapeHtml(milestone.name)}</h4>
                        <span class="m-badge-pill pill-gray" id="statusBadge${step}"><i class="fa-solid fa-lock"></i> Chưa mở</span>
                    </div>
                    <span class="m-deadline"><i class="fa-regular fa-clock"></i> Hạn nộp: ${new Date(milestone.endDate).toLocaleString("vi-VN")}</span>
                </div>
                <p class="milestone-description">${escapeHtml(milestone.desc || "")}</p>
                <div class="milestone-body" id="milestoneBody${step}"></div>
            `;
            const deadline = card.querySelector(".m-deadline");
            deadline.classList.toggle("text-red", new Date(milestone.endDate) < new Date());

            const description = card.querySelector(".milestone-description");
            description.style.display = milestone.desc ? "" : "none";
            list.appendChild(card);
        });
    }

    if (emptyState) {
        let emptyIcon = '<i class="fa-solid fa-calendar-xmark"></i>';
        let emptyTitle = "Chưa có mốc tiến độ nộp bài";
        let emptySub = "Các mốc nộp báo cáo tiến độ và hạn nộp sẽ hiển thị tại đây khi đề tài được duyệt.";

        if (milestoneLoadError) {
            emptyIcon = '<i class="fa-solid fa-triangle-exclamation"></i>';
            emptyTitle = "Không thể tải danh sách hạn nộp";
            emptySub = "Đã xảy ra sự cố khi tải dữ liệu từ máy chủ. Vui lòng thử tải lại trang.";
        } else if (!currentTopicData || currentTopicData.status !== "APPROVED") {
            emptyIcon = '<i class="fa-solid fa-calendar-xmark"></i>';
            emptyTitle = "Đề tài chưa được phê duyệt";
            emptySub = "Hạn nộp bài và các mốc tiến độ sẽ kích hoạt sau khi đề tài được Giảng viên phê duyệt.";
        } else {
            emptyIcon = '<i class="fa-solid fa-list-check"></i>';
            emptyTitle = "Giảng viên chưa tạo mốc tiến độ";
            emptySub = "Hiện tại giảng viên chưa thiết lập mốc nộp bài cho đề tài này. Vui lòng kiểm tra lại sau.";
        }

        emptyState.innerHTML = `
            <div class="empty-icon-wrap">${emptyIcon}</div>
            <h4 class="empty-title">${escapeHtml(emptyTitle)}</h4>
            <p class="empty-subtitle">${escapeHtml(emptySub)}</p>
        `;
        emptyState.style.display = milestones.length ? "none" : "flex";
    }
}

function updateMilestoneHeaderSummary(milestones) {
    const summary = document.getElementById("milestoneSummary");
    if (!summary) return;

    if (milestoneLoadError || currentTopicData?.status !== "APPROVED" || !milestones.length) {
        summary.hidden = true;
        return;
    }

    const milestoneSteps = new Set(milestones.map(item => Number(item.step)));
    const submittedSteps = new Set(
        milestoneSubmissionHistory
            .filter(item => {
                const step = Number(item.milestone || item.milestone_step);
                const status = getSubmissionReviewStatus(item);
                return milestoneSteps.has(step) &&
                    !item.is_draft &&
                    !["DRAFT", "NOT_SUBMITTED", "WITHDRAWN", "SUPERSEDED"].includes(status);
            })
            .map(item => Number(item.milestone || item.milestone_step))
    );

    summary.textContent = `${milestones.length} mốc · ${submittedSteps.size} đã nộp`;
    summary.hidden = false;
}

// =========================================================
// QUẢN LÝ QUY TRÌNH TIẾN ĐỘ TUẦN TỰ
// =========================================================
function getSubmissionReviewStatus(submission) {
    return submission?.review_status || (submission?.is_draft ? "DRAFT" : "PENDING_REVIEW");
}

function getSubmissionStatusLabel(status) {
    return {
        NOT_SUBMITTED: "Chưa nộp",
        DRAFT: "Bản nháp",
        PENDING_REVIEW: "Chờ giảng viên nhận xét",
        APPROVED: "Đã duyệt",
        REVISION_REQUESTED: "Yêu cầu nộp lại",
        WITHDRAWN: "Đã rút bài nộp",
        SUPERSEDED: "Đã được thay thế"
    }[status] || "Chờ giảng viên nhận xét";
}

function isMilestoneSubmissionWindowOpen(milestone) {
    const endTime = new Date(milestone?.endDate).getTime();
    return Number.isFinite(endTime) && (Date.now() <= endTime || milestone?.allowLate);
}

function renderMilestoneSubmissionHistory(step) {
    const history = milestoneSubmissionHistory
        .filter(item => Number(item.milestone || item.milestone_step) === step)
        .sort((a, b) => new Date(b.submitted_at || b.createdAt) - new Date(a.submitted_at || a.createdAt));
    if (!history.length) return "";

    return `<section class="milestone-submission-history">
        <h4><i class="fa-solid fa-clock-rotate-left"></i> Lịch sử nộp bài</h4>
        <ol>${history.map((item, index) => {
            const fileName = item.file_name || item.original_name || `Bài nộp Mốc ${step}`;
            const storedName = item.stored_filename || String(item.file_path || "").split(/[\\/]/).pop();
            const fileUrl = storedName ? `${window.APP_CONFIG.API_BASE_URL}/api/submissions/file/${encodeURIComponent(storedName)}` : "";
            const status = getSubmissionReviewStatus(item);
            const feedback = String(item.feedback || "").trim();
            const grade = (item.grade !== undefined && item.grade !== null) ? Number(item.grade) : null;
            const submittedAt = item.submitted_at || item.createdAt;
            return `<li>
                <div class="history-submission-heading">
                    <div class="history-heading-left">
                        <strong>${item.is_draft ? "Bản nháp" : `Lần nộp ${Number(item.attempt) || index + 1}`}</strong>
                    </div>
                    <div class="history-heading-right" style="display: flex; align-items: center; gap: 8px;">
                        <span class="history-status ${status.toLowerCase()}">${escapeHtml(getSubmissionStatusLabel(status))}</span>
                        ${grade !== null ? `<span class="history-grade-pill" style="font-weight: 700; color: #D97706; background: #FEF3C7; padding: 2px 8px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center;">Điểm: ${grade}/10</span>` : ""}
                    </div>
                </div>
                <small>${submittedAt ? escapeHtml(new Date(submittedAt).toLocaleString("vi-VN")) : "Chưa có thời gian nộp"}</small>
                <a class="protected-submission-file" href="${escapeHtml(fileUrl || "#")}" data-file-name="${escapeHtml(fileName)}">${escapeHtml(fileName)}</a>
                ${feedback ? `<p><strong>Nhận xét:</strong> ${escapeHtml(feedback)}</p>` : ""}
            </li>`;
        }).join("")}</ol>
    </section>`;
}

function renderSubmissionStatusTable(milestone, {
    submitted = false,
    draft = false,
    fileName = "",
    fileInfo = null,
    timeStr = "",
    reviewStatus = "",
    feedback = "",
    grade = null
} = {}) {
    const remainingMs = new Date(milestone?.endDate).getTime() - Date.now();
    const remainingSeconds = Math.floor(Math.abs(remainingMs) / 1000);
    const days = Math.floor(remainingSeconds / 86400);
    const hours = Math.floor((remainingSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);

    let timeRemaining = "Chưa xác định";
    let chipColorClass = "chip-gray";

    if (!Number.isNaN(remainingMs)) {
        if (remainingMs > 24 * 3600 * 1000) {
            chipColorClass = "chip-green";
            const parts = [];
            if (days) parts.push(`${days} ngày`);
            if (hours) parts.push(`${hours} giờ`);
            timeRemaining = `Còn ${parts.join(" ") || "1 ngày"}`;
        } else if (remainingMs > 0) {
            chipColorClass = "chip-orange";
            const parts = [];
            if (hours) parts.push(`${hours} giờ`);
            if (minutes) parts.push(`${minutes} phút`);
            timeRemaining = `Còn ${parts.join(" ") || "ít phút"}`;
        } else {
            chipColorClass = "chip-red";
            const parts = [];
            if (days) parts.push(`${days} ngày`);
            if (hours) parts.push(`${hours} giờ`);
            timeRemaining = `Quá hạn ${parts.join(" ") || "trước đó"}`;
        }
    }

    const storedFileId = fileInfo?.filename || String(fileInfo?.path || "").split(/[\\/]/).pop();
    const fileHref = storedFileId ? `${window.APP_CONFIG.API_BASE_URL}/api/submissions/file/${encodeURIComponent(storedFileId)}` : "";
    const escapedFileName = escapeHtml(fileName);
    const status = reviewStatus || (draft ? "DRAFT" : submitted ? "PENDING_REVIEW" : "NOT_SUBMITTED");
    const statusLabel = getSubmissionStatusLabel(status);

    const lecturerName = currentTopicData?.lecturer_name || currentTopicData?.lecturer_code || "Giảng viên hướng dẫn";

    return `
        <div class="milestone-status-grid">
            <!-- Ô 1: Trạng thái bài nộp -->
            <div class="status-grid-item item-status">
                <div class="grid-item-icon icon-status"><i class="fa-solid fa-file-circle-check"></i></div>
                <div class="grid-item-content">
                    <span class="grid-item-label">Trạng thái bài nộp</span>
                    <div class="grid-item-value font-600">${escapeHtml(statusLabel)}</div>
                    ${submitted || draft ? `
                        <div class="grid-item-file">
                            ${fileHref
                                ? `<a class="submission-file-link protected-submission-file" href="${escapeHtml(fileHref)}" data-file-name="${escapedFileName}" title="Bấm để tải về file đã nộp"><i class="fa-regular fa-file-lines"></i> ${escapedFileName}</a>`
                                : `<span class="submission-file-name"><i class="fa-regular fa-file-lines"></i> ${escapedFileName}</span>`}
                        </div>` : ""}
                </div>
            </div>

            <!-- Ô 2: Thời gian còn lại -->
            <div class="status-grid-item item-countdown">
                <div class="grid-item-icon icon-time"><i class="fa-regular fa-clock"></i></div>
                <div class="grid-item-content">
                    <span class="grid-item-label">Thời gian còn lại</span>
                    <div class="grid-item-value">
                        <span class="countdown-chip ${chipColorClass}">${escapeHtml(timeRemaining)}</span>
                    </div>
                </div>
            </div>

            <!-- Ô 3: Chỉnh sửa lần cuối -->
            <div class="status-grid-item item-last-modified">
                <div class="grid-item-icon icon-edit"><i class="fa-regular fa-calendar-check"></i></div>
                <div class="grid-item-content">
                    <span class="grid-item-label">Chỉnh sửa lần cuối</span>
                    <div class="grid-item-value font-600">${submitted || draft ? escapeHtml(timeStr) : "Chưa nộp lần nào"}</div>
                </div>
            </div>

            <!-- Ô 4: Nhận xét -->
            <div class="status-grid-item item-feedback">
                <div class="grid-item-icon icon-feedback"><i class="fa-regular fa-comment-dots"></i></div>
                <div class="grid-item-content">
                    <span class="grid-item-label">Nhận xét</span>
                    <div class="grid-item-value">
                        ${feedback ? `
                            <div class="feedback-bubble-wrap">
                                <div class="feedback-avatar" title="${escapeHtml(lecturerName)}"><i class="fa-solid fa-chalkboard-user"></i></div>
                                <div class="feedback-bubble">
                                    <span class="feedback-author">${escapeHtml(lecturerName)}</span>
                                    <p class="feedback-text">${escapeHtml(feedback)}</p>
                                </div>
                            </div>
                        ` : `
                            <div class="feedback-empty">
                                <i class="fa-regular fa-comment"></i> Chưa có nhận xét
                            </div>
                        `}
                    </div>
                </div>
            </div>
        </div>
        ${renderMilestoneSubmissionHistory(Number(milestone?.step))}`;
}

function renderMilestonesWorkflow(topicData) {
    syncMilestoneCards();

    lecturerMilestones.forEach(milestone => {
        const step = Number(milestone.step);
        if (!Number.isInteger(step) || step < 1) return;
        const history = milestoneSubmissionHistory
            .filter(item => Number(item.milestone || item.milestone_step) === step)
            .sort((a, b) => new Date(b.submitted_at || b.createdAt) - new Date(a.submitted_at || a.createdAt));
        const draftSubmission = history.find(item => item.is_draft);
        const latestSubmission = history.find(item => !item.is_draft);
        const submission = draftSubmission || latestSubmission;
        const mFile = submission ? {
            name: submission.file_name || submission.original_name || `Bài nộp Mốc ${step}`,
            path: submission.file_path,
            filename: submission.stored_filename || String(submission.file_path || "").split(/[\\/]/).pop(),
            submittedAt: submission.submitted_at || submission.createdAt,
            isDraft: Boolean(submission.is_draft),
            review_status: getSubmissionReviewStatus(submission),
            feedback: submission.feedback || "",
            grade: (submission.grade !== undefined && submission.grade !== null) ? submission.grade : null
        } : topicData[`milestone${step}_file`] || (topicData.milestones && topicData.milestones[step - 1]);

        if (mFile && (mFile.name || mFile.original_name || mFile.filename)) {
            const fileName = mFile.name || mFile.original_name || mFile.filename;
            const timeStr = mFile.submittedAt ? new Date(mFile.submittedAt).toLocaleString('vi-VN') : "Đã nộp";
            if (mFile.isDraft) {
                setMilestoneDraft(step, fileName, timeStr, mFile, milestone);
            } else if (mFile.review_status === "REVISION_REQUESTED") {
                setMilestoneRevisionRequested(step, fileName, timeStr, mFile, milestone);
            } else if (mFile.review_status === "APPROVED") {
                setMilestoneCompleted(step, fileName, timeStr, mFile, milestone);
            } else if (mFile.review_status === "WITHDRAWN") {
                setMilestoneWithdrawn(step, fileName, timeStr, mFile, milestone);
            } else {
                setMilestoneUnderReview(step, fileName, timeStr, mFile, milestone);
            }
        } else {
            const now = new Date();
            const startDate = new Date(milestone.startDate);
            const endDate = new Date(milestone.endDate);

            if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
                lockMilestone(step, "Thời gian mở hoặc hạn nộp của mốc này chưa được cấu hình hợp lệ.");
            } else if (now < startDate) {
                lockMilestone(step, `Mốc này bắt đầu nhận bài từ ${startDate.toLocaleString('vi-VN')}.`);
            } else if (now > endDate && !milestone.allowLate) {
                closeMilestone(step, `Đã quá hạn nộp từ ${endDate.toLocaleString('vi-VN')}.`);
            } else {
                renderMilestoneAwaitingSubmission(step, { canSubmit: true });
            }
        }
    });
}

function renderMilestoneAwaitingSubmission(mIndex, { canSubmit = false, message = "" } = {}) {
    const card = document.getElementById(`milestoneCard${mIndex}`);
    const badge = document.getElementById(`statusBadge${mIndex}`);
    const body = document.getElementById(`milestoneBody${mIndex}`);
    const milestone = lecturerMilestones.find(item => Number(item.step) === mIndex);
    const now = new Date();
    const isOverdue = milestone && now > new Date(milestone.endDate);

    if (card) card.className = `milestone-card ${canSubmit ? "active" : "locked"}`;
    if (badge) {
        if (!canSubmit) {
            badge.className = "m-badge-pill pill-gray";
            badge.innerHTML = '<i class="fa-solid fa-lock"></i> Chưa mở';
        } else if (isOverdue && !milestone.allowLate) {
            badge.className = "m-badge-pill pill-red";
            badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Trễ hạn';
        } else {
            badge.className = "m-badge-pill pill-gray";
            badge.innerHTML = '<i class="fa-regular fa-clock"></i> Chờ nộp';
        }
    }

    if (body) {
        body.innerHTML = `
            ${renderSubmissionStatusTable(milestone)}
            <div class="add-submission-actions">
                <button type="button" class="btn-add-submission" id="addSubmissionM${mIndex}" ${canSubmit ? "" : "disabled"}>
                    <i class="fa-solid fa-plus"></i> Thêm bài nộp
                </button>
                ${message ? `<p class="locked-msg">${escapeHtml(message)}</p>` : ""}
            </div>`;

        document.getElementById(`addSubmissionM${mIndex}`)?.addEventListener("click", () => {
            if (canSubmit) enableMilestoneUpload(mIndex);
        });
    }
}

// HÀM MỞ KHÓA VÀ RENDER FORM UPLOAD CHO MỐC ĐẾN LƯỢT
function enableMilestoneUpload(mIndex, isEditing = false, existingFileName = "", existingFileInfo = null, existingTimeStr = "", existingIsDraft = false) {
    const card = document.getElementById(`milestoneCard${mIndex}`);
    const badge = document.getElementById(`statusBadge${mIndex}`);
    const body = document.getElementById(`milestoneBody${mIndex}`);
    const milestone = lecturerMilestones.find(item => Number(item.step) === mIndex);

    if (card) card.className = "milestone-card active";
    if (badge) {
        badge.className = "m-badge-pill pill-blue";
        badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang diễn ra';
    }

    if (body) {
        body.innerHTML = `
            ${renderSubmissionStatusTable(milestone, {
                submitted: isEditing && !existingIsDraft,
                draft: isEditing && existingIsDraft,
                fileName: existingFileName,
                fileInfo: existingFileInfo,
                timeStr: existingTimeStr
            })}
            <section class="submission-upload-panel">
                <header class="submission-upload-header">
                    <h4><i class="fa-solid fa-cloud-arrow-up"></i> ${isEditing ? "Sửa bài nộp" : "Thêm bài nộp"}</h4>
                    <span>Dung lượng tối đa: 25 MB • Định dạng: PDF, DOC, DOCX, ZIP, RAR</span>
                </header>
                <form id="formMilestone${mIndex}" class="upload-form">
                    ${isEditing ? `<p class="editing-submission-note">Đang sửa bài đã nộp: <strong>${escapeHtml(existingFileName)}</strong></p>` : ""}
                    <div class="upload-zone modern-dropzone" id="dropZoneM${mIndex}">
                        <input type="file" id="fileMilestone${mIndex}" class="input-file" hidden accept=".pdf,.doc,.docx,.zip,.rar" />
                        <div class="dropzone-content" id="dropzonePromptM${mIndex}">
                            <div class="dropzone-cloud-icon"><i class="fa-solid fa-cloud-arrow-up"></i></div>
                            <p class="dropzone-text">Kéo thả tệp vào đây hoặc <span class="dropzone-link" id="openFilePickerM${mIndex}">bấm để chọn</span></p>
                            <span class="dropzone-hint">Hỗ trợ định dạng: PDF, DOC, DOCX, ZIP, RAR (Tối đa 25MB)</span>
                        </div>
                        <div id="selectedFileM${mIndex}" class="selected-file-wrapper" style="display: none;"></div>
                    </div>

                    <div class="upload-actions">
                        <button type="submit" class="btn-submit-primary" id="btnSubmitM${mIndex}" disabled>
                            <i class="fa-solid fa-paper-plane"></i> Nộp bài
                        </button>
                        <button type="button" class="btn-cancel-outline" id="cancelEditM${mIndex}">Hủy</button>
                    </div>
                </form>
            </section>
        `;

        initUploadEvents(mIndex);
        document.getElementById(`openFilePickerM${mIndex}`)?.addEventListener("click", (e) => {
            e.stopPropagation();
            openMilestoneFilePicker(mIndex);
        });
        document.getElementById(`cancelEditM${mIndex}`)?.addEventListener("click", () => {
            delete pendingMilestoneFiles[mIndex];
            if (isEditing) {
                const auth = getAuthForRole("STUDENT");
                if (auth?.user?.user_code) loadMyTopic(auth.user.user_code);
            } else {
                const now = new Date();
                const canSubmit = Boolean(milestone && now >= new Date(milestone.startDate) &&
                    (now <= new Date(milestone.endDate) || milestone.allowLate));
                renderMilestoneAwaitingSubmission(mIndex, { canSubmit });
            }
        });
    }
}

// HÀM HIỂN THỊ MỐC Ở TRẠNG THÁI ĐÃ HOÀN THÀNH
function setMilestoneCompleted(mIndex, fileName, timeStr, fileInfo, milestone) {
    const card = document.getElementById(`milestoneCard${mIndex}`);
    const badge = document.getElementById(`statusBadge${mIndex}`);
    const body = document.getElementById(`milestoneBody${mIndex}`);
    if (card) card.className = "milestone-card completed";
    if (badge) {
        badge.className = "m-badge-pill pill-green";
        badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã duyệt';
    }
    if (body) {
        body.innerHTML = renderSubmissionStatusTable(milestone, {
            submitted: true,
            fileName,
            fileInfo,
            timeStr,
            reviewStatus: "APPROVED",
            feedback: fileInfo?.feedback || "",
            grade: fileInfo?.grade
        });

        document.getElementById(`editSubmissionM${mIndex}`)?.addEventListener("click", () => {
            enableMilestoneUpload(mIndex, true, fileName, fileInfo, timeStr);
        });

        document.getElementById(`deleteSubmissionM${mIndex}`)?.addEventListener("click", async event => {
            if (!currentTopicData?._id) return;
            const button = event.currentTarget;
            const confirmed = await window.showConfirmDialog({
                title: "Xác nhận xóa bài nộp",
                message: `Bạn có chắc muốn loại bỏ bài nộp Mốc ${mIndex}? Mốc này sẽ cần được nộp lại.`,
                confirmText: "Xóa bài nộp",
                danger: true
            });
            if (!confirmed) return;

            const auth = getAuthForRole("STUDENT");
            button.disabled = true;
            try {
                const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/${currentTopicData._id}/milestone/${mIndex}/submission`, {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${auth?.token || ""}` }
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || "Không thể xóa bài nộp.");

                showAppNotification(result.message || "Đã loại bỏ bài nộp.", "success");
                if (auth?.user?.user_code) await loadMyTopic(auth.user.user_code);
            } catch (error) {
                showAppNotification(error.message || "Không thể xóa bài nộp.", "error");
                button.disabled = false;
            }
        });
    }
}

function setMilestoneUnderReview(mIndex, fileName, timeStr, fileInfo, milestone) {
    const card = document.getElementById(`milestoneCard${mIndex}`);
    const badge = document.getElementById(`statusBadge${mIndex}`);
    const body = document.getElementById(`milestoneBody${mIndex}`);
    const canChangeSubmission = isMilestoneSubmissionWindowOpen(milestone);
    if (card) card.className = "milestone-card active";
    if (badge) {
        badge.className = "m-badge-pill pill-green";
        badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã nộp';
    }
    if (body) {
        body.innerHTML = `
            ${canChangeSubmission ? `<div class="submission-actions">
                <button type="button" class="btn-resubmit" id="replaceSubmissionM${mIndex}">
                    <i class="fa-solid fa-rotate-right"></i> Nộp lại
                </button>
                <button type="button" class="submission-action-delete" id="withdrawSubmissionM${mIndex}">
                    <i class="fa-solid fa-rotate-left"></i> Rút bài nộp
                </button>
            </div>` : '<small class="submission-closed-note">Chỉ có thể nộp lại hoặc rút bài khi còn thời hạn nộp.</small>'}
            ${renderSubmissionStatusTable(milestone, {
                submitted: true,
                fileName,
                fileInfo,
                timeStr,
                reviewStatus: "PENDING_REVIEW",
                feedback: fileInfo?.feedback || "",
                grade: fileInfo?.grade
            })}`;

        document.getElementById(`replaceSubmissionM${mIndex}`)?.addEventListener("click", () => {
            enableMilestoneUpload(mIndex, true, fileName, fileInfo, timeStr);
        });

        document.getElementById(`withdrawSubmissionM${mIndex}`)?.addEventListener("click", async event => {
            if (!currentTopicData?._id) return;
            const button = event.currentTarget;
            const confirmed = await window.showConfirmDialog({
                title: "Xác nhận rút bài nộp",
                message: `Rút bài nộp Mốc ${mIndex}? Bản nộp hiện tại vẫn được lưu trong lịch sử và bạn có thể nộp lại khi còn hạn.`,
                confirmText: "Rút bài nộp",
                danger: true
            });
            if (!confirmed) return;

            const auth = getAuthForRole("STUDENT");
            button.disabled = true;
            try {
                const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/${currentTopicData._id}/milestone/${mIndex}/withdraw`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${auth?.token || ""}` }
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.message || "Không thể rút bài nộp.");
                showAppNotification(result.message || "Đã rút bài nộp.", "success");
                if (auth?.user?.user_code) await loadMyTopic(auth.user.user_code);
            } catch (error) {
                showAppNotification(error.message || "Không thể rút bài nộp.", "error");
                button.disabled = false;
            }
        });
    }
}

function setMilestoneWithdrawn(mIndex, fileName, timeStr, fileInfo, milestone) {
    const canResubmit = isMilestoneSubmissionWindowOpen(milestone);

    if (canResubmit) {
        enableMilestoneUpload(mIndex);
        return;
    }

    const card = document.getElementById(`milestoneCard${mIndex}`);
    const badge = document.getElementById(`statusBadge${mIndex}`);
    const body = document.getElementById(`milestoneBody${mIndex}`);
    if (card) card.className = "milestone-card locked";
    if (badge) {
        badge.className = "m-badge-pill pill-gray";
        badge.innerHTML = '<i class="fa-solid fa-rotate-left"></i> Đã rút bài';
    }
    if (body) {
        body.innerHTML = `
            <small class="submission-closed-note">Đã hết thời hạn nộp lại bài.</small>
            ${renderSubmissionStatusTable(milestone, {
                submitted: true,
                fileName,
                fileInfo,
                timeStr,
                reviewStatus: "WITHDRAWN"
            })}`;
    }
}

function setMilestoneRevisionRequested(mIndex, fileName, timeStr, fileInfo, milestone) {
    const card = document.getElementById(`milestoneCard${mIndex}`);
    const badge = document.getElementById(`statusBadge${mIndex}`);
    const body = document.getElementById(`milestoneBody${mIndex}`);
    const canResubmit = Boolean(milestone);
    if (card) card.className = "milestone-card active";
    if (badge) {
        badge.className = "m-badge-pill pill-red";
        badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Cần nộp lại';
    }
    if (!body) return;

    body.innerHTML = `
        <div class="submission-actions">
            <button type="button" class="btn-resubmit" id="resubmitM${mIndex}" ${canResubmit ? "" : "disabled"}>
                <i class="fa-solid fa-rotate-right"></i> Nộp lại báo cáo
            </button>
        </div>
        ${canResubmit ? "" : '<small class="submission-closed-note">Đã hết thời hạn nộp lại bài.</small>'}
        ${renderSubmissionStatusTable(milestone, {
            submitted: true,
            fileName,
            fileInfo,
            timeStr,
            reviewStatus: "REVISION_REQUESTED",
            feedback: fileInfo?.feedback || "",
            grade: fileInfo?.grade
        })}`;

    document.getElementById(`resubmitM${mIndex}`)?.addEventListener("click", () => {
        if (canResubmit) enableMilestoneUpload(mIndex);
    });
}

function setMilestoneDraft(mIndex, fileName, timeStr, fileInfo, milestone) {
    const card = document.getElementById(`milestoneCard${mIndex}`);
    const badge = document.getElementById(`statusBadge${mIndex}`);
    const body = document.getElementById(`milestoneBody${mIndex}`);
    const latestOfficialSubmission = milestoneSubmissionHistory
        .filter(item => Number(item.milestone || item.milestone_step) === mIndex && !item.is_draft)
        .sort((a, b) => new Date(b.submitted_at || b.createdAt) - new Date(a.submitted_at || a.createdAt))[0];
    const resubmissionRequested = getSubmissionReviewStatus(latestOfficialSubmission) === "REVISION_REQUESTED";
    const canEditSubmission = Boolean(milestone &&
        (isMilestoneSubmissionWindowOpen(milestone) || resubmissionRequested));

    if (card) card.className = "milestone-card active";
    if (badge) {
        badge.className = "m-badge-pill pill-blue";
        badge.innerHTML = '<i class="fa-regular fa-floppy-disk"></i> Bản nháp';
    }
    if (!body) return;

    body.innerHTML = `
        <div class="submission-actions">
            <button type="button" class="submission-action-submit btn-submit-primary" id="submitDraftM${mIndex}" ${canEditSubmission ? "" : "disabled"}><i class="fa-solid fa-paper-plane"></i> Nộp bài</button>
            <button type="button" class="submission-action-edit" id="editDraftM${mIndex}" ${canEditSubmission ? "" : "disabled"}><i class="fa-solid fa-pen-to-square"></i> Sửa bài nộp</button>
            <button type="button" class="submission-action-delete" id="deleteDraftM${mIndex}" ${canEditSubmission ? "" : "disabled"}><i class="fa-solid fa-trash-can"></i> Xóa bản nháp</button>
        </div>
        ${renderSubmissionStatusTable(milestone, { draft: true, fileName, fileInfo, timeStr })}`;

    document.getElementById(`submitDraftM${mIndex}`)?.addEventListener("click", async event => {
        if (!currentTopicData?._id) return;
        const auth = getAuthForRole("STUDENT");
        const button = event.currentTarget;
        button.disabled = true;
        try {
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/${currentTopicData._id}/milestone/${mIndex}/submit`, {
                method: "POST",
                headers: { Authorization: `Bearer ${auth?.token || ""}` }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Không thể nộp bài.");
            showAppNotification(result.message || "Đã nộp bài chính thức.", "success");
            if (auth?.user?.user_code) await loadMyTopic(auth.user.user_code);
        } catch (error) {
            showAppNotification(error.message || "Không thể nộp bài.", "error");
            button.disabled = false;
        }
    });

    document.getElementById(`editDraftM${mIndex}`)?.addEventListener("click", () => {
        enableMilestoneUpload(mIndex, true, fileName, fileInfo, timeStr, true);
    });

    document.getElementById(`deleteDraftM${mIndex}`)?.addEventListener("click", async event => {
        if (!currentTopicData?._id) return;
        const button = event.currentTarget;
        const confirmed = await window.showConfirmDialog({
            title: "Xác nhận xóa bản nháp",
            message: `Xóa bản nháp Mốc ${mIndex}? Nếu đã có bài nộp chính thức trước đó, bài đó vẫn được giữ lại.`,
            confirmText: "Xóa bản nháp",
            danger: true
        });
        if (!confirmed) return;
        const auth = getAuthForRole("STUDENT");
        button.disabled = true;
        try {
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/${currentTopicData._id}/milestone/${mIndex}/submission`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${auth?.token || ""}` }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Không thể xóa bản nháp.");
            showAppNotification(result.message || "Đã xóa bản nháp.", "success");
            if (auth?.user?.user_code) await loadMyTopic(auth.user.user_code);
        } catch (error) {
            showAppNotification(error.message || "Không thể xóa bản nháp.", "error");
            button.disabled = false;
        }
    });
}

// HÀM KHÓA MỐC VÀ ẨN Ô UPLOAD
function lockMilestone(mIndex, msg) {
    renderMilestoneAwaitingSubmission(mIndex, { message: msg });
}

function closeMilestone(mIndex, msg) {
    const badge = document.getElementById(`statusBadge${mIndex}`);

    renderMilestoneAwaitingSubmission(mIndex, { message: msg });
    if (badge) {
        badge.className = "m-badge-pill pill-red";
        badge.innerHTML = '<i class="fa-solid fa-lock"></i> Đã đóng';
    }
}

function disableAllMilestones(reasonMsg) {
    lecturerMilestones.forEach(milestone => lockMilestone(Number(milestone.step), reasonMsg));
}

function updateProgressStepper(topicData) {
    const badge = document.getElementById("stepperOverallBadge");
    const lineFill = document.getElementById("stepperLineFill");
    const node1 = document.getElementById("stepNode1");
    const node2 = document.getElementById("stepNode2");
    const node3 = document.getElementById("stepNode3");
    const node4 = document.getElementById("stepNode4");
    const node5 = document.getElementById("stepNode5");
    const status1 = document.getElementById("stepStatus1");
    const status2 = document.getElementById("stepStatus2");
    const status3 = document.getElementById("stepStatus3");
    const status4 = document.getElementById("stepStatus4");
    const status5 = document.getElementById("stepStatus5");

    if (!node1) return;

    const setNodeState = (node, statusEl, state, statusText, iconClass) => {
        if (!node) return;
        node.className = `stepper-node ${state}`;
        if (statusEl) statusEl.textContent = statusText;
        const iconContainer = node.querySelector(".node-circle i");
        if (iconContainer && iconClass) {
            iconContainer.className = `fa-solid ${iconClass}`;
        }
    };

    if (!topicData || !topicData._id || topicData.status === "NONE") {
        if (badge) {
            badge.className = "stepper-progress-badge";
            badge.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Chưa đăng ký';
        }
        if (lineFill) lineFill.style.width = "8%";
        setNodeState(node1, status1, "current", "Đang chọn đề tài", "fa-file-signature");
        setNodeState(node2, status2, "upcoming", "Chưa duyệt", "fa-clipboard-check");
        setNodeState(node3, status3, "upcoming", "Chưa bắt đầu", "fa-chart-line");
        setNodeState(node4, status4, "upcoming", "Chưa bắt đầu", "fa-file-lines");
        setNodeState(node5, status5, "upcoming", "Chưa bắt đầu", "fa-award");
        return;
    }

    if (String(topicData.status || "").startsWith("JOIN_")) {
        if (badge) {
            badge.className = "stepper-progress-badge is-pending";
            badge.innerHTML = '<i class="fa-solid fa-users"></i> Chờ duyệt nhóm';
        }
        if (lineFill) lineFill.style.width = "15%";
        setNodeState(node1, status1, "current", "Đang xin vào nhóm", "fa-user-clock");
        setNodeState(node2, status2, "upcoming", "Chưa duyệt", "fa-clipboard-check");
        setNodeState(node3, status3, "upcoming", "Chưa bắt đầu", "fa-chart-line");
        setNodeState(node4, status4, "upcoming", "Chưa bắt đầu", "fa-file-lines");
        setNodeState(node5, status5, "upcoming", "Chưa bắt đầu", "fa-award");
        return;
    }

    if (topicData.status === "PENDING") {
        if (badge) {
            badge.className = "stepper-progress-badge is-pending";
            badge.innerHTML = '<i class="fa-solid fa-clock"></i> Chờ GVHD phê duyệt';
        }
        if (lineFill) lineFill.style.width = "30%";
        setNodeState(node1, status1, "completed", "Đã đăng ký", "fa-check");
        setNodeState(node2, status2, "current", "Đang chờ duyệt", "fa-hourglass-half");
        setNodeState(node3, status3, "upcoming", "Chưa bắt đầu", "fa-chart-line");
        setNodeState(node4, status4, "upcoming", "Chưa bắt đầu", "fa-file-lines");
        setNodeState(node5, status5, "upcoming", "Chưa bắt đầu", "fa-award");
        return;
    }

    if (topicData.status === "REJECTED") {
        if (badge) {
            badge.className = "stepper-progress-badge";
            badge.style.background = "#fef2f2";
            badge.style.color = "#dc2626";
            badge.style.borderColor = "#fecaca";
            badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Cần chọn lại';
        }
        if (lineFill) lineFill.style.width = "25%";
        setNodeState(node1, status1, "completed", "Đã đăng ký", "fa-check");
        setNodeState(node2, status2, "rejected", "Bị từ chối", "fa-xmark");
        setNodeState(node3, status3, "upcoming", "Chưa bắt đầu", "fa-chart-line");
        setNodeState(node4, status4, "upcoming", "Chưa bắt đầu", "fa-file-lines");
        setNodeState(node5, status5, "upcoming", "Chưa bắt đầu", "fa-award");
        return;
    }

    if (topicData.status === "APPROVED") {
        const approvedSubmissions = (milestoneSubmissionHistory || []).filter(s => getSubmissionReviewStatus(s) === "APPROVED");
        const hasApprovedM1 = approvedSubmissions.some(s => Number(s.milestone || s.milestone_step) === 1);
        const hasApprovedM2 = approvedSubmissions.some(s => Number(s.milestone || s.milestone_step) === 2);
        const hasApprovedM3 = approvedSubmissions.some(s => Number(s.milestone || s.milestone_step) === 3);

        setNodeState(node1, status1, "completed", "Đã hoàn thành", "fa-check");
        setNodeState(node2, status2, "completed", "Đã phê duyệt", "fa-check");

        if (hasApprovedM3 || hasApprovedM2) {
            if (badge) {
                badge.className = "stepper-progress-badge is-completed";
                badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Sẵn sàng bảo vệ';
            }
            if (lineFill) lineFill.style.width = "90%";
            setNodeState(node3, status3, "completed", "Đã nghiệm thu", "fa-check");
            setNodeState(node4, status4, "completed", "Đã nộp đủ", "fa-check");
            setNodeState(node5, status5, "current", "Sẵn sàng bảo vệ", "fa-award");
        } else if (hasApprovedM1) {
            if (badge) {
                badge.className = "stepper-progress-badge is-completed";
                badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Báo cáo cuối kỳ';
            }
            if (lineFill) lineFill.style.width = "68%";
            setNodeState(node3, status3, "completed", "Đã xong giữa kỳ", "fa-check");
            setNodeState(node4, status4, "current", "Đang thực hiện", "fa-file-lines");
            setNodeState(node5, status5, "upcoming", "Chưa bắt đầu", "fa-award");
        } else {
            if (badge) {
                badge.className = "stepper-progress-badge is-completed";
                badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang thực hiện';
            }
            if (lineFill) lineFill.style.width = "48%";
            setNodeState(node3, status3, "current", "Đang thực hiện", "fa-chart-line");
            setNodeState(node4, status4, "upcoming", "Chưa bắt đầu", "fa-file-lines");
            setNodeState(node5, status5, "upcoming", "Chưa bắt đầu", "fa-award");
        }
    }
}

function renderEmptyState() {
    currentTopicData = null;
    milestoneSubmissionHistory = [];
    lecturerMilestones = [];
    milestoneLoadError = false;
    syncMilestoneCards();
    updateProgressStepper(null);
    const banner = document.getElementById("topicStatusBanner");
    if (banner) {
        banner.className = "status-banner none";
        banner.innerHTML = '<span class="status-dot"></span> <span class="status-banner-text">Trạng thái: <strong>Chưa đăng ký</strong></span>';
    }

    if (document.getElementById("topicTitle")) document.getElementById("topicTitle").textContent = "Bạn chưa đăng ký đề tài nào";
    if (document.getElementById("topicDesc")) document.getElementById("topicDesc").innerHTML = 'Bạn hiện chưa có thông tin đề tài. Vui lòng sang trang <a href="student-dashboard.html" style="color: #2563eb; font-weight: 600; text-decoration: underline;">Đăng ký đề tài</a> để tiến hành đăng ký.';
    if (document.getElementById("topicCode")) document.getElementById("topicCode").textContent = "--";
    
    formatMemberItem("rowLecturer", "avatarLecturer", "topicLecturer", "Chưa phân công", "lecturer");
    formatMemberItem("rowLeader", "avatarLeader", "topicLeader", "--", "leader");
    formatMemberItem("rowMember2", "avatarMember2", "topicMember2", "--", "member");
    formatMemberItem("rowMember3", "avatarMember3", "topicMember3", "--", "member");

    const dateElement = document.getElementById("topicCreatedDate") || document.getElementById("topicDate");
    if (dateElement) dateElement.textContent = "--";

    const btnCancelTopic = document.getElementById("btnCancelTopic");
    if (btnCancelTopic) btnCancelTopic.style.display = "none";

    disableAllMilestones("Chưa đăng ký đề tài");
}

function openMilestoneFilePicker(mIndex) {
    const oldModal = document.getElementById(`filePickerModalM${mIndex}`);
    oldModal?.remove();

    const auth = getAuthForRole("STUDENT");
    const modal = document.createElement("div");
    modal.id = `filePickerModalM${mIndex}`;
    modal.className = "file-picker-overlay";
    modal.innerHTML = `
        <section class="file-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="filePickerTitleM${mIndex}">
            <header class="file-picker-header">
                <h3 id="filePickerTitleM${mIndex}">Trình chọn tập tin</h3>
                <button type="button" class="file-picker-close" aria-label="Đóng">&times;</button>
            </header>
            <div class="file-picker-body">
                <aside><button type="button" class="file-picker-source active"><i class="fa-solid fa-upload"></i> Tải lên một tệp</button></aside>
                <div class="file-picker-fields">
                    <label for="pickerFileM${mIndex}">Tệp đính kèm</label>
                    <input type="file" id="pickerFileM${mIndex}" accept=".pdf,.doc,.docx,.zip,.rar">
                    <label for="pickerNameM${mIndex}">Lưu dưới dạng</label>
                    <input type="text" id="pickerNameM${mIndex}" value="">
                    <label for="pickerAuthorM${mIndex}">Tác giả</label>
                    <input type="text" id="pickerAuthorM${mIndex}" value="${escapeHtml(auth?.user?.full_name || "Sinh viên")}" readonly>
                    <div class="file-picker-actions">
                        <button type="button" class="btn-cancel-edit file-picker-cancel">Hủy bỏ</button>
                        <button type="button" class="btn-submit-changes file-picker-upload" disabled>Tải lên tệp này</button>
                    </div>
                </div>
            </div>
        </section>`;
    document.body.appendChild(modal);

    const sourceInput = modal.querySelector(`#pickerFileM${mIndex}`);
    const saveAsInput = modal.querySelector(`#pickerNameM${mIndex}`);
    const uploadButton = modal.querySelector(".file-picker-upload");
    const closeModal = () => modal.remove();

    sourceInput.addEventListener("change", () => {
        const file = sourceInput.files?.[0];
        saveAsInput.value = file?.name || "";
        uploadButton.disabled = !file;
    });
    modal.querySelectorAll(".file-picker-close, .file-picker-cancel").forEach(button => {
        button.addEventListener("click", closeModal);
    });
    modal.addEventListener("click", event => {
        if (event.target === modal) closeModal();
    });
    uploadButton.addEventListener("click", () => {
        const file = sourceInput.files?.[0];
        if (!file) return;
        if (file.size > 25 * 1024 * 1024) {
            showAppNotification("File vượt quá kích thước tối đa 25MB!");
            return;
        }

        const uploadName = (saveAsInput.value.trim() || file.name).replace(/[\\/]/g, "_");
        const fileInput = document.getElementById(`fileMilestone${mIndex}`);
        if (!fileInput) return;

        try {
            const transfer = new DataTransfer();
            transfer.items.add(file);
            fileInput.files = transfer.files;
        } catch (error) {
            showAppNotification("Trình duyệt không hỗ trợ chọn tệp này. Vui lòng thử lại.");
            return;
        }

        pendingMilestoneFiles[mIndex] = { file, uploadName };
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
        closeModal();
    });
}

// =========================================================
// HÀM KHỞI TẠO SỰ KIỆN KÉO THẢ / CHỌN FILE VÀ UPLOAD THỰC TẾ
// =========================================================
function initUploadEvents(mIndex) {
    const fileInput = document.getElementById(`fileMilestone${mIndex}`);
    const dropZone = document.getElementById(`dropZoneM${mIndex}`);
    const promptBox = document.getElementById(`dropzonePromptM${mIndex}`);
    const previewBox = document.getElementById(`selectedFileM${mIndex}`);
    const btnSubmit = document.getElementById(`btnSubmitM${mIndex}`);
    const formEl = document.getElementById(`formMilestone${mIndex}`);

    if (!fileInput || !dropZone) return;

    // Bấm vào vùng dropzone để mở bộ chọn file (ngoại trừ nút xóa file và link picker)
    dropZone.addEventListener("click", (e) => {
        if (e.target.closest(".btn-remove-file") || e.target.closest(`#openFilePickerM${mIndex}`)) return;
        fileInput.click();
    });

    fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    dropZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            pendingMilestoneFiles[mIndex] = { file: e.dataTransfer.files[0], uploadName: e.dataTransfer.files[0].name };
            handleFiles(e.dataTransfer.files);
        }
    });

    previewBox?.addEventListener("click", event => {
        const removeBtn = event.target.closest(".btn-remove-file");
        if (removeBtn) {
            event.stopPropagation();
            fileInput.value = "";
            delete pendingMilestoneFiles[mIndex];
            if (previewBox) {
                previewBox.innerHTML = "";
                previewBox.style.display = "none";
            }
            if (promptBox) {
                promptBox.style.display = "flex";
            }
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.style.opacity = "0.5";
                btnSubmit.style.cursor = "not-allowed";
            }
        }
    });

    if (formEl) {
        formEl.addEventListener("submit", async (e) => {
            e.preventDefault();

            const milestone = lecturerMilestones.find(item => Number(item.step) === mIndex);
            const now = new Date();
            if (!milestone || now < new Date(milestone.startDate)) {
                showAppNotification("Chưa đến thời gian bắt đầu nộp bài cho mốc này.", "warning");
                return;
            }
            const latestOfficialSubmission = milestoneSubmissionHistory
                .filter(item => Number(item.milestone || item.milestone_step) === mIndex && !item.is_draft)
                .sort((a, b) => new Date(b.submitted_at || b.createdAt) - new Date(a.submitted_at || a.createdAt))[0];
            const resubmissionRequested = getSubmissionReviewStatus(latestOfficialSubmission) === "REVISION_REQUESTED";
            if (now > new Date(milestone.endDate) && !milestone.allowLate && !resubmissionRequested) {
                showAppNotification("Đã quá hạn nộp bài cho mốc này.", "error");
                return;
            }
            
            const selectedUpload = pendingMilestoneFiles[mIndex];
            const file = selectedUpload?.file || fileInput.files?.[0];
            if (!file) {
                showAppNotification("Vui lòng chọn file báo cáo trước khi nộp!", "warning");
                return;
            }

            if (!currentTopicData || !currentTopicData._id) {
                showAppNotification("Chưa lấy được thông tin đề tài. Vui lòng tải lại trang!", "error");
                return;
            }

            const studentAuth = getAuthForRole("STUDENT");
            const token = studentAuth?.token;
            const user = studentAuth?.user || {};

            // Hiển thị spinner và disable nút nộp bài
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang nộp bài...';

            const progressBar = document.getElementById(`uploadProgressBarM${mIndex}`);
            if (progressBar) progressBar.style.width = "45%";

            try {
                const formData = new FormData();
                formData.append("file", file, selectedUpload?.uploadName || file.name);
                formData.append("milestoneIndex", mIndex);
                formData.append("milestone", mIndex);
                formData.append("isDraft", "true");

                if (progressBar) progressBar.style.width = "75%";

                // Gửi request đến Endpoint backend
                const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/${currentTopicData._id}/upload-milestone/${mIndex}`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    },
                    body: formData
                });

                if (progressBar) progressBar.style.width = "100%";

                if (!res.ok) {
                    let errMsg = "Không thể lưu file báo cáo!";
                    try {
                        const errJson = await res.json();
                        errMsg = errJson.message || errMsg;
                    } catch (e) {
                        errMsg = `Lỗi hệ thống (${res.status}). Vui lòng kiểm tra lại Route ở Backend.`;
                    }
                    showAppNotification(`Nộp bài thất bại: ${errMsg}`, "error");
                    
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Nộp bài';
                    return;
                }

                const result = await res.json();
                delete pendingMilestoneFiles[mIndex];
                
                // Toast xanh thành công theo yêu cầu
                showAppNotification(result.message || `Đã nộp bài Mốc ${mIndex} thành công!`, "success");

                // Đồng bộ lại dữ liệu thực tế từ MongoDB - Card chuyển sang "Đã nộp" kèm tên tệp, giờ nộp, nút "Nộp lại" nếu còn hạn
                await loadMyTopic(user.user_code);

            } catch (err) {
                console.error("Lỗi kết nối khi nộp mốc:", err);
                showAppNotification("Không thể kết nối đến máy chủ! Vui lòng kiểm tra lại Backend server.", "error");
                
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Nộp bài';
            }
        });
    }

    function getFileTypeInfo(filename) {
        const ext = (filename || "").split(".").pop().toLowerCase();
        if (ext === "pdf") {
            return { icon: "fa-file-pdf", colorClass: "icon-pdf" };
        } else if (["doc", "docx"].includes(ext)) {
            return { icon: "fa-file-word", colorClass: "icon-doc" };
        } else if (["zip", "rar", "7z"].includes(ext)) {
            return { icon: "fa-file-zipper", colorClass: "icon-zip" };
        }
        return { icon: "fa-file-lines", colorClass: "icon-generic" };
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        const file = files[0];
        const allowedExtensions = ["pdf", "doc", "docx", "zip", "rar", "7z", "ppt", "pptx"];
        const ext = (file.name || "").split(".").pop().toLowerCase();

        if (!allowedExtensions.includes(ext)) {
            showAppNotification("Định dạng tệp không được hỗ trợ! Vui lòng chọn tệp PDF, Word, PowerPoint hoặc file nén (ZIP, RAR, 7z).", "error");
            fileInput.value = "";
            delete pendingMilestoneFiles[mIndex];
            if (previewBox) {
                previewBox.innerHTML = "";
                previewBox.style.display = "none";
            }
            if (promptBox) promptBox.style.display = "flex";
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.style.opacity = "0.5";
                btnSubmit.style.cursor = "not-allowed";
            }
            return;
        }

        if (file.size > 25 * 1024 * 1024) {
            showAppNotification("File vượt quá kích thước tối đa 25MB!", "error");
            fileInput.value = "";
            delete pendingMilestoneFiles[mIndex];
            if (previewBox) {
                previewBox.innerHTML = "";
                previewBox.style.display = "none";
            }
            if (promptBox) promptBox.style.display = "flex";
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.style.opacity = "0.5";
                btnSubmit.style.cursor = "not-allowed";
            }
            return;
        }

        const uploadName = pendingMilestoneFiles[mIndex]?.uploadName || file.name;
        pendingMilestoneFiles[mIndex] = { file, uploadName };
        const fileType = getFileTypeInfo(uploadName);
        const fileSizeStr = (file.size / (1024 * 1024)).toFixed(2) + " MB";

        if (promptBox) promptBox.style.display = "none";

        if (previewBox) {
            previewBox.style.display = "block";
            previewBox.innerHTML = `
                <div class="selected-file-card">
                    <div class="file-card-icon ${fileType.colorClass}">
                        <i class="fa-solid ${fileType.icon}"></i>
                    </div>
                    <div class="file-card-info">
                        <div class="file-card-name" title="${escapeHtml(uploadName)}">${escapeHtml(uploadName)}</div>
                        <div class="file-card-size">${fileSizeStr}</div>
                        <div class="upload-progress-wrap" id="uploadProgressWrapM${mIndex}">
                            <div class="upload-progress-bar" id="uploadProgressBarM${mIndex}" style="width: 100%;"></div>
                        </div>
                    </div>
                    <button type="button" class="btn-remove-file" title="Xóa tệp" aria-label="Xóa tệp">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>`;
        }

        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.style.opacity = "1";
            btnSubmit.style.cursor = "pointer";
        }
    }
}