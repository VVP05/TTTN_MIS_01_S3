document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user || user.role !== "LECTURER") {
        window.location.href = "index.html";
        return;
    }

    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    // 2. MODAL TẢI TÀI LIỆU MỚI
    const uploadModal = document.getElementById("uploadModal");
    const openUploadModalBtn = document.getElementById("openUploadModalBtn");

    if (openUploadModalBtn) {
        openUploadModalBtn.addEventListener("click", () => {
            uploadModal.style.display = "flex";
        });
    }

    document.querySelectorAll(".btn-close-modal").forEach(btn => {
        btn.addEventListener("click", () => uploadModal.style.display = "none");
    });

    window.addEventListener("click", (e) => {
        if (e.target.classList.contains("modal-overlay")) uploadModal.style.display = "none";
    });

    // 3. THÊM TÀI LIỆU VÀO BẢNG (DEMO DỮ LIỆU)
    const uploadDocForm = document.getElementById("uploadDocForm");
    const myDocsTableBody = document.getElementById("myDocsTableBody");

    if (uploadDocForm) {
        uploadDocForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const title = document.getElementById("docTitle").value;
            const category = document.getElementById("docCategory").value;
            const target = document.getElementById("docTarget").value;
            const fileInput = document.getElementById("docFile");

            let fileName = fileInput.files[0] ? fileInput.files[0].name : "Tai_Lieu_Moi.docx";
            const today = new Date().toLocaleDateString("vi-VN");

            const newRow = document.createElement("tr");
            newRow.innerHTML = `
                <td>
                    <div class="file-name-cell">
                        <i class="fa-solid fa-file-word text-blue"></i>
                        <strong>${title} (${fileName})</strong>
                    </div>
                </td>
                <td><span class="badge badge-info">${category}</span></td>
                <td>${target}</td>
                <td>${today}</td>
                <td>0</td>
                <td>
                    <div class="action-buttons">
                        <a href="#" class="btn-icon" title="Tải xuống"><i class="fa-solid fa-download"></i></a>
                        <button class="btn-icon text-red btn-delete-doc" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;

            myDocsTableBody.prepend(newRow);
            bindDeleteEvents(); // Gán lại sự kiện xóa cho nút vừa tạo

            alert("Đã chia sẻ tài liệu đến sinh viên thành công!");
            uploadModal.style.display = "none";
            uploadDocForm.reset();
        });
    }

    // 4. XÓA TÀI LIỆU
    function bindDeleteEvents() {
        document.querySelectorAll(".btn-delete-doc").forEach(btn => {
            btn.onclick = (e) => {
                if (confirm("Bạn có chắc chắn muốn xóa tài liệu này không?")) {
                    e.target.closest("tr").remove();
                }
            };
        });
    }
    bindDeleteEvents();

    // 5. ĐĂNG XUẤT
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("user");
            window.location.href = "index.html";
        });
    }
});