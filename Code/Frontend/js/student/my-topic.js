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
            const response = await apiFetch(link.href, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error("Không thể tải tệp báo cáo.");
            const fileUrl = URL.createObjectURL(await response.blob());
            const downloadLink = document.createElement("a");
            downloadLink.href = fileUrl;
            downloadLink.download = link.dataset.fileName || "bao-cao";
            downloadLink.click();
            window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
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
async function getUserDisplayName(userCode) {
    if (!userCode || userCode === "N/A" || userCode === "null") {
        return "Không có (Làm cá nhân)";
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
                return `${data.full_name} (${userCode})`;
            }
        }
    } catch (err) {
        console.error("Lỗi khi lấy thông tin người dùng:", err);
    }
    
    return userCode;
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
            syncMilestoneCards();

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
                getUserDisplayName(data.lecturer_code)
            ]);

            if (document.getElementById("topicLeader")) document.getElementById("topicLeader").textContent = leaderName;
            if (document.getElementById("topicMember2")) document.getElementById("topicMember2").textContent = member2Name;
            if (document.getElementById("topicMember3")) document.getElementById("topicMember3").textContent = member3Name;
            if (document.getElementById("topicLecturer")) document.getElementById("topicLecturer").textContent = lecturerName;

            if (document.getElementById("topicFeedback")) {
                document.getElementById("topicFeedback").innerHTML = data.feedback 
                    ? `<i class="fa-regular fa-comment-dots"></i> ${data.feedback}` 
                    : `<i class="fa-regular fa-comment-dots"></i> Chưa có nhận xét mới từ giảng viên.`;
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
                    banner.innerHTML = '<i class="fa-solid fa-circle-check"></i> <span>Trạng thái: <strong>Đã phê duyệt</strong></span>';
                    
                    if (btnCancel) btnCancel.style.display = "none";

                    // Render quy trình milestone theo dữ liệu thực từ Backend
                    renderMilestonesWorkflow(data);

                } else if (data.status === "PENDING") {
                    banner.className = "status-banner pending";
                    banner.innerHTML = '<i class="fa-solid fa-clock"></i> <span>Trạng thái: <strong>Chờ phê duyệt</strong></span>';
                    
                    if (btnCancel) btnCancel.style.display = "inline-flex";
                    disableAllMilestones("Đề tài đang chờ phê duyệt");

                } else if (data.status === "REJECTED") {
                    banner.className = "status-banner rejected";
                    banner.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> <span>Trạng thái: <strong>Bị từ chối</strong></span>';
                    
                    if (btnCancel) btnCancel.style.display = "none";
                    disableAllMilestones("Đề tài bị từ chối");
                }
            }
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
        banner.textContent = isAccepted
            ? "Trưởng nhóm đã chấp nhận yêu cầu. Đang chờ trưởng nhóm đăng ký đề tài."
            : data.status === "JOIN_REJECTED"
                ? "Yêu cầu tham gia nhóm đã bị từ chối."
                : "Yêu cầu tham gia nhóm đang chờ trưởng nhóm xác nhận.";
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
    if (document.getElementById("topicLeader")) {
        document.getElementById("topicLeader").textContent = await getUserDisplayName(data.leader_code);
    }
    if (document.getElementById("topicMember2")) document.getElementById("topicMember2").textContent = "--";
    if (document.getElementById("topicMember3")) document.getElementById("topicMember3").textContent = "--";
    if (document.getElementById("topicLecturer")) document.getElementById("topicLecturer").textContent = "Chưa đăng ký";
    const cancelButton = document.getElementById("btnCancelTopic");
    if (cancelButton) cancelButton.style.display = "none";
    disableAllMilestones("Đề tài sẽ hiển thị sau khi trưởng nhóm đăng ký.");
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
                        <span class="m-badge gray" id="statusBadge${step}"><i class="fa-solid fa-lock"></i> Chưa mở</span>
                        <h4></h4>
                    </div>
                    <span class="m-deadline"></span>
                </div>
                <p class="milestone-description"></p>
                <div class="milestone-body" id="milestoneBody${step}"></div>
            `;
            card.querySelector(".m-title h4").textContent = `Mốc ${step}: ${milestone.name}`;

            const deadline = card.querySelector(".m-deadline");
            deadline.classList.toggle("text-red", new Date(milestone.endDate) < new Date());
            const clockIcon = document.createElement("i");
            clockIcon.className = "fa-regular fa-clock";
            deadline.replaceChildren(clockIcon, document.createTextNode(` Hạn nộp: ${new Date(milestone.endDate).toLocaleString("vi-VN")}`));

            const description = card.querySelector(".milestone-description");
            description.textContent = milestone.desc || "";
            description.style.display = milestone.desc ? "" : "none";
            list.appendChild(card);
        });
    }

    if (emptyState) {
        if (milestoneLoadError) {
            emptyState.textContent = "Không thể tải danh sách hạn nộp bài. Vui lòng thử tải lại trang.";
        } else if (!currentTopicData || currentTopicData.status !== "APPROVED") {
            emptyState.textContent = "Hạn nộp bài sẽ hiển thị sau khi đề tài được giảng viên phê duyệt.";
        } else {
            emptyState.textContent = "Giảng viên chưa tạo mốc tiến độ hoặc hạn nộp cho đề tài này.";
        }
        emptyState.style.display = milestones.length ? "none" : "block";
    }
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
            const submittedAt = item.submitted_at || item.createdAt;
            return `<li>
                <div class="history-submission-heading">
                    <strong>${item.is_draft ? "Bản nháp" : `Lần nộp ${Number(item.attempt) || index + 1}`}</strong>
                    <span class="history-status ${status.toLowerCase()}">${escapeHtml(getSubmissionStatusLabel(status))}</span>
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
    feedback = ""
} = {}) {
    const remainingMs = new Date(milestone?.endDate).getTime() - Date.now();
    const remainingSeconds = Math.floor(Math.abs(remainingMs) / 1000);
    const days = Math.floor(remainingSeconds / 86400);
    const hours = Math.floor((remainingSeconds % 86400) / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    const timeParts = [];
    if (days) timeParts.push(`${days} ngày`);
    if (hours || days) timeParts.push(`${hours} giờ`);
    if (minutes || hours || days) timeParts.push(`${minutes} phút`);
    timeParts.push(`${seconds} giây`);

    let timeRemaining = "Chưa xác định";
    let timeClass = "";
    if (!Number.isNaN(remainingMs)) {
        timeClass = submitted ? (remainingMs >= 0 ? "submission-row-success" : "submission-row-overdue") : "";
        timeRemaining = remainingMs >= 0
            ? `Còn ${timeParts.join(" ")}`
            : `Đã quá hạn ${timeParts.join(" ")}${milestone?.allowLate ? " (được phép nộp trễ)" : ""}`;
    }

    const storedFileId = fileInfo?.filename || String(fileInfo?.path || "").split(/[\\/]/).pop();
    const fileHref = storedFileId ? `${window.APP_CONFIG.API_BASE_URL}/api/submissions/file/${encodeURIComponent(storedFileId)}` : "";
    const escapedFileName = escapeHtml(fileName);
    const fileContent = submitted || draft
        ? `${fileHref
            ? `<a class="submission-file-link protected-submission-file" href="${escapeHtml(fileHref)}" data-file-name="${escapedFileName}">${escapedFileName}</a>`
            : escapedFileName} <span class="submission-file-date">${escapeHtml(timeStr)}</span>`
        : "Chưa có tập tin nào được nộp.";
    const status = reviewStatus || (draft ? "DRAFT" : submitted ? "PENDING_REVIEW" : "NOT_SUBMITTED");

    return `
        <h3 class="submission-status-heading">Trạng thái bài nộp</h3>
        <table class="submission-status-table">
            <tbody>
                <tr class="${status === "APPROVED" ? "submission-row-success" : ""}"><th>Trạng thái bài nộp</th><td>${escapeHtml(getSubmissionStatusLabel(status))}</td></tr>
                <tr class="${timeClass}"><th>Thời gian còn lại</th><td>${escapeHtml(timeRemaining)}</td></tr>
                <tr><th>Chỉnh sửa lần cuối</th><td>${submitted || draft ? escapeHtml(timeStr) : "Chưa nộp lần nào."}</td></tr>
                <tr class="submission-row-file"><th>Nộp tập tin</th><td>${fileContent}</td></tr>
                <tr><th>Nhận xét</th><td>${feedback ? escapeHtml(feedback) : "Chưa có nhận xét."}</td></tr>
            </tbody>
        </table>
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
            feedback: submission.feedback || ""
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

    if (card) card.className = `milestone-card ${canSubmit ? "active" : "locked"}`;
    if (badge) {
        badge.className = `m-badge ${canSubmit ? "orange" : "gray"}`;
        badge.innerHTML = canSubmit
            ? '<i class="fa-regular fa-clock"></i> Chưa nộp'
            : '<i class="fa-solid fa-lock"></i> Chưa mở';
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
        badge.className = "m-badge orange";
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
                    <h4><i class="fa-solid fa-chevron-down"></i> ${isEditing ? "Sửa bài nộp" : "Thêm bài nộp"}</h4>
                    <span>Kích thước tệp tối đa: 25 MB, số lượng tệp tối đa: 1</span>
                </header>
            <form id="formMilestone${mIndex}" class="upload-form">
                ${isEditing ? `<p class="editing-submission-note">Đang sửa bài đã nộp: <strong>${escapeHtml(existingFileName)}</strong></p>` : ""}
                <div class="upload-zone file-manager-zone" id="dropZoneM${mIndex}">
                    <input type="file" id="fileMilestone${mIndex}" class="input-file" hidden />
                    <div class="file-manager-toolbar">
                        <button type="button" class="btn-open-file-picker" id="openFilePickerM${mIndex}">
                            <i class="fa-regular fa-file"></i> Thêm tệp
                        </button>
                        <span class="file-manager-limit">PDF, DOC, DOCX, ZIP hoặc RAR</span>
                    </div>
                    <div id="selectedFileM${mIndex}" class="file-manager-list">
                        <div class="file-manager-folder"><i class="fa-regular fa-folder"></i> Tệp</div>
                        ${isEditing ? `<div class="file-manager-item"><i class="fa-regular fa-file-pdf"></i><span>${escapeHtml(existingFileName)}</span><small>Đã lưu</small></div>` : '<div class="file-manager-empty">Chưa có tệp nào được chọn</div>'}
                    </div>
                </div>

                <div class="upload-actions">
                    <button type="submit" class="btn-submit-changes" id="btnSubmitM${mIndex}" disabled style="opacity: 0.5; cursor: not-allowed;">
                        Lưu thay đổi
                    </button>
                    <button type="button" class="btn-cancel-edit" id="cancelEditM${mIndex}">Hủy bỏ</button>
                </div>
            </form>
            </section>
        `;

        initUploadEvents(mIndex);
        document.getElementById(`openFilePickerM${mIndex}`)?.addEventListener("click", () => {
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
        badge.className = "m-badge green";
        badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã duyệt';
    }
    if (body) {
        body.innerHTML = renderSubmissionStatusTable(milestone, {
            submitted: true,
            fileName,
            fileInfo,
            timeStr,
            reviewStatus: "APPROVED",
            feedback: fileInfo?.feedback || ""
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

                showAppNotification(result.message || "Đã loại bỏ bài nộp.");
                if (auth?.user?.user_code) await loadMyTopic(auth.user.user_code);
            } catch (error) {
                showAppNotification(error.message || "Không thể xóa bài nộp.");
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
        badge.className = "m-badge warning";
        badge.textContent = "Chờ nhận xét";
    }
    if (body) {
        body.innerHTML = `
            ${canChangeSubmission ? `<div class="submission-actions">
                <button type="button" class="submission-action-edit" id="replaceSubmissionM${mIndex}">
                    <i class="fa-solid fa-pen-to-square"></i> Thay file
                </button>
                <button type="button" class="submission-action-delete" id="withdrawSubmissionM${mIndex}">
                    <i class="fa-solid fa-rotate-left"></i> Rút bài nộp
                </button>
            </div>` : '<small class="submission-closed-note">Chỉ có thể thay hoặc rút bài khi còn thời hạn nộp.</small>'}
            ${renderSubmissionStatusTable(milestone, {
            submitted: true,
            fileName,
            fileInfo,
            timeStr,
            reviewStatus: "PENDING_REVIEW"
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
                showAppNotification(result.message || "Đã rút bài nộp.");
                if (auth?.user?.user_code) await loadMyTopic(auth.user.user_code);
            } catch (error) {
                showAppNotification(error.message || "Không thể rút bài nộp.");
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
        badge.className = "m-badge gray";
        badge.textContent = "Đã rút bài";
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
        badge.className = "m-badge warning";
        badge.textContent = "Cần nộp lại";
    }
    if (!body) return;

    body.innerHTML = `
        <div class="submission-actions">
            <button type="button" class="submission-action-submit" id="resubmitM${mIndex}" ${canResubmit ? "" : "disabled"}>
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
            feedback: fileInfo?.feedback || ""
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
        badge.className = "m-badge orange";
        badge.innerHTML = '<i class="fa-regular fa-floppy-disk"></i> Bản nháp';
    }
    if (!body) return;

    body.innerHTML = `
        <div class="submission-actions">
            <button type="button" class="submission-action-submit" id="submitDraftM${mIndex}" ${canEditSubmission ? "" : "disabled"}><i class="fa-solid fa-paper-plane"></i> Nộp bài</button>
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
            showAppNotification(result.message || "Đã nộp bài chính thức.");
            if (auth?.user?.user_code) await loadMyTopic(auth.user.user_code);
        } catch (error) {
            showAppNotification(error.message || "Không thể nộp bài.");
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
            showAppNotification(result.message || "Đã xóa bản nháp.");
            if (auth?.user?.user_code) await loadMyTopic(auth.user.user_code);
        } catch (error) {
            showAppNotification(error.message || "Không thể xóa bản nháp.");
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
    if (badge) badge.innerHTML = '<i class="fa-solid fa-lock"></i> Đã đóng';
}

function disableAllMilestones(reasonMsg) {
    lecturerMilestones.forEach(milestone => lockMilestone(Number(milestone.step), reasonMsg));
}

function renderEmptyState() {
    currentTopicData = null;
    milestoneSubmissionHistory = [];
    lecturerMilestones = [];
    milestoneLoadError = false;
    syncMilestoneCards();
    const banner = document.getElementById("topicStatusBanner");
    if (banner) {
        banner.className = "status-banner none";
        banner.innerHTML = 'Trạng thái: <strong style="color: #ef4444;"><i class="fa-solid fa-circle" style="color: #ef4444; font-size: 10px; vertical-align: middle; margin-right: 4px;"></i> Chưa đăng ký</strong>';
    }

    if (document.getElementById("topicTitle")) document.getElementById("topicTitle").textContent = "Bạn chưa đăng ký đề tài nào";
    if (document.getElementById("topicDesc")) document.getElementById("topicDesc").innerHTML = 'Bạn hiện chưa có thông tin đề tài. Vui lòng sang trang <a href="student-dashboard.html" style="color: #2563eb; font-weight: 600; text-decoration: underline;">Đăng ký đề tài</a> để tiến hành đăng ký.';
    if (document.getElementById("topicCode")) document.getElementById("topicCode").textContent = "--";
    if (document.getElementById("topicLecturer")) document.getElementById("topicLecturer").textContent = "Chưa phân công";
    if (document.getElementById("topicLeader")) document.getElementById("topicLeader").textContent = "--";
    if (document.getElementById("topicMember2")) document.getElementById("topicMember2").textContent = "--";
    if (document.getElementById("topicMember3")) document.getElementById("topicMember3").textContent = "--";

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
    const previewBox = document.getElementById(`selectedFileM${mIndex}`);
    const btnSubmit = document.getElementById(`btnSubmitM${mIndex}`);
    const formEl = document.getElementById(`formMilestone${mIndex}`);

    if (!fileInput || !dropZone) return;

    fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "#2563eb";
        dropZone.style.backgroundColor = "#eff6ff";
    });

    dropZone.addEventListener("dragleave", (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "#cbd5e1";
        dropZone.style.backgroundColor = "#ffffff";
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.style.borderColor = "#cbd5e1";
        dropZone.style.backgroundColor = "#ffffff";
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            fileInput.files = e.dataTransfer.files;
            pendingMilestoneFiles[mIndex] = { file: e.dataTransfer.files[0], uploadName: e.dataTransfer.files[0].name };
            handleFiles(e.dataTransfer.files);
        }
    });

    previewBox?.addEventListener("click", event => {
        if (event.target.closest(".btn-remove-file")) {
            fileInput.value = "";
            delete pendingMilestoneFiles[mIndex];
            previewBox.innerHTML = '<div class="file-manager-folder"><i class="fa-regular fa-folder"></i> Tệp</div><div class="file-manager-empty">Chưa có tệp nào được chọn</div>';
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
                showAppNotification("Chưa đến thời gian bắt đầu nộp bài cho mốc này.");
                return;
            }
            const latestOfficialSubmission = milestoneSubmissionHistory
                .filter(item => Number(item.milestone || item.milestone_step) === mIndex && !item.is_draft)
                .sort((a, b) => new Date(b.submitted_at || b.createdAt) - new Date(a.submitted_at || a.createdAt))[0];
            const resubmissionRequested = getSubmissionReviewStatus(latestOfficialSubmission) === "REVISION_REQUESTED";
            if (now > new Date(milestone.endDate) && !milestone.allowLate && !resubmissionRequested) {
                showAppNotification("Đã quá hạn nộp bài cho mốc này.");
                return;
            }
            
            const selectedUpload = pendingMilestoneFiles[mIndex];
            const file = selectedUpload?.file || fileInput.files?.[0];
            if (!file) {
                showAppNotification("Vui lòng chọn file báo cáo trước khi nộp!");
                return;
            }

            if (!currentTopicData || !currentTopicData._id) {
                showAppNotification("Chưa lấy được thông tin đề tài. Vui lòng tải lại trang!");
                return;
            }

            const studentAuth = getAuthForRole("STUDENT");
            const token = studentAuth?.token;
            const user = studentAuth?.user || {};

            // Disable nút nộp bài tránh click nhiều lần
            btnSubmit.disabled = true;
            btnSubmit.style.opacity = "0.7";
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi dữ liệu...';

            try {
                const formData = new FormData();
                formData.append("file", file, selectedUpload?.uploadName || file.name);
                formData.append("milestoneIndex", mIndex);
                formData.append("milestone", mIndex);
                formData.append("isDraft", "true");

                // Gửi request đến Endpoint backend
                const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/${currentTopicData._id}/upload-milestone/${mIndex}`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    },
                    body: formData
                });

                // Nếu Backend phản hồi lỗi HTTP (404, 500,...)
                if (!res.ok) {
                    let errMsg = "Không thể lưu file báo cáo!";
                    try {
                        const errJson = await res.json();
                        errMsg = errJson.message || errMsg;
                    } catch (e) {
                        errMsg = `Lỗi hệ thống (${res.status}). Vui lòng kiểm tra lại Route ở Backend.`;
                    }
                    showAppNotification(`Nộp bài thất bại: ${errMsg}`);
                    
                    btnSubmit.disabled = false;
                    btnSubmit.style.opacity = "1";
                    btnSubmit.innerHTML = "Lưu thay đổi";
                    return;
                }

                const result = await res.json();
                delete pendingMilestoneFiles[mIndex];
                showAppNotification(result.message || `Nộp thành công Mốc ${mIndex}: "${file.name}".`);

                // Đồng bộ lại dữ liệu thực tế từ MongoDB
                await loadMyTopic(user.user_code);

            } catch (err) {
                console.error("Lỗi kết nối khi nộp mốc:", err);
                showAppNotification("Không thể kết nối đến máy chủ! Vui lòng kiểm tra lại Backend server.");
                
                btnSubmit.disabled = false;
                btnSubmit.style.opacity = "1";
                btnSubmit.innerHTML = "Lưu thay đổi";
            }
        });
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        const file = files[0];
        if (file.size > 25 * 1024 * 1024) {
            showAppNotification("File vượt quá kích thước tối đa 25MB!");
            fileInput.value = "";
            delete pendingMilestoneFiles[mIndex];
            if (previewBox) previewBox.innerHTML = '<div class="file-manager-folder"><i class="fa-regular fa-folder"></i> Tệp</div><div class="file-manager-empty">Chưa có tệp nào được chọn</div>';
            if (btnSubmit) btnSubmit.disabled = true;
            return;
        }
        if (previewBox) {
            const uploadName = pendingMilestoneFiles[mIndex]?.uploadName || file.name;
            pendingMilestoneFiles[mIndex] = { file, uploadName };
            previewBox.innerHTML = `
                <div class="file-manager-folder"><i class="fa-regular fa-folder"></i> Tệp</div>
                <div class="file-manager-item">
                    <i class="fa-regular fa-file-lines"></i>
                    <span>${escapeHtml(uploadName)}</span>
                    <small>${(file.size / (1024 * 1024)).toFixed(2)} MB</small>
                    <button type="button" class="btn-remove-file" title="Loại bỏ tệp" aria-label="Loại bỏ tệp"><i class="fa-solid fa-xmark"></i></button>
                </div>`;
        }
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.style.opacity = "1";
            btnSubmit.style.cursor = "pointer";
        }
    }
}