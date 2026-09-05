document.addEventListener("DOMContentLoaded", () => {

    let accountList = [];
    let currentEditingUsername = null;

    // DOM ELEMENTS
    const tableBody = document.getElementById("accountTableBody");
    const searchInput = document.getElementById("searchInput");
    const roleFilter = document.getElementById("roleFilter");
    const statusFilter = document.getElementById("statusFilter");
    const resetFilterBtn = document.getElementById("resetFilterBtn");
    const passwordInput = document.getElementById("passwordInput");
    const passwordConfirmInput = document.getElementById("passwordConfirmInput");
    const adminPasswordRequirements = {
        length: document.getElementById("adminReqLength"),
        uppercase: document.getElementById("adminReqUpper"),
        lowercase: document.getElementById("adminReqLower"),
        number: document.getElementById("adminReqNumber"),
        special: document.getElementById("adminReqSpecial")
    };

    const getPasswordRules = (password) => ({
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password),
        special: /[^A-Za-z0-9]/.test(password)
    });

    const updatePasswordStrength = () => {
        const rules = getPasswordRules(passwordInput.value);
        const score = Object.values(rules).filter(Boolean).length;
        Object.entries(rules).forEach(([rule, valid]) => {
            adminPasswordRequirements[rule].classList.toggle("valid", valid);
        });
        const levels = [
            { max: 0, label: "Chưa nhập", color: "#e2e8f0" },
            { max: 2, label: "Yếu", color: "#ef4444" },
            { max: 3, label: "Trung bình", color: "#f59e0b" },
            { max: 4, label: "Mạnh", color: "#2563eb" },
            { max: 5, label: "Rất mạnh", color: "#16a34a" }
        ];
        const level = levels.find(item => score <= item.max);
        document.getElementById("adminStrengthBar").style.width = `${score * 20}%`;
        document.getElementById("adminStrengthBar").style.backgroundColor = level.color;
        document.getElementById("adminStrengthText").textContent = level.label;
        document.getElementById("adminStrengthText").style.color = level.color;
        return rules;
    };

    passwordInput.addEventListener("input", updatePasswordStrength);

    const accountModal = document.getElementById("accountModal");
    const accountForm = document.getElementById("accountForm");
    const openAddBtn = document.getElementById("openAddBtn");
    const closeAccountModal = document.getElementById("closeAccountModal");
    const cancelAccountModal = document.getElementById("cancelAccountModal");

    const logoutModal = document.getElementById("logoutModal");
    const openLogoutBtn = document.getElementById("openLogoutBtn");
    const cancelLogout = document.getElementById("cancelLogout");
    const confirmLogout = document.getElementById("confirmLogout");

    async function fetchAdmins() {
        try {
            const response = await fetch("http://localhost:5000/api/auth/admins");
            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result?.message || "Không tải được dữ liệu admin");
            }

            accountList = Array.isArray(result.data) ? result.data.map(item => ({
                username: item.username || item.user_code || "admin",
                fullname: item.fullname || item.full_name || "Quản trị viên",
                email: item.email || "Chưa cập nhật",
                role: item.role || "Quản trị hệ thống",
                lastLogin: item.lastLogin || "Chưa từng",
                status: item.status === "locked" ? "locked" : "active"
            })) : [];

            renderAccounts(accountList);
            document.getElementById("paginationInfo").textContent = `Hiển thị ${accountList.length} / ${accountList.length} tài khoản`;
        } catch (error) {
            console.error("Lỗi tải tài khoản admin thật:", error);
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 20px; color: #ef4444;">Không thể tải dữ liệu tài khoản admin từ máy chủ.</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 tài khoản";
        }
    }

    // 2. RENDER BẢNG TÀI KHOẢN
    function renderAccounts(data) {
        tableBody.innerHTML = "";

        if (data.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" class="text-center" style="padding: 20px; color: #94a3b8;">Không tìm thấy tài khoản phù hợp</td></tr>`;
            document.getElementById("paginationInfo").textContent = "Hiển thị 0 / 0 tài khoản";
            return;
        }

        data.forEach(item => {
            const tr = document.createElement("tr");

            // Phân loại CSS cho Role Tag
            let roleClass = "role-staff";
            if (item.role === "Super Admin") roleClass = "role-super";
            else if (item.role === "Quản trị khoa") roleClass = "role-admin";

            // Status Badge
            const statusClass = item.status === "active" ? "status-active" : "status-locked";
            const statusText = item.status === "active" ? "Hoạt động" : "Đã khóa";

            tr.innerHTML = `
                <td><input type="checkbox"></td>
                <td><strong>${item.username}</strong></td>
                <td>${item.fullname}</td>
                <td>${item.email}</td>
                <td><span class="role-tag ${roleClass}">${item.role}</span></td>
                <td>${item.lastLogin}</td>
                <td class="text-center"><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td class="text-center">
                    <button class="table-action-btn edit-btn" data-username="${item.username}" title="Sửa"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="table-action-btn red delete-btn" data-username="${item.username}" title="Xóa"><i class="fa-solid fa-trash-can"></i></button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        document.getElementById("paginationInfo").textContent = `Hiển thị 1 - ${data.length} trên tổng số ${data.length} tài khoản`;
        attachEvents();
    }

    // 3. TÌM KIẾM & LỌC
    function handleFilter() {
        const query = searchInput.value.toLowerCase().trim();
        const selectedRole = roleFilter.value;
        const selectedStatus = statusFilter.value;

        const filtered = accountList.filter(acc => {
            const matchQuery = acc.username.toLowerCase().includes(query) || acc.fullname.toLowerCase().includes(query) || acc.email.toLowerCase().includes(query);
            const matchRole = selectedRole === "" || acc.role === selectedRole;
            const matchStatus = selectedStatus === "" || acc.status === selectedStatus;

            return matchQuery && matchRole && matchStatus;
        });

        renderAccounts(filtered);
    }

    searchInput.addEventListener("input", handleFilter);
    roleFilter.addEventListener("change", handleFilter);
    statusFilter.addEventListener("change", handleFilter);

    resetFilterBtn.addEventListener("click", () => {
        searchInput.value = "";
        roleFilter.value = "";
        statusFilter.value = "";
        renderAccounts(accountList);
    });

    // 4. THÊM / SỬA TÀI KHOẢN
    openAddBtn.onclick = () => {
        currentEditingUsername = null;
        document.getElementById("modalTitle").textContent = "Thêm Tài khoản Admin mới";
        accountForm.reset();
        document.getElementById("usernameInput").disabled = false;
        document.getElementById("passwordInput").required = true;
        passwordConfirmInput.required = true;
        accountModal.style.display = "flex";
    };

    accountForm.onsubmit = (e) => {
        e.preventDefault();

        const username = document.getElementById("usernameInput").value.trim();
        const fullname = document.getElementById("fullnameInput").value.trim();
        const email = document.getElementById("emailInput").value.trim();
        const role = document.getElementById("roleInput").value;
        const status = document.getElementById("statusInput").value;
        const password = passwordInput.value;
        const passwordConfirm = passwordConfirmInput.value;
        const passwordRules = updatePasswordStrength();

        if (!currentEditingUsername && !Object.values(passwordRules).every(Boolean)) {
            alert("Mật khẩu phải có ít nhất 8 ký tự, chữ hoa, chữ thường, chữ số và ký tự đặc biệt!");
            return;
        }

        if (currentEditingUsername && password && !Object.values(passwordRules).every(Boolean)) {
            alert("Mật khẩu mới phải có ít nhất 8 ký tự, chữ hoa, chữ thường, chữ số và ký tự đặc biệt!");
            return;
        }

        if ((password || passwordConfirm) && password !== passwordConfirm) {
            alert("Nhập lại mật khẩu mới không khớp!");
            return;
        }

        if (currentEditingUsername) {
            const index = accountList.findIndex(a => a.username === currentEditingUsername);
            if (index !== -1) {
                accountList[index] = { ...accountList[index], fullname, email, role, status };
            }
        } else {
            if (accountList.some(a => a.username === username)) {
                alert("Tên đăng nhập này đã tồn tại!");
                return;
            }
            accountList.unshift({
                username,
                fullname,
                email,
                role,
                status,
                lastLogin: "Chưa từng"
            });
        }

        accountModal.style.display = "none";
        passwordInput.value = "";
        passwordConfirmInput.value = "";
        updatePasswordStrength();
        renderAccounts(accountList);
    };

    // 5. EVENT SỬA / XÓA
    function attachEvents() {
        document.querySelectorAll(".edit-btn").forEach(btn => {
            btn.onclick = (e) => {
                const username = e.currentTarget.getAttribute("data-username");
                const item = accountList.find(a => a.username === username);
                if (item) {
                    currentEditingUsername = username;
                    document.getElementById("modalTitle").textContent = "Chỉnh sửa tài khoản";
                    document.getElementById("usernameInput").value = item.username;
                    document.getElementById("usernameInput").disabled = true;
                    document.getElementById("fullnameInput").value = item.fullname;
                    document.getElementById("emailInput").value = item.email;
                    document.getElementById("roleInput").value = item.role;
                    document.getElementById("statusInput").value = item.status;
                    document.getElementById("passwordInput").required = false; // Không bắt buộc nhập lại mật khẩu khi sửa
                    passwordConfirmInput.value = "";
                    passwordConfirmInput.required = false;

                    accountModal.style.display = "flex";
                }
            };
        });

        document.querySelectorAll(".delete-btn").forEach(btn => {
            btn.onclick = (e) => {
                const username = e.currentTarget.getAttribute("data-username");

                if (username === "superadmin") {
                    alert("Không thể xóa tài khoản Super Admin hệ thống!");
                    return;
                }

                if (confirm(`Bạn có chắc muốn xóa tài khoản [${username}]?`)) {
                    accountList = accountList.filter(a => a.username !== username);
                    renderAccounts(accountList);
                }
            };
        });
    }

    closeAccountModal.onclick = () => accountModal.style.display = "none";
    cancelAccountModal.onclick = () => accountModal.style.display = "none";

    // 6. ĐĂNG XUẤT
    openLogoutBtn.onclick = () => logoutModal.style.display = "flex";
    cancelLogout.onclick = () => logoutModal.style.display = "none";
    confirmLogout.onclick = () => {
        localStorage.clear();
        window.location.href = "index.html";
    };

    fetchAdmins();
});