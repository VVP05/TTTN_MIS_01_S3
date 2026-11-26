/**
 * =========================================================================
 * ADMIN DASHBOARD SCRIPT
 * Phong cách Dashboard Quản trị Giáo Dục Hiện Đại, Sạch, Chuyên Nghiệp
 * =========================================================================
 */

document.addEventListener("DOMContentLoaded", async () => {

    // =========================================================================
    // 1. KIỂM TRA PHIÊN ĐĂNG NHẬP & QUYỀN ADMIN
    // =========================================================================
    const user = await window.verifyAuthSession("ADMIN");
    if (!user) return;
    const token = "";

    // Hiển thị tên Admin & Ngày hiện tại
    const userNameElem = document.getElementById("userName");
    const welcomeAdminElem = document.getElementById("welcomeAdminName");
    const fullName = user.full_name || user.fullName || "Quản trị viên";

    if (userNameElem) userNameElem.textContent = fullName;
    if (welcomeAdminElem) welcomeAdminElem.textContent = fullName;

    // Cập nhật ngày hôm nay trên Hero banner
    const heroTodayDate = document.getElementById("heroTodayDate");
    if (heroTodayDate) {
        heroTodayDate.textContent = formatVietnameseDate(new Date());
    }

    // =========================================================================
    // 2. BIẾN QUẢN LÝ THỂ HIỆN BIỂU ĐỒ & DỮ LIỆU
    // =========================================================================
    let registrationChartInstance = null;
    let statusChartInstance = null;
    let latestDashboardReport = null;
    const exportReportBtn = document.getElementById("exportReportBtn");
    
    // Cấu hình URL API Backend
    const API_BASE_URL = window.APP_CONFIG.API_BASE_URL + "/api";

    // =========================================================================
    // 3. HÀM FETCH DỮ LIỆU TỪ BACKEND
    // =========================================================================
    async function fetchDashboardData(semester = "all") {
        latestDashboardReport = null;
        if (exportReportBtn) exportReportBtn.disabled = true;

        try {
            const params = new URLSearchParams({ semester });
            const url = `${API_BASE_URL}/dashboard/admin?${params}`;

            const res = await apiFetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            if (!res.ok) {
                console.error(`Lỗi gọi API: Mã lỗi ${res.status} - ${res.statusText}`);
                const errorData = await res.json().catch(() => ({}));
                window.showAppNotification?.(errorData.message || "Không thể tải dữ liệu dashboard.");
                if (res.status === 401 || res.status === 403) {
                    window.showAppNotification?.("Phiên đăng nhập hết hạn hoặc bạn không có quyền truy cập!");
                }
                return;
            }

            const responseData = await res.json();

            if (responseData.success) {
                const kpiData = responseData.kpi || responseData.data?.kpi;
                const chartData = responseData.chart || responseData.data?.chart;
                const pendingTopics = responseData.pendingTopicsList || responseData.data?.pendingTopicsList;

                if (kpiData) {
                    const selectedSemester = document.getElementById("semesterSelect");
                    latestDashboardReport = {
                        semesterName: responseData.selectedSemester?.name ||
                            (semester === "all"
                                ? "Toàn bộ học kỳ"
                                : selectedSemester?.selectedOptions?.[0]?.textContent?.trim() || "Học kỳ được chọn"),
                        kpi: kpiData,
                        chart: chartData || {},
                        pendingTopics: Array.isArray(pendingTopics) ? pendingTopics : []
                    };
                    if (exportReportBtn) exportReportBtn.disabled = false;

                    // Cập nhật tên học kỳ trên Hero
                    const heroSemesterBadge = document.getElementById("heroSemesterBadge");
                    if (heroSemesterBadge) {
                        heroSemesterBadge.innerHTML = `<i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(latestDashboardReport.semesterName)}`;
                    }

                    renderKPIs(kpiData);
                    renderDoughnutChart(kpiData);
                    renderHeroSummary(kpiData);
                    renderActionRequired(kpiData);
                } else {
                    console.warn("Không tìm thấy object 'kpi' trong dữ liệu trả về.");
                }

                if (chartData) {
                    renderLineChart(chartData);
                }

                renderPendingTable(pendingTopics || []);
            } else {
                console.error("API trả về success = false:", responseData.message);
                window.showAppNotification?.("Không thể tải dữ liệu: " + responseData.message);
            }
        } catch (error) {
            console.error("Không thể kết nối đến máy chủ Backend:", error);
            window.showAppNotification?.("Không thể kết nối đến máy chủ để tải dashboard.");
        }
    }

    async function loadSemesterOptions(select) {
        select.disabled = true;
        select.replaceChildren();
        const loadingOption = document.createElement("option");
        loadingOption.textContent = "Đang tải học kỳ...";
        loadingOption.value = "";
        select.append(loadingOption);

        try {
            const response = await apiFetch(`${API_BASE_URL}/semesters`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok || !result.success || !Array.isArray(result.data)) {
                throw new Error(result.message || "Không thể tải danh sách học kỳ.");
            }

            const semesters = result.data.filter(semester => semester?._id && semester.name);
            select.replaceChildren();
            const allOption = document.createElement("option");
            allOption.value = "all";
            allOption.textContent = "Toàn bộ học kỳ";
            select.append(allOption);

            semesters.forEach(semester => {
                const option = document.createElement("option");
                option.value = semester._id;
                option.textContent = semester.name;
                select.append(option);
            });

            const activeSemester = semesters.find(semester => semester.is_active);
            select.value = activeSemester?._id || "all";
            select.disabled = false;
            return select.value;
        } catch (error) {
            const errorOption = document.createElement("option");
            errorOption.value = "";
            errorOption.textContent = "Không tải được học kỳ";
            select.replaceChildren(errorOption);
            console.error("Không thể tải danh sách học kỳ:", error);
            window.showAppNotification?.(error.message || "Không thể tải danh sách học kỳ.");
            return null;
        }
    }

    // =========================================================================
    // 4. ANIMATION ĐẾM SỐ TỪ 0 (0.6s)
    // =========================================================================
    function animateCounter(el, target, duration = 600) {
        if (!el) return;
        const endValue = Number(target || 0);
        const startTime = performance.now();
        const startValue = 0;

        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out quad
            const ease = 1 - (1 - progress) * (1 - progress);
            const current = Math.round(startValue + (endValue - startValue) * ease);
            el.textContent = current.toLocaleString('vi-VN');
            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.textContent = endValue.toLocaleString('vi-VN');
            }
        }
        requestAnimationFrame(update);
    }

    // =========================================================================
    // 5. CÁC HÀM CẬP NHẬT GIAO DIỆN
    // =========================================================================

    // A. Cập nhật 5 Thẻ KPI
    function renderKPIs(kpi) {
        animateCounter(document.getElementById("kpiStudents"), kpi.totalStudents);
        animateCounter(document.getElementById("kpiLecturers"), kpi.totalLecturers);
        animateCounter(document.getElementById("kpiTotalTopics"), kpi.totalTopics);
        animateCounter(document.getElementById("kpiApprovedTopics"), kpi.approvedTopics);
        animateCounter(document.getElementById("kpiPendingTopics"), kpi.pendingTopics);

        // Chấm pulse cảnh báo nếu có đề tài chờ duyệt
        const pendingCard = document.querySelector(".kpi-card.card-red");
        const pendingValueEl = document.getElementById("kpiPendingTopics");
        if (pendingCard && pendingValueEl) {
            const existingPulse = pendingCard.querySelector(".pulse-dot");
            if (Number(kpi.pendingTopics || 0) > 0) {
                if (!existingPulse) {
                    const dot = document.createElement("span");
                    dot.className = "pulse-dot";
                    pendingValueEl.parentElement.prepend(dot);
                }
            } else if (existingPulse) {
                existingPulse.remove();
            }
        }
    }

    // B. Hero Summary & Date
    function renderHeroSummary(kpi) {
        const summaryPill = document.getElementById("heroSummaryPill");
        if (!summaryPill) return;

        const pending = Number(kpi.pendingTopics || 0);
        summaryPill.hidden = pending > 0;
        if (summaryPill.hidden) return;

        summaryPill.className = "hero-summary-pill";
        summaryPill.innerHTML = `
            <i class="fa-solid fa-circle-check" style="color: var(--success, #16A34A);"></i>
            <span>Tất cả đề tài hiện đã được xử lý ổn định, không có việc tồn đọng.</span>
        `;
    }

    // C. Khối Cần xử lý (Action Required)
    function renderActionRequired(kpi) {
        const actionCard = document.getElementById("actionRequiredCard");
        const actionList = document.getElementById("actionRequiredList");
        if (!actionCard || !actionList) return;

        const needRevision = Number(kpi.needRevisionTopics || 0);

        let items = [];

        if (needRevision > 0) {
            items.push({
                icon: "fa-solid fa-pen-to-square",
                text: `Có <strong>${needRevision} đề tài</strong> nhóm sinh viên đang trong giai đoạn yêu cầu chỉnh sửa.`,
                actionUrl: "admin-teams.html",
                actionText: "Xem chi tiết"
            });
        }

        if (items.length === 0) {
            actionCard.style.display = "none";
            return;
        }

        actionCard.style.display = "block";
        actionList.innerHTML = items.slice(0, 5).map(item => `
            <div class="action-required-item">
                <div class="item-left">
                    <i class="${item.icon} item-icon"></i>
                    <span>${item.text}</span>
                </div>
                <a href="${item.actionUrl}" class="btn-action-go">${item.actionText}</a>
            </div>
        `).join('');
    }

    // D. Vẽ Biểu đồ đường (Đăng ký theo tháng)
    function renderLineChart(chartData) {
        const ctxRegElem = document.getElementById('registrationChart');
        if (!ctxRegElem) return;

        if (registrationChartInstance) {
            registrationChartInstance.destroy();
        }

        const labels = chartData?.monthLabels || ['Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8'];
        const values = chartData?.monthlyRegistrations || [0, 0, 0, 0, 0, 0];

        const totalReg = values.reduce((sum, v) => sum + v, 0);

        // Trạng thái trống nếu không có dữ liệu
        const chartWrapper = ctxRegElem.parentElement;
        const existingEmpty = chartWrapper.querySelector(".chart-empty-state");
        if (totalReg === 0 && values.every(v => v === 0)) {
            ctxRegElem.style.display = "none";
            if (!existingEmpty) {
                const emptyDiv = document.createElement("div");
                emptyDiv.className = "chart-empty-state";
                emptyDiv.innerHTML = `
                    <i class="fa-solid fa-chart-column"></i>
                    <p>Chưa có dữ liệu đăng ký đề tài trong học kỳ này</p>
                `;
                chartWrapper.appendChild(emptyDiv);
            }
        } else if (existingEmpty) {
            existingEmpty.remove();
            ctxRegElem.style.display = "";
        }

        const ctxReg = ctxRegElem.getContext('2d');
        const gradient = ctxReg.createLinearGradient(0, 0, 0, 240);
        gradient.addColorStop(0, 'rgba(37, 99, 235, 0.32)');
        gradient.addColorStop(1, 'rgba(37, 99, 235, 0.01)');

        registrationChartInstance = new Chart(ctxReg, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Số đề tài đăng ký',
                    data: values,
                    borderColor: '#2563EB',
                    backgroundColor: gradient,
                    borderWidth: 3,
                    pointBackgroundColor: '#FFFFFF',
                    pointBorderColor: '#2563EB',
                    pointBorderWidth: 2.5,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointHoverBorderWidth: 3,
                    pointHoverBackgroundColor: '#2563EB',
                    pointHoverBorderColor: '#FFFFFF',
                    tension: 0.35,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#0F172A',
                        titleFont: { family: "'Be Vietnam Pro', 'Inter', sans-serif", size: 12, weight: '700' },
                        bodyFont: { family: "'Be Vietnam Pro', 'Inter', sans-serif", size: 12 },
                        padding: 10,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: (context) => ` Đăng ký: ${context.parsed.y} đề tài`
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0,
                            stepSize: 1,
                            font: { family: "'Be Vietnam Pro', 'Inter', sans-serif", size: 12 },
                            color: '#64748B'
                        },
                        grid: {
                            color: '#E2E8F0',
                            borderDash: [4, 4]
                        }
                    },
                    x: {
                        ticks: {
                            font: { family: "'Be Vietnam Pro', 'Inter', sans-serif", size: 12 },
                            color: '#64748B'
                        },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // E. Vẽ Biểu đồ Tròn (Tỷ lệ trạng thái đề tài - SỬA LỖI 150%)
    function renderDoughnutChart(kpi) {
        const ctxStatusElem = document.getElementById('statusChart');
        if (!ctxStatusElem || !kpi) return;

        if (statusChartInstance) {
            statusChartInstance.destroy();
        }

        // Tách bạch các trạng thái không trùng lặp (loại bỏ inProgress trùng lặp với approved)
        const approved = Number(kpi.approvedTopics || 0);
        const pending = Number(kpi.pendingTopics || 0);
        const needRevision = Number(kpi.needRevisionTopics || 0);
        const rejected = Number(kpi.rejectedTopics || 0);

        // Tổng số đề tài thực tế từ các lát trạng thái
        const sliceTotal = approved + pending + needRevision + rejected;
        const total = sliceTotal > 0 ? sliceTotal : Number(kpi.totalTopics || 0);

        const doughnutTotalEl = document.getElementById("doughnutTotal");
        if (doughnutTotalEl) doughnutTotalEl.textContent = total;

        // Tính % chính xác bảo đảm tổng luôn bằng 100%
        const calcPercent = (val) => total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';

        const allStatuses = [
            { label: 'Đã phê duyệt', value: approved, color: '#16A34A' },
            { label: 'Chờ phê duyệt', value: pending, color: '#D97706' },
            { label: 'Yêu cầu sửa', value: needRevision, color: '#7C3AED' },
            { label: 'Bị từ chối', value: rejected, color: '#DC2626' }
        ];

        // Lọc các trạng thái có số liệu (nếu total == 0, hiển thị mẫu lát rỗng)
        const activeStatuses = total > 0 
            ? allStatuses.filter(s => s.value > 0)
            : [{ label: 'Chưa có đề tài', value: 1, color: '#E2E8F0' }];

        const chartLabels = activeStatuses.map(s => s.label);
        const chartValues = activeStatuses.map(s => s.value);
        const chartColors = activeStatuses.map(s => s.color);

        const ctxStatus = ctxStatusElem.getContext('2d');
        statusChartInstance = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartValues,
                    backgroundColor: chartColors,
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                    borderRadius: 6,
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
                        titleFont: { family: "'Be Vietnam Pro', 'Inter', sans-serif", size: 12, weight: '700' },
                        bodyFont: { family: "'Be Vietnam Pro', 'Inter', sans-serif", size: 12 },
                        padding: 10,
                        cornerRadius: 8,
                        usePointStyle: true,
                        callbacks: {
                            label: (context) => {
                                const val = context.parsed;
                                const pct = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
                                return ` ${context.label}: ${val} đề tài (${pct})`;
                            }
                        }
                    }
                }
            }
        });

        // Tạo Legend tùy chỉnh bên dưới biểu đồ
        const legendContainer = document.getElementById('statusLegend');
        if (legendContainer) {
            legendContainer.innerHTML = '';
            allStatuses.forEach((status) => {
                if (status.value > 0 || total === 0) {
                    const pct = calcPercent(status.value);
                    const item = document.createElement('div');
                    item.className = 'legend-item';
                    item.innerHTML = `
                        <div class="legend-left">
                            <span class="dot" style="background-color: ${status.color}"></span>
                            <span>${status.label}</span>
                        </div>
                        <strong>${status.value} (${pct})</strong>
                    `;
                    legendContainer.appendChild(item);
                }
            });
        }
    }

    // F. Đổ dữ liệu vào bảng đề tài nhóm chờ giảng viên xử lý
    function renderPendingTable(pendingList) {
        const tbody = document.getElementById("pendingTopicsTable");
        if (!tbody) return;

        if (!Array.isArray(pendingList) || pendingList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px 20px;">
                        <i class="fa-solid fa-circle-check" style="font-size: 32px; color: var(--success); margin-bottom: 8px; display: block;"></i>
                        Không có đề tài nào đang chờ xử lý vào lúc này.
                    </td>
                </tr>
            `;
            return;
        }

        const now = new Date();

        tbody.innerHTML = pendingList.map(t => {
            const topicCode = t.topic_code || 'Chưa có';
            const title = t.title || 'N/A';
            const leaderCode = t.leader_code || 'N/A';
            const leaderName = t.leader_name || '';
            const lecturerCode = t.lecturer_code || '';
            const lecturerName = t.lecturer_name || lecturerCode || 'Chưa xác định';

            // Tính thời gian chờ
            let waitDaysText = "Hôm nay";
            let isUrgent = false;
            if (t.createdAt) {
                const diffDays = Math.floor((now - new Date(t.createdAt)) / (1000 * 60 * 60 * 24));
                if (diffDays >= 3) {
                    waitDaysText = `${diffDays} ngày`;
                    isUrgent = true;
                } else if (diffDays > 0) {
                    waitDaysText = `${diffDays} ngày`;
                }
            }

            const leaderInitial = leaderName ? leaderName.charAt(0).toUpperCase() : (leaderCode.slice(-2) || 'SV');
            const lecturerInitial = lecturerName.charAt(0).toUpperCase();

            return `
                <tr>
                    <td><span class="topic-code-badge">${escapeHtml(topicCode)}</span></td>
                    <td>
                        <div class="topic-title-cell" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                    </td>
                    <td>
                        <div class="user-identity-cell">
                            <span class="user-cell-avatar">${leaderInitial}</span>
                            <div class="user-cell-info">
                                <span class="user-cell-name">${escapeHtml(leaderName || leaderCode)}</span>
                                <span class="user-cell-code">MSSV: ${escapeHtml(leaderCode)}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="user-identity-cell">
                            <span class="user-cell-avatar" style="background: #DCFCE7; color: #16A34A;">${lecturerInitial}</span>
                            <div class="user-cell-info">
                                <span class="user-cell-name">${escapeHtml(lecturerName)}</span>
                                <span class="user-cell-code">GV: ${escapeHtml(lecturerCode || lecturerName)}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="waiting-time-badge ${isUrgent ? 'urgent' : ''}">
                            ${isUrgent ? '<i class="fa-solid fa-clock-rotate-left"></i> ' : ''}${waitDaysText}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // G. Tải & Hiển thị Hoạt động mới nhất (Khắc phục lỗi treo request)
    async function fetchRecentActivities() {
        const container = document.getElementById("recentActivitiesList");
        if (!container) return;

        // Skeleton loading khi đang tải
        container.innerHTML = `
            <div class="activity-item">
                <div class="skeleton-box" style="width: 34px; height: 34px; border-radius: 50%;"></div>
                <div style="flex: 1;">
                    <div class="skeleton-box" style="width: 65%; height: 14px; margin-bottom: 6px;"></div>
                    <div class="skeleton-box" style="width: 30%; height: 11px;"></div>
                </div>
            </div>
            <div class="activity-item">
                <div class="skeleton-box" style="width: 34px; height: 34px; border-radius: 50%;"></div>
                <div style="flex: 1;">
                    <div class="skeleton-box" style="width: 75%; height: 14px; margin-bottom: 6px;"></div>
                    <div class="skeleton-box" style="width: 40%; height: 11px;"></div>
                </div>
            </div>
            <div class="activity-item">
                <div class="skeleton-box" style="width: 34px; height: 34px; border-radius: 50%;"></div>
                <div style="flex: 1;">
                    <div class="skeleton-box" style="width: 50%; height: 14px; margin-bottom: 6px;"></div>
                    <div class="skeleton-box" style="width: 25%; height: 11px;"></div>
                </div>
            </div>
        `;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

            const res = await apiFetch(`${API_BASE_URL}/activity-logs?limit=8`, {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const result = await res.json();
            if (!res.ok || !result.success || !Array.isArray(result.data)) {
                throw new Error(result.message || "Không thể tải nhật ký hoạt động.");
            }

            const logs = result.data;
            if (logs.length === 0) {
                container.innerHTML = `
                    <div class="activity-empty-state">
                        <i class="fa-regular fa-clipboard"></i>
                        <p>Chưa có hoạt động nào được ghi nhận gần đây.</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = logs.map(item => {
                const userName = String(item.user_name || item.user_code || "Hệ thống").trim();
                const initial = userName.charAt(0).toUpperCase();
                const role = item.role || "SYSTEM";
                const roleClass = role === "LECTURER" ? "role-lecturer" : (role === "ADMIN" ? "role-admin" : "");
                const timeAgo = formatTimeAgo(item.createdAt || item.updatedAt);
                const actionText = item.actionText || `${item.method || ""} ${item.url || ""}`;

                return `
                    <div class="activity-item">
                        <span class="activity-avatar ${roleClass}" title="${role}">${initial}</span>
                        <div class="activity-details">
                            <div class="activity-desc">
                                <strong>${escapeHtml(userName)}</strong> ${escapeHtml(actionText)}
                            </div>
                            <div class="activity-meta">
                                <span><i class="fa-regular fa-clock"></i> ${timeAgo}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (error) {
            console.error("Lỗi khi tải hoạt động mới nhất:", error);
            container.innerHTML = `
                <div class="activity-empty-state">
                    <i class="fa-solid fa-triangle-exclamation" style="color: var(--danger, #DC2626);"></i>
                    <p style="color: var(--danger, #DC2626); margin-bottom: 8px;">Không thể tải danh sách hoạt động</p>
                    <button type="button" id="btnRetryActivities" class="btn-retry-activity">
                        <i class="fa-solid fa-rotate-right"></i> Thử lại
                    </button>
                </div>
            `;
            const retryBtn = document.getElementById("btnRetryActivities");
            if (retryBtn) {
                retryBtn.addEventListener("click", fetchRecentActivities);
            }
        }
    }

    // =========================================================================
    // 6. XUẤT BÁO CÁO CSV (GIỮ NGUYÊN LOGIC CŨ)
    // =========================================================================
    function csvCell(value) {
        let text = value == null ? "" : String(value);
        if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    }

    if (exportReportBtn) {
        exportReportBtn.addEventListener("click", () => {
            if (!latestDashboardReport) {
                window.showAppNotification?.("Chưa có dữ liệu dashboard để xuất báo cáo.");
                return;
            }

            try {
                const { semesterName, kpi, chart, pendingTopics } = latestDashboardReport;
                const rows = [
                    ["BÁO CÁO TỔNG QUAN HỆ THỐNG"],
                    ["Học kỳ", semesterName],
                    ["Thời điểm xuất", new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })],
                    [],
                    ["Chỉ số", "Số lượng"],
                    ["Sinh viên", kpi.totalStudents],
                    ["Giảng viên", kpi.totalLecturers],
                    ["Đề tài đăng ký", kpi.totalTopics],
                    ["Đã phê duyệt", kpi.approvedTopics],
                    ["Chờ phê duyệt", kpi.pendingTopics],
                    ["Bị từ chối", kpi.rejectedTopics],
                    ["Yêu cầu chỉnh sửa", kpi.needRevisionTopics],
                    ["Đề tài đang thực hiện", kpi.inProgressTopics],
                    ["Đề tài duyệt từ giảng viên", kpi.approvedBySource?.lecturer],
                    ["Đề tài duyệt từ sinh viên", kpi.approvedBySource?.student],
                    [],
                    ["Đăng ký theo tháng"],
                    ["Tháng", "Số đề tài"]
                ];

                (chart.monthLabels || []).forEach((label, index) => {
                    rows.push([label, chart.monthlyRegistrations?.[index] ?? 0]);
                });

                rows.push(
                    [],
                    ["5 đề tài gần nhất chờ xử lý"],
                    ["Mã đề tài", "Tên đề tài", "MSSV trưởng nhóm", "Giảng viên hướng dẫn"]
                );
                pendingTopics.forEach(topic => {
                    rows.push([
                        topic.topic_code || "",
                        topic.title || "",
                        topic.leader_code || "",
                        topic.lecturer_name || topic.lecturer_code || ""
                    ]);
                });

                const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}`;
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = downloadUrl;
                link.download = `bao-cao-tong-quan-${new Date().toISOString().slice(0, 10)}.csv`;
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
                window.showAppNotification?.("Đã tải báo cáo tổng quan dạng CSV.");
            } catch (error) {
                console.error("Không thể tạo báo cáo dashboard:", error);
                window.showAppNotification?.("Không thể tạo báo cáo. Vui lòng thử lại.");
            }
        });
    }

    // =========================================================================
    // 7. TIỆN ÍCH HELPER
    // =========================================================================
    function formatTimeAgo(dateString) {
        if (!dateString) return "Vừa xong";
        const date = new Date(dateString);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 60) return "Vừa xong";
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} phút trước`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} giờ trước`;
        if (diffInSeconds < 172800) return "Hôm qua";
        return `${Math.floor(diffInSeconds / 86400)} ngày trước`;
    }

    function formatVietnameseDate(d = new Date()) {
        const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
        const dayName = days[d.getDay()];
        const date = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${dayName}, ${date}/${month}/${year}`;
    }

    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // =========================================================================
    // 8. KHỞI CHẠY TẢI DỮ LIỆU BAN ĐẦU
    // =========================================================================
    const semesterSelect = document.getElementById("semesterSelect");
    if (semesterSelect) {
        const initialSemester = await loadSemesterOptions(semesterSelect);
        if (initialSemester) await fetchDashboardData(initialSemester);
        semesterSelect.addEventListener("change", event => {
            if (event.target.value) fetchDashboardData(event.target.value);
        });
    } else {
        await fetchDashboardData("all");
    }

    // Tải danh sách hoạt động mới nhất
    fetchRecentActivities();

    // =========================================================================
    // 9. XỬ LÝ MODAL ĐĂNG XUẤT
    // =========================================================================
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn && logoutModal) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            logoutModal.classList.add("active");
            logoutModal.style.display = "flex";
        });
    }

    if (cancelLogoutBtn && logoutModal) {
        cancelLogoutBtn.addEventListener("click", () => {
            logoutModal.classList.remove("active");
            logoutModal.style.display = "none";
        });
    }

    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            localStorage.removeItem("adminAuth");
            
            if (localStorage.getItem("token") && localStorage.getItem("user")) {
                const tempUser = JSON.parse(localStorage.getItem("user") || "{}");
                if (tempUser.role === "ADMIN") {
                    localStorage.removeItem("token");
                    localStorage.removeItem("user");
                }
            }

            if (localStorage.getItem("activeRole") === "ADMIN") {
                localStorage.removeItem("activeRole");
            }
            
            sessionStorage.clear();
            window.location.href = "../auth/index.html";
        });
    }

    window.addEventListener("click", (e) => {
        if (logoutModal && e.target === logoutModal) {
            logoutModal.classList.remove("active");
            logoutModal.style.display = "none";
        }
    });
});
