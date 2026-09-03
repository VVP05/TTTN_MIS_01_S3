const API_BASE = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP
    const auth = JSON.parse(localStorage.getItem("lecturerAuth") || "null");
    const user = auth?.user || null;
    if (!user || user.role !== "LECTURER") {
        window.location.href = "index.html";
        return;
    }

    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    const lecturerCode = user.user_code;

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

    // 3. ICON THEO ĐUÔI FILE
    function getFileIcon(fileName) {
        const ext = (fileName.split(".").pop() || "").toLowerCase();
        if (ext === "pdf") return { icon: "fa-file-pdf", cls: "text-red" };
        if (["doc", "docx"].includes(ext)) return { icon: "fa-file-word", cls: "text-blue" };
        if (["xls", "xlsx"].includes(ext)) return { icon: "fa-file-excel", cls: "text-green" };
        if (["zip", "rar"].includes(ext)) return { icon: "fa-file-zipper", cls: "text-orange" };
        if (["ppt", "pptx"].includes(ext)) return { icon: "fa-file-powerpoint", cls: "text-orange" };
        return { icon: "fa-file", cls: "text-blue" };
    }

    function formatDate(dateString) {
        return new Date(dateString).toLocaleDateString("vi-VN");
    }

    // 4. TẢI DANH SÁCH NHÓM THỰC TẾ CỦA GIẢNG VIÊN ĐANG ĐĂNG NHẬP
    const docTargetSelect = document.getElementById("docTarget");

    async function fetchLecturerGroups() {
        try {
            const response = await fetch(`${API_BASE}/api/groups/lecturer/${lecturerCode}`);
            const result = await response.json();

            if (!docTargetSelect) return;

            const groups = result?.data || [];
            docTargetSelect.innerHTML = "";

            const allOption = document.createElement("option");
            allOption.value = "Tất cả nhóm hướng dẫn";
            allOption.textContent = "Tất cả nhóm tôi đang hướng dẫn";
            docTargetSelect.appendChild(allOption);

            if (!groups.length) {
                const emptyOption = document.createElement("option");
                emptyOption.value = "Tất cả nhóm hướng dẫn";
                emptyOption.textContent = "Bạn chưa có nhóm nào được phân công";
                emptyOption.disabled = true;
                docTargetSelect.appendChild(emptyOption);
                return;
            }

            groups.forEach((group) => {
                const option = document.createElement("option");
                const groupCode = group.group_code || "Nhóm";
                option.value = groupCode;
                option.textContent = `Chỉ ${groupCode}`;
                docTargetSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Lỗi khi tải danh sách nhóm giảng viên:", error);
            if (!docTargetSelect) return;
            docTargetSelect.innerHTML = "";
            const fallback = document.createElement("option");
            fallback.value = "Tất cả nhóm hướng dẫn";
            fallback.textContent = "Không tải được danh sách nhóm";
            fallback.disabled = true;
            docTargetSelect.appendChild(fallback);
        }
    }

    // 4. TẢI DANH SÁCH TÀI LIỆU ĐÃ CHIA SẺ TỪ SERVER
    const myDocsTableBody = document.getElementById("myDocsTableBody");
    const emptyDocsRow = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding: 24px 0;">Bạn chưa chia sẻ tài liệu nào.</td></tr>`;

    async function fetchMyDocuments() {
        try {
            const response = await fetch(`${API_BASE}/api/documents/lecturer/${lecturerCode}`);
            const data = await response.json();

            if (!data.success) {
                myDocsTableBody.innerHTML = emptyDocsRow;
                return;
            }

            renderDocuments(data.documents || []);
        } catch (error) {
            console.error("Lỗi kết nối máy chủ khi tải danh sách tài liệu:", error);
            myDocsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#ef4444; padding: 24px 0;">Lỗi kết nối máy chủ! Vui lòng kiểm tra Server rồi tải lại trang.</td></tr>`;
        }
    }

    function renderDocuments(documents) {
        if (!documents.length) {
            myDocsTableBody.innerHTML = emptyDocsRow;
            return;
        }

        myDocsTableBody.innerHTML = "";

        documents.forEach((doc) => {
            const { icon, cls } = getFileIcon(doc.original_name || "");
            const row = document.createElement("tr");
            row.dataset.id = doc._id;

            row.innerHTML = `
                <td>
                    <div class="file-name-cell">
                        <i class="fa-solid ${icon} ${cls}"></i>
                        <strong>${doc.title} (${doc.original_name})</strong>
                    </div>
                </td>
                <td><span class="badge badge-info">${doc.category}</span></td>
                <td>${doc.target}</td>
                <td>${formatDate(doc.createdAt)}</td>
                <td>${doc.download_count || 0}</td>
                <td>
                    <div class="action-buttons">
                        <a href="#" class="btn-icon btn-download-doc" title="Tải xuống"><i class="fa-solid fa-download"></i></a>
                        <button class="btn-icon text-red btn-delete-doc" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </td>
            `;

            myDocsTableBody.appendChild(row);
        });

        bindRowEvents();
    }

    // 5. THÊM TÀI LIỆU MỚI (TẢI LÊN THẬT QUA API)
    const uploadDocForm = document.getElementById("uploadDocForm");
    const uploadSubmitBtn = uploadDocForm ? uploadDocForm.querySelector('button[type="submit"]') : null;

    if (uploadDocForm) {
        uploadDocForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const title = document.getElementById("docTitle").value.trim();
            const category = document.getElementById("docCategory").value;
            const target = document.getElementById("docTarget").value;
            const fileInput = document.getElementById("docFile");
            const file = fileInput.files[0];

            if (!title) {
                alert("Vui lòng nhập tên tài liệu hiển thị!");
                return;
            }

            if (!file) {
                alert("Vui lòng chọn file tài liệu trước khi chia sẻ!");
                return;
            }

            const MAX_SIZE = 25 * 1024 * 1024; // 25MB, đồng bộ với giới hạn phía Server
            if (file.size > MAX_SIZE) {
                alert("File vượt quá kích thước tối đa 25MB!");
                return;
            }

            const formData = new FormData();
            formData.append("title", title);
            formData.append("category", category);
            formData.append("target", target);
            formData.append("uploader_code", lecturerCode);
            formData.append("uploader_name", user.full_name || "");
            formData.append("file", file);

            const originalBtnHtml = uploadSubmitBtn ? uploadSubmitBtn.innerHTML : "";
            if (uploadSubmitBtn) {
                uploadSubmitBtn.disabled = true;
                uploadSubmitBtn.textContent = "Đang tải lên...";
            }

            try {
                const response = await fetch(`${API_BASE}/api/documents/upload`, {
                    method: "POST",
                    body: formData
                });
                const data = await response.json();

                if (!response.ok || !data.success) {
                    alert(data.message || "Chia sẻ tài liệu thất bại, vui lòng thử lại!");
                    return;
                }

                alert("Đã chia sẻ tài liệu đến sinh viên thành công!");
                uploadModal.style.display = "none";
                uploadDocForm.reset();
                fetchMyDocuments(); // Tải lại danh sách để hiện tài liệu vừa thêm
            } catch (error) {
                console.error("Lỗi kết nối:", error);
                alert("Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!");
            } finally {
                if (uploadSubmitBtn) {
                    uploadSubmitBtn.disabled = false;
                    uploadSubmitBtn.innerHTML = originalBtnHtml;
                }
            }
        });
    }

    // 6. XÓA / TẢI XUỐNG TÀI LIỆU (GẮN SỰ KIỆN CHO TỪNG DÒNG)
    function bindRowEvents() {
        document.querySelectorAll(".btn-delete-doc").forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault();
                const row = e.target.closest("tr");
                const docId = row.dataset.id;

                if (!confirm("Bạn có chắc chắn muốn xóa tài liệu này không?")) return;

                try {
                    const response = await fetch(`${API_BASE}/api/documents/${docId}`, { method: "DELETE" });
                    const data = await response.json();

                    if (!response.ok || !data.success) {
                        alert(data.message || "Xóa tài liệu thất bại!");
                        return;
                    }

                    row.remove();
                    if (!myDocsTableBody.querySelector("tr")) {
                        myDocsTableBody.innerHTML = emptyDocsRow;
                    }
                } catch (error) {
                    console.error("Lỗi kết nối:", error);
                    alert("Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!");
                }
            };
        });

        document.querySelectorAll(".btn-download-doc").forEach(btn => {
            btn.onclick = async (e) => {
                e.preventDefault();
                const row = e.target.closest("tr");
                const docId = row.dataset.id;

                try {
                    const response = await fetch(`${API_BASE}/api/documents/download/${docId}`, { method: "PATCH" });
                    const data = await response.json();

                    if (!response.ok || !data.success) {
                        alert(data.message || "Không thể tải tài liệu!");
                        return;
                    }

                    window.open(`${API_BASE}${data.file_path}`, "_blank");
                    fetchMyDocuments(); // Cập nhật lại số lượt tải trên bảng
                } catch (error) {
                    console.error("Lỗi kết nối:", error);
                    alert("Không thể kết nối đến máy chủ. Vui lòng kiểm tra Server!");
                }
            };
        });
    }

    // 7. ĐĂNG XUẤT
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("user");
            window.location.href = "index.html";
        });
    }

    // Tải dữ liệu lần đầu
    fetchLecturerGroups();
    fetchMyDocuments();
});
