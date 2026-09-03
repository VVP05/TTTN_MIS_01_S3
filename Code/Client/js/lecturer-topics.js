// Cấu hình URL Backend API
const API_BASE_URL = 'http://localhost:5000/api/topics';

// Biến toàn cục lưu dữ liệu đề tài tải về từ Server
let allTopicsData = {
    pending: [],
    approved: [],
    myPool: []
};

// Biến tạm lưu trữ ID đề tài và hành động đang thao tác trong Modal
let currentSelectedTopicId = null;
let currentActionType = null; // 'APPROVE' | 'REJECT' | 'REVISION'

document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA ĐĂNG NHẬP (Bắt buộc Token và Role là LECTURER)
    let lecturerAuth = null;
    try {
        lecturerAuth = JSON.parse(localStorage.getItem("lecturerAuth") || "null");
    } catch (error) {
        lecturerAuth = null;
    }

    const token = lecturerAuth?.token;
    const userStr = lecturerAuth?.user ? JSON.stringify(lecturerAuth.user) : null;

    if (!token || !userStr) {
        alert("Bạn chưa đăng nhập. Vui lòng đăng nhập để tiếp tục!");
        window.location.href = "index.html";
        return;
    }

    const user = JSON.parse(userStr);
    if (user.role !== "LECTURER") {
        alert("Bạn không có quyền truy cập trang dành cho Giảng viên!");
        window.location.href = "index.html";
        return;
    }

    const lecturerCode = user.user_code || user.userCode;

    // Hiển thị thông tin giảng viên lên Topbar
    const userNameEl = document.getElementById("userName");
    const userCodeEl = document.getElementById("userCode");
    if (userNameEl) userNameEl.textContent = user.full_name || user.fullName;
    if (userCodeEl) userCodeEl.textContent = lecturerCode;

    // Xử lý Đăng xuất
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.clear();
            window.location.href = "index.html";
        });
    }

    // 2. TẢI DỮ LIỆU THẬT TỪ SERVER
    loadLecturerTopics(lecturerCode, token);

    // 3. XỬ LÝ CHUYỂN TAB
    const tabButtons = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            tabButtons.forEach(b => b.classList.remove("active"));
            tabContents.forEach(c => c.classList.remove("active"));

            btn.classList.add("active");
            const targetTabId = btn.getAttribute("data-tab");
            const targetContent = document.getElementById(`tab-${targetTabId}`);
            if (targetContent) targetContent.classList.add("active");

            // Render lại dữ liệu cho phù hợp bộ lọc hiện tại
            filterAndRender();
        });
    });

    // 4. LẮNG NGHE LỌC & TÌM KIẾM
    const searchInput = document.getElementById("searchTopicInput");
    const categoryFilter = document.getElementById("categoryFilter");

    if (searchInput) searchInput.addEventListener("input", filterAndRender);
    if (categoryFilter) categoryFilter.addEventListener("change", filterAndRender);

    // 5. THIẾT LẬP CÁC MODAL THAO TÁC
    setupModals(lecturerCode, token);
});

/**
 * Hàm gọi API Backend tải toàn bộ danh sách đề tài của Giảng viên
 */
async function loadLecturerTopics(lecturerCode, token) {
    try {
        const response = await fetch(`${API_BASE_URL}/lecturer/${lecturerCode}`, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });
        const result = await response.json();

        if (response.ok && result.success) {
            allTopicsData = {
                pending: result.data.pending || [],
                approved: result.data.approved || [],
                myPool: result.data.myPool || []
            };

            // Cập nhật số lượng huy hiệu (badge) tab Chờ duyệt
            const badgePending = document.getElementById("badge-pending");
            if (badgePending) {
                badgePending.textContent = allTopicsData.pending.length;
            }

            // Render ra giao diện
            filterAndRender();
        } else {
            console.error("Lỗi từ server:", result.message);
        }
    } catch (error) {
        console.error("Lỗi kết nối API:", error);
        alert("Không thể kết nối đến máy chủ Backend!");
    }
}

/**
 * Lọc theo Từ khóa + Lĩnh vực và Render vào bảng
 */
function filterAndRender() {
    const keyword = (document.getElementById("searchTopicInput")?.value || "").toLowerCase().trim();
    const category = document.getElementById("categoryFilter")?.value || "ALL";

    // Hàm kiểm tra 1 đề tài có thỏa mãn điều kiện lọc không
    const matchFilter = (topic) => {
        const matchKeyword = (
            (topic.title || "").toLowerCase().includes(keyword) ||
            (topic.topic_code || "").toLowerCase().includes(keyword) ||
            (topic.leader_code || topic.student_code || "").toLowerCase().includes(keyword) ||
            (topic.member2_code || "").toLowerCase().includes(keyword) ||
            (topic.member3_code || "").toLowerCase().includes(keyword)
        );
        const matchCategory = (category === "ALL" || topic.category === category);
        return matchKeyword && matchCategory;
    };

    // Lọc dữ liệu từng mảng
    const filteredPending = allTopicsData.pending.filter(matchFilter);
    const filteredApproved = allTopicsData.approved.filter(matchFilter);
    const filteredMyPool = allTopicsData.myPool.filter(matchFilter);

    // Render ra 3 Tab
    renderPendingTable(filteredPending);
    renderApprovedTable(filteredApproved);
    renderMyTopicsTable(filteredMyPool);
}

/**
 * RENDER TAB 1: CHỜ PHÊ DUYỆT
 */
function renderPendingTable(list) {
    const tbody = document.getElementById("tbody-pending");
    const footerText = document.getElementById("footer-pending-text");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: #64748b;">Không có đề tài nào chờ phê duyệt</td></tr>`;
        if (footerText) footerText.innerHTML = "Hiển thị <strong>0</strong> kết quả";
        return;
    }

    list.forEach(topic => {
        const tr = document.createElement("tr");
        const dateStr = topic.createdAt ? new Date(topic.createdAt).toLocaleDateString("vi-VN") : "N/A";
        const tagClass = getCategoryTagClass(topic.category);

        tr.innerHTML = `
            <td><strong>${topic.topic_code || ("DT-" + (topic._id ? topic._id.slice(-5).toUpperCase() : "0000"))}</strong></td>
            <td>
                <div class="topic-title-cell">
                    <a href="#" class="topic-title-link">${topic.title}</a>
                    <small>${topic.description ? topic.description.substring(0, 70) + "..." : "Không có mô tả"}</small>
                </div>
            </td>
            <td><span class="tag ${tagClass}">${topic.category || "Web / Ứng dụng"}</span></td>
            <td><strong>${topic.leader_code || "N/A"}</strong></td>
            <td>${dateStr}</td>
            <td class="action-buttons">
                <button class="btn-icon btn-approve" title="Phê duyệt đề tài" onclick="openConfirmModal('${topic._id}', 'APPROVE')">
                    <i class="fa-solid fa-check"></i>
                </button>
                <button class="btn-icon btn-revision" title="Yêu cầu chỉnh sửa" onclick="openRevisionModal('${topic._id}')">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button class="btn-icon btn-reject" title="Từ chối đề tài" onclick="openConfirmModal('${topic._id}', 'REJECT')">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (footerText) {
        footerText.innerHTML = `Hiển thị <strong>${list.length}</strong> trên tổng số <strong>${allTopicsData.pending.length}</strong> đề tài chờ duyệt`;
    }
}

/**
 * RENDER TAB 2: ĐÃ PHÊ DUYỆT (HIỂN THỊ CÁC THÀNH VIÊN)
 */
function renderApprovedTable(list) {
    const tbody = document.getElementById("tbody-approved");
    const footerText = document.getElementById("footer-approved-text");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 24px; color: #64748b;">Chưa có đề tài nào được phê duyệt</td></tr>`;
        if (footerText) footerText.innerHTML = "Hiển thị <strong>0</strong> kết quả";
        return;
    }

    list.forEach(topic => {
        const tr = document.createElement("tr");
        const dateStr = topic.updatedAt ? new Date(topic.updatedAt).toLocaleDateString("vi-VN") : "N/A";
        const tagClass = getCategoryTagClass(topic.category);
        
        // Tạo chuỗi danh sách sinh viên tham gia
        let members = topic.leader_code || "N/A";
        if (topic.member2_code) members += `, ${topic.member2_code}`;
        if (topic.member3_code) members += `, ${topic.member3_code}`;

        tr.innerHTML = `
            <td><strong>${topic.topic_code || ("DT-" + (topic._id ? topic._id.slice(-5).toUpperCase() : "0000"))}</strong></td>
            <td><strong>${topic.title}</strong></td>
            <td><span class="tag ${tagClass}">${topic.category || "Web / Ứng dụng"}</span></td>
            <td>${members}</td>
            <td>${dateStr}</td>
            <td><span class="badge badge-success">Đang hướng dẫn</span></td>
            <td><a href="lecturer-progress-detail.html?topicId=${encodeURIComponent(topic._id)}" class="link-action">Xem tiến độ</a></td>
        `;
        tbody.appendChild(tr);
    });

    if (footerText) {
        footerText.innerHTML = `Hiển thị <strong>${list.length}</strong> trên tổng số <strong>${allTopicsData.approved.length}</strong> đề tài đang hướng dẫn`;
    }
}

