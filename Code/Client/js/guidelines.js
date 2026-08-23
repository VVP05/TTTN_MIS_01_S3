document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user || user.role !== "STUDENT") {
        window.location.href = "index.html";
        return;
    }

    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    const docCards = document.querySelectorAll(".doc-card");
    const noDocResult = document.getElementById("noDocResult");

    // 2. LỌC TÀI LIỆU THEO TABS CATEGORY
    const tabButtons = document.querySelectorAll(".tab-btn");
    let currentCategory = "ALL";
    let currentSearchQuery = "";

    const filterDocuments = () => {
        let visibleCount = 0;

        docCards.forEach((card) => {
            const category = card.getAttribute("data-category");
            const title = card.getAttribute("data-title").toLowerCase();
            
            const matchCategory = (currentCategory === "ALL" || category === currentCategory);
            const matchSearch = title.includes(currentSearchQuery.toLowerCase());

            if (matchCategory && matchSearch) {
                card.style.display = "flex";
                visibleCount++;
            } else {
                card.style.display = "none";
            }
        });

        // Hiển thị thông báo nếu không tìm thấy
        if (noDocResult) {
            noDocResult.style.display = (visibleCount === 0) ? "block" : "none";
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

    // 3. TÌM KIẾM TÀI LIỆU (SEARCH)
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", (e) => {
            currentSearchQuery = e.target.value.trim();
            filterDocuments();
        });
    }

    // 4. MODAL PREVIEW TÀI LIỆU
    const previewModal = document.getElementById("previewModal");
    const btnClosePreviewModal = document.getElementById("btnClosePreviewModal");

    window.previewDoc = (fileName, docTitle) => {
        document.getElementById("previewTitle").textContent = docTitle;
        document.getElementById("previewFileName").textContent = fileName;
        previewModal.style.display = "flex";
    };

    if (btnClosePreviewModal) {
        btnClosePreviewModal.addEventListener("click", () => {
            previewModal.style.display = "none";
        });
    }

    // 5. XỬ LÝ ĐĂNG XUẤT
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

    // Đóng modal khi bấm ra ngoài vùng xám
    window.addEventListener("click", (e) => {
        if (e.target === previewModal) previewModal.style.display = "none";
        if (e.target === logoutModal) logoutModal.style.display = "none";
    });
});