document.addEventListener("DOMContentLoaded", async () => {
    const baseUrl = "http://localhost:5000/api";

    const authRaw = localStorage.getItem("adminAuth") || localStorage.getItem("token");
    let token = null;
    let user = null;

    if (authRaw) {
        try {
            const authObj = JSON.parse(authRaw);
            token = authObj?.token || authRaw;
            user = authObj?.user || null;
        } catch (error) {
            token = authRaw;
        }
    }

    if (!user) {
        try {
            user = JSON.parse(localStorage.getItem("user") || "null");
        } catch (error) {
            user = null;
        }
    }

    if (!token || !user || String(user.role).toUpperCase() !== "ADMIN") {
        window.location.href = "index.html";
        return;
    }

    let logList = [];

    async function fetchLogs() {
        try {
            const response = await fetch(`${baseUrl}/activity-logs`, {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            const result = await response.json();

            if (!response.ok || !result || !Array.isArray(result.data)) {
                throw new Error(result?.message || 'Không tải được nhật ký hoạt động');
            }

            logList = result.data.map(item => ({
                ...item,
                timestamp: item.createdAt || item.updatedAt || item.timestamp,
                user: item.user_name || item.user || 'Không xác định',
                email: item.email || item.user_email || '-',
                role: item.role || 'GUEST',
                actionType: item.actionType || item.method || 'OTHER',
                actionText: item.actionText || `${item.method || ''} ${item.url || ''}`,
                ip: item.ip || item.ip_address || 'Unknown'
            }));

            updateSummary();
            renderLogs(logList);
        } catch (error) {
            console.error('Lỗi tải nhật ký hoạt động:', error);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px; color: #ef4444;">Không thể tải dữ liệu nhật ký hoạt động từ máy chủ.</td></tr>`;
            }
        }
    }

    // DOM ELEMENTS
    const tableBody = document.getElementById("logsTableBody");
    const searchInput = document.getElementById("searchInput");
    const roleFilter = document.getElementById("roleFilter");
    const actionTypeFilter = document.getElementById("actionTypeFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");
    const exportLogBtn = document.getElementById("exportLogBtn");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    // 2. CẬP NHẬT SUMMARY CARDS
    function updateSummary() {
        const totalLogsEl = document.getElementById("totalLogs");
        const adminLogsEl = document.getElementById("adminLogs");
        const lecturerLogsEl = document.getElementById("lecturerLogs");
        const studentLogsEl = document.getElementById("studentLogs");

        if (totalLogsEl) totalLogsEl.textContent = logList.length;
        if (adminLogsEl) adminLogsEl.textContent = logList.filter(l => l.role === "ADMIN").length;
        if (lecturerLogsEl) lecturerLogsEl.textContent = logList.filter(l => l.role === "LECTURER").length;
        if (studentLogsEl) studentLogsEl.textContent = logList.filter(l => l.role === "STUDENT").length;
    }

    // FORMAT DATETIME
    function formatDate(dateStr) {
        if (!dateStr) return "-";
        const d = new Date(dateStr);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${hours}:${minutes}:${seconds} - ${day}/${month}/${year}`;
    }

    // 3. RENDER LOGS TABLE
    function renderLogs(data) {
        if (!tableBody) return;
        tableBody.innerHTML = "";

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px; color: #94a3b8;">Không tìm thấy nhật ký hoạt động nào</td></tr>`;
            return;
        }

        data.forEach(item => {
            const tr = document.createElement("tr");

            // Role Badge
            let roleBadge = "";
            if (item.role === "ADMIN") roleBadge = `<span class="role-pill role-admin">ADMIN</span>`;
            else if (item.role === "LECTURER") roleBadge = `<span class="role-pill role-lecturer">GIẢNG VIÊN</span>`;
            else roleBadge = `<span class="role-pill role-student">SINH VIÊN</span>`;

            // Action Badge
            let actionBadge = "";
            if (item.actionType === "CREATE") actionBadge = `<span class="action-pill action-create">TẠO MỚI</span>`;
            else if (item.actionType === "UPDATE") actionBadge = `<span class="action-pill action-update">CẬP NHẬT</span>`;
            else if (item.actionType === "DELETE") actionBadge = `<span class="action-pill action-delete">XÓA</span>`;
            else actionBadge = `<span class="action-pill action-auth">XÁC THỰC</span>`;

            tr.innerHTML = `
                <td><i class="fa-regular fa-clock" style="color:#94a3b8; margin-right:4px;"></i> ${formatDate(item.timestamp)}</td>
                <td>
                    <div class="user-cell">
                        <span class="user-name">${item.user}</span>
                        <span class="user-sub">${item.email}</span>
                    </div>
                </td>
                <td>${roleBadge}</td>
                <td>${actionBadge}</td>
                <td style="line-height: 1.4; color: #334155;">${item.actionText}</td>
                <td class="text-center"><span class="ip-code">${item.ip}</span></td>
            `;
            tableBody.appendChild(tr);
        });
    }

    // 4. LỌC & TÌM KIẾM
    function handleFilter() {
        const query = searchInput?.value.toLowerCase().trim() || "";
        const selectedRole = roleFilter?.value || "";
        const selectedAction = actionTypeFilter?.value || "";

        const filtered = logList.filter(l => {
            const matchQuery = l.user.toLowerCase().includes(query) || 
                               l.email.toLowerCase().includes(query) || 
                               l.actionText.toLowerCase().includes(query);
            const matchRole = selectedRole === "" || l.role === selectedRole;
            const matchAction = selectedAction === "" || l.actionType === selectedAction;

            return matchQuery && matchRole && matchAction;
        });

        renderLogs(filtered);
    }

    searchInput?.addEventListener("input", handleFilter);
    roleFilter?.addEventListener("change", handleFilter);
    actionTypeFilter?.addEventListener("change", handleFilter);

    resetFilterBtn.onclick = () => {
        if (searchInput) searchInput.value = "";
        if (roleFilter) roleFilter.value = "";
        if (actionTypeFilter) actionTypeFilter.value = "";
        handleFilter();
    };

    // 5. XUẤT CSV (MÔ PHỎNG)
    exportLogBtn.onclick = () => {
        alert("Đã hoàn tất xuất file Nhật ký hoạt động (system-audit-logs.csv)!");
    };

    // LOGOUT
    openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    cancelLogout.onclick = () => logoutModal.style.display = "none";
    confirmLogout.onclick = () => {
        localStorage.clear();
        window.location.href = "index.html";
    };

    // INIT
    await fetchLogs();
    handleFilter();
});