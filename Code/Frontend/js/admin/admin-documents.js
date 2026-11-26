const API_BASE = window.APP_CONFIG.API_BASE_URL + "";

document.addEventListener("DOMContentLoaded", async () => {
    const user = await window.verifyAuthSession("ADMIN");
    if (!user) return;

    // DOM ELEMENTS (GIỮ NGUYÊN ID GỐC)
    const userNameElem = document.getElementById("userName");
    if (userNameElem) {
        userNameElem.textContent = user.full_name || user.fullName || "Quản trị viên";
    }

    const form = document.getElementById("documentForm");
    const docTitle = document.getElementById("docTitle");
    const docCategory = document.getElementById("docCategory");
    const docTarget = document.getElementById("docTarget");
    const docFile = document.getElementById("docFile");
    const uploadBtn = document.getElementById("uploadBtn");
    const uploadBtnText = document.getElementById("uploadBtnText");
    const formMessage = document.getElementById("formMessage");
    const resetFormBtn = document.getElementById("resetFormBtn");

    const tableBody = document.getElementById("documentTableBody");
    const searchInput = document.getElementById("searchInput");
    const targetFilter = document.getElementById("targetFilter");
    const categoryFilter = document.getElementById("categoryFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");
    const activeFilterChips = document.getElementById("activeFilterChips");
    const pageSizeSelect = document.getElementById("pageSizeSelect");
    const paginationControls = document.getElementById("paginationControls");
    const paginationInfo = document.getElementById("paginationInfo");

    const semesterSelect = document.getElementById("semesterSelect");
    const logoutBtn = document.getElementById("logoutBtn");

    // Collapsible & Dropzone Elements
    const toggleFormBtn = document.getElementById("toggleFormBtn");
    const uploadFormCollapse = document.getElementById("uploadFormCollapse");
    const collapseIcon = document.getElementById("collapseIcon");
    const dropzoneArea = document.getElementById("dropzoneArea");
    const dropzonePrompt = document.getElementById("dropzonePrompt");
    const filePreviewCard = document.getElementById("filePreviewCard");
    const previewFileName = document.getElementById("previewFileName");
    const previewFileSize = document.getElementById("previewFileSize");
    const previewFileIcon = document.getElementById("previewFileIcon");
    const removeFileBtn = document.getElementById("removeFileBtn");
    const fileErrorMsg = document.getElementById("fileErrorMsg");

    // STATS DOM
    const statTotalDocs = document.getElementById("statTotalDocs");
    const statTotalDownloads = document.getElementById("statTotalDownloads");
    const statRecentDocs = document.getElementById("statRecentDocs");

    // STATE
    let documents = [];
    let filteredDocuments = [];
    let currentPage = 1;
    let pageSize = 10;
    let justAddedDocId = null;
    const authHeaders = {};

    // ── TẢI HỌC KỲ TOPBAR ─────────────────────────────────────
    async function loadSemesterOptions() {
        if (!semesterSelect) return;
        try {
            const res = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/semesters", { headers: authHeaders });
            const result = await res.json();
            const list = Array.isArray(result) ? result : (result.data || []);
            semesterSelect.replaceChildren();
            list.forEach(s => {
                const opt = document.createElement("option");
                opt.value = s._id || s.id || "";
                let name = s.semesterName || s.name || "Học kỳ";
                name = name.replace(/Học kì/gi, "Học kỳ");
                opt.textContent = name;
                if (s.isActive || s.is_active) opt.selected = true;
                semesterSelect.appendChild(opt);
            });
            if (semesterSelect.options.length === 0) {
                semesterSelect.innerHTML = `<option value="">Chưa có học kỳ</option>`;
            }
        } catch {
            semesterSelect.innerHTML = `<option value="">Lỗi tải học kỳ</option>`;
        }
    }

    // ── FORMATTERS & HELPERS ──────────────────────────────────
    const formatDate = (value) => value ? new Date(value).toLocaleDateString("vi-VN") : "-";

    const formatTimeAgo = (dateValue) => {
        if (!dateValue) return "";
        const now = new Date();
        const past = new Date(dateValue);
        const diffDays = Math.floor((now - past) / (1000 * 60 * 60 * 24));
        if (diffDays <= 0) return "Hôm nay";
        if (diffDays === 1) return "Hôm qua";
        if (diffDays < 30) return `${diffDays} ngày trước`;
        const diffMonths = Math.floor(diffDays / 30);
        return `${diffMonths} tháng trước`;
    };

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return "0 KB";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
    };

    const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);

    const displayFilename = (value) => {
        const filename = String(value || "");
        if (!/[ÃÂ]/.test(filename)) return filename;
        const characters = Array.from(filename);
        if (characters.some(character => character.codePointAt(0) > 255)) return filename;
        try {
            const bytes = Uint8Array.from(characters, character => character.codePointAt(0));
            return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
            return filename;
        }
    };

    const getFileExt = (name = "") => (name.split(".").pop() || "").toLowerCase();

    const getFileIconMeta = (name = "") => {
        const ext = getFileExt(name);
        if (ext === "pdf") return { icon: "fa-file-pdf", cls: "pdf" };
        if (["doc", "docx"].includes(ext)) return { icon: "fa-file-word", cls: "word" };
        if (["ppt", "pptx"].includes(ext)) return { icon: "fa-file-powerpoint", cls: "powerpoint" };
        if (["xls", "xlsx"].includes(ext)) return { icon: "fa-file-excel", cls: "excel" };
        if (["zip", "rar", "7z"].includes(ext)) return { icon: "fa-file-zipper", cls: "zip" };
        return { icon: "fa-file-lines", cls: "word" };
    };

    const getCategoryClass = (category = "") => {
        const cat = category.toLowerCase();
        if (cat.includes("quy định") || cat.includes("hướng dẫn")) return "guideline";
        if (cat.includes("báo cáo")) return "report";
        if (cat.includes("slide")) return "slide";
        return "";
    };

    const getTargetMeta = (target = "") => {
        const t = target.toLowerCase();
        if (t.includes("giảng viên") && !t.includes("sinh viên")) {
            return { cls: "lecturers", icon: "fa-chalkboard-user", label: target };
        }
        if (t.includes("sinh viên") && !t.includes("giảng viên")) {
            return { cls: "students", icon: "fa-user-graduate", label: target };
        }
        return { cls: "all", icon: "fa-users", label: target || "Tất cả" };
    };

    // ── CẬP NHẬT THỐNG KÊ NHANH ──────────────────────────────
    function updateQuickStats() {
        const total = documents.length;
        const totalDl = documents.reduce((acc, doc) => acc + (Number(doc.download_count) || 0), 0);

        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        const recent = documents.filter(doc => doc.createdAt && new Date(doc.createdAt) >= sevenDaysAgo).length;

        if (statTotalDocs) statTotalDocs.textContent = total.toLocaleString("vi-VN");
        if (statTotalDownloads) statTotalDownloads.textContent = totalDl.toLocaleString("vi-VN");
        if (statRecentDocs) statRecentDocs.textContent = recent.toLocaleString("vi-VN");
    }

    // ── ACTIVE FILTER CHIPS ───────────────────────────────────
    function renderFilterChips() {
        if (!activeFilterChips) return;
        const chips = [];
        const q = searchInput?.value.trim();
        const t = targetFilter?.value;
        const c = categoryFilter?.value;

        if (q) {
            chips.push(`<span class="filter-chip" data-clear="search">
                <i class="fa-solid fa-magnifying-glass"></i> "${escapeHtml(q)}" <i class="fa-solid fa-xmark"></i>
            </span>`);
        }
        if (t === "students") {
            chips.push(`<span class="filter-chip" data-clear="target">
                <i class="fa-solid fa-user-graduate"></i> Sinh viên / Nhóm <i class="fa-solid fa-xmark"></i>
            </span>`);
        } else if (t === "lecturers") {
            chips.push(`<span class="filter-chip" data-clear="target">
                <i class="fa-solid fa-chalkboard-user"></i> Giảng viên <i class="fa-solid fa-xmark"></i>
            </span>`);
        }
        if (c) {
            chips.push(`<span class="filter-chip" data-clear="category">
                <i class="fa-solid fa-tag"></i> ${escapeHtml(c)} <i class="fa-solid fa-xmark"></i>
            </span>`);
        }

        activeFilterChips.innerHTML = chips.join("");
        activeFilterChips.style.display = chips.length ? "flex" : "none";

        if (resetFilterBtn) {
            resetFilterBtn.classList.toggle("active", chips.length > 0);
        }

        activeFilterChips.querySelectorAll(".filter-chip").forEach(chip => {
            chip.onclick = () => {
                const type = chip.dataset.clear;
                if (type === "search" && searchInput) searchInput.value = "";
                if (type === "target" && targetFilter) targetFilter.value = "";
                if (type === "category" && categoryFilter) categoryFilter.value = "";
                renderDocuments();
            };
        });
    }

    // ── RENDER DOCUMENTS TABLE ────────────────────────────────
    function renderDocuments() {
        const query = searchInput.value.trim().toLowerCase();
        const selectedTarget = targetFilter.value;
        const selectedCategory = categoryFilter ? categoryFilter.value : "";

        filteredDocuments = documents.filter(doc => {
            const role = doc.uploader_role || (doc.uploader_code === "ADMIN" ? "ADMIN" : "LECTURER");
            const recipient = (doc.target || "").toLowerCase();
            const originalName = displayFilename(doc.original_name);
            const lecturerSharedWithStudents = role === "LECTURER" && recipient !== "tất cả giảng viên";

            const matchesQuery = `${doc.title} ${originalName} ${doc.category} ${doc.uploader_name} ${doc.uploader_code} ${doc.target}`.toLowerCase().includes(query);
            const matchesTarget = !selectedTarget
                || (selectedTarget === "students" && (lecturerSharedWithStudents || ["students", "tất cả sinh viên"].includes(recipient)))
                || (selectedTarget === "lecturers" && recipient === "tất cả giảng viên");
            const matchesCategory = !selectedCategory || (doc.category === selectedCategory);

            return matchesQuery && matchesTarget && matchesCategory;
        });

        renderFilterChips();

        const totalItems = filteredDocuments.length;
        const totalPages = Math.ceil(totalItems / pageSize) || 1;
        currentPage = Math.max(1, Math.min(currentPage, totalPages));

        if (!filteredDocuments.length) {
            const hasFilter = query || selectedTarget || selectedCategory;
            tableBody.innerHTML = `
                <tr><td colspan="7">
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fa-solid fa-file-circle-question"></i></div>
                        <div class="empty-title">${hasFilter ? "Không tìm thấy tài liệu phù hợp" : "Chưa có tài liệu nào được gửi"}</div>
                        <div class="empty-desc">${hasFilter ? "Thử thay đổi từ khóa tìm kiếm hoặc bộ lọc đối tượng / phân loại." : "Sử dụng form bên trên để tải lên và chia sẻ tài liệu mới tới sinh viên hoặc giảng viên."}</div>
                        ${hasFilter ? `<button class="btn-action btn-action-outline btn-sm" id="emptyResetBtn"><i class="fa-solid fa-rotate-left"></i> Xóa bộ lọc</button>` : ""}
                    </div>
                </td></tr>`;
            if (paginationInfo) paginationInfo.textContent = "Hiển thị 0 trên tổng số 0 tài liệu";
            if (paginationControls && window.renderAdminPagination) {
                window.renderAdminPagination(paginationControls, 0, 0, () => {});
            }
            const emptyResetBtn = document.getElementById("emptyResetBtn");
            if (emptyResetBtn) {
                emptyResetBtn.onclick = () => {
                    searchInput.value = "";
                    targetFilter.value = "";
                    if (categoryFilter) categoryFilter.value = "";
                    renderDocuments();
                };
            }
            return;
        }

        const startIndex = (currentPage - 1) * pageSize;
        const pageData = filteredDocuments.slice(startIndex, startIndex + pageSize);

        tableBody.innerHTML = pageData.map(doc => {
            const fileMeta = getFileIconMeta(doc.original_name || "");
            const origName = displayFilename(doc.original_name);
            const catCls = getCategoryClass(doc.category);
            const targetMeta = getTargetMeta(doc.target);
            const isJustAdded = doc._id === justAddedDocId;

            const uploaderRole = doc.uploader_role || (doc.uploader_code === "ADMIN" ? "ADMIN" : "LECTURER");
            const uploaderName = doc.uploader_name || doc.uploader_code || "Quản trị viên";
            const uploaderInit = (uploaderName.trim().charAt(0) || "Q").toUpperCase();
            const isLecturer = uploaderRole !== "ADMIN";

            const dlCount = Number(doc.download_count) || 0;

            return `
                <tr data-id="${doc._id}" class="${isJustAdded ? 'row-just-added' : ''}">
                    <td>
                        <div class="doc-cell">
                            <i class="fa-solid ${fileMeta.icon} doc-file-icon ${fileMeta.cls}"></i>
                            <div class="doc-info">
                                <span class="doc-name" title="${escapeHtml(doc.title)}">${escapeHtml(doc.title)}</span>
                                <span class="doc-filename" title="${escapeHtml(origName)}">${escapeHtml(origName)}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="category-badge-chip ${catCls}">${escapeHtml(doc.category || "Tài liệu")}</span>
                    </td>
                    <td>
                        <div class="uploader-cell-box">
                            <span class="uploader-avatar-circle ${isLecturer ? 'lecturer' : ''}">${uploaderInit}</span>
                            <div class="uploader-info-meta">
                                <span class="uploader-name-text">${escapeHtml(uploaderName)}</span>
                                <span class="uploader-role-sub">${isLecturer ? 'Giảng viên' : 'Admin'}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="target-badge-chip ${targetMeta.cls}">
                            <i class="fa-solid ${targetMeta.icon}"></i> ${escapeHtml(targetMeta.label)}
                        </span>
                    </td>
                    <td>
                        <div class="date-cell-box">
                            <span class="date-primary">${formatDate(doc.createdAt)}</span>
                            <span class="date-relative">${formatTimeAgo(doc.createdAt)}</span>
                        </div>
                    </td>
                    <td class="text-center">
                        <span class="download-count-badge ${dlCount === 0 ? 'zero' : ''}">
                            <i class="fa-solid fa-arrow-down-to-bracket"></i> ${dlCount}
                        </span>
                    </td>
                    <td class="text-center">
                        <div class="table-action-group">
                            <button class="btn-icon-action download" data-id="${doc._id}" title="Tải xuống" aria-label="Tải tài liệu ${escapeHtml(doc.title)}">
                                <i class="fa-solid fa-download"></i>
                            </button>
                            <button class="btn-icon-action delete" data-id="${doc._id}" title="Xóa tài liệu" aria-label="Xóa tài liệu ${escapeHtml(doc.title)}">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>`;
        }).join("");

        // Cập nhật phân trang
        if (paginationInfo) {
            paginationInfo.textContent = `Hiển thị ${startIndex + 1} – ${startIndex + pageData.length} trên tổng số ${totalItems} tài liệu`;
        }

        if (paginationControls && window.renderAdminPagination) {
            window.renderAdminPagination(paginationControls, currentPage, totalPages, (newPage) => {
                currentPage = newPage;
                renderDocuments();
            });
        }

        // Gắn sự kiện tải và xóa
        tableBody.querySelectorAll(".download").forEach(btn => {
            btn.onclick = () => downloadDocument(btn.dataset.id);
        });
        tableBody.querySelectorAll(".delete").forEach(btn => {
            btn.onclick = () => deleteDocument(btn.dataset.id);
        });
    }

    // ── TẢI DANH SÁCH TÀI LIỆU ────────────────────────────────
    async function loadDocuments() {
        try {
            const response = await apiFetch(`${API_BASE}/api/documents/admin/all`, { headers: authHeaders });
            const result = await response.json();
            documents = response.ok && result.success ? result.documents || [] : [];
            updateQuickStats();
            renderDocuments();
        } catch (error) {
            console.error("Lỗi tải danh sách tài liệu:", error);
            tableBody.innerHTML = `
                <tr><td colspan="7">
                    <div class="empty-state">
                        <div class="empty-icon"><i class="fa-solid fa-triangle-exclamation" style="color:#EF4444;"></i></div>
                        <div class="empty-title">Không thể tải danh sách tài liệu</div>
                        <div class="empty-desc">Vui lòng kiểm tra kết nối máy chủ và thử lại.</div>
                    </div>
                </td></tr>`;
        }
    }

    // ── TẢI XUỐNG TÀI LIỆU ────────────────────────────────────
    async function downloadDocument(id) {
        try {
            const response = await apiFetch(`${API_BASE}/api/documents/download/${id}`, { method: "PATCH", headers: authHeaders });
            const result = await response.json();
            if (!response.ok || !result.success) {
                return window.showAppNotification?.(result.message || "Không thể tải tài liệu!");
            }
            window.open(`${API_BASE}${result.file_path}`, "_blank");
            loadDocuments();
        } catch (err) {
            window.showAppNotification?.("Lỗi khi tải tài liệu!");
        }
    }

    // ── XÓA TÀI LIỆU ──────────────────────────────────────────
    async function deleteDocument(id) {
        const doc = documents.find(d => d._id === id);
        const docTitleText = doc ? `"${doc.title}"` : "tài liệu này";

        const confirmed = await window.showConfirmDialog({
            title: "Xác nhận xóa tài liệu",
            message: `Bạn có chắc chắn muốn xóa ${docTitleText}? Hành động này sẽ gỡ bỏ file khỏi trang sinh viên và giảng viên.`,
            confirmText: "Xóa tài liệu",
            danger: true
        });
        if (!confirmed) return;

        try {
            const response = await apiFetch(`${API_BASE}/api/documents/${id}`, { method: "DELETE", headers: authHeaders });
            const result = await response.json();
            if (!response.ok || !result.success) {
                return window.showAppNotification?.(result.message || "Xóa tài liệu thất bại!");
            }
            window.showAppNotification?.("Đã xóa tài liệu thành công.");
            loadDocuments();
        } catch (err) {
            window.showAppNotification?.("Lỗi kết nối khi xóa tài liệu!");
        }
    }

    // ── XỬ LÝ CHỌN FILE & DROPZONE ────────────────────────────
    function setSelectedFile(file) {
        if (!file) {
            docFile.value = "";
            dropzonePrompt.style.display = "flex";
            filePreviewCard.style.display = "none";
            if (fileErrorMsg) fileErrorMsg.style.display = "none";
            return;
        }

        // Validate max 25MB
        const maxBytes = 25 * 1024 * 1024;
        if (file.size > maxBytes) {
            if (fileErrorMsg) {
                fileErrorMsg.textContent = "File vượt quá dung lượng tối đa cho phép (25MB).";
                fileErrorMsg.style.display = "block";
            }
            docFile.value = "";
            return;
        }

        if (fileErrorMsg) fileErrorMsg.style.display = "none";

        const meta = getFileIconMeta(file.name);
        previewFileName.textContent = file.name;
        previewFileSize.textContent = formatBytes(file.size);
        previewFileIcon.className = `fa-solid ${meta.icon} file-preview-icon ${meta.cls}`;

        dropzonePrompt.style.display = "none";
        filePreviewCard.style.display = "flex";

        // Tự động gợi ý tên tài liệu nếu chưa nhập
        if (docTitle && !docTitle.value.trim()) {
            const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            docTitle.value = baseName;
        }
    }

    if (dropzoneArea) {
        dropzoneArea.addEventListener("click", (e) => {
            if (e.target.closest("#removeFileBtn")) return;
            docFile.click();
        });
        dropzoneArea.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                docFile.click();
            }
        });
        dropzoneArea.addEventListener("dragover", (e) => {
            e.preventDefault();
            dropzoneArea.classList.add("dragover");
        });
        dropzoneArea.addEventListener("dragleave", () => {
            dropzoneArea.classList.remove("dragover");
        });
        dropzoneArea.addEventListener("drop", (e) => {
            e.preventDefault();
            dropzoneArea.classList.remove("dragover");
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                docFile.files = files;
                setSelectedFile(files[0]);
            }
        });
    }

    if (docFile) {
        docFile.addEventListener("change", () => {
            if (docFile.files && docFile.files.length > 0) {
                setSelectedFile(docFile.files[0]);
            } else {
                setSelectedFile(null);
            }
        });
    }

    if (removeFileBtn) {
        removeFileBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            setSelectedFile(null);
        });
    }

    // ── XÓA FORM ──────────────────────────────────────────────
    function clearForm() {
        form.reset();
        setSelectedFile(null);
        if (formMessage) {
            formMessage.textContent = "";
            formMessage.className = "form-message";
        }
    }

    if (resetFormBtn) {
        resetFormBtn.addEventListener("click", clearForm);
    }

    // ── THU GỌN / MỞ RỘNG FORM GỬI TÀI LIỆU ───────────────────
    if (toggleFormBtn && uploadFormCollapse) {
        toggleFormBtn.addEventListener("click", () => {
            const isCollapsed = uploadFormCollapse.classList.toggle("collapsed");
            toggleFormBtn.setAttribute("aria-expanded", !isCollapsed);
            if (collapseIcon) {
                collapseIcon.className = isCollapsed ? "fa-solid fa-chevron-down" : "fa-solid fa-chevron-up";
            }
        });
        toggleFormBtn.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleFormBtn.click();
            }
        });
    }

    // ── SUBMIT FORM ───────────────────────────────────────────
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const file = docFile.files[0];
        if (!file) {
            if (fileErrorMsg) {
                fileErrorMsg.textContent = "Vui lòng chọn file đính kèm!";
                fileErrorMsg.style.display = "block";
            }
            return;
        }

        const titleVal = docTitle.value.trim();
        if (!titleVal) {
            docTitle.focus();
            return;
        }

        const formData = new FormData();
        formData.append("title", titleVal);
        formData.append("category", docCategory.value);
        formData.append("target", docTarget.value);
        formData.append("file", file);

        uploadBtn.disabled = true;
        if (uploadBtnText) uploadBtnText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên...`;
        if (formMessage) {
            formMessage.className = "form-message";
            formMessage.textContent = "Đang tải file lên hệ thống...";
        }

        try {
            const response = await apiFetch(`${API_BASE}/api/documents/upload`, {
                method: "POST",
                headers: authHeaders,
                body: formData
            });
            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || "Gửi tài liệu thất bại!");
            }

            // Gửi thành công
            clearForm();
            window.showAppNotification?.("Đã gửi tài liệu thành công!");
            if (formMessage) {
                formMessage.className = "form-message";
                formMessage.textContent = "Đã gửi tài liệu thành công.";
                setTimeout(() => { if (formMessage) formMessage.textContent = ""; }, 4000);
            }

            // Nhớ ID vừa upload để highlight
            justAddedDocId = result.document?._id || null;
            await loadDocuments();

            if (justAddedDocId) {
                setTimeout(() => {
                    const addedRow = tableBody.querySelector(`.row-just-added`);
                    if (addedRow) addedRow.classList.remove("row-just-added");
                    justAddedDocId = null;
                }, 2000);
            }
        } catch (error) {
            if (formMessage) {
                formMessage.className = "form-message error";
                formMessage.textContent = error.message;
            }
            window.showAppNotification?.(error.message || "Gửi tài liệu thất bại!");
        } finally {
            uploadBtn.disabled = false;
            if (uploadBtnText) uploadBtnText.textContent = "Gửi tài liệu";
        }
    });

    // ── SEARCH & FILTER EVENTS ────────────────────────────────
    if (searchInput) {
        searchInput.addEventListener("input", () => {
            currentPage = 1;
            renderDocuments();
        });
    }

    if (targetFilter) {
        targetFilter.addEventListener("change", () => {
            currentPage = 1;
            renderDocuments();
        });
    }

    if (categoryFilter) {
        categoryFilter.addEventListener("change", () => {
            currentPage = 1;
            renderDocuments();
        });
    }

    if (resetFilterBtn) {
        resetFilterBtn.addEventListener("click", () => {
            if (searchInput) searchInput.value = "";
            if (targetFilter) targetFilter.value = "";
            if (categoryFilter) categoryFilter.value = "";
            currentPage = 1;
            renderDocuments();
        });
    }

    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", () => {
            pageSize = parseInt(pageSizeSelect.value, 10) || 10;
            currentPage = 1;
            renderDocuments();
        });
    }

    // ── LOGOUT ────────────────────────────────────────────────
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            if (logoutModal) logoutModal.style.display = "flex";
        });
    }
    if (cancelLogout) {
        cancelLogout.addEventListener("click", () => {
            if (logoutModal) logoutModal.style.display = "none";
        });
    }
    if (confirmLogout) {
        confirmLogout.addEventListener("click", () => {
            if (typeof window.logoutSession === "function") window.logoutSession();
            localStorage.removeItem("adminAuth");
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            sessionStorage.clear();
            window.location.href = "../auth/index.html";
        });
    }
    if (logoutModal) {
        logoutModal.addEventListener("click", (e) => {
            if (e.target === logoutModal) logoutModal.style.display = "none";
        });
    }

    // ── KHỞI CHẠY ─────────────────────────────────────────────
    await Promise.all([loadSemesterOptions(), loadDocuments()]);
});
