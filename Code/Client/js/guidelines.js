document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP
    const auth = JSON.parse(localStorage.getItem("studentAuth") || "null");
    const user = auth?.user || null;
    if (!user || user.role !== "STUDENT") {
        window.location.href = "index.html";
        return;
    }

    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    const documentGrid = document.getElementById("documentGrid");
    const noDocResult = document.getElementById("noDocResult");
    const allDocumentsCount = document.getElementById("allDocumentsCount");
    const API_BASE = "http://localhost:5000";

    const getCategoryKey = (category) => {
        const text = (category || "").toLowerCase();
        if (text.includes("biểu mẫu") || text.includes("quy định") || text.includes("hướng dẫn") || text.includes("quy chế")) return "REGULATION";
        if (text.includes("slide") || text.includes("presentation") || text.includes("thuyết trình")) return "SLIDE";
        return "REPORT";
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

        if (allDocumentsCount) allDocumentsCount.textContent = cards.length;

        cards.forEach((doc) => {
            const card = document.createElement("div");
            const categoryKey = getCategoryKey(doc.category || doc.target || "");
            const fileName = doc.original_name || doc.file_name || "Tài liệu";
            const filePath = doc.file_path ? `${API_BASE}${doc.file_path}` : "#";

            card.className = "doc-card";
            card.setAttribute("data-category", categoryKey);
            card.setAttribute("data-title", (doc.title || fileName).toLowerCase());
            card.innerHTML = `
                <div class="doc-file-icon ${categoryKey === "REGULATION" ? "pdf" : categoryKey === "SLIDE" ? "pptx" : "docx"}">
                    <i class="${categoryKey === "REGULATION" ? "fa-solid fa-file-pdf" : categoryKey === "SLIDE" ? "fa-solid fa-file-powerpoint" : "fa-solid fa-file-word"}"></i>
                </div>
                <div class="doc-info">
                    <span class="doc-category ${categoryKey === "REGULATION" ? "regulation" : categoryKey === "SLIDE" ? "slide" : "report"}">${doc.category || "Tài liệu"}</span>
                    <h4 class="doc-title">${doc.title || fileName}</h4>
                    <p class="doc-desc">${doc.target || "Tất cả nhóm hướng dẫn"}</p>
                    <div class="doc-meta">
                        <span><i class="fa-solid fa-calendar"></i> ${formatDate(doc.createdAt)}</span>
                        <span><i class="fa-solid fa-hard-drive"></i> ${formatBytes(doc.file_size)}</span>
                    </div>
                </div>
                <div class="doc-actions">
                    <button class="btn-preview" type="button" onclick="previewDoc('${fileName.replace(/'/g, "\\'")}', '${(doc.title || fileName).replace(/'/g, "\\'")}')"><i class="fa-regular fa-eye"></i> Xem trước</button>
                    <a class="btn-download" href="${filePath}" download><i class="fa-solid fa-download"></i> Tải về</a>
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
                noDocResult.style.display = visibleCount === 0 ? "block" : "none";
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
            const response = await fetch(`${API_BASE}/api/documents/student`);
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
            window.location.href = "index.html";
        });
    }

    window.addEventListener("click", (e) => {
        if (e.target === previewModal) previewModal.style.display = "none";
        if (e.target === logoutModal) logoutModal.style.display = "none";
    });

    loadDocuments();
});