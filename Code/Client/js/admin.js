/**
 * Lấy thông tin xác thực tùy theo Role
 */
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
        console.error(`Lỗi parse JSON cho role ${role}:`, error);
        return null;
    }
}

document.addEventListener("DOMContentLoaded", async () => {

    // =========================================================================
    // 1. KIỂM TRA PHIÊN ĐĂNG NHẬP & QUYỀN ADMIN
    // =========================================================================
    const auth = getAuthForRole("ADMIN") || {
        token: localStorage.getItem("token"),
        user: JSON.parse(localStorage.getItem("user") || "null")
    };

    const user = auth?.user;
    const token = auth?.token;

    if (!user || user.role !== "ADMIN" || !token) {
        console.warn("Chưa đăng nhập hoặc không phải Admin. Chuyển hướng về trang chủ...");
        window.location.href = "index.html";
        return;
    }

    // Hiển thị tên Admin
    const userNameElem = document.getElementById("userName");
    const welcomeAdminElem = document.getElementById("welcomeAdminName");
    const fullName = user.full_name || user.fullName || "Quản trị viên";

    if (userNameElem) userNameElem.textContent = fullName;
    if (welcomeAdminElem) welcomeAdminElem.textContent = fullName;

    // =========================================================================
    // 2. BIẾN QUẢN LÝ THỂ HIỆN BIỂU ĐỒ
    // =========================================================================
    let registrationChartInstance = null;
    let statusChartInstance = null;
    
    // Cấu hình URL API Backend (Sửa port nếu backend chạy port khác)
    const API_BASE_URL = "http://localhost:5000/api";

    // =========================================================================
    // 3. HÀM FETCH DỮ LIỆU TỪ BACKEND
    // =========================================================================
    async function fetchDashboardData(semester = "") {
        try {
            const url = `${API_BASE_URL}/dashboard/admin${semester ? `?semester=${semester}` : ''}`;
            console.log("Đang gọi API Dashboard tại:", url);

            const res = await fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                }
            });

            if (!res.ok) {
                console.error(`Lỗi gọi API: Mã lỗi ${res.status} - ${res.statusText}`);
                if (res.status === 401 || res.status === 403) {
                    alert("Phiên đăng nhập hết hạn hoặc bạn không có quyền truy cập!");
                    // Có thể thực hiện tự động đăng xuất ở đây
                }
                return;
            }

            const responseData = await res.json();
            console.log("Dữ liệu trả về từ Backend:", responseData); // KIỂM TRA LOG NÀY ĐỂ XEM DATA CÓ BỊ RỖNG KHÔNG

            if (responseData.success) {
                // Hỗ trợ trường hợp data được bọc trong object "data" hoặc nằm trực tiếp ngoài response
                const kpiData = responseData.kpi || responseData.data?.kpi;
                const chartData = responseData.chart || responseData.data?.chart;
                const pendingTopics = responseData.pendingTopicsList || responseData.data?.pendingTopicsList;

                if (kpiData) {
                    renderKPIs(kpiData);
                    renderDoughnutChart(kpiData);
                } else {
                    console.warn("Không tìm thấy object 'kpi' trong dữ liệu trả về.");
                }

                if (chartData) {
                    renderLineChart(chartData);
                }

                renderPendingTable(pendingTopics || []);
            } else {
                console.error("API trả về thành công nhưng success = false:", responseData.message);
                alert("Không thể tải dữ liệu: " + responseData.message);
            }
        } catch (error) {
            console.error("Không thể kết nối đến máy chủ Backend:", error);
        }
    }

    // =========================================================================
    // 4. CÁC HÀM CẬP NHẬT GIAO DIỆN HTML
    // =========================================================================

    // A. Cập nhật 5 Thẻ KPI
    function renderKPIs(kpi) {
        const updateElement = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = Number(value || 0).toLocaleString('vi-VN');
        };

        updateElement("kpiStudents", kpi.totalStudents);
        updateElement("kpiLecturers", kpi.totalLecturers);
        updateElement("kpiTotalTopics", kpi.totalTopics);
        updateElement("kpiApprovedTopics", kpi.approvedTopics);
        updateElement("kpiPendingTopics", kpi.pendingTopics);
        updateElement("pendingTopicsBadge", kpi.pendingTopics);

        const ratioEl = document.getElementById("kpiApprovedRatio");
        if (ratioEl) {
            const lecturerApproved = Number(kpi.approvedBySource?.lecturer || 0);
            const studentApproved = Number(kpi.approvedBySource?.student || 0);

            if (lecturerApproved === 0 && studentApproved === 0) {
                ratioEl.innerHTML = '<span class="mini-stat"><i class="fa-solid fa-chalkboard-user"></i> GV: 0</span><span class="mini-stat"><i class="fa-solid fa-user-graduate"></i> SV: 0</span>';
            } else {
                ratioEl.innerHTML = `
                    <span class="mini-stat"><i class="fa-solid fa-chalkboard-user"></i> GV: ${lecturerApproved}</span>
                    <span class="mini-stat"><i class="fa-solid fa-user-graduate"></i> SV: ${studentApproved}</span>
                `;
            }
        }
    }

    // B. Vẽ Biểu đồ đường (Đăng ký theo tháng)
    function renderLineChart(chartData) {
        const ctxRegElem = document.getElementById('registrationChart');
        if (!ctxRegElem) return;

        if (registrationChartInstance) {
            registrationChartInstance.destroy();
        }

        const labels = chartData?.monthLabels || ['Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8'];
        const values = chartData?.monthlyRegistrations || [0, 0, 0, 0, 0, 0];

        const ctxReg = ctxRegElem.getContext('2d');
        registrationChartInstance = new Chart(ctxReg, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Số đề tài đăng ký',
                    data: values,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.08)',
                    borderWidth: 2.5,
                    pointBackgroundColor: '#2563eb',
                    pointRadius: 4,
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // C. Vẽ Biểu đồ Tròn (Tỷ lệ trạng thái đề tài)
    function renderDoughnutChart(kpi) {
        const ctxStatusElem = document.getElementById('statusChart');
        if (!ctxStatusElem || !kpi) return;

        if (statusChartInstance) {
            statusChartInstance.destroy();
        }

        const total = Number(kpi.totalTopics || 0);
        const approved = Number(kpi.approvedTopics || 0);
        const pending = Number(kpi.pendingTopics || 0);
        const rejected = Number(kpi.rejectedTopics || 0);
        const inProgress = Number(kpi.inProgressTopics || 0); // Thêm field nếu DB bạn có

        const doughnutTotalEl = document.getElementById("doughnutTotal");
        if (doughnutTotalEl) doughnutTotalEl.textContent = total;

        const calcPercent = (val) => total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';

        const statusData = {
            labels: ['Đã phê duyệt', 'Chờ phê duyệt', 'Bị từ chối', 'Đang thực hiện'],
            values: [approved, pending, rejected, inProgress],
            percentages: [
                calcPercent(approved),
                calcPercent(pending),
                calcPercent(rejected),
                calcPercent(inProgress)
            ],
            colors: ['#10b981', '#f59e0b', '#ef4444', '#3b82f6']
        };

        const ctxStatus = ctxStatusElem.getContext('2d');
        statusChartInstance = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: statusData.labels,
                datasets: [{
                    data: statusData.values,
                    backgroundColor: statusData.colors,
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

        // Tạo Legend tùy chỉnh bên dưới biểu đồ
        const legendContainer = document.getElementById('statusLegend');
        if (legendContainer) {
            legendContainer.innerHTML = '';
            statusData.labels.forEach((label, index) => {
                if (statusData.values[index] > 0 || total === 0) { // Tối ưu: Chỉ hiển thị các trạng thái có dữ liệu
                    const item = document.createElement('div');
                    item.className = 'legend-item';
                    item.innerHTML = `
                        <div class="legend-left">
                            <span class="dot" style="background-color: ${statusData.colors[index]}"></span>
                            <span>${label}</span>
                        </div>
                        <strong>${statusData.values[index]} (${statusData.percentages[index]})</strong>
                    `;
                    legendContainer.appendChild(item);
                }
            });
        }
    }

    // D. Đổ dữ liệu vào bảng Đề tài chờ duyệt
    function renderPendingTable(pendingList) {
        const tbody = document.getElementById("pendingTopicsTable");
        if (!tbody) return;

        if (!Array.isArray(pendingList) || pendingList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: #6b7280; padding: 20px;">
                        Hiện không có đề tài nào chờ phê duyệt.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = pendingList.map(t => `
            <tr>
                <td><strong>${t.topic_code || 'Chưa có'}</strong></td>
                <td>${t.title || 'N/A'}</td>
                <td>MSSV: ${t.leader_code || 'N/A'}</td>
                <td>GV: ${t.lecturer_code || t.lecturer_name || 'N/A'}</td>
                <td class="table-actions">
                    <button class="btn-action btn-view" title="Xem & Xét duyệt" onclick="window.location.href='admin-topics.html'">
                        <i class="fa-solid fa-eye"></i> Xem & Duyệt
                    </button>
                </td>
            </tr>
        `).join('');
    }

    // =========================================================================
    // 5. LẮP SỰ KIỆN VÀ KHỞI CHẠY TẢI DỮ LIỆU
    // =========================================================================

    // Tải dữ liệu ban đầu
    const semesterSelect = document.getElementById("semesterSelect");
    const initialSemester = semesterSelect ? semesterSelect.value : "";
    await fetchDashboardData(initialSemester);

    // Lắng nghe sự kiện đổi Học kỳ
    if (semesterSelect) {
        semesterSelect.addEventListener("change", (e) => {
            fetchDashboardData(e.target.value);
        });
    }

    // Xử lý Modal Đăng xuất
    const logoutBtn = document.getElementById("logoutBtn");
    const logoutModal = document.getElementById("logoutModal");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    if (logoutBtn && logoutModal) {
        logoutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            logoutModal.classList.add("active"); // Thường sử dụng class để trigger CSS animation
            logoutModal.style.display = "flex"; // Fallback nếu không dùng class
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
            
            // Xóa luôn các token chuẩn nếu admin dùng chung luồng
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
            window.location.href = "login.html"; // Chuyển về login thay vì index nếu bạn có trang login riêng
        });
    }

    window.addEventListener("click", (e) => {
        if (logoutModal && e.target === logoutModal) {
            logoutModal.classList.remove("active");
            logoutModal.style.display = "none";
        }
    });
});