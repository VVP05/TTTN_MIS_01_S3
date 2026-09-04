const API_BASE = "http://localhost:5000";

document.addEventListener("DOMContentLoaded", () => {
    const auth = JSON.parse(localStorage.getItem("adminAuth") || "null");
    const user = auth?.user || JSON.parse(localStorage.getItem("user") || "null");
    const token = auth?.token || localStorage.getItem("token");
    if (!user || user.role !== "ADMIN" || !token) {
        window.location.href = "index.html";
        return;
    }

    document.getElementById("userName").textContent = user.full_name || user.fullName || "Quản trị viên";
    const form = document.getElementById("documentForm");
    const tableBody = document.getElementById("documentTableBody");
    const searchInput = document.getElementById("searchInput");
    const message = document.getElementById("formMessage");
    let documents = [];

    const formatDate = (value) => value ? new Date(value).toLocaleDateString("vi-VN") : "-";
    const fileIcon = (name) => {
        const ext = (name.split(".").pop() || "").toLowerCase();
        if (ext === "pdf") return "fa-file-pdf";
        if (["doc", "docx"].includes(ext)) return "fa-file-word";
        if (["ppt", "pptx"].includes(ext)) return "fa-file-powerpoint";
        if (["xls", "xlsx"].includes(ext)) return "fa-file-excel";
        return "fa-file-lines";
    };

    function renderDocuments() {
        const query = searchInput.value.trim().toLowerCase();
        const filtered = documents.filter(doc => `${doc.title} ${doc.original_name} ${doc.category}`.toLowerCase().includes(query));
        if (!filtered.length) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding:24px;color:#94a3b8">Chưa có tài liệu phù hợp.</td></tr>`;
            return;
        }
        tableBody.innerHTML = filtered.map(doc => `
            <tr data-id="${doc._id}">
                <td><div class="file-cell"><i class="fa-solid ${fileIcon(doc.original_name || "")}"></i><span>${doc.title}<small>${doc.original_name || ""}</small></span></div></td>
                <td><span class="category-badge">${doc.category || "Tài liệu"}</span></td>
                <td>${doc.target || "Tất cả sinh viên"}</td>
                <td>${formatDate(doc.createdAt)}</td>
                <td>${doc.download_count || 0}</td>
                <td><button class="action-btn download" title="Tải xuống"><i class="fa-solid fa-download"></i></button><button class="action-btn delete" title="Xóa"><i class="fa-solid fa-trash-can"></i></button></td>
            </tr>`).join("");
        tableBody.querySelectorAll(".download").forEach(button => button.addEventListener("click", () => downloadDocument(button.closest("tr").dataset.id)));
        tableBody.querySelectorAll(".delete").forEach(button => button.addEventListener("click", () => deleteDocument(button.closest("tr").dataset.id)));
    }

    async function loadDocuments() {
        try {
            let response = await fetch(`${API_BASE}/api/documents/admin/all`);
            if (response.status === 404) {
                response = await fetch(`${API_BASE}/api/documents/student`);
            }
            const result = await response.json();
            documents = response.ok && result.success ? result.documents || [] : [];
            renderDocuments();
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:#ef4444">Không thể tải danh sách tài liệu.</td></tr>`;
        }
    }

    async function downloadDocument(id) {
        const response = await fetch(`${API_BASE}/api/documents/download/${id}`, { method: "PATCH" });
        const result = await response.json();
        if (!response.ok || !result.success) return alert(result.message || "Không thể tải tài liệu!");
        window.open(`${API_BASE}${result.file_path}`, "_blank");
        loadDocuments();
    }

    async function deleteDocument(id) {
        if (!confirm("Bạn có chắc muốn xóa tài liệu này khỏi trang sinh viên không?")) return;
        const response = await fetch(`${API_BASE}/api/documents/${id}`, { method: "DELETE" });
        const result = await response.json();
        if (!response.ok || !result.success) return alert(result.message || "Xóa tài liệu thất bại!");
        loadDocuments();
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const file = document.getElementById("docFile").files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append("title", document.getElementById("docTitle").value.trim());
        formData.append("category", document.getElementById("docCategory").value);
        formData.append("target", document.getElementById("docTarget").value);
        formData.append("uploader_code", user.user_code || "ADMIN");
        formData.append("uploader_name", user.full_name || user.fullName || "Quản trị viên");
        formData.append("file", file);
        const button = document.getElementById("uploadBtn");
        button.disabled = true;
        message.textContent = "Đang tải lên...";
        try {
            const response = await fetch(`${API_BASE}/api/documents/upload`, { method: "POST", body: formData });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || "Gửi tài liệu thất bại!");
            form.reset();
            message.textContent = "Đã gửi tài liệu cho sinh viên.";
            loadDocuments();
        } catch (error) {
            message.textContent = error.message;
            message.style.color = "#ef4444";
        } finally {
            button.disabled = false;
        }
    });

    searchInput.addEventListener("input", renderDocuments);
    document.getElementById("logoutBtn").addEventListener("click", () => {
        localStorage.removeItem("adminAuth");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "index.html";
    });
    loadDocuments();
});
