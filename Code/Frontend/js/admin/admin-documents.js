const API_BASE = window.APP_CONFIG.API_BASE_URL + "";

document.addEventListener("DOMContentLoaded", async () => {
    const user = await window.verifyAuthSession("ADMIN");
    if (!user) return;

    document.getElementById("userName").textContent = user.full_name || user.fullName || "Quản trị viên";
    const form = document.getElementById("documentForm");
    const tableBody = document.getElementById("documentTableBody");
    const searchInput = document.getElementById("searchInput");
    const targetFilter = document.getElementById("targetFilter");
    const message = document.getElementById("formMessage");
    let documents = [];
    const authHeaders = {};

    const formatDate = (value) => value ? new Date(value).toLocaleDateString("vi-VN") : "-";
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
        } catch (error) {
            console.warn("Không thể khôi phục tên file tiếng Việt:", error);
            return filename;
        }
    };
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
        const selectedTarget = targetFilter.value;
        const filtered = documents.filter(doc => {
            const role = doc.uploader_role || (doc.uploader_code === "ADMIN" ? "ADMIN" : "LECTURER");
            const recipient = (doc.target || "").toLowerCase();
            const originalName = displayFilename(doc.original_name);
            const lecturerSharedWithStudents = role === "LECTURER" && recipient !== "tất cả giảng viên";
            const matchesQuery = `${doc.title} ${originalName} ${doc.category} ${doc.uploader_name} ${doc.uploader_code} ${doc.target}`.toLowerCase().includes(query);
            const matchesTarget = !selectedTarget
                || (selectedTarget === "students" && (lecturerSharedWithStudents || ["students", "tất cả sinh viên"].includes(recipient)))
                || (selectedTarget === "lecturers" && recipient === "tất cả giảng viên");
            return matchesQuery && matchesTarget;
        });
        if (!filtered.length) {
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding:24px;color:#94a3b8">Chưa có tài liệu phù hợp.</td></tr>`;
            return;
        }
        tableBody.innerHTML = filtered.map(doc => `
            <tr data-id="${doc._id}">
                <td><div class="file-cell"><i class="fa-solid ${fileIcon(doc.original_name || "")}"></i><span>${escapeHtml(doc.title)}<small>${escapeHtml(displayFilename(doc.original_name))}</small></span></div></td>
                <td><span class="category-badge">${escapeHtml(doc.category || "Tài liệu")}</span></td>
                <td><div class="uploader-cell"><span>${escapeHtml(doc.uploader_name || doc.uploader_code)}</span>${(doc.uploader_role || (doc.uploader_code === "ADMIN" ? "ADMIN" : "LECTURER")) === "ADMIN" ? "" : "<small>Giảng viên</small>"}</div></td>
                <td>${escapeHtml(doc.target || "Tất cả sinh viên")}</td>
                <td>${formatDate(doc.createdAt)}</td>
                <td>${doc.download_count || 0}</td>
                <td><button class="action-btn download" title="Tải xuống"><i class="fa-solid fa-download"></i></button><button class="action-btn delete" title="Xóa"><i class="fa-solid fa-trash-can"></i></button></td>
            </tr>`).join("");
        tableBody.querySelectorAll(".download").forEach(button => button.addEventListener("click", () => downloadDocument(button.closest("tr").dataset.id)));
        tableBody.querySelectorAll(".delete").forEach(button => button.addEventListener("click", () => deleteDocument(button.closest("tr").dataset.id)));
    }

    async function loadDocuments() {
        try {
            const response = await apiFetch(`${API_BASE}/api/documents/admin/all`, { headers: authHeaders });
            const result = await response.json();
            documents = response.ok && result.success ? result.documents || [] : [];
            renderDocuments();
        } catch (error) {
            console.error("Lỗi tải danh sách tài liệu:", error);
            tableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:#ef4444">Không thể tải danh sách tài liệu.</td></tr>`;
        }
    }

    async function downloadDocument(id) {
        const response = await apiFetch(`${API_BASE}/api/documents/download/${id}`, { method: "PATCH", headers: authHeaders });
        const result = await response.json();
        if (!response.ok || !result.success) return showAppNotification(result.message || "Không thể tải tài liệu!");
        window.open(`${API_BASE}${result.file_path}`, "_blank");
        loadDocuments();
    }

    async function deleteDocument(id) {
        const confirmed = await window.showConfirmDialog({
            title: "Xác nhận xóa tài liệu",
            message: "Bạn có chắc muốn xóa tài liệu này khỏi trang sinh viên không?",
            confirmText: "Xóa tài liệu",
            danger: true
        });
        if (!confirmed) return;
        const response = await apiFetch(`${API_BASE}/api/documents/${id}`, { method: "DELETE", headers: authHeaders });
        const result = await response.json();
        if (!response.ok || !result.success) return showAppNotification(result.message || "Xóa tài liệu thất bại!");
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
        formData.append("file", file);
        const button = document.getElementById("uploadBtn");
        button.disabled = true;
        message.textContent = "Đang tải lên...";
        try {
            const response = await apiFetch(`${API_BASE}/api/documents/upload`, { method: "POST", headers: authHeaders, body: formData });
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
    targetFilter.addEventListener("change", renderDocuments);
    document.getElementById("logoutBtn").addEventListener("click", () => {
        window.logoutSession();
        localStorage.removeItem("adminAuth");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "../auth/index.html";
    });
    loadDocuments();
});
