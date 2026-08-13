document.addEventListener("DOMContentLoaded", () => {

    let lecturerList = [];
    let currentEditingId = null;

    // DOM ELEMENTS
    const tableBody = document.getElementById("lecturerTableBody");
    const searchInput = document.getElementById("searchInput");
    const deptFilter = document.getElementById("deptFilter");
    const degreeFilter = document.getElementById("degreeFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");

    const lecturerModal = document.getElementById("lecturerModal");
    const lecturerForm = document.getElementById("lecturerForm");
    const openAddBtn = document.getElementById("openAddBtn");
    const closeLecturerModal = document.getElementById("closeLecturerModal");
    const cancelLecturerModal = document.getElementById("cancelLecturerModal");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    async function fetchLecturers() {
        try {
            const response = await fetch("http://localhost:5000/api/auth/lecturers");
            const result = await response.json();

            if (!response.ok || !result || (!Array.isArray(result) && !Array.isArray(result.data))) {
                throw new Error(result?.message || "Không tải được dữ liệu giảng viên");
            }

            const rawList = Array.isArray(result) ? result : result.data || [];

            lecturerList = rawList.map(item => ({
                id: item.user_code || item.id || "",
                name: item.full_name || item.name || "Chưa cập nhật",
                degree: item.degree || "Chưa cập nhật",
                dept: item.dept || "Chưa cập nhật",
                email: item.email || "Chưa cập nhật",
                groupsCount: item.groupsCount || 0,
                topicsCount: item.topicsCount || 0
            }));

            renderLecturers(lecturerList);
        } catch (error) {
            console.error("Lỗi tải giảng viên thật:", error);
            tableBody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 20px; color: #ef4444;">Không thể tải dữ liệu giảng viên từ máy chủ.</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 giảng viên";
        }
    }

    function renderLecturers(data) {
        tableBody.innerHTML = "";

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="9" class="text-center" style="padding: 20px; color: #94a3b8;">Không tìm thấy giảng viên phù hợp</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 giảng viên";
            return;
        }

        data.forEach(item => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><input type="checkbox"></td>
                <td><strong>${item.id}</strong></td>
                <td>${item.name}</td>
                <td><span class="badge-degree">${item.degree}</span></td>
                <td>${item.dept}</td>
                <td>${item.email}</td>
                <td class="text-center"><span class="group-count-tag">${item.groupsCount} nhóm</span></td>
                <td class="text-center"><span class="topic-count-tag">${item.topicsCount} đề tài</span></td>
                <td class="text-center">
                    <button class="table-action-btn edit-btn" data-id="${item.id}" title="Sửa"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="table-action-btn red delete-btn" data-id="${item.id}" title="Xóa"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        document.getElementById("paginationInfo").textContent = `Hiển thị 1 - ${data.length} trên tổng số ${data.length} giảng viên`;
        attachEvents();
    }

    function handleFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedDept = deptFilter.value;
        const selectedDegree = degreeFilter.value;

        const filtered = lecturerList.filter(l => {
            const matchQuery = (l.id || "").toLowerCase().includes(query) || (l.name || "").toLowerCase().includes(query) || (l.email || "").toLowerCase().includes(query);
            const matchDept = selectedDept === "" || (l.dept || "").toLowerCase().includes(selectedDept.toLowerCase());
            const matchDegree = selectedDegree === "" || (l.degree || "") === selectedDegree;

            return matchQuery && matchDept && matchDegree;
        });

        renderLecturers(filtered);
    }

    if (searchInput) searchInput.addEventListener("input", handleFilter);
    if (deptFilter) deptFilter.addEventListener("change", handleFilter);
    if (degreeFilter) degreeFilter.addEventListener("change", handleFilter);

    if (resetFilterBtn) {
        resetFilterBtn.addEventListener("click", () => {
            searchInput.value = "";
            deptFilter.value = "";
            degreeFilter.value = "";
            renderLecturers(lecturerList);
        });
    }

    if (openAddBtn) {
        openAddBtn.onclick = () => {
            currentEditingId = null;
            document.getElementById("modalTitle").textContent = "Thêm Giảng viên mới";
            lecturerForm.reset();
            document.getElementById("lecturerIdInput").disabled = false;
            lecturerModal.style.display = "flex";
        };
    }

    if (lecturerForm) {
        lecturerForm.onsubmit = async (e) => {
            e.preventDefault();

            const id = document.getElementById("lecturerIdInput").value.trim();
            const name = document.getElementById("lecturerNameInput").value.trim();
            const degree = document.getElementById("lecturerDegreeInput").value;
            const dept = document.getElementById("lecturerDeptInput").value;
            const email = document.getElementById("lecturerEmailInput").value.trim();

            if (!id || !name || !degree || !dept || !email) {
                alert("Vui lòng điền đầy đủ thông tin giảng viên.");
                return;
            }

            try {
                const payload = {
                    user_code: id,
                    full_name: name,
                    degree,
                    dept,
                    email
                };

                let response;
                if (currentEditingId) {
                    response = await fetch(`http://localhost:5000/api/auth/lecturers/${currentEditingId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                } else {
                    response = await fetch("http://localhost:5000/api/auth/lecturers", {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }

                const result = await response.json();
                if (!response.ok || !result.success) {
                    throw new Error(result.message || 'Lỗi khi lưu dữ liệu giảng viên.');
                }

                lecturerModal.style.display = "none";
                await fetchLecturers();
            } catch (error) {
                console.error('Lỗi lưu giảng viên:', error);
                alert(error.message || 'Không thể lưu giảng viên.');
            }
        };
    }

    function attachEvents() {
        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                const item = lecturerList.find(l => l.id === id);
                if (item) {
                    currentEditingId = id;
                    document.getElementById("modalTitle").textContent = "Chỉnh sửa giảng viên";
                    document.getElementById("lecturerIdInput").value = item.id;
                    document.getElementById("lecturerIdInput").disabled = true;
                    document.getElementById("lecturerNameInput").value = item.name;
                    document.getElementById("lecturerDegreeInput").value = item.degree;
                    document.getElementById("lecturerDeptInput").value = item.dept;
                    document.getElementById("lecturerEmailInput").value = item.email;

                    lecturerModal.style.display = "flex";
                }
            };
        });

        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                if (confirm(`Bạn có chắc muốn xóa giảng viên mã ${id}?`)) {
                    lecturerList = lecturerList.filter(l => l.id !== id);
                    renderLecturers(lecturerList);
                }
            };
        });
    }

    if (closeLecturerModal) closeLecturerModal.onclick = () => lecturerModal.style.display = "none";
    if (cancelLecturerModal) cancelLecturerModal.onclick = () => lecturerModal.style.display = "none";

    if (openLogoutBtn) openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    if (cancelLogout) cancelLogout.onclick = () => logoutModal.style.display = "none";
    if (confirmLogout) {
        confirmLogout.onclick = () => {
            localStorage.clear();
            window.location.href = "index.html";
        };
    }

    fetchLecturers();
});