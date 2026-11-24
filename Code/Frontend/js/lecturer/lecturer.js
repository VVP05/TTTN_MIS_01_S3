function getAuthForRole(role) {
    const roleKey = {
        STUDENT: "studentAuth",
        LECTURER: "lecturerAuth",
        ADMIN: "adminAuth"
    }[role] || "auth";

    const activeSession = sessionStorage.getItem("activeAuth");
    if (activeSession) {
        try {
            const sessionAuth = JSON.parse(activeSession);
            if (sessionAuth?.user?.role === role) return sessionAuth;
        } catch (error) {
            sessionStorage.removeItem("activeAuth");
        }
    }

    return null;
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

document.addEventListener("DOMContentLoaded", async () => {
    initUIEvents();

    const auth = getAuthForRole("LECTURER") || { token: null, user: null };
    const token = auth?.token;
    const userRaw = auth?.user ? JSON.stringify(auth.user) : null;

    if (!userRaw || userRaw === "null") {
        window.location.href = "../auth/index.html";
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
        const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/v1/lecturer/dashboard", {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });

        if (response.status === 401 || response.status === 403) {
            showAppNotification("Phiên đăng nhập đã hết hạn hoặc không có quyền truy cập!");
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
            renderUrgentTasks(stats, upcomingDeadlines);
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
        || "GV";

    updateUserInfo(name, code);
}

function updateUserInfo(fullName, userCode) {
    const userNameEl = document.getElementById("userName");
    const welcomeEl = document.getElementById("welcomeLecturerName");
    const userCodeEl = document.getElementById("userCode");
    const dateDisplayEl = document.getElementById("currentDateDisplay");

    if (userNameEl) userNameEl.textContent = fullName;
    if (welcomeEl) welcomeEl.textContent = fullName;
    if (userCodeEl) userCodeEl.textContent = userCode;

    if (dateDisplayEl) {
        const now = new Date();
        const days = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
        const dayName = days[now.getDay()];
        const dateStr = now.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
        dateDisplayEl.textContent = `${dayName}, ${dateStr}`;
    }
}

function handleLogout() {
    window.logoutSession();
    localStorage.removeItem("lecturerAuth");
    if (localStorage.getItem("activeRole") === "LECTURER") {
        localStorage.removeItem("activeRole");
    }
    if (localStorage.getItem("token") && JSON.parse(localStorage.getItem("user") || "null")?.role === "LECTURER") {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
    }
    sessionStorage.clear();
    window.location.href = "../auth/index.html";
}

function initUIEvents() {
    const menuItems = document.querySelectorAll(".sidebar-menu .menu-item");
    menuItems.forEach(item => {
        item.addEventListener("click", () => {
            menuItems.forEach(el => el.classList.remove("active"));
            item.classList.add("active");
        });
    });
}

/**
 * Hiệu ứng đếm số (Count-up) mượt mà trong 0.6 giây
 */
function animateCountUp(element, target) {
    if (!element) return;
    const numTarget = Number(target) || 0;
    if (numTarget === 0) {
        element.textContent = "0";
        return;
    }
    const duration = 600;
    const startTime = performance.now();
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const current = Math.floor(progress * numTarget);
        element.textContent = current;
        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = numTarget;
        }
    }
    requestAnimationFrame(update);
}

function renderKPIs(stats) {
    if (!stats) return;
    const elAssigned = document.getElementById("statAssignedGroups");
    const elApproved = document.getElementById("statApprovedTopics");
    const elPending = document.getElementById("statPendingTopics");
    const elLateGroups = document.getElementById("statLateGroups");

    const assignedCount = Number(stats.assignedGroups) || 0;
    const approvedCount = Number(stats.approvedTopics) || 0;
    const pendingCount = Number(stats.pendingTopics) || 0;
    const lateCount = Number(stats.lateGroups) || 0;

    animateCountUp(elAssigned, assignedCount);
    animateCountUp(elApproved, approvedCount);
    animateCountUp(elPending, pendingCount);
    animateCountUp(elLateGroups, lateCount);

    // Xử lý cảnh báo thẻ "Nhóm có milestone trễ"
    const cardLate = document.getElementById("kpiCardLate");
    if (cardLate) {
        cardLate.classList.toggle("has-late", lateCount > 0);
    }

    // Xử lý chấm nhấp nháy thẻ "Đang chờ phê duyệt"
    const pendingDot = document.getElementById("pendingPulseDot");
    if (pendingDot) {
        pendingDot.style.display = pendingCount > 0 ? "inline-block" : "none";
    }

    // Cập nhật banner chào đón động
    const bannerSummary = document.getElementById("welcomeSummaryText");
    const btnHandleNow = document.getElementById("btnHandleNow");

    if (bannerSummary) {
        if (pendingCount > 0 || lateCount > 0) {
            let parts = [];
            if (pendingCount > 0) parts.push(`<strong>${pendingCount}</strong> đề tài chờ duyệt`);
            if (lateCount > 0) parts.push(`<strong>${lateCount}</strong> nhóm trễ milestone`);
            bannerSummary.innerHTML = `Hôm nay bạn có ${parts.join(" và ")}.`;
            if (btnHandleNow) {
                btnHandleNow.style.display = "inline-flex";
            }
        } else {
            bannerSummary.textContent = "Mọi thứ đang ổn, hiện tại không có công việc tồn đọng cần xử lý gấp.";
            if (btnHandleNow) {
                btnHandleNow.style.display = "none";
            }
        }
    }
}

/**
 * 8. RENDER KHỐI "VIỆC CẦN LÀM NGAY"
 */
function renderUrgentTasks(stats, upcomingDeadlines) {
    const box = document.getElementById("urgentTasksBox");
    const listContainer = document.getElementById("urgentTasksList");
    const countBadge = document.getElementById("urgentTasksCount");
    if (!box || !listContainer) return;

    const tasks = [];

    const pendingCount = Number(stats?.pendingTopics) || 0;
    if (pendingCount > 0) {
        tasks.push({
            type: "warning",
            icon: "fa-book-bookmark",
            title: `Có ${pendingCount} đề tài đăng ký đang chờ bạn phê duyệt`,
            subtitle: "Xem xét đề cương và chấp thuận hướng dẫn cho nhóm sinh viên",
            actionText: "Duyệt đề tài",
            actionLink: "lecturer-topics.html",
            btnClass: "primary"
        });
    }

    const lateCount = Number(stats?.lateGroups) || 0;
    if (lateCount > 0) {
        tasks.push({
            type: "danger",
            icon: "fa-triangle-exclamation",
            title: `Có ${lateCount} nhóm sinh viên đang trễ hạn nộp milestone`,
            subtitle: "Cần nhắc nhở nhóm nộp báo cáo hoặc cập nhật tiến độ gấp",
            actionText: "Kiểm tra nhóm",
            actionLink: "lecturer-groups.html",
            btnClass: "danger"
        });
    }

    (upcomingDeadlines || []).slice(0, 3).forEach(dl => {
        tasks.push({
            type: "blue",
            icon: dl.iconClass || "fa-calendar-check",
            title: dl.title,
            subtitle: `${dl.subtitle} · Hạn: ${dl.dueDate} (${dl.daysLeft})`,
            actionText: "Xem lịch",
            actionLink: "lecturer-schedule.html",
            btnClass: "primary"
        });
    });

    if (tasks.length === 0) {
        box.style.display = "none";
        return;
    }

    box.style.display = "block";
    if (countBadge) countBadge.textContent = `${tasks.length} việc`;

    listContainer.innerHTML = tasks.slice(0, 5).map(t => `
        <div class="urgent-task-item">
            <div class="urgent-task-left">
                <span class="task-type-badge ${t.type}"><i class="fa-solid ${t.icon}"></i></span>
                <div>
                    <div class="urgent-task-desc">${escapeHtml(t.title)}</div>
                    <div class="urgent-task-sub">${escapeHtml(t.subtitle)}</div>
                </div>
            </div>
            <a href="${t.actionLink}" class="btn-task-action ${t.btnClass}">
                <span>${t.actionText}</span>
                <i class="fa-solid fa-arrow-right"></i>
            </a>
        </div>
    `).join("");
}

function renderProgressChart(progressData) {
    const container = document.getElementById("progressChartContainer");
    const ctxProgressEl = document.getElementById('progressChart');
    if (!ctxProgressEl || typeof Chart === "undefined") return;

    if (!progressData || !progressData.series || progressData.series.length === 0) {
        if (container) {
            container.innerHTML = `
                <div class="chart-empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-chart-simple"></i></div>
                    <h4>Chưa có dữ liệu milestone</h4>
                    <p>Dữ liệu sẽ tự động hiển thị khi các nhóm sinh viên bắt đầu nộp bài theo từng mốc tiến độ.</p>
                    <a href="lecturer-milestones.html" class="btn-sm-primary"><i class="fa-solid fa-plus"></i> Tạo milestone</a>
                </div>
            `;
        }
        return;
    }

    const datasetStyles = [
        { backgroundColor: '#10B981', hoverBackgroundColor: '#059669' },
        { backgroundColor: '#3B82F6', hoverBackgroundColor: '#2563EB' },
        { backgroundColor: '#F59E0B', hoverBackgroundColor: '#D97706' },
        { backgroundColor: '#F43F5E', hoverBackgroundColor: '#E11D48' },
        { backgroundColor: '#94A3B8', hoverBackgroundColor: '#64748B' }
    ];

    const formattedDatasets = (progressData.series || []).map((seriesItem, index) => ({
        label: seriesItem.name,
        data: seriesItem.data,
        ...datasetStyles[index % datasetStyles.length],
        borderWidth: 0,
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.65,
        categoryPercentage: 0.8
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
                legend: { 
                    position: 'top', 
                    align: 'start',
                    labels: { 
                        usePointStyle: true, 
                        boxWidth: 8,
                        boxHeight: 8,
                        padding: 14,
                        font: { family: "'Be Vietnam Pro', sans-serif", size: 12.5, weight: '600' },
                        color: '#475569'
                    } 
                },
                tooltip: {
                    backgroundColor: '#0F172A',
                    titleFont: { family: "'Be Vietnam Pro', sans-serif", size: 12.5, weight: '700' },
                    bodyFont: { family: "'Be Vietnam Pro', sans-serif", size: 12 },
                    padding: 12,
                    cornerRadius: 10,
                    usePointStyle: true
                }
            },
            scales: { 
                y: { 
                    beginAtZero: true, 
                    ticks: { 
                        stepSize: 1,
                        font: { family: "'Be Vietnam Pro', sans-serif", size: 11.5 },
                        color: '#64748B'
                    },
                    grid: {
                        color: 'rgba(226, 232, 240, 0.8)',
                        borderDash: [4, 4]
                    }
                }, 
                x: { 
                    grid: { display: false },
                    ticks: {
                        font: { family: "'Be Vietnam Pro', sans-serif", size: 12, weight: '500' },
                        color: '#64748B'
                    }
                } 
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
            legendContainer.innerHTML = `<p style="text-align: center; color: #94A3B8; font-size: 13px; padding: 10px 0;">Chưa có đề tài nào trong kho</p>`;
        }
        return;
    }

    const colors = ['#2563EB', '#7C3AED', '#F59E0B', '#10B981', '#06B6D4', '#EC4899'];
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
                borderRadius: 5,
                spacing: 4,
                cutout: '72%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#0F172A',
                    titleFont: { family: "'Be Vietnam Pro', sans-serif", size: 12.5, weight: '700' },
                    bodyFont: { family: "'Be Vietnam Pro', sans-serif", size: 12 },
                    padding: 12,
                    cornerRadius: 10,
                    usePointStyle: true,
                    callbacks: {
                        label: (context) => ` ${context.label}: ${context.parsed} đề tài (${percentages[context.dataIndex]})`
                    }
                }
            }
        }
    });

    if (legendContainer) {
        legendContainer.innerHTML = labels.map((label, index) => `
            <div class="legend-item">
                <div class="legend-left">
                    <span class="dot" style="background-color: ${colors[index]}"></span>
                    <span>${escapeHtml(label)}</span>
                </div>
                <span class="legend-values">${values[index]} <small style="font-weight: normal; color: #64748B;">(${percentages[index]})</small></span>
            </div>
        `).join("");
    }
}

function renderRecentRegistrations(registrations) {
    const tableBody = document.getElementById("recentRegistrationsBody");
    if (!tableBody) return;

    tableBody.innerHTML = "";

    if (!registrations || registrations.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: #64748B; padding: 36px 20px;">
                    <i class="fa-solid fa-inbox" style="font-size: 28px; margin-bottom: 8px; display: block; color: #94A3B8;"></i>
                    Chưa có nhóm hoặc đề tài nào được đăng ký gần đây
                </td>
            </tr>`;
        return;
    }

    registrations.forEach(item => {
        const row = document.createElement("tr");
        const isPending = item.statusText?.includes("Chờ") || item.badgeClass?.includes("warning");
        if (isPending) {
            row.className = "row-pending";
        }

        const leaderName = item.leaderInfo || "N/A";
        const initial = leaderName.trim().split(/\s+/).slice(-2)
            .map(part => part.charAt(0).toLocaleUpperCase("vi-VN")).join("");

        let statusPillClass = "status-green";
        if (isPending) {
            statusPillClass = "status-orange";
        } else if (item.badgeClass?.includes("danger") || item.statusText?.includes("Từ chối")) {
            statusPillClass = "status-red";
        }

        const actionBtn = isPending ? `
            <a href="lecturer-topics.html" class="btn-view-pending" title="Xem và phê duyệt đề tài">
                <span>Xem</span> <i class="fa-solid fa-arrow-right"></i>
            </a>
        ` : '';

        row.innerHTML = `
            <td><span class="group-code-badge">${escapeHtml(item.groupCode)}</span></td>
            <td><span class="topic-title-table" title="${escapeHtml(item.topicTitle)}">${escapeHtml(item.topicTitle)}</span></td>
            <td>
                <div class="leader-cell">
                    <span class="leader-avatar">${initial}</span>
                    <div class="leader-info-col">
                        <span class="leader-name">${escapeHtml(leaderName)}</span>
                        <span class="leader-code">${item.leaderCode ? `MSSV: ${escapeHtml(item.leaderCode)} · ` : ""}Trưởng nhóm</span>
                    </div>
                </div>
            </td>
            <td><i class="fa-regular fa-calendar" style="color: #94A3B8; margin-right: 4px;"></i> ${escapeHtml(item.createdDate)}</td>
            <td style="text-align: center;">
                <span class="status-pill ${statusPillClass}">
                    <span class="dot"></span>
                    <span>${escapeHtml(item.statusText)}</span>
                </span>
                ${actionBtn}
            </td>
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
            <div class="empty-state-card-sm">
                <div class="empty-icon-sm"><i class="fa-regular fa-calendar-check"></i></div>
                <h4>Không có hạn chót hay lịch hẹn nào sắp tới</h4>
                <p>Bạn có thể tạo hạn nộp mới ở trang Milestone để sinh viên nộp báo cáo đúng hạn.</p>
                <a href="lecturer-milestones.html" class="btn-sm-outline"><i class="fa-solid fa-calendar-plus"></i> Tạo hạn nộp mới</a>
            </div>`;
        return;
    }

    deadlines.forEach(item => {
        const div = document.createElement("div");
        div.className = "deadline-item";

        // Tách ngày tháng để hiển thị calendar date block
        let dayStr = "15";
        let monthStr = "T11";
        const dateMatch = /(\d{1,2})[\/\-](\d{1,2})/.exec(String(item.dueDate || ""));
        if (dateMatch) {
            dayStr = dateMatch[1];
            monthStr = `T${dateMatch[2]}`;
        }

        const isMeeting = item.iconClass?.includes("user") || item.iconClass?.includes("comments") || item.title?.toLowerCase().includes("họp");
        const iconName = isMeeting ? "fa-handshake" : "fa-calendar-check";

        div.innerHTML = `
            <div class="deadline-date-box">
                <span class="deadline-day">${dayStr}</span>
                <span class="deadline-month">${monthStr}</span>
            </div>
            <div class="deadline-icon ${item.colorClass || 'blue'}">
                <i class="fa-solid ${iconName}"></i>
            </div>
            <div class="deadline-info">
                <h4 title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</h4>
                <p>${escapeHtml(item.subtitle)}</p>
            </div>
            <span class="deadline-chip ${item.colorClass || 'blue'}">
                ${escapeHtml(item.daysLeft)}
            </span>
        `;
        deadlineList.appendChild(div);
    });
}
