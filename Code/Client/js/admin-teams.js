document.addEventListener("DOMContentLoaded", async () => {

    let lecturerList = [];
    let teamList = [];
    let selectedTeamId = null;

    // DOM ELEMENTS
    const tableBody = document.getElementById("teamTableBody");
    const searchInput = document.getElementById("searchInput");
    const statusFilter = document.getElementById("statusFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");

    const assignModal = document.getElementById("assignModal");
    const closeAssignModal = document.getElementById("closeAssignModal");
    const cancelAssignBtn = document.getElementById("cancelAssignBtn");
    const saveAssignBtn = document.getElementById("saveAssignBtn");
    const modalTeamTitle = document.getElementById("modalTeamTitle");
    const lecturerHDSelect = document.getElementById("lecturerHDSelect");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    async function fetchLecturers() {
        try {
            const response = await fetch("http://localhost:5000/api/auth/lecturers");
            const result = await response.json();
            const rawList = Array.isArray(result) ? result : (result.data || []);

            lecturerList = rawList.map(item => ({
                id: item.user_code || item.id || "",
                name: item.full_name || item.name || "Chưa cập nhật",
                user_code: item.user_code || item.id || ""
            }));
        } catch (error) {
            console.error("Lỗi tải danh sách giảng viên:", error);
            lecturerList = [];
        }
    }

    async function fetchTeams() {
        try {
            const response = await fetch("http://localhost:5000/api/topics/admin/all");
            const result = await response.json();

            if (!response.ok || !result || !Array.isArray(result.data)) {
                throw new Error(result?.message || "Không tải được dữ liệu nhóm");
            }

            teamList = result.data.map(item => ({
                _id: item._id,
                id: item.id || item._id,
                topicTitle: item.topicTitle || "Chưa có tiêu đề",
                lecturerHD: item.lecturerHD || null,
                lecturer_code: item.lecturer_code || null,
                students: Array.isArray(item.students) ? item.students : []
            }));

            renderTeams(teamList);
        } catch (error) {
            console.error("Lỗi tải nhóm thật:", error);
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px; color: #ef4444;">Không thể tải dữ liệu nhóm từ máy chủ.</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 nhóm";
        }
    }

    function renderTeams(data) {
        tableBody.innerHTML = "";

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px; color: #94a3b8;">Không tìm thấy nhóm phù hợp</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 nhóm";
            return;
        }

        data.forEach(item => {
            const tr = document.createElement("tr");

            const isAssigned = !!item.lecturerHD;
            const statusTag = isAssigned 
                ? `<span class="status-badge status-assigned">Đã phân công</span>` 
                : `<span class="status-badge status-unassigned">Chưa phân công</span>`;

            const studentHtml = (item.students || []).map(s => 
                `<span class="student-tag ${s.isLeader ? 'leader' : ''}">${s.name} (${s.code})${s.isLeader ? ' - Trưởng nhóm' : ''}</span>`
            ).join(" ");

            tr.innerHTML = `
                <td><input type="checkbox"></td>
                <td><strong>${item.id}</strong></td>
                <td>
                    <div class="team-topic-title">${item.topicTitle}</div>
                    <div class="student-tags">${studentHtml || '<em style="color: #94a3b8;">Chưa có thành viên</em>'}</div>
                </td>
                <td>${item.lecturerHD ? `<strong>${item.lecturerHD}</strong>` : '<em style="color: #94a3b8;">Chưa gán GVHD</em>'}</td>
                <td class="text-center">${statusTag}</td>
                <td class="text-center">
                    <button class="table-action-btn assign-btn" data-id="${item._id}" title="Gán / Đổi GVHD">
                        <i class="fa-solid fa-user-pen"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        document.getElementById("paginationInfo").textContent = `Hiển thị 1 - ${data.length} trên tổng số ${data.length} nhóm`;
        attachEvents();
    }

    function handleFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedStatus = statusFilter.value;

        const filtered = teamList.filter(t => {
            const matchQuery = (t.id || "").toString().toLowerCase().includes(query) ||
                               (t.topicTitle || "").toLowerCase().includes(query) ||
                               (t.lecturerHD && t.lecturerHD.toLowerCase().includes(query)) ||
                               (t.students || []).some(s => (s.name || "").toLowerCase().includes(query) || (s.code || "").toLowerCase().includes(query));

            let matchStatus = true;
            if (selectedStatus === "assigned") matchStatus = !!t.lecturerHD;
            if (selectedStatus === "unassigned") matchStatus = !t.lecturerHD;

            return matchQuery && matchStatus;
        });

        renderTeams(filtered);
    }

    if (searchInput) searchInput.addEventListener("input", handleFilter);
    if (statusFilter) statusFilter.addEventListener("change", handleFilter);

    if (resetFilterBtn) {
        resetFilterBtn.addEventListener("click", () => {
            searchInput.value = "";
            statusFilter.value = "";
            handleFilter();
        });
    }

    function openAssignModal(teamId) {
        selectedTeamId = teamId;
        const team = teamList.find(t => t._id === teamId || t.id === teamId);
        if (!team) return;

        modalTeamTitle.innerHTML = `<strong>[${team.id}] ${team.topicTitle}</strong>`;

        lecturerHDSelect.innerHTML = `<option value="">-- Chọn Giảng Viên Hướng Dẫn --</option>`;
        lecturerList.forEach(lec => {
            const selected = (team.lecturer_code || team.lecturerHD) === lec.user_code || team.lecturerHD === lec.name ? "selected" : "";
            lecturerHDSelect.innerHTML += `<option value="${lec.user_code}" ${selected}>${lec.name}</option>`;
        });

        assignModal.style.display = "flex";
    }

    function attachEvents() {
        document.querySelectorAll(".assign-btn").forEach(btn => {
            btn.onclick = (e) => {
                const id = e.currentTarget.getAttribute("data-id");
                openAssignModal(id);
            };
        });
    }

    if (saveAssignBtn) {
        saveAssignBtn.onclick = async () => {
            const selectedLecturer = lecturerHDSelect.value;
            if (!selectedLecturer) {
                alert("Vui lòng chọn Giảng viên hướng dẫn!");
                return;
            }

            if (!selectedTeamId) {
                alert("Không tìm thấy nhóm cần phân công!");
                return;
            }

            try {
                const res = await fetch(`http://localhost:5000/api/topics/admin/assign-lecturer/${selectedTeamId}`, {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ lecturer_code: selectedLecturer })
                });

                const data = await res.json();
                if (!res.ok || !data.success) {
                    throw new Error(data.message || "Không thể phân công giảng viên");
                }

                alert(data.message || "Phân công thành công!");
                assignModal.style.display = "none";
                await fetchTeams();
                handleFilter();
            } catch (error) {
                console.error("Lỗi phân công giảng viên:", error);
                alert(error.message || "Lỗi phân công giảng viên!");
            }
        };
    }

    if (closeAssignModal) closeAssignModal.onclick = () => assignModal.style.display = "none";
    if (cancelAssignBtn) cancelAssignBtn.onclick = () => assignModal.style.display = "none";

    if (openLogoutBtn) openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    if (cancelLogout) cancelLogout.onclick = () => logoutModal.style.display = "none";
    if (confirmLogout) {
        confirmLogout.onclick = () => {
            localStorage.clear();
            window.location.href = "index.html";
        };
    }

    await fetchLecturers();
    await fetchTeams();
    handleFilter();
});