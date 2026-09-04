function getAuthForRole(role) {
    const roleKey = {
        STUDENT: "studentAuth",
        LECTURER: "lecturerAuth",
        ADMIN: "adminAuth"
    }[role] || "auth";

    const raw = localStorage.getItem(roleKey);
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("=== DASHBOARD JS LOADED ===");
    
    initUIEvents();

    const auth = getAuthForRole("LECTURER") || { token: localStorage.getItem("token"), user: JSON.parse(localStorage.getItem("user") || "null") };
    const token = auth?.token || sessionStorage.getItem("token");
    const userRaw = auth?.user ? JSON.stringify(auth.user) : (localStorage.getItem("user") || sessionStorage.getItem("user"));

    if (!token || !userRaw || userRaw === "null") {
        console.warn("Không tìm thấy Token hoặc User! Chuyển hướng về trang login...");
        window.location.href = "index.html";
        return;
    }

    let user = {};
    try {
        user = JSON.parse(userRaw);
        if (user.data) user = user.data;
        if (user.user) user = user.user;
    } catch (e) {
        console.error("Lỗi parse JSON user:", e);
    }

    displayUserFromStorage(user);

    try {
        const response = await fetch("http://localhost:5000/api/v1/lecturer/dashboard", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (response.status === 401 || response.status === 403) {
            alert("Phiên đăng nhập đã hết hạn hoặc không có quyền truy cập!");
            handleLogout();
            return;
        }

        if (!response.ok) {
            console.error(`Lỗi HTTP Server: Status ${response.status}`);
            return;
        }

        const result = await response.json();

        if (result.success && result.data) {
            const { 
                user: apiUser, 
                stats, 
                milestoneProgress, 
                topicDistribution,
                recentRegistrations,
                upcomingDeadlines 
            } = result.data;

            if (apiUser) {
                displayUserFromStorage(apiUser);
            }

            renderKPIs(stats);
            renderProgressChart(milestoneProgress);
            renderCategoryChart(topicDistribution);
            renderRecentRegistrations(recentRegistrations);
            renderUpcomingDeadlines(upcomingDeadlines);
        } else {
            console.error("API trả về lỗi:", result.message);
        }
    } catch (error) {
        console.error("Lỗi kết nối API Backend:", error);
    }
});

function displayUserFromStorage(user) {
    if (!user) return;
    
    // Quét toàn bộ danh sách các thuộc tính họ tên có thể xảy ra
    const rawName = user.fullName 
        || user.full_name 
        || user.fullname 
        || user.lecturer_name 
        || user.lecturerName 
        || user.fullNameLecturer 
        || user.name 
        || user.user_name 
        || user.username;

    const name = (rawName && rawName.trim() !== "") ? rawName : "Giảng viên";

    const code = user.userCode 
        || user.user_code 
        || user.code 
        || user.lecturer_code 
        || user.lecturerCode 
        || user.user_id 
        || user.id 
        || "--";

    updateUserInfo(name, code);
}

function updateUserInfo(fullName, userCode) {
    const userNameEl = document.getElementById("userName");
    const welcomeEl = document.getElementById("welcomeLecturerName");
    const userCodeEl = document.getElementById("userCode");

    if (userNameEl) userNameEl.textContent = fullName;
    if (welcomeEl) welcomeEl.textContent = fullName;
    if (userCodeEl) userCodeEl.textContent = userCode;
}

function handleLogout() {
    localStorage.removeItem("lecturerAuth");
    if (localStorage.getItem("activeRole") === "LECTURER") {
        localStorage.removeItem("activeRole");
    }
    if (localStorage.getItem("token") && JSON.parse(localStorage.getItem("user") || "null")?.role === "LECTURER") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
    }
    sessionStorage.clear();
    window.location.href = "index.html";
}

function initUIEvents() {
    const menuItems = document.querySelectorAll(".sidebar-menu .menu-item");
    menuItems.forEach(item => {
        item.addEventListener("click", () => {
            menuItems.forEach(el => el.classList.remove("active"));
            item.classList.add("active");
        });
    });

    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn) {
        logoutBtn.onclick = function(e) {
            e.preventDefault();
            if (logoutModal) {
                logoutModal.style.display = "flex";
            } else {
                handleLogout();
            }
        };
    }

    if (cancelLogoutBtn) {
        cancelLogoutBtn.onclick = function() {
            if (logoutModal) logoutModal.style.display = "none";
        };
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.onclick = function() {
            handleLogout();
        };
    }

    window.onclick = function(e) {
        if (logoutModal && e.target === logoutModal) {
            logoutModal.style.display = "none";
        }
    };
}

function renderKPIs(stats) {
    if (!stats) return;
    const elAssigned = document.getElementById("statAssignedGroups");
    const elApproved = document.getElementById("statApprovedTopics");
    const elPending = document.getElementById("statPendingTopics");

    if (elAssigned) elAssigned.textContent = stats.assignedGroups ?? 0;
    if (elApproved) elApproved.textContent = stats.approvedTopics ?? 0;
    if (elPending) elPending.textContent = stats.pendingTopics ?? 0;
}

function renderProgressChart(progressData) {
    const ctxProgressEl = document.getElementById('progressChart');
    if (!ctxProgressEl || !progressData || typeof Chart === "undefined") return;

    const datasetStyles = [
        { backgroundColor: '#2563eb' },
        { backgroundColor: '#16a34a' },
        { backgroundColor: '#f59e0b' },
        { backgroundColor: '#dc3545' }
    ];

    const formattedDatasets = (progressData.series || []).map((seriesItem, index) => ({
        label: seriesItem.name,
        data: seriesItem.data,
        ...datasetStyles[index % datasetStyles.length],
        borderWidth: 0,
        barPercentage: 0.6
    }));

    if (window.myProgressChart) {
        window.myProgressChart.destroy();
    }

    window.myProgressChart = new Chart(ctxProgressEl.getContext('2d'), {
        type: 'bar',
        data: {
            labels: progressData.labels || ['Mốc 1', 'Mốc 2', 'Mốc 3', 'Mốc 4'],
            datasets: formattedDatasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } } 
            },
            scales: { 
                y: { beginAtZero: true, ticks: { stepSize: 1 } }, 
                x: { grid: { display: false } } 
            }
        }
    });
}

function renderCategoryChart(distributionData) {
    const ctxCategoryEl = document.getElementById('categoryChart');
    const totalNumEl = document.querySelector('.total-num');
    const legendContainer = document.getElementById('categoryLegend');

    if (!ctxCategoryEl || typeof Chart === "undefined") return;

    if (!distributionData || distributionData.length === 0) {
        if (totalNumEl) totalNumEl.textContent = "0";
        if (legendContainer) {
            legendContainer.innerHTML = `<p style="text-align: center; color: #94a3b8; font-size: 13px; margin-top: 10px;">Chưa có đề tài nào</p>`;
        }
        return;
    }

    const colors = ['#2563eb', '#22c55e', '#f59e0b', '#a855f7', '#94a3b8'];
    const labels = distributionData.map(item => item.field);
    const values = distributionData.map(item => item.count);
    const percentages = distributionData.map(item => `${item.percentage}%`);

    const totalCount = values.reduce((acc, curr) => acc + curr, 0);
    if (totalNumEl) totalNumEl.textContent = totalCount;

    if (window.myCategoryChart) {
        window.myCategoryChart.destroy();
    }

    window.myCategoryChart = new Chart(ctxCategoryEl.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors.slice(0, labels.length),
                borderWidth: 0,
                cutout: '72%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });

    if (legendContainer) {
        legendContainer.innerHTML = "";
        labels.forEach((label, index) => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
                <div class="legend-left">
                    <span class="dot" style="background-color: ${colors[index]}"></span>
                    <span>${label}</span>
                </div>
                <strong>${values[index]} (${percentages[index]})</strong>
            `;
            legendContainer.appendChild(item);
        });
    }
}

function renderRecentRegistrations(registrations) {
    const tableBody = document.getElementById("recentRegistrationsBody");
    if (!tableBody) return;

    tableBody.innerHTML = "";

    if (!registrations || registrations.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: #64748b; padding: 24px;">
                    <i class="fa-solid fa-inbox" style="font-size: 24px; margin-bottom: 8px; display: block; color: #94a3b8;"></i>
                    Chưa có nhóm hoặc đề tài nào được đăng ký
                </td>
            </tr>`;
        return;
    }

    registrations.forEach(item => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td><strong>${item.groupCode}</strong></td>
            <td>${item.topicTitle}</td>
            <td>${item.leaderInfo}</td>
            <td>${item.createdDate}</td>
            <td><span class="badge ${item.badgeClass}">${item.statusText}</span></td>
        `;
        tableBody.appendChild(row);
    });
}

function renderUpcomingDeadlines(deadlines) {
    const deadlineList = document.getElementById("upcomingDeadlinesList");
    if (!deadlineList) return;

    deadlineList.innerHTML = "";

    if (!deadlines || deadlines.length === 0) {
        deadlineList.innerHTML = `
            <div style="text-align: center; color: #64748b; padding: 24px;">
                <i class="fa-regular fa-calendar-check" style="font-size: 24px; margin-bottom: 8px; display: block; color: #94a3b8;"></i>
                Không có hạn chót hay lịch họp nào sắp tới
            </div>`;
        return;
    }

    deadlines.forEach(item => {
        const div = document.createElement("div");
        div.className = "deadline-item";
        div.innerHTML = `
            <div class="deadline-icon ${item.colorClass}"><i class="fa-solid ${item.iconClass}"></i></div>
            <div class="deadline-info">
                <h4>${item.title}</h4>
                <p>${item.subtitle}</p>
            </div>
            <div class="deadline-date ${item.colorClass}">
                <span>${item.dueDate}</span>
                <small>${item.daysLeft}</small>
            </div>
        `;
        deadlineList.appendChild(div);
    });
}