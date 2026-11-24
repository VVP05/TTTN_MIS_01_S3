const API_BASE = window.APP_CONFIG.API_BASE_URL + "";

document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP
    const auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    const user = auth?.user || null;
    if (!user || user.role !== "LECTURER") {
        window.location.href = "../auth/index.html";
        return;
    }

    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    const lecturerCode = user.user_code;
    const authHeaders = { Authorization: `Bearer ${auth.token}` };

    let allMyDocuments = [];

    // 2. MODAL TẢI TÀI LIỆU MỚI
    const uploadModal = document.getElementById("uploadModal");
    const openUploadModalBtn = document.getElementById("openUploadModalBtn");
    const uploadDocForm = document.getElementById("uploadDocForm");
    const fileInput = document.getElementById("docFile");
    const fileDropzone = document.getElementById("fileDropzone");
    const fileDropzoneText = document.getElementById("fileDropzoneText");

    const openUploadModal = () => {
        if (uploadModal) uploadModal.style.display = "flex";
    };

    const closeUploadModal = () => {
        if (uploadModal) uploadModal.style.display = "none";
    };

    if (openUploadModalBtn) {
        openUploadModalBtn.addEventListener("click", openUploadModal);
    }

    document.querySelectorAll(".btn-close-modal").forEach(btn => {
        btn.addEventListener("click", closeUploadModal);
    });

    if (uploadModal) {
        uploadModal.addEventListener("click", (e) => {
            if (e.target === uploadModal) closeUploadModal();
        });
    }

    // 3. ICON THEO ĐUÔI FILE
    function getFileIcon(fileName) {
        const ext = (fileName.split(".").pop() || "").toLowerCase();
        if (ext === "pdf") return { icon: "fa-file-pdf", bg: "pdf" };
        if (["doc", "docx"].includes(ext)) return { icon: "fa-file-word", bg: "word" };
        if (["xls", "xlsx"].includes(ext)) return { icon: "fa-file-excel", bg: "excel" };
        if (["zip", "rar"].includes(ext)) return { icon: "fa-file-zipper", bg: "archive" };
        if (["ppt", "pptx"].includes(ext)) return { icon: "fa-file-powerpoint", bg: "powerpoint" };
        return { icon: "fa-file-lines", bg: "other" };
    }

    function formatDate(dateString) {
        if (!dateString) return "-";
        return new Date(dateString).toLocaleDateString("vi-VN", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
    }

    function timeAgo(dateString) {
        if (!dateString) return "";
        const now = new Date();
        const past = new Date(dateString);
        const diffDays = Math.floor((now - past) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) return "Hôm nay";
        if (diffDays === 1) return "Hôm qua";
        if (diffDays < 30) return `${diffDays} ngày trước`;
        const diffMonths = Math.floor(diffDays / 30);
        return `${diffMonths} tháng trước`;
    }

    // 4. TẢI DANH SÁCH NHÓM THỰC TẾ
    const docTargetSelect = document.getElementById("docTarget");
    const targetFilterSelect = document.getElementById("targetFilter");

    async function fetchLecturerGroups() {
        try {
            const response = await apiFetch(`${API_BASE}/api/groups/lecturer/${lecturerCode}`, { headers: authHeaders });
            const result = await response.json();

            const groups = result?.data || [];

            if (docTargetSelect) {
                docTargetSelect.innerHTML = "";
                const allOption = document.createElement("option");
                allOption.value = "Tất cả nhóm hướng dẫn";
                allOption.textContent = "Tất cả nhóm tôi đang hướng dẫn";
                docTargetSelect.appendChild(allOption);

                groups.forEach((group) => {
                    const option = document.createElement("option");
                    const groupCode = group.group_code || "Nhóm";
                    option.value = groupCode;
                    option.textContent = `Chỉ ${groupCode}`;
                    docTargetSelect.appendChild(option);
                });
            }

            if (targetFilterSelect) {
                targetFilterSelect.innerHTML = `
                    <option value="">Tất cả đối tượng</option>
                    <option value="Tất cả nhóm hướng dẫn">Tất cả nhóm</option>
                `;
                groups.forEach((group) => {
                    const opt = document.createElement("option");
                    const groupCode = group.group_code || "Nhóm";
                    opt.value = groupCode;
                    opt.textContent = groupCode;
                    targetFilterSelect.appendChild(opt);
                });
            }
        } catch (error) {
            console.error("Lỗi khi tải danh sách nhóm giảng viên:", error);
        }
    }

    // 5. TẢI DANH SÁCH TÀI LIỆU TỪ SERVER
    const myDocsTableBody = document.getElementById("myDocsTableBody");
    const facultyDocsGrid = document.getElementById("facultyDocsGrid");
    const docTableFooter = document.getElementById("docTableFooter");
    const docFooterInfo = document.getElementById("docFooterInfo");

    const searchDocInput = document.getElementById("searchDocInput");
    const categoryFilter = document.getElementById("categoryFilter");
    const targetFilter = document.getElementById("targetFilter");
    const btnResetDocFilters = document.getElementById("btnResetDocFilters");

    async function fetchMyDocuments() {
        try {
            const response = await apiFetch(`${API_BASE}/api/documents/lecturer/${lecturerCode}`, { headers: authHeaders });
            const data = await response.json();

            if (!data.success) {
                renderEmptyMyDocs();
                return;
            }

            const documents = data.documents || [];
            renderFacultyDocuments(documents.filter(doc => doc.target === "Tất cả giảng viên"));
            allMyDocuments = documents.filter(doc => doc.target !== "Tất cả giảng viên" && doc.uploader_code === lecturerCode);
            filterAndRenderMyDocs();
        } catch (error) {
            console.error("Lỗi kết nối máy chủ khi tải danh sách tài liệu:", error);
            if (myDocsTableBody) {
                myDocsTableBody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; color: #dc2626; padding: 32px;">
                            Lỗi kết nối máy chủ! Vui lòng kiểm tra Server rồi tải lại trang.
                        </td>
                    </tr>`;
            }
        }
    }

    function renderFacultyDocuments(documents) {
        if (!facultyDocsGrid) return;
        if (!documents.length) {
            facultyDocsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 36px 20px; background: #ffffff; border: 1px dashed #cbd5e1; border-radius: 12px;">
                    <div style="width: 48px; height: 48px; border-radius: 50%; background: #eff6ff; color: #2563eb; display: grid; place-items: center; font-size: 20px; margin: 0 auto 10px;">
                        <i class="fa-solid fa-folder-open"></i>
                    </div>
                    <p style="font-size: 14px; font-weight: 600; color: #0f172a; margin: 0 0 4px;">Khoa chưa đăng biểu mẫu nào</p>
                    <p style="font-size: 13px; color: #64748b; margin: 0;">Các biểu mẫu chính thức từ Khoa/Bộ môn sẽ hiển thị tại đây khi được ban hành.</p>
                </div>`;
            return;
        }

        facultyDocsGrid.innerHTML = documents.map((doc) => {
            const { icon, bg } = getFileIcon(doc.original_name || "");
            const fileSizeKb = Math.round((doc.file_size || 0) / 1024);
            return `
                <div class="doc-card">
                    <div class="doc-icon ${bg}"><i class="fa-solid ${icon}"></i></div>
                    <div class="doc-info">
                        <h3 title="${doc.title}">${doc.title}</h3>
                        <p>Cập nhật: ${formatDate(doc.createdAt)} • ${fileSizeKb} KB</p>
                    </div>
                    <a href="#" class="btn-download btn-download-faculty" data-id="${doc._id}" title="Tải xuống" aria-label="Tải xuống">
                        <i class="fa-solid fa-download"></i>
                    </a>
                </div>`;
        }).join("");

        facultyDocsGrid.querySelectorAll(".btn-download-faculty").forEach((button) => {
            button.addEventListener("click", async (event) => {
                event.preventDefault();
                const response = await apiFetch(`${API_BASE}/api/documents/download/${button.dataset.id}`, { method: "PATCH", headers: authHeaders });
                const result = await response.json();
                if (!response.ok || !result.success) {
                    showAppNotification(result.message || "Không thể tải tài liệu!");
                    return;
                }
                window.open(`${API_BASE}${result.file_path}`, "_blank");
            });
        });
    }

    function renderEmptyMyDocs(isFiltered = false) {
        if (!myDocsTableBody) return;
        if (docTableFooter) docTableFooter.style.display = "none";

        if (isFiltered) {
            myDocsTableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="empty-state-wrap">
                            <div class="empty-state-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
                            <h3 class="empty-state-title">Không tìm thấy tài liệu phù hợp</h3>
                            <p class="empty-state-desc">Không có tài liệu nào khớp với từ khóa tìm kiếm hoặc bộ lọc được chọn.</p>
                            <button type="button" class="btn-outline" onclick="document.getElementById('btnResetDocFilters').click()" style="height:36px; padding:0 14px; font-size:13px;">
                                <i class="fa-solid fa-rotate-left"></i> Xóa bộ lọc
                            </button>
                        </div>
                    </td>
                </tr>`;
        } else {
            myDocsTableBody.innerHTML = `
                <tr>
                    <td colspan="6">
                        <div class="empty-state-wrap">
                            <div class="empty-state-icon"><i class="fa-solid fa-file-arrow-up"></i></div>
                            <h3 class="empty-state-title">Bạn chưa chia sẻ tài liệu nào</h3>
                            <p class="empty-state-desc">Tải lên tài liệu để sinh viên trong các nhóm hướng dẫn có thể xem và tải về phục vụ thực tập.</p>
                            <button type="button" class="btn-primary" onclick="document.getElementById('openUploadModalBtn').click()" style="height:38px; padding:0 18px; font-size:13.5px;">
                                <i class="fa-solid fa-cloud-arrow-up"></i> Tải tài liệu lên ngay
                            </button>
                        </div>
                    </td>
                </tr>`;
        }
    }

    function filterAndRenderMyDocs() {
        if (!myDocsTableBody) return;

        const keyword = (searchDocInput?.value || "").toLowerCase().trim();
        const selectedCat = categoryFilter?.value || "";
        const selectedTarget = targetFilter?.value || "";

        const hasFilter = Boolean(keyword || selectedCat || selectedTarget);
        if (btnResetDocFilters) {
            btnResetDocFilters.style.display = hasFilter ? "inline-flex" : "none";
        }

        const filtered = allMyDocuments.filter(doc => {
            const title = (doc.title || "").toLowerCase();
            const originalName = (doc.original_name || "").toLowerCase();
            const matchKeyword = !keyword || title.includes(keyword) || originalName.includes(keyword);
            const matchCat = !selectedCat || doc.category === selectedCat;
            const matchTarget = !selectedTarget || doc.target === selectedTarget;

            return matchKeyword && matchCat && matchTarget;
        });

        if (!filtered.length) {
            renderEmptyMyDocs(hasFilter);
            return;
        }

        if (docTableFooter && docFooterInfo) {
            docTableFooter.style.display = "flex";
            docFooterInfo.textContent = `Hiển thị ${filtered.length} trên tổng số ${allMyDocuments.length} tài liệu`;
        }

        myDocsTableBody.innerHTML = "";

        filtered.forEach((doc) => {
            const { icon, bg } = getFileIcon(doc.original_name || "");
            const row = document.createElement("tr");
            row.dataset.id = doc._id;

            let catBadgeCls = "category-blue";
            if (doc.category === "Tài liệu kỹ thuật") catBadgeCls = "category-purple";
            else if (doc.category === "Thông báo chung") catBadgeCls = "category-orange";

            const isAllGroups = doc.target === "Tất cả nhóm hướng dẫn";
            const targetHtml = isAllGroups 
                ? `<span class="target-chip all-groups"><i class="fa-solid fa-users"></i> Tất cả nhóm</span>`
                : `<span class="target-chip"><i class="fa-solid fa-user-group"></i> ${doc.target}</span>`;

            const downloadCount = Number(doc.download_count) || 0;
            const downloadCountHtml = downloadCount > 0
                ? `<span class="download-count-cell"><i class="fa-solid fa-download"></i> ${downloadCount}</span>`
                : `<span class="download-count-cell muted"><i class="fa-solid fa-download"></i> 0</span>`;

            row.innerHTML = `
                <td>
                    <div class="file-name-cell">
                        <div class="file-name-icon ${bg}">
                            <i class="fa-solid ${icon}"></i>
                        </div>
                        <div class="file-name-text">
                            <span class="file-title-primary" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</span>
                            <span class="file-name-original" title="${escapeHtml(doc.original_name)}">${escapeHtml(doc.original_name)}</span>
                        </div>
                    </div>
                </td>
                <td><span class="badge-category ${catBadgeCls}">${escapeHtml(doc.category)}</span></td>
                <td>${targetHtml}</td>
                <td>
                    <div class="date-stacked">
                        <strong>${formatDate(doc.createdAt)}</strong>
                        <small>${timeAgo(doc.createdAt)}</small>
                    </div>
                </td>
                <td class="text-center">${downloadCountHtml}</td>
                <td class="text-center">
                    <div class="action-buttons" style="justify-content: center;">
                        <a href="#" class="btn-icon btn-download-doc" title="Tải xuống" aria-label="Tải xuống"><i class="fa-solid fa-download"></i></a>
                        <button class="btn-icon text-red btn-delete-doc" title="Xóa tài liệu" aria-label="Xóa"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;

            myDocsTableBody.appendChild(row);
        });

        bindRowEvents();
    }

    function escapeHtml(value) {
        return String(value || "").replace(/[&<>"']/g, c => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[c]);
    }

    if (searchDocInput) searchDocInput.addEventListener("input", filterAndRenderMyDocs);
    if (categoryFilter) categoryFilter.addEventListener("change", filterAndRenderMyDocs);
    if (targetFilter) targetFilter.addEventListener("change", filterAndRenderMyDocs);

    if (btnResetDocFilters) {
        btnResetDocFilters.addEventListener("click", () => {
            if (searchDocInput) searchDocInput.value = "";
            if (categoryFilter) categoryFilter.value = "";
            if (targetFilter) targetFilter.value = "";
            filterAndRenderMyDocs();
        });
    }

    // 6. THÊM TÀI LIỆU MỚI (TẢI LÊN QUA API)
    const uploadSubmitBtn = uploadDocForm ? uploadDocForm.querySelector('button[type="submit"]') : null;
    const uploadStatus = document.getElementById("uploadStatus");

    function setUploadStatus(message, type = "") {
        if (!uploadStatus) return;
        uploadStatus.textContent = message;
        uploadStatus.className = `upload-status ${type ? `upload-status-${type}` : ""}`;
    }

    if (fileInput) {
        fileInput.addEventListener("change", () => {
            if (fileInput.files[0]) {
                const f = fileInput.files[0];
                if (fileDropzoneText) fileDropzoneText.innerHTML = `<strong>Đã chọn:</strong> ${escapeHtml(f.name)} (${Math.round(f.size / 1024)} KB)`;
                setUploadStatus(`Đã chọn: ${f.name}`, "info");
            } else {
                if (fileDropzoneText) fileDropzoneText.textContent = "Kéo thả file vào đây hoặc bấm để chọn";
            }
        });
    }

    if (fileDropzone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            fileDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                fileDropzone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            fileDropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                fileDropzone.classList.remove('dragover');
            }, false);
        });

        fileDropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length && fileInput) {
                fileInput.files = files;
                const f = files[0];
                if (fileDropzoneText) fileDropzoneText.innerHTML = `<strong>Đã chọn:</strong> ${escapeHtml(f.name)} (${Math.round(f.size / 1024)} KB)`;
                setUploadStatus(`Đã chọn: ${f.name}`, "info");
            }
        });
    }

    if (uploadDocForm) {
        uploadDocForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            if (uploadSubmitBtn?.disabled) return;

            const title = document.getElementById("docTitle").value.trim();
            const category = document.getElementById("docCategory").value;
            const target = document.getElementById("docTarget").value;
            const file = fileInput?.files[0];

            setUploadStatus("Đang kiểm tra thông tin và tải file lên...", "loading");

            if (!title) {
                showAppNotification("Vui lòng nhập tên tài liệu hiển thị!", "error");
                setUploadStatus("Vui lòng nhập tên tài liệu hiển thị.", "error");
                return;
            }

            if (!file) {
                showAppNotification("Vui lòng chọn file tài liệu trước khi chia sẻ!", "error");
                setUploadStatus("Vui lòng chọn file tài liệu trước khi chia sẻ.", "error");
                return;
            }

            const MAX_SIZE = 25 * 1024 * 1024; // 25MB
            if (file.size > MAX_SIZE) {
                showAppNotification("File vượt quá kích thước tối đa 25MB!", "error");
                setUploadStatus("File vượt quá kích thước tối đa 25MB.", "error");
                return;
            }

            const formData = new FormData();
            formData.append("title", title);
            formData.append("category", category);
            formData.append("target", target);
            formData.append("file", file);

            const originalBtnHtml = uploadSubmitBtn ? uploadSubmitBtn.innerHTML : "";
            if (uploadSubmitBtn) {
                uploadSubmitBtn.disabled = true;
                uploadSubmitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên...';
            }

            try {
                const response = await apiFetch(`${API_BASE}/api/documents/upload`, {
                    method: "POST",
                    headers: authHeaders,
                    body: formData
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    showAppNotification(data.message || "Chia sẻ tài liệu thất bại, vui lòng thử lại!", "error");
                    setUploadStatus(data.message || "Chia sẻ tài liệu thất bại, vui lòng thử lại.", "error");
                    return;
                }

                await fetchMyDocuments();
                showAppNotification(data.message || "Đã chia sẻ tài liệu đến sinh viên thành công!", "success");
                setUploadStatus("Đã tải lên và chia sẻ tài liệu thành công.", "success");
                uploadDocForm.reset();
                if (fileDropzoneText) fileDropzoneText.textContent = "Kéo thả file vào đây hoặc bấm để chọn";
                setTimeout(() => {
                    closeUploadModal();
                    setUploadStatus("");
                }, 800);
            } catch (error) {
                console.error("Lỗi kết nối:", error);
                showAppNotification("Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!", "error");
                setUploadStatus("Không thể kết nối đến máy chủ. Vui lòng thử lại.", "error");
            } finally {
                if (uploadSubmitBtn) {
                    uploadSubmitBtn.disabled = false;
                    uploadSubmitBtn.innerHTML = originalBtnHtml;
                }
            }
        });
    }

    // 7. XÓA / TẢI XUỐNG TÀI LIỆU
    function bindRowEvents() {
        document.querySelectorAll(".btn-delete-doc").forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault();
                const row = e.target.closest("tr");
                const docId = row.dataset.id;

                const confirmed = await window.showConfirmDialog({
                    title: "Xác nhận xóa tài liệu",
                    message: "Bạn có chắc chắn muốn xóa tài liệu này không? Thao tác này sẽ không thể hoàn tác.",
                    confirmText: "Xóa tài liệu",
                    danger: true
                });
                if (!confirmed) return;

                try {
                    const response = await apiFetch(`${API_BASE}/api/documents/${docId}`, { method: "DELETE", headers: authHeaders });
                    const data = await response.json();

                    if (!response.ok || !data.success) {
                        showAppNotification(data.message || "Xóa tài liệu thất bại!", "error");
                        return;
                    }

                    showAppNotification(data.message || "Đã xóa tài liệu thành công!", "success");
                    await fetchMyDocuments();
                } catch (error) {
                    console.error("Lỗi kết nối:", error);
                    showAppNotification("Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!", "error");
                }
            };
        });

        document.querySelectorAll(".btn-download-doc").forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault();
                const row = e.target.closest("tr");
                const docId = row.dataset.id;

                try {
                    const response = await apiFetch(`${API_BASE}/api/documents/download/${docId}`, { method: "PATCH", headers: authHeaders });
                    const data = await response.json();

                    if (!response.ok || !data.success) {
                        showAppNotification(data.message || "Không thể tải tài liệu!", "error");
                        return;
                    }

                    window.open(`${API_BASE}${data.file_path}`, "_blank");
                    fetchMyDocuments(); // Cập nhật lại số lượt tải
                } catch (error) {
                    console.error("Lỗi kết nối:", error);
                    showAppNotification("Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!", "error");
                }
            };
        });
    }

    // Tải dữ liệu ban đầu
    fetchLecturerGroups();
    fetchMyDocuments();
});