/**
 * RENDER TAB 3: KHO ĐỀ TÀI CỦA TÔI (Đã thêm logic tự đối soát dữ liệu với danh sách Đã phê duyệt)
 */
function renderMyTopicsTable(list) {
    const tbody = document.getElementById("tbody-mytopics");
    const footerText = document.getElementById("footer-mytopics-text");
    if (!tbody) return;

    tbody.innerHTML = "";

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 24px; color: #64748b;">Kho đề tài trống. Bạn chưa đăng đề tài gợi ý nào.</td></tr>`;
        if (footerText) footerText.innerHTML = "Hiển thị <strong>0</strong> kết quả";
        return;
    }

    // Lấy danh sách Tên & ID của tất cả các Đề tài ĐÃ PHÊ DUYỆT từ Tab 2
    const approvedTitles = (allTopicsData.approved || []).map(t => (t.title || "").trim().toLowerCase());
    const approvedPoolIds = (allTopicsData.approved || []).map(t => (t.pool_topic_id || t.pool_id || "").toString().trim().toLowerCase());

    list.forEach(topic => {
        const tr = document.createElement("tr");
        const tagClass = getCategoryTagClass(topic.category);
        
        const currentTitle = (topic.title || "").trim().toLowerCase();
        const currentId = (topic._id || "").toString().trim().toLowerCase();

        // Kiểm tra xem Đề tài Kho này có khớp với đề tài nào đã được duyệt hay không
        const isMatchedWithApproved = approvedTitles.includes(currentTitle) || (currentId && approvedPoolIds.includes(currentId));

        const isRegistered = (
            topic.status === 'REGISTERED' || 
            topic.is_registered === true
        );

        const statusBadge = isRegistered
            ? `<span class="badge badge-success">Đã đăng ký</span>` 
            : topic.status === 'APPROVED'
            ? `<span class="badge badge-primary">Đã phê duyệt</span>`
            : topic.status === 'PENDING'
            ? `<span class="badge badge-warning">Chờ duyệt</span>`
            : topic.status === 'REJECTED'
            ? `<span class="badge badge-danger">Đã từ chối</span>`
            : `<span class="badge badge-warning">Đang mở đăng ký</span>`;

        tr.innerHTML = `
            <td><strong>${topic.topic_code || ("DT-" + (topic._id ? topic._id.slice(-5).toUpperCase() : "0000"))}</strong></td>
            <td><strong>${topic.title}</strong></td>
            <td><span class="tag ${tagClass}">${topic.category || "Web / Ứng dụng"}</span></td>
            <td>${topic.description || topic.requirements || "Không có yêu cầu"}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-text-edit" onclick="alert('Chức năng chỉnh sửa đề tài kho đang được hoàn thiện!')">Sửa</button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    if (footerText) {
        footerText.innerHTML = `Hiển thị <strong>${list.length}</strong> trên tổng số <strong>${allTopicsData.myPool.length}</strong> đề tài trong kho`;
    }
}

/**
 * Hàm trợ giúp chọn màu Tag theo lĩnh vực
 */
function getCategoryTagClass(category) {
    if (category === "AI / ML") return "tag-green";
    if (category === "Dữ liệu / Phân tích") return "tag-purple";
    return "tag-blue";
}

/**
 * THIẾT LẬP CÁC SỰ KIỆN ĐÓNG/MỞ MODAL & GỌI API THAO TÁC
 */
function setupModals(lecturerCode, token) {
    const createModal = document.getElementById("createTopicModal");
    const revisionModal = document.getElementById("revisionModal");
    const confirmModal = document.getElementById("actionConfirmModal");

    // Đóng Modal khi bấm nút X hoặc Hủy
    document.querySelectorAll(".btn-close-modal").forEach(btn => {
        btn.addEventListener("click", () => {
            if (createModal) createModal.style.display = "none";
            if (revisionModal) revisionModal.style.display = "none";
            if (confirmModal) confirmModal.style.display = "none";
        });
    });

    // Mở Modal Đề xuất đề tài mới vào Kho
    const openCreateBtn = document.getElementById("openCreateModalBtn");
    if (openCreateBtn) {
        openCreateBtn.addEventListener("click", () => {
            if (createModal) createModal.style.display = "flex";
        });
    }

    // Xử lý Form thêm đề tài mới vào Kho Gợi ý (POST /api/topics/lecturer-pool)
    const createForm = document.getElementById("createTopicForm");
    if (createForm) {
        createForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const titleInput = document.getElementById("createTitle")?.value.trim();
            const categoryInput = document.getElementById("createCategory")?.value;
            const maxGroupsInput = document.getElementById("createMaxGroups")?.value;
            const descriptionInput = document.getElementById("createDescription")?.value.trim();

            if (!titleInput) {
                alert("Vui lòng nhập tên đề tài!");
                return;
            }

            try {
                const response = await fetch(`${API_BASE_URL}/lecturer-pool`, {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        lecturer_code: lecturerCode,
                        title: titleInput,
                        category: categoryInput || "Web / Ứng dụng",
                        description: descriptionInput || "Chưa có mô tả chi tiết",
                        max_groups: Number(maxGroupsInput) || 1
                    })
                });

                const result = await response.json();
                if (response.ok && result.success) {
                    alert("Đã lưu đề tài mới vào Kho gợi ý cho sinh viên thành công!");
                    if (createModal) createModal.style.display = "none";
                    createForm.reset();
                    
                    // Tải lại dữ liệu và tự động kích hoạt Tab Kho đề tài để xem kết quả
                    await loadLecturerTopics(lecturerCode, token);

                    const poolTabBtn = document.querySelector('.tab-btn[data-tab="mytopics"]');
                    if (poolTabBtn) poolTabBtn.click();
                } else {
                    alert("Lỗi: " + (result.message || "Không thể tạo đề tài"));
                }
            } catch (error) {
                console.error("Lỗi khi tạo đề tài:", error);
                alert("Lỗi kết nối máy chủ khi tạo đề tài!");
            }
        });
    }

    const rejectModal = document.getElementById("rejectTopicModal");
    const rejectReasonInput = document.getElementById("rejectReasonInput");
    const confirmRejectBtn = document.getElementById("confirmRejectBtn");

    // Xử lý nút Xác nhận Phê duyệt trong Confirm Modal
    const confirmActionBtn = document.getElementById("confirmActionBtn");
    if (confirmActionBtn) {
        confirmActionBtn.addEventListener("click", async () => {
            if (!currentSelectedTopicId || !currentActionType || currentActionType !== 'APPROVE') return;

            const feedbackMsg = 'Giảng viên đã đồng ý hướng dẫn đề tài này.';
            await executeStatusUpdate(currentSelectedTopicId, 'APPROVED', feedbackMsg, lecturerCode, token);
            if (confirmModal) confirmModal.style.display = "none";
        });
    }

    // Xử lý nút Xác nhận Từ chối (Modal nhập lý do)
    if (confirmRejectBtn) {
        confirmRejectBtn.addEventListener("click", async () => {
            const reason = rejectReasonInput ? rejectReasonInput.value.trim() : "";
            if (!reason) {
                alert("Vui lòng điền lý do từ chối đề tài!");
                return;
            }

            await executeStatusUpdate(currentSelectedTopicId, 'REJECTED', reason, lecturerCode, token);
            if (rejectModal) rejectModal.style.display = "none";
            if (rejectReasonInput) rejectReasonInput.value = "";
        });
    }

    // Xử lý nút Gửi Yêu Cầu Chỉnh Sửa trong Revision Modal
    const confirmRevisionBtn = document.getElementById("confirmRevisionBtn");
    if (confirmRevisionBtn) {
        confirmRevisionBtn.addEventListener("click", async () => {
            const noteInput = document.getElementById("revisionNoteInput");
            const note = noteInput ? noteInput.value.trim() : "";
            
            if (!note) {
                alert("Vui lòng nhập chi tiết phản hồi/yêu cầu chỉnh sửa cho sinh viên!");
                return;
            }

            await executeStatusUpdate(currentSelectedTopicId, 'NEED_REVISION', note, lecturerCode, token);
            if (revisionModal) revisionModal.style.display = "none";
            if (noteInput) noteInput.value = "";
        });
    }

    // Đóng khi nhấp ra ngoài Modal
    window.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal-overlay")) {
            e.target.style.display = "none";
        }
    });
}

/**
 * HÀM MỞ MODAL PHÊ DUYỆT / TỪ CHỐI (Gọi từ HTML inline onclick)
 */
window.openConfirmModal = function(topicId, actionType) {
    currentSelectedTopicId = topicId;
    currentActionType = actionType;

    const modal = document.getElementById("actionConfirmModal");
    const iconEl = document.getElementById("confirmIcon");
    const titleEl = document.getElementById("confirmTitle");
    const msgEl = document.getElementById("confirmMessage");
    const actionBtn = document.getElementById("confirmActionBtn");

    if (!modal) return;

    if (actionType === 'APPROVE') {
        if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #16a34a; font-size: 3rem;"></i>';
        if (titleEl) titleEl.textContent = "Xác nhận phê duyệt";
        if (msgEl) msgEl.textContent = "Bạn có chắc chắn muốn phê duyệt đề tài này cho nhóm sinh viên không?";
        if (actionBtn) {
            actionBtn.style.backgroundColor = "#16a34a";
            actionBtn.textContent = "Phê duyệt ngay";
        }

        if (modal) modal.style.display = "flex";
    } else {
        if (modal) modal.style.display = "none";
        const rejectModal = document.getElementById("rejectTopicModal");
        const rejectReasonInput = document.getElementById("rejectReasonInput");
        if (rejectReasonInput) rejectReasonInput.value = "";
        if (rejectModal) rejectModal.style.display = "flex";
    }
};

/**
 * HÀM MỞ MODAL YÊU CẦU CHỈNH SỬA (Gọi từ HTML inline onclick)
 */
window.openRevisionModal = function(topicId) {
    currentSelectedTopicId = topicId;
    const modal = document.getElementById("revisionModal");
    if (modal) modal.style.display = "flex";
};

/**
 * GỌI API CẬP NHẬT TRẠNG THÁI ĐỀ TÀI (PUT /api/topics/update-status/:topic_id)
 */
async function executeStatusUpdate(topicId, status, feedback, lecturerCode, token) {
    try {
        const response = await fetch(`${API_BASE_URL}/update-status/${topicId}`, {
            method: "PUT",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ status, feedback })
        });

        const result = await response.json();
        if (response.ok && result.success) {
            alert(result.message || "Cập nhật trạng thái đề tài thành công!");
            // Tải lại dữ liệu mới nhất từ Server (sẽ tự động cập nhật lại Kho đề tài sang Đã đăng ký)
            loadLecturerTopics(lecturerCode, token);
        } else {
            alert("Lỗi thao tác: " + (result.message || "Không thể cập nhật trạng thái đề tài!"));
        }
    } catch (error) {
        console.error("Lỗi khi cập nhật trạng thái:", error);
        alert("Lỗi kết nối máy chủ khi cập nhật trạng thái!");
    }
}