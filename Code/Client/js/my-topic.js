// Biến toàn cục lưu thông tin đề tài sau khi load
let currentTopicData = null;
const TOTAL_MILESTONES = 5;

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
    
    // 1. KIỂM TRA PHIÊN ĐĂNG NHẬP
    const auth = getAuthForRole("STUDENT") || { token: localStorage.getItem("token"), user: JSON.parse(localStorage.getItem("user") || "null") };
    const user = auth?.user;
    const token = auth?.token || localStorage.getItem("token");

    if (!user || user.role !== "STUDENT") {
        window.location.href = "index.html";
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
        btnCancelTopic.addEventListener("click", async () => {
            if (!currentTopicData || !currentTopicData._id) {
                alert("Bạn chưa có đề tài nào để hủy!");
                return;
            }

            if (currentTopicData.status === "APPROVED") {
                alert("Đề tài đã được phê duyệt! Bạn không thể tự hủy, vui lòng liên hệ Giảng viên.");
                return;
            }

            const confirmCancel = confirm("Bạn có chắc chắn muốn hủy đăng ký đề tài này để đăng ký đề tài khác không?");
            if (confirmCancel) {
                try {
                    const res = await fetch(`http://localhost:5000/api/topics/delete/${currentTopicData._id}`, {
                        method: "DELETE",
                        headers: {
                            "Authorization": `Bearer ${token}`
                        }
                    });
                    
                    const result = await res.json();

                    if (res.ok) {
                        alert(result.message || "Đã hủy đề tài thành công!");
                        window.location.href = "student-dashboard.html";
                    } else {
                        alert(result.message || "Không thể hủy đề tài!");
                    }
                } catch (err) {
                    console.error("Lỗi khi hủy đề tài:", err);
                    alert("Lỗi kết nối máy chủ khi hủy đề tài!");
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
            window.location.href = "index.html";
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
        const token = JSON.parse(localStorage.getItem("studentAuth") || "null")?.token;
        const res = await fetch(`http://localhost:5000/api/auth/users/${userCode}`, {
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
        const token = JSON.parse(localStorage.getItem("studentAuth") || "null")?.token;
        const response = await fetch(`http://localhost:5000/api/topics/my-topic/${userCode}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            renderEmptyState();
            return;
        }

        const data = await response.json();
        
        if (data && data._id) {
            currentTopicData = data;

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

                    // Render quy trình 5 mốc theo dữ liệu thực từ Backend
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
        } else {
            renderEmptyState();
        }
    } catch (error) {
        console.error("Lỗi khi kết nối đến Server:", error);
        renderEmptyState();
    }
}

// =========================================================
// QUẢN LÝ QUY TRÌNH TIẾN ĐỘ TUẦN TỰ (WORKFLOW 5 MỐC)
// =========================================================
function renderMilestonesWorkflow(topicData) {
    let activeFound = false;

    for (let i = 1; i <= TOTAL_MILESTONES; i++) {
        const mFile = topicData[`milestone${i}_file`] || (topicData.milestones && topicData.milestones[i - 1]);

        if (mFile && (mFile.name || mFile.original_name || mFile.filename)) {
            const fileName = mFile.name || mFile.original_name || mFile.filename;
            const timeStr = mFile.submittedAt ? new Date(mFile.submittedAt).toLocaleString('vi-VN') : "Đã nộp";
            setMilestoneCompleted(i, fileName, timeStr);
        } else if (!activeFound) {
            enableMilestoneUpload(i);
            activeFound = true;
        } else {
            const prevM = i - 1;
            lockMilestone(i, `Cột mốc này sẽ tự động mở sau khi hoàn thành Mốc ${prevM}.`);
        }
    }
}

// HÀM MỞ KHÓA VÀ RENDER FORM UPLOAD CHO MỐC ĐẾN LƯỢT
function enableMilestoneUpload(mIndex) {
    const card = document.getElementById(`milestoneCard${mIndex}`);
    const badge = document.getElementById(`statusBadge${mIndex}`);
    const body = document.getElementById(`milestoneBody${mIndex}`);

    if (card) card.className = "milestone-card active";
    if (badge) {
        badge.className = "m-badge orange";
        badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang diễn ra';
    }

    if (body) {
        body.innerHTML = `
            <form id="formMilestone${mIndex}" class="upload-form">
                <div class="upload-zone">
                    <input type="file" id="fileMilestone${mIndex}" class="input-file" hidden />
                    <label for="fileMilestone${mIndex}" class="upload-box" id="dropZoneM${mIndex}" style="cursor: pointer;">
                        <i class="fa-solid fa-cloud-arrow-up upload-icon" style="color: #2563eb;"></i>
                        <span class="upload-text" style="color: #334155;">Kéo thả file báo cáo vào đây hoặc <strong>chọn file từ máy tính</strong></span>
                        <small class="upload-hint">Định dạng hỗ trợ: .PDF, .DOCX, .ZIP, .RAR (Dung lượng tối đa 25MB)</small>
                    </label>
                </div>
                
                <div id="selectedFileM${mIndex}" class="selected-file-preview" style="display: none;">
                    <i class="fa-solid fa-paperclip"></i>
                    <span class="file-name-text">filename.pdf</span>
                    <button type="button" class="btn-remove-file" id="removeFileM${mIndex}" title="Xóa file"><i class="fa-solid fa-xmark"></i></button>
                </div>

                <div class="upload-actions">
                    <button type="submit" class="btn-primary" id="btnSubmitM${mIndex}" disabled style="opacity: 0.5; cursor: not-allowed;">
                        <i class="fa-solid fa-paper-plane"></i> Nộp báo cáo Mốc ${mIndex}
                    </button>
                </div>
            </form>
        `;

        initUploadEvents(mIndex);
    }
}

// HÀM HIỂN THỊ MỐC Ở TRẠNG THÁI ĐÃ HOÀN THÀNH
function setMilestoneCompleted(mIndex, fileName, timeStr) {
    const card = document.getElementById(`milestoneCard${mIndex}`);
    const badge = document.getElementById(`statusBadge${mIndex}`);
    const body = document.getElementById(`milestoneBody${mIndex}`);

    if (card) card.className = "milestone-card completed";
    if (badge) {
        badge.className = "m-badge green";
        badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Đã hoàn thành';
    }
    if (body) {
        body.innerHTML = `
            <div class="submitted-file-info">
                <div class="file-details" style="display: flex; align-items: center; gap: 12px; background: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <i class="fa-solid fa-file-pdf" style="font-size: 28px; color: #ef4444;"></i>
                    <div>
                        <strong style="color: #1e293b; display: block;">${fileName}</strong>
                        <small style="color: #64748b;">Nộp lúc: ${timeStr} (Đã xác nhận)</small>
                    </div>
                </div>
            </div>`;
    }
}

// HÀM KHÓA MỐC VÀ ẨN Ô UPLOAD
function lockMilestone(mIndex, msg) {
    const card = document.getElementById(`milestoneCard${mIndex}`);
    const badge = document.getElementById(`statusBadge${mIndex}`);
    const body = document.getElementById(`milestoneBody${mIndex}`);

    if (card) card.className = "milestone-card locked";
    if (badge) {
        badge.className = "m-badge gray";
        badge.innerHTML = '<i class="fa-solid fa-lock"></i> Chưa mở';
    }
    if (body) {
        body.innerHTML = `<p class="locked-msg"><i class="fa-solid fa-lock"></i> ${msg}</p>`;
    }
}

function disableAllMilestones(reasonMsg) {
    for (let i = 1; i <= TOTAL_MILESTONES; i++) {
        lockMilestone(i, reasonMsg);
    }
}

function renderEmptyState() {
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

// =========================================================
// HÀM KHỞI TẠO SỰ KIỆN KÉO THẢ / CHỌN FILE VÀ UPLOAD THỰC TẾ
// =========================================================
function initUploadEvents(mIndex) {
    const fileInput = document.getElementById(`fileMilestone${mIndex}`);
    const dropZone = document.getElementById(`dropZoneM${mIndex}`);
    const previewBox = document.getElementById(`selectedFileM${mIndex}`);
    const btnRemove = document.getElementById(`removeFileM${mIndex}`);
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
            handleFiles(e.dataTransfer.files);
        }
    });

    if (btnRemove) {
        btnRemove.addEventListener("click", () => {
            fileInput.value = "";
            if (previewBox) previewBox.style.display = "none";
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.style.opacity = "0.5";
                btnSubmit.style.cursor = "not-allowed";
            }
        });
    }

    if (formEl) {
        formEl.addEventListener("submit", async (e) => {
            e.preventDefault();
            
            if (!fileInput.files || fileInput.files.length === 0) {
                alert("Vui lòng chọn file báo cáo trước khi nộp!");
                return;
            }

            if (!currentTopicData || !currentTopicData._id) {
                alert("Chưa lấy được thông tin đề tài. Vui lòng tải lại trang!");
                return;
            }

            const file = fileInput.files[0];
            const studentAuth = JSON.parse(localStorage.getItem("studentAuth") || "null");
            const token = studentAuth?.token;
            const user = studentAuth?.user || {};

            // Disable nút nộp bài tránh click nhiều lần
            btnSubmit.disabled = true;
            btnSubmit.style.opacity = "0.7";
            btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi dữ liệu...';

            try {
                const formData = new FormData();
                formData.append("file", file);
                formData.append("milestoneIndex", mIndex);
                formData.append("milestone", mIndex);

                // Gửi request đến Endpoint backend
                const res = await fetch(`http://localhost:5000/api/topics/${currentTopicData._id}/upload-milestone/${mIndex}`, {
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
                    alert(`Nộp bài thất bại: ${errMsg}`);
                    
                    btnSubmit.disabled = false;
                    btnSubmit.style.opacity = "1";
                    btnSubmit.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Nộp báo cáo Mốc ${mIndex}`;
                    return;
                }

                const result = await res.json();
                alert(result.message || `Nộp thành công Mốc ${mIndex}: "${file.name}".`);

                // Đồng bộ lại dữ liệu thực tế từ MongoDB
                await loadMyTopic(user.user_code);

            } catch (err) {
                console.error("Lỗi kết nối khi nộp mốc:", err);
                alert("Không thể kết nối đến máy chủ! Vui lòng kiểm tra lại Backend server.");
                
                btnSubmit.disabled = false;
                btnSubmit.style.opacity = "1";
                btnSubmit.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Nộp báo cáo Mốc ${mIndex}`;
            }
        });
    }

    function handleFiles(files) {
        if (!files || files.length === 0) return;
        const file = files[0];
        if (file.size > 25 * 1024 * 1024) {
            alert("File vượt quá kích thước tối đa 25MB!");
            fileInput.value = "";
            return;
        }
        if (previewBox) {
            const fileNameText = previewBox.querySelector(".file-name-text");
            if (fileNameText) fileNameText.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
            previewBox.style.display = "flex";
        }
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.style.opacity = "1";
            btnSubmit.style.cursor = "pointer";
        }
    }
}