document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP
    let auth = null;
    try {
        auth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
    } catch (error) {
        auth = null;
    }
    const user = auth?.user || null;
    if (!user || user.role !== "STUDENT") {
        window.location.href = "../auth/index.html";
        return;
    }

    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    const documentGrid = document.getElementById("documentGrid");
    const noDocResult = document.getElementById("noDocResult");
    const allDocumentsCount = document.getElementById("allDocumentsCount");
    const API_BASE = window.APP_CONFIG.API_BASE_URL + "";
    const authHeaders = { Authorization: `Bearer ${auth.token}` };

    const escapeHtml = (str) => {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

    const getFileExtension = (filename = "") => {
        if (!filename || typeof filename !== "string") return "";
        const cleanName = filename.split("?")[0].split("#")[0];
        const parts = cleanName.split(".");
        return parts.length > 1 ? parts.pop().toLowerCase().trim() : "";
    };

    const getFileInfo = (filename = "") => {
        const ext = getFileExtension(filename);
        if (ext === "xlsx" || ext === "xls" || ext === "csv") {
            return { icon: "fa-solid fa-file-excel", type: "xlsx" };
        }
        if (ext === "docx" || ext === "doc") {
            return { icon: "fa-solid fa-file-word", type: "docx" };
        }
        if (ext === "pdf") {
            return { icon: "fa-solid fa-file-pdf", type: "pdf" };
        }
        if (ext === "pptx" || ext === "ppt") {
            return { icon: "fa-solid fa-file-powerpoint", type: "pptx" };
        }
        if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
            return { icon: "fa-solid fa-file-zipper", type: "zip" };
        }
        if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
            return { icon: "fa-solid fa-file-image", type: "image" };
        }
        return { icon: "fa-solid fa-file-lines", type: "other" };
    };

    const isPreviewable = (filename = "") => {
        const ext = getFileExtension(filename);
        return ["pdf", "png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
    };

    const formatTitle = (str = "") => {
        if (!str) return "";
        const trimmed = String(str).trim();
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
    };

    const getCategoryKey = (doc = {}) => {
        const category = String(doc.category || "").toLowerCase();
        const title = String(doc.title || "").toLowerCase();
        const fileName = String(doc.original_name || doc.file_name || "").toLowerCase();
        const ext = getFileExtension(fileName);

        // 1. SLIDE (Thuyết trình / Báo cáo slide)
        if (
            category.includes("slide") ||
            category.includes("thuyết trình") ||
            category.includes("presentation") ||
            category.includes("powerpoint") ||
            ext === "pptx" ||
            ext === "ppt" ||
            title.includes("slide") ||
            title.includes("thuyết trình")
        ) {
            return "SLIDE";
        }

        // 2. REGULATION (Quy chế, Quy định, Biểu mẫu, Hướng dẫn, Thông báo)
        if (
            category.includes("biểu mẫu") ||
            category.includes("quy định") ||
            category.includes("quy chế") ||
            category.includes("hướng dẫn") ||
            category.includes("thông báo") ||
            category.includes("quy phạm") ||
            category.includes("regulation") ||
            category.includes("form") ||
            title.includes("biểu mẫu") ||
            title.includes("quy định") ||
            title.includes("quy chế") ||
            title.includes("giấy giới thiệu") ||
            title.includes("phiếu nhận xét") ||
            title.includes("thông báo")
        ) {
            return "REGULATION";
        }

        // 3. REPORT (Mẫu báo cáo, Khóa luận, Đề cương, Kỹ thuật, Tham khảo...)
        return "REPORT";
    };

    const updateTabCounts = (docs) => {
        let regCount = 0;
        let repCount = 0;
        let sliCount = 0;

        docs.forEach((doc) => {
            const cat = getCategoryKey(doc);
            if (cat === "REGULATION") regCount++;
            else if (cat === "SLIDE") sliCount++;
            else repCount++;
        });

        if (allDocumentsCount) allDocumentsCount.textContent = docs.length;
        const regCountEl = document.getElementById("regulationDocumentsCount");
        if (regCountEl) regCountEl.textContent = regCount;
        const repCountEl = document.getElementById("reportDocumentsCount");
        if (repCountEl) repCountEl.textContent = repCount;
        const sliCountEl = document.getElementById("slideDocumentsCount");
        if (sliCountEl) sliCountEl.textContent = sliCount;
    };

    const formatBytes = (bytes) => {
        if (!bytes || Number(bytes) === 0) return "0 KB";
        const kb = bytes / 1024;
        if (kb < 1024) return `${Math.round(kb)} KB`;
        return `${(kb / 1024).toFixed(1)} MB`;
    };

    const formatDate = (value) => {
        if (!value) return "Chưa cập nhật";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleDateString("vi-VN");
    };

    const renderDocuments = (docs) => {
        const cards = docs || [];
        documentGrid.innerHTML = "";

        updateTabCounts(cards);

        cards.forEach((doc) => {
            const card = document.createElement("div");
            const categoryKey = getCategoryKey(doc);
            const fileName = doc.original_name || doc.file_name || "Tài liệu";
            const filePath = doc.file_path ? `${API_BASE}${doc.file_path}` : "#";
            const fileInfo = getFileInfo(fileName);
            const canPreview = isPreviewable(fileName);
            const rawTitle = doc.title || fileName;
            const displayTitle = formatTitle(rawTitle);
            const uploaderName = doc.uploader_name || (doc.uploader_role === "ADMIN" ? "Ban Quản trị" : (doc.uploader_code || "Khoa CNTT"));
            const hasDownloads = typeof doc.download_count === "number";
            const downloadHtml = hasDownloads
                ? `<span><i class="fa-solid fa-download"></i> ${doc.download_count} lượt tải</span>`
                : "";

            card.className = "doc-card";
            card.setAttribute("data-category", categoryKey);
            card.setAttribute("data-title", rawTitle.toLowerCase());
            card.innerHTML = `
                <div class="doc-file-icon ${fileInfo.type}">
                    <i class="${fileInfo.icon}"></i>
                </div>
                <div class="doc-info">
                    <span class="doc-category ${categoryKey === "REGULATION" ? "regulation" : categoryKey === "SLIDE" ? "slide" : "report"}">${escapeHtml(doc.category || (categoryKey === "REGULATION" ? "Biểu mẫu" : categoryKey === "SLIDE" ? "Slide" : "Báo cáo"))}</span>
                    <h4 class="doc-title">${escapeHtml(displayTitle)}</h4>
                    <p class="doc-desc">Đăng bởi ${escapeHtml(uploaderName)}</p>
                    <div class="doc-meta">
                        <span><i class="fa-solid fa-calendar"></i> ${formatDate(doc.createdAt)}</span>
                        <span><i class="fa-solid fa-hard-drive"></i> ${formatBytes(doc.file_size)}</span>
                        ${downloadHtml}
                    </div>
                </div>
                <div class="doc-actions">
                    ${canPreview ? `<button class="btn-preview" type="button" onclick="previewDoc('${fileName.replace(/'/g, "\\'")}', '${displayTitle.replace(/'/g, "\\'")}')"><i class="fa-regular fa-eye"></i> Xem trước</button>` : ""}
                    <a class="btn-download ${canPreview ? "" : "btn-download-full"}" href="${filePath}" download><i class="fa-solid fa-download"></i> Tải về</a>
                </div>
            `;
            documentGrid.appendChild(card);
        });

        const visibleCards = [...documentGrid.querySelectorAll(".doc-card")];
        const searchInput = document.getElementById("searchInput");
        const tabButtons = document.querySelectorAll(".tab-btn");
        let currentCategory = "ALL";
        let currentSearchQuery = "";

        const filterDocuments = () => {
            let visibleCount = 0;

            visibleCards.forEach((card) => {
                const category = card.getAttribute("data-category");
                const title = (card.getAttribute("data-title") || "").toLowerCase();
                const matchCategory = (currentCategory === "ALL" || category === currentCategory);
                const matchSearch = title.includes(currentSearchQuery.toLowerCase());

                card.style.display = matchCategory && matchSearch ? "flex" : "none";
                if (matchCategory && matchSearch) visibleCount++;
            });

            if (noDocResult) {
                if (visibleCount === 0) {
                    noDocResult.style.display = "block";
                    if (currentSearchQuery) {
                        noDocResult.innerHTML = `
                            <i class="fa-solid fa-folder-open no-result-icon"></i>
                            <h4>Không tìm thấy tài liệu nào phù hợp</h4>
                            <p>Không tìm thấy kết quả phù hợp với từ khóa "<strong>${escapeHtml(currentSearchQuery)}</strong>". Vui lòng thử từ khóa khác hoặc chuyển danh mục.</p>
                        `;
                    } else {
                        noDocResult.innerHTML = `
                            <i class="fa-solid fa-folder-open no-result-icon"></i>
                            <h4>Chưa có tài liệu trong mục này</h4>
                            <p>Hiện chưa có văn bản hoặc biểu mẫu nào được cập nhật trong chuyên mục này.</p>
                        `;
                    }
                } else {
                    noDocResult.style.display = "none";
                }
            }
        };

        tabButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                tabButtons.forEach((b) => b.classList.remove("active"));
                btn.classList.add("active");
                currentCategory = btn.getAttribute("data-category");
                filterDocuments();
            });
        });

        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                currentSearchQuery = e.target.value.trim();
                filterDocuments();
            });
        }

        filterDocuments();
    };

    const loadDocuments = async () => {
        try {
            const response = await apiFetch(`${API_BASE}/api/documents/student`, { headers: authHeaders });
            const result = await response.json();
            const docs = result && Array.isArray(result.documents)
                ? result.documents.filter(doc => doc.target !== "Tất cả giảng viên")
                : [];
            renderDocuments(docs);
        } catch (error) {
            console.error("Lỗi khi tải tài liệu từ server:", error);
            documentGrid.innerHTML = "";
            if (noDocResult) {
                noDocResult.style.display = "block";
                noDocResult.innerHTML = "<i class='fa-solid fa-triangle-exclamation no-result-icon'></i><h4>Không tải được tài liệu từ máy chủ</h4><p>Vui lòng kiểm tra server backend và thử lại.</p>";
            }
        }
    };

    // 2. MODAL PREVIEW TÀI LIỆU
    const previewModal = document.getElementById("previewModal");
    const btnClosePreviewModal = document.getElementById("btnClosePreviewModal");

    window.previewDoc = (fileName, docTitle) => {
        const title = docTitle || "Tên tài liệu";
        document.getElementById("previewTitle").textContent = title;
        document.getElementById("previewFileName").textContent = fileName;
        previewModal.style.display = "flex";
    };

    if (btnClosePreviewModal) {
        btnClosePreviewModal.addEventListener("click", () => {
            previewModal.style.display = "none";
        });
    }

    // 3. XỬ LÝ ĐĂNG XUẤT
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn) logoutBtn.addEventListener("click", () => logoutModal.style.display = "flex");
    if (cancelLogoutBtn) cancelLogoutBtn.addEventListener("click", () => logoutModal.style.display = "none");
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = "../auth/index.html";
        });
    }

    window.addEventListener("click", (e) => {
        if (e.target === previewModal) previewModal.style.display = "none";
        if (e.target === logoutModal) logoutModal.style.display = "none";
    });

    loadDocuments();
});