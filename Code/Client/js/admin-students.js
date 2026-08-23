document.addEventListener("DOMContentLoaded", () => {
    let studentList = [];
    let currentEditingId = null;

    const tableBody = document.getElementById("studentTableBody");
    const searchInput = document.getElementById("searchInput");
    const classFilter = document.getElementById("classFilter");
    const statusFilter = document.getElementById("statusFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");

    const studentModal = document.getElementById("studentModal");
    const studentForm = document.getElementById("studentForm");
    const openAddBtn = document.getElementById("openAddBtn");
    const closeStudentModal = document.getElementById("closeStudentModal");
    const cancelStudentModal = document.getElementById("cancelStudentModal");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    async function fetchStudents() {
        try {
            const response = await fetch("http://localhost:5000/api/auth/students");
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || "Không tải được dữ liệu sinh viên");
            }

            studentList = Array.isArray(result.data) ? result.data.map(item => ({
                id: item.user_code || item.id || "",
                name: item.full_name || item.name || "Chưa cập nhật",
                class: item.class || "",
                major: item.major || "",
                email: item.email || "",
                status: item.status || "NONE"
            })) : [];

            renderStudents(studentList);
            updatePageSummary(studentList.length);
        } catch (error) {
            console.error("Lỗi tải sinh viên thật:", error);
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 20px; color: #ef4444;">Không thể tải dữ liệu sinh viên từ máy chủ.</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 sinh viên";
        }
    }

    function updatePageSummary(total) {
        const summaryText = `Hiển thị ${total} / ${total} sinh viên`;
        const paginationInfo = document.getElementById("paginationInfo");
        if (paginationInfo) paginationInfo.textContent = summaryText;
    }

    function renderStudents(data) {
        tableBody.innerHTML = "";

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 20px; color: #94a3b8;">Không tìm thấy sinh viên phù hợp</td></tr>`;
            updatePageSummary(0);
            return;
        }

        data.forEach(item => {
            let statusBadge = "";
            if (item.status === "APPROVED") {
                statusBadge = `<span class="badge-status green">Đã có đề tài</span>`;
            } else if (item.status === "PENDING") {
                statusBadge = `<span class="badge-status orange">Chờ phê duyệt</span>`;
            } else {
                statusBadge = `<span class="badge-status gray">Chưa có nhóm</span>`;
            }

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><input type="checkbox"></td>
                <td><strong>${item.id}</strong></td>
                <td>${item.name}</td>
                <td>${item.class || 'Chưa cập nhật'}</td>
                <td>${item.major || 'Chưa cập nhật'}</td>
                <td>${item.email || 'Chưa cập nhật'}</td>
                <td>${statusBadge}</td>
                <td class="text-center">
                    <button class="table-action-btn edit-btn" data-id="${item.id}" title="Sửa"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="table-action-btn red delete-btn" data-id="${item.id}" title="Xóa"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        updatePageSummary(data.length);
        attachEvents();
    }

    function handleFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedClass = classFilter.value;
        const selectedStatus = statusFilter.value;

        const filtered = studentList.filter(s => {
            const matchQuery = (s.id || '').toLowerCase().includes(query) || (s.name || '').toLowerCase().includes(query);
            const matchClass = selectedClass === "" || s.class === selectedClass;
            const matchStatus = selectedStatus === "" || s.status === selectedStatus;

            return matchQuery && matchClass && matchStatus;
        });

        renderStudents(filtered);
    }

    searchInput.addEventListener("input", handleFilter);
    classFilter.addEventListener("change", handleFilter);
    statusFilter.addEventListener("change", handleFilter);

    resetFilterBtn.addEventListener("click", () => {
        searchInput.value = "";
        classFilter.value = "";
        statusFilter.value = "";
        renderStudents(studentList);
    });

    openAddBtn.onclick = () => {
        currentEditingId = null;
        document.getElementById("modalTitle").textContent = "Thêm Sinh viên mới";
        studentForm.reset();
        document.getElementById("studentIdInput").disabled = false;
        studentModal.style.display = "flex";
    };

    studentForm.onsubmit = async (e) => {
        e.preventDefault();

        const id = document.getElementById("studentIdInput").value.trim();
        const name = document.getElementById("studentNameInput").value.trim();
        const studentClass = document.getElementById("studentClassInput").value.trim();
        const major = document.getElementById("studentMajorInput").value;
        const email = document.getElementById("studentEmailInput").value.trim();

        if (!id || !name || !studentClass || !email) {
            alert("Vui lòng điền đầy đủ thông tin sinh viên.");
            return;
        }

        try {
            const payload = {
                user_code: id,
                full_name: name,
                class: studentClass,
                major,
                email
            };

            let response;
            if (currentEditingId) {
                response = await fetch(`http://localhost:5000/api/auth/students/${currentEditingId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                response = await fetch("http://localhost:5000/api/auth/students", {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Lỗi khi lưu dữ liệu sinh viên.');
            }

            studentModal.style.display = "none";
            await fetchStudents();
        } catch (error) {
            console.error('Lỗi lưu sinh viên:', error);
            alert(error.message || 'Không thể lưu sinh viên.');
        }
    };

    function attachEvents() {
        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const item = studentList.find(s => s.id === id);
                if (item) {
                    currentEditingId = id;
                    document.getElementById("modalTitle").textContent = "Chỉnh sửa sinh viên";
                    document.getElementById("studentIdInput").value = item.id;
                    document.getElementById("studentIdInput").disabled = true;
                    document.getElementById("studentNameInput").value = item.name;
                    document.getElementById("studentClassInput").value = item.class || "";
                    document.getElementById("studentMajorInput").value = item.major || "Kỹ thuật Phần mềm";
                    document.getElementById("studentEmailInput").value = item.email || "";

                    studentModal.style.display = "flex";
                }
            };
        });

        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                if (confirm(`Bạn chắc chắn muốn xóa sinh viên ${id}?`)) {
                    studentList = studentList.filter(s => s.id !== id);
                    renderStudents(studentList);
                }
            };
        });
    }

    closeStudentModal.onclick = () => studentModal.style.display = "none";
    cancelStudentModal.onclick = () => studentModal.style.display = "none";

    openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    cancelLogout.onclick = () => logoutModal.style.display = "none";
    confirmLogout.onclick = () => {
        localStorage.clear();
        window.location.href = "index.html";
    };

    fetchStudents();
});