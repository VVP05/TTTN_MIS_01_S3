/**
 * Trình quản lý Đăng ký Đề tài Khóa luận / Đồ án dành cho Sinh viên
 * Đã tối ưu hóa cấu trúc, xử lý lỗi, linh hoạt nhận diện dữ liệu Giảng viên & UX.
 */

function getAuthForRole(role) {
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

document.addEventListener("DOMContentLoaded", async () => {
    // =========================================================================
    // 1. KIỂM TRA ĐĂNG NHẬP & PHÂN QUYỀN VAI TRÒ
    // =========================================================================
    const auth = getAuthForRole("STUDENT");
    const token = auth?.token;
    const userStr = auth?.user ? JSON.stringify(auth.user) : null;

    if (!userStr || userStr === "null") {
        window.location.href = "../auth/index.html";
        return;
    }

    const user = JSON.parse(userStr);

    if (user.role !== "STUDENT") {
        window.location.href = "../auth/index.html";
        return;
    }

    // =========================================================================
    // 2. KHAI BÁO BIẾN TRẠNG THÁI & DOM ELEMENTS
    // =========================================================================
    let isEditing = false;
    let hasEditedMemberCodes = false;
    let allPoolTopics = [];
    let allLecturers = [];
    let registrationWindowOpen = false;
    let marketplaceData = { lecturerTopics: [], groupTopics: [] };
    let activeMarketplaceTab = "lecturer";
    let marketplacePage = 1;
    const marketplacePageSize = 12;

    // Header Info Elements
    const userNameEl = document.getElementById("userName");
    const userCodeEl = document.getElementById("userCode");
    const leaderNameEl = document.getElementById("leaderName");

    // Modal Logout Elements
    const logoutModal = document.getElementById("logoutModal");
    const logoutBtn = document.getElementById("logoutBtn");
    const cancelLogoutBtn = document.getElementById("cancelLogoutBtn");
    const confirmLogoutBtn = document.getElementById("confirmLogoutBtn");

    // Form Elements
    const form = document.getElementById("topicRegisterForm");
    const roleRadios = document.querySelectorAll('input[name="userRole"]');
    const leaderLabel = document.getElementById("leaderLabel");
    const partnerInput = document.getElementById("partnerCodeInput");
    const member3Input = document.getElementById("member3CodeInput");
    const member2Field = document.getElementById("member2Field");
    const member3Field = document.getElementById("member3Field");
    const joinRequestsSection = document.getElementById("joinRequestsSection");
    const joinRequestsList = document.getElementById("joinRequestsList");
    const proposedSelect = document.getElementById("proposedTopic");
    const lecturerSelect = document.getElementById("lecturerCode");
    const topicTitleInput = document.getElementById("topicTitle");
    const topicDescInput = document.getElementById("topicDescription");
    const topicDetailsSection = document.getElementById("topicDetailsSection");
    const memberRoleNote = document.getElementById("memberRoleNote");

    // Action Buttons & Status UI
    const editBtn = document.getElementById("editBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    const submitBtn = document.getElementById("submitBtn");
    const msgBox = document.getElementById("formMessage");
    const statusEl = document.getElementById("topicStatus");
    const registrationWindowNotice = document.getElementById("registrationWindowNotice");
    const marketplaceCards = document.getElementById("marketplaceCards");
    const marketplaceMessage = document.getElementById("marketplaceMessage");
    const marketplacePagination = document.getElementById("marketplacePagination");
    const marketplaceSearch = document.getElementById("marketplaceSearch");
    const marketplaceCategory = document.getElementById("marketplaceCategory");
    const lecturerTopicCount = document.getElementById("lecturerTopicCount");
    const groupTopicCount = document.getElementById("groupTopicCount");

    // Modal Cancel Elements
    const cancelModal = document.getElementById("cancelModal");
    const closeCancelBtn = document.getElementById("closeCancelBtn");
    const confirmCancelBtn = document.getElementById("confirmCancelBtn");

    // Hiển thị thông tin cơ bản của Sinh viên
    if (userNameEl) userNameEl.textContent = user.full_name || user.name || "";
    const welcomeUserNameEl = document.getElementById("welcomeUserName");
    if (welcomeUserNameEl) welcomeUserNameEl.textContent = user.full_name || user.name || "bạn";
    if (userCodeEl) userCodeEl.textContent = user.user_code || "";

    // =========================================================================
    // 3. CÁC HÀM BỔ TRỢ (UTILITY FUNCTIONS)
    // =========================================================================
    
    /**
     * Tách lấy Mã số sinh viên (MSSV) từ chuỗi format "Họ và Tên (MSSV)"
     */
    function extractCode(str) {
        if (!str) return "";
        const val = str.trim();
        if (val.includes("(")) {
            const match = val.match(/\(([^)]+)\)/);
            if (match) return match[1].trim();
        }
        return val;
    }

    function clearCurrentStudentFromMemberField(inputEl) {
        const enteredCode = extractCode(inputEl?.value).trim();
        if (enteredCode && enteredCode !== enteredCode.toUpperCase()) {
            showMessage("error", `Mã sinh viên "${enteredCode}" không hợp lệ. Vui lòng kiểm tra và nhập đúng mã số sinh viên.`);
            return;
        }

        const currentStudentCode = String(user.user_code || "").trim().toUpperCase();
        if (!enteredCode || enteredCode !== currentStudentCode) return;

        showMessage("error", "Mã sinh viên của bạn đã là Trưởng nhóm, không thể nhập lại ở Thành viên 2 hoặc 3.");
    }

    [partnerInput, member3Input].forEach(inputEl => {
        inputEl?.addEventListener("input", () => {
            hasEditedMemberCodes = true;
        });
        inputEl?.addEventListener("blur", () => clearCurrentStudentFromMemberField(inputEl));
    });

    /**
     * Hiển thị hộp thông báo phản hồi người dùng
     */
    function showMessage(type, message, customHTML = null) {
        if (!msgBox) return;
        msgBox.style.display = "block";
        msgBox.className = `message-box message-${type}`;
        
        if (customHTML) {
            msgBox.innerHTML = customHTML;
        } else {
            const icon = type === "success" 
                ? "fa-circle-check" 
                : type === "error" 
                ? "fa-circle-xmark" 
                : "fa-circle-info";
            msgBox.innerHTML = `<i class="fa-solid ${icon}"></i> ${message}`;
        }
        msgBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function hideMessage() {
        if (msgBox) {
            msgBox.style.display = "none";
            msgBox.className = "message-box";
        }
    }

    async function loadRegistrationWindow() {
        try {
            const response = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/semesters/registration-status", {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || "Không thể tải thời hạn đăng ký.");

            const data = result.data || {};
            registrationWindowOpen = data.is_open === true;
            if (registrationWindowNotice) {
                const isUpcoming = !registrationWindowOpen && data.state === "upcoming";
                registrationWindowNotice.hidden = false;
                registrationWindowNotice.classList.toggle("is-open", registrationWindowOpen);
                registrationWindowNotice.classList.toggle("is-upcoming", isUpcoming);
                registrationWindowNotice.classList.toggle("is-closed", !registrationWindowOpen && !isUpcoming);
                if (registrationWindowOpen) {
                    const status = document.createElement("span");
                    status.className = "registration-window-status";
                    status.textContent = "Đang trong thời hạn";
                    const endDate = new Date(data.semester.registration_end_date);
                    const endFormat = data.semester.registration_window_has_time
                        ? { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }
                        : { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" };
                    const details = ` đăng ký đề tài${data.semester?.name ? ` – ${data.semester.name}` : ""}. Hạn cuối: ${endDate.toLocaleString("vi-VN", endFormat)}.`;
                    registrationWindowNotice.replaceChildren(status, document.createTextNode(details));
                } else if (isUpcoming) {
                    const status = document.createElement("span");
                    status.className = "registration-window-status is-upcoming";
                    status.textContent = "Chưa đến thời hạn đăng ký";
                    const startDate = new Date(data.semester.registration_start_date);
                    const startFormat = data.semester.registration_window_has_time
                        ? { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }
                        : { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" };
                    const details = `${data.semester?.name ? ` – ${data.semester.name}` : ""}. Mở đăng ký: ${startDate.toLocaleString("vi-VN", startFormat)}.`;
                    registrationWindowNotice.replaceChildren(status, document.createTextNode(details));
                } else {
                    registrationWindowNotice.textContent = "Hiện không trong thời hạn đăng ký đề tài. ";
                }
            }
        } catch (error) {
            registrationWindowOpen = false;
            if (registrationWindowNotice) {
                registrationWindowNotice.hidden = false;
                registrationWindowNotice.classList.add("is-closed");
                registrationWindowNotice.textContent = "Không thể xác minh thời hạn đăng ký. Vui lòng tải lại trang hoặc liên hệ quản trị viên.";
            }
            console.error("Lỗi tải thời hạn đăng ký học kỳ:", error);
        }
    }

    /**
     * Khóa / Mở khóa Form theo vai trò và trạng thái thao tác
     */
    function disableForm(disabled) {
        const selectedRole = document.querySelector('input[name="userRole"]:checked')?.value || "LEADER";

        if (leaderNameEl) leaderNameEl.disabled = disabled || (selectedRole === "LEADER");
        if (partnerInput) partnerInput.disabled = disabled || (selectedRole === "MEMBER");
        if (member3Input) member3Input.disabled = disabled || (selectedRole === "MEMBER");
        
        roleRadios.forEach(r => r.disabled = disabled);
        if (lecturerSelect) lecturerSelect.disabled = disabled || selectedRole === "MEMBER";
        if (proposedSelect) proposedSelect.disabled = disabled || selectedRole === "MEMBER";
        if (topicTitleInput) topicTitleInput.disabled = disabled || selectedRole === "MEMBER";
        if (topicDescInput) topicDescInput.disabled = disabled || selectedRole === "MEMBER";
    }

    /**
     * Đổi trạng thái hiển thị của nút bấm (Loading state)
     */
    function setButtonLoading(button, isLoading, originalText) {
        if (!button) return;
        if (isLoading) {
            button.disabled = true;
            const span = button.querySelector("span");
            if (span) span.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...`;
        } else {
            button.disabled = false;
            const span = button.querySelector("span");
            if (span) span.innerHTML = originalText;
        }
    }

    // =========================================================================
    // 4. XỬ LÝ DỮ LIỆU GIẢNG VIÊN & KHO ĐỀ TÀI
    // =========================================================================

    /**
     * Lọc và hiển thị danh sách đề tài gợi ý theo Giảng viên được chọn
     */
    const renderProposedTopics = (selectedLecturerCode = "") => {
        if (!proposedSelect) return;

        if (!selectedLecturerCode) {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "-- Vui lòng chọn Giảng viên hướng dẫn trước --";
            proposedSelect.replaceChildren(option);
            return;
        }

        const filtered = allPoolTopics.filter(t => t.lecturer_code === selectedLecturerCode);

        if (filtered && filtered.length > 0) {
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = "-- Chọn đề tài gợi ý từ Kho (Hoặc tự nhập bên dưới) --";
            const options = filtered.map(topic => {
                const option = document.createElement("option");
                const registeredGroups = Number(topic.registered_groups) || 0;
                const maxGroupsValue = Number(topic.max_groups);
                const maxGroups = Number.isInteger(maxGroupsValue) && maxGroupsValue >= 0
                    ? maxGroupsValue
                    : 1;
                const remainingGroups = Number(topic.remaining_groups ?? maxGroups - registeredGroups);
                const isFull = remainingGroups <= 0 || topic.status === "REGISTERED";
                const codeTag = topic.topic_code ? `[${topic.topic_code}] ` : "";
                const availability = registeredGroups > 0 ? " - Đã có nhóm đăng ký" : "";
                option.value = topic._id;
                option.dataset.title = topic.title || "";
                option.dataset.desc = topic.description || "";
                option.dataset.lecturer = topic.lecturer_code || "";
                option.disabled = isFull;
                option.textContent = `${codeTag}${topic.title || "Đề tài chưa có tên"}${availability}`;
                return option;
            });
            proposedSelect.replaceChildren(placeholder, ...options);
        } else {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "-- Giảng viên này hiện chưa có đề tài gợi ý --";
            proposedSelect.replaceChildren(option);
        }
    };

    /**
     * Tải danh sách Đề tài gợi ý từ Kho của Giảng viên
     */
    const loadProposedTopics = async () => {
        if (!proposedSelect) return;
        try {
            const res = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/topics/lecturer-pool", {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (res.ok) {
                const result = await res.json();
                allPoolTopics = Array.isArray(result) ? result : (result.data || result.topics || []);
                renderProposedTopics(lecturerSelect ? lecturerSelect.value : "");
            } else {
                proposedSelect.innerHTML = `<option value="">-- Chưa có đề tài từ Kho Giảng viên --</option>`;
            }
        } catch (err) {
            console.error("Lỗi kết nối tải kho đề tài:", err);
            proposedSelect.innerHTML = `<option value="">-- Lỗi kết nối tải Kho đề tài --</option>`;
        }
    };

    /**
     * Tải danh sách Giảng viên Hướng dẫn (Đã nâng cấp tự động bóc tách mảng & linh hoạt thuộc tính)
     */
    const loadLecturers = async () => {
        if (!lecturerSelect) return;
        try {
            const res = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/auth/lecturers", {
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (res.ok) {
                const responseData = await res.json();
                
                // Log kiểm tra cấu trúc dữ liệu Backend trả về
                console.log(">>> Dữ liệu Giảng viên từ Backend:", responseData);

                // Tự động nhận diện mảng dữ liệu (dù Backend trả trực tiếp mảng hay bọc trong data / lecturers)
                let lecturers = [];
                if (Array.isArray(responseData)) {
                    lecturers = responseData;
                } else if (responseData && Array.isArray(responseData.data)) {
                    lecturers = responseData.data;
                } else if (responseData && Array.isArray(responseData.lecturers)) {
                    lecturers = responseData.lecturers;
                }

                if (lecturers && lecturers.length > 0) {
                    allLecturers = lecturers.map(lecturer => {
                        const quota = Number(lecturer.max_quota);
                        return {
                            code: String(lecturer.user_code || lecturer.userCode || lecturer.code || lecturer.username || ""),
                            name: lecturer.full_name || lecturer.fullName || lecturer.name || "Chưa đặt tên",
                            groupsCount: Number(lecturer.groupsCount) || 0,
                            maxQuota: Number.isInteger(quota) && quota >= 0 ? quota : 5
                        };
                    });
                    lecturerSelect.innerHTML = `<option value="">-- Chọn Giảng viên hướng dẫn --</option>` +
                        allLecturers.map(lecturer =>
                            `<option value="${lecturer.code}">${lecturer.name} (${lecturer.code})</option>`
                        ).join('');
                } else {
                    allLecturers = [];
                    lecturerSelect.innerHTML = `<option value="">-- Chưa có dữ liệu giảng viên --</option>`;
                }
            } else {
                console.error("Lỗi HTTP khi tải danh sách giảng viên:", res.status, res.statusText);
                lecturerSelect.innerHTML = `<option value="">-- Không thể tải danh sách giảng viên (Lỗi ${res.status}) --</option>`;
            }
        } catch (err) {
            console.error("Lỗi tải danh sách giảng viên:", err);
            lecturerSelect.innerHTML = `<option value="">-- Lỗi kết nối máy chủ --</option>`;
        }
    };

    /**
     * Tải thông tin thành viên nhóm theo MSSV
     */
    async function loadPartnerInfo(inputEl, partnerCode) {
        if (!inputEl) return;
        if (!partnerCode) {
            inputEl.value = "";
            return;
        }
        inputEl.value = partnerCode;

        try {
            const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/users/${partnerCode}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const partnerData = await res.json();
                if (partnerData && partnerData.full_name) {
                    inputEl.value = `${partnerData.full_name} (${partnerData.user_code})`;
                }
            }
        } catch (err) {
            console.error("Không thể lấy thông tin thành viên:", err);
        }
    }

    // =========================================================================
    // 5. CẬP NHẬT GIAO DIỆN THEO VAI TRÒ & SỰ KIỆN LỌC ĐỀ TÀI
    // =========================================================================
    const updateRoleUI = (role) => {
        const isMemberRole = role === "MEMBER";

        if (member2Field) member2Field.style.display = isMemberRole ? "none" : "block";
        if (member3Field) member3Field.style.display = isMemberRole ? "none" : "block";
        if (leaderNameEl) leaderNameEl.closest('.form-group')?.style.setProperty('display', 'block');

        if (isMemberRole) {
            if (topicDetailsSection) topicDetailsSection.style.display = "none";
            if (memberRoleNote) memberRoleNote.style.display = "block";
            if (submitBtn) submitBtn.querySelector("span").innerHTML = '<i class="fa-solid fa-user-plus"></i> Tham Gia Nhóm';
            if (lecturerSelect) lecturerSelect.value = "";
            if (proposedSelect) proposedSelect.value = "";
            if (lecturerSelect) lecturerSelect.disabled = true;
            if (proposedSelect) proposedSelect.disabled = true;
            if (topicTitleInput) {
                topicTitleInput.value = "";
                topicTitleInput.disabled = true;
            }
            if (topicDescInput) {
                topicDescInput.value = "";
                topicDescInput.disabled = true;
            }
            if (leaderLabel) leaderLabel.innerHTML = 'MSSV Trưởng nhóm <span class="required" style="color: red;">*</span>';
            if (leaderNameEl) {
                leaderNameEl.value = "";
                leaderNameEl.placeholder = "Nhập chính xác MSSV Trưởng nhóm (VD: SV01)...";
                leaderNameEl.disabled = false;
            }
            if (partnerInput) {
                partnerInput.value = "";
                partnerInput.placeholder = "Chỉ Trưởng nhóm mới có thể nhập thêm thành viên...";
                partnerInput.disabled = true;
            }
            if (member3Input) {
                member3Input.value = "";
                member3Input.placeholder = "Chỉ Trưởng nhóm mới có thể nhập thêm thành viên...";
                member3Input.disabled = true;
            }
        } else {
            if (topicDetailsSection) topicDetailsSection.style.display = "";
            if (memberRoleNote) memberRoleNote.style.display = "none";
            if (submitBtn) submitBtn.querySelector("span").innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi Đăng Ký Đề Tài';
            if (lecturerSelect) lecturerSelect.disabled = false;
            if (proposedSelect) proposedSelect.disabled = false;
            if (topicTitleInput) topicTitleInput.disabled = false;
            if (topicDescInput) topicDescInput.disabled = false;
            if (leaderLabel) leaderLabel.innerHTML = 'Trưởng nhóm <span class="required" style="color: red;">*</span>';
            if (leaderNameEl) {
                leaderNameEl.value = `${user.full_name || user.name} (${user.user_code})`;
                leaderNameEl.disabled = true;
                leaderNameEl.placeholder = "Nhập MSSV Trưởng nhóm...";
            }
            if (partnerInput) {
                partnerInput.placeholder = "Nhập MSSV Thành viên 2 (VD: SV02)...";
                partnerInput.disabled = false;
            }
            if (member3Input) {
                member3Input.placeholder = "Nhập MSSV Thành viên 3 (VD: SV03)...";
                member3Input.disabled = false;
            }
        }
    };

    roleRadios.forEach(radio => {
        radio.addEventListener("change", (e) => {
            hideMessage();
            updateRoleUI(e.target.value);
        });
    });

    // Khi thay đổi Giảng viên -> Cập nhật danh sách Đề tài gợi ý
    if (lecturerSelect) {
        lecturerSelect.addEventListener("change", (e) => {
            hideMessage();
            const selectedLecturer = allLecturers.find(lecturer => lecturer.code === e.target.value);
            if (!isEditing) {
                if (topicTitleInput) topicTitleInput.value = "";
                if (topicDescInput) topicDescInput.value = "";
            }
            renderProposedTopics(e.target.value);
            if (!isEditing && selectedLecturer &&
                selectedLecturer.groupsCount >= selectedLecturer.maxQuota) {
                showMessage(
                    "error",
                    `Giảng viên ${selectedLecturer.name} đã đủ số lượng nhóm hướng dẫn. Vui lòng chọn giảng viên khác.`
                );
            }
        });
    }

    // Khi chọn Đề tài gợi ý -> Tự động điền Tên, Mô tả & Giảng viên
    if (proposedSelect) {
        proposedSelect.addEventListener("change", (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];

            if (selectedOption && selectedOption.value !== "") {
                const topicTitle = selectedOption.getAttribute("data-title") || "";
                const topicDesc = selectedOption.getAttribute("data-desc") || "";
                const lecturerCode = selectedOption.getAttribute("data-lecturer") || "";

                if (topicTitleInput && topicTitle) topicTitleInput.value = topicTitle;
                if (topicDescInput && topicDesc) topicDescInput.value = topicDesc;
                if (lecturerSelect && lecturerCode) lecturerSelect.value = lecturerCode;
            }
        });
    }

    function createMarketplaceMeta(icon, text) {
        const item = document.createElement("span");
        const iconElement = document.createElement("i");
        iconElement.className = `fa-solid ${icon}`;
        iconElement.setAttribute("aria-hidden", "true");
        item.append(iconElement, document.createTextNode(text));
        return item;
    }

    function createMarketplaceCard(topic, isGroupTopic) {
        const card = document.createElement("article");
        card.className = "marketplace-card";

        const title = document.createElement("h3");
        title.textContent = topic.title || "Đề tài chưa có tên";
        card.appendChild(title);

        const description = document.createElement("p");
        description.textContent = topic.description || "Chưa có mô tả cho đề tài này.";
        card.appendChild(description);

        const meta = document.createElement("div");
        meta.className = "marketplace-card-meta";
        if (topic.category) meta.appendChild(createMarketplaceMeta("fa-layer-group", topic.category));
        if (isGroupTopic) {
            meta.appendChild(createMarketplaceMeta("fa-user-tie", `Trưởng nhóm: ${topic.leader_name || topic.leader_code}`));
            meta.appendChild(createMarketplaceMeta("fa-chalkboard-user", `GVHD: ${topic.lecturer_name || topic.lecturer_code || "Chưa phân công"}`));
            if (topic.requirements) meta.appendChild(createMarketplaceMeta("fa-list-check", `Yêu cầu: ${topic.requirements}`));
        } else {
            meta.appendChild(createMarketplaceMeta("fa-chalkboard-user", topic.lecturer_name || topic.lecturer_code || "Giảng viên"));
            if (topic.requirements) meta.appendChild(createMarketplaceMeta("fa-list-check", `Yêu cầu: ${topic.requirements}`));
        }
        card.appendChild(meta);

        const footer = document.createElement("div");
        footer.className = "marketplace-card-footer";
        const status = document.createElement("span");
        status.className = "marketplace-card-status";
        const action = document.createElement("button");
        action.type = "button";
        action.className = "marketplace-card-action";

        if (isGroupTopic) {
            status.textContent = `Còn ${topic.open_slots} vị trí`;
            const requestStatus = String(topic.request_status || "").toUpperCase();
            if (requestStatus === "PENDING") {
                action.textContent = "Đang chờ xác nhận";
                action.disabled = true;
            } else if (requestStatus === "ACCEPTED") {
                action.textContent = "Đã được nhận vào nhóm";
                action.disabled = true;
            } else if (!topic.can_join) {
                action.textContent = "Không thể đăng ký lúc này";
                action.disabled = true;
            } else if (!registrationWindowOpen) {
                action.textContent = "Đang ngoài hạn đăng ký";
                action.disabled = true;
            } else {
                action.textContent = "Xin tham gia nhóm";
                action.addEventListener("click", () => requestToJoinGroup(topic, action));
            }
        } else {
            status.textContent = "Đang mở đăng ký";
            if (!topic.can_register_as_leader) {
                action.textContent = "Bạn đã có đăng ký";
                action.disabled = true;
            } else if (!registrationWindowOpen) {
                action.textContent = "Đang ngoài hạn đăng ký";
                action.disabled = true;
            } else {
                action.textContent = "Chọn làm trưởng nhóm";
                action.addEventListener("click", () => chooseLecturerTopic(topic));
            }
        }

        footer.append(status, action);
        card.appendChild(footer);
        return card;
    }

    function renderMarketplace() {
        if (!marketplaceCards) return;
        const topics = activeMarketplaceTab === "lecturer"
            ? marketplaceData.lecturerTopics
            : marketplaceData.groupTopics;
        const searchTerm = String(marketplaceSearch?.value || "").trim().toLocaleLowerCase("vi");
        const selectedCategory = marketplaceCategory?.value || "";
        const filteredTopics = topics.filter(topic => {
            const searchableText = [
                topic.title,
                topic.description,
                topic.category,
                topic.lecturer_name,
                topic.leader_name,
                topic.leader_code
            ].join(" ").toLocaleLowerCase("vi");
            return (!searchTerm || searchableText.includes(searchTerm)) &&
                (!selectedCategory || topic.category === selectedCategory);
        });

        const pageCount = Math.max(1, Math.ceil(filteredTopics.length / marketplacePageSize));
        marketplacePage = Math.min(marketplacePage, pageCount);
        const startIndex = (marketplacePage - 1) * marketplacePageSize;
        const pageTopics = filteredTopics.slice(startIndex, startIndex + marketplacePageSize);

        marketplaceCards.replaceChildren(...pageTopics.map(topic =>
            createMarketplaceCard(topic, activeMarketplaceTab === "groups")
        ));
        renderMarketplacePagination(filteredTopics.length, pageCount);
        if (marketplaceMessage) {
            marketplaceMessage.textContent = filteredTopics.length
                ? ""
                : topics.length
                    ? "Không tìm thấy đề tài phù hợp với bộ lọc."
                    : activeMarketplaceTab === "lecturer"
                        ? "Hiện chưa có đề tài giảng viên nào đang mở đăng ký."
                        : "Hiện chưa có nhóm nào đang tìm thêm thành viên.";
        }
    }

    function renderMarketplacePagination(total, pageCount) {
        if (!marketplacePagination) return;
        marketplacePagination.replaceChildren();
        marketplacePagination.hidden = pageCount <= 1;
        if (pageCount <= 1) return;

        const previousButton = document.createElement("button");
        previousButton.type = "button";
        previousButton.className = "marketplace-page-button";
        previousButton.textContent = "Trang trước";
        previousButton.disabled = marketplacePage <= 1;
        previousButton.addEventListener("click", () => {
            marketplacePage -= 1;
            renderMarketplace();
        });

        const pageStatus = document.createElement("span");
        pageStatus.className = "marketplace-page-status";
        pageStatus.textContent = `Trang ${marketplacePage} / ${pageCount} · ${total} đề tài`;

        const nextButton = document.createElement("button");
        nextButton.type = "button";
        nextButton.className = "marketplace-page-button";
        nextButton.textContent = "Trang sau";
        nextButton.disabled = marketplacePage >= pageCount;
        nextButton.addEventListener("click", () => {
            marketplacePage += 1;
            renderMarketplace();
        });

        marketplacePagination.append(previousButton, pageStatus, nextButton);
    }

    async function loadMarketplace() {
        if (!marketplaceCards) return;
        if (marketplaceMessage) marketplaceMessage.textContent = "Đang tải danh sách đề tài...";

        try {
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/marketplace`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            const result = await response.json();
            if (!response.ok || result.success !== true) {
                throw new Error(result.message || "Không thể tải danh sách đề tài.");
            }

            marketplaceData = {
                lecturerTopics: Array.isArray(result.data?.lecturerTopics) ? result.data.lecturerTopics : [],
                groupTopics: Array.isArray(result.data?.groupTopics) ? result.data.groupTopics : []
            };
            if (lecturerTopicCount) lecturerTopicCount.textContent = String(marketplaceData.lecturerTopics.length);
            if (groupTopicCount) groupTopicCount.textContent = String(marketplaceData.groupTopics.length);
            renderMarketplace();
        } catch (error) {
            console.error("Lỗi tải sàn đề tài:", error);
            if (marketplaceMessage) marketplaceMessage.textContent =
                error.message || "Không thể tải danh sách đề tài. Vui lòng thử lại.";
            marketplaceCards.replaceChildren();
        }
    }

    function chooseLecturerTopic(topic) {
        const leaderRole = document.querySelector('input[name="userRole"][value="LEADER"]');
        if (leaderRole) leaderRole.checked = true;
        updateRoleUI("LEADER");
        if (lecturerSelect) lecturerSelect.value = topic.lecturer_code || "";
        renderProposedTopics(topic.lecturer_code || "");
        if (proposedSelect) {
            proposedSelect.value = String(topic._id || "");
            proposedSelect.dispatchEvent(new Event("change", { bubbles: true }));
        }
        form?.scrollIntoView({ behavior: "smooth", block: "start" });
        topicTitleInput?.focus({ preventScroll: true });
    }

    async function requestToJoinGroup(topic, button) {
        button.disabled = true;
        const originalText = button.textContent;
        button.textContent = "Đang gửi yêu cầu...";
        try {
            const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/register`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    registration_role: "MEMBER",
                    leader_code: topic.leader_code,
                    member2_code: user.user_code,
                    member3_code: null
                })
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "Không thể gửi yêu cầu tham gia nhóm.");
            }
            showMessage("success", result.message || "Đã gửi yêu cầu tham gia nhóm.");
            await Promise.all([checkTopicStatus(), loadJoinRequests(), loadMarketplace()]);
        } catch (error) {
            showMessage("error", error.message || "Không thể gửi yêu cầu tham gia nhóm. Vui lòng thử lại.");
            button.disabled = false;
            button.textContent = originalText;
        }
    }

    document.querySelectorAll("[data-marketplace-tab]").forEach(tab => {
        tab.addEventListener("click", () => {
            activeMarketplaceTab = tab.dataset.marketplaceTab === "groups" ? "groups" : "lecturer";
            marketplacePage = 1;
            document.querySelectorAll("[data-marketplace-tab]").forEach(item => {
                const isActive = item === tab;
                item.classList.toggle("active", isActive);
                item.setAttribute("aria-selected", String(isActive));
            });
            renderMarketplace();
        });
    });
    marketplaceSearch?.addEventListener("input", () => {
        marketplacePage = 1;
        renderMarketplace();
    });
    marketplaceCategory?.addEventListener("change", () => {
        marketplacePage = 1;
        renderMarketplace();
    });
    document.getElementById("proposeOwnTopicBtn")?.addEventListener("click", () => {
        if (proposedSelect) proposedSelect.value = "";
        if (topicTitleInput) topicTitleInput.value = "";
        if (topicDescInput) topicDescInput.value = "";
        form?.scrollIntoView({ behavior: "smooth", block: "start" });
        topicTitleInput?.focus({ preventScroll: true });
    });

    // =========================================================================
    // 6. KIỂM TRA TRẠNG THÁI ĐĂNG KÝ ĐỀ TÀI CỦA SINH VIÊN
    // =========================================================================
    const resetToUnregisteredState = () => {
        isEditing = false;
        if (statusEl) {
            statusEl.className = "status-text status-none";
            statusEl.innerHTML = `<i class="fa-solid fa-circle"></i> Chưa đăng ký`;
        }
        
        if (lecturerSelect) lecturerSelect.value = "";
        renderProposedTopics("");

        const defaultRadio = document.querySelector('input[name="userRole"][value="LEADER"]');
        if (defaultRadio) defaultRadio.checked = true;
        updateRoleUI("LEADER");

        disableForm(false);
        if (editBtn) editBtn.style.display = "none";
        if (cancelBtn) cancelBtn.style.display = "none";
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.display = "inline-block";
            const span = submitBtn.querySelector("span");
            if (span) span.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Gửi Đăng Ký Đề Tài`;
        }
        hideMessage();
    };

    const checkTopicStatus = async () => {
        try {
            const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/student/${user.user_code}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            
            if (res.ok) {
                const topic = await res.json();
                
                if (topic && topic.status) {
                    if (lecturerSelect) lecturerSelect.value = topic.lecturer_code || "";
                    
                    renderProposedTopics(topic.lecturer_code || "");
                    
                    if (proposedSelect) proposedSelect.value = topic.proposed_topic_id || topic.proposed_topic || "";
                    if (topicTitleInput) topicTitleInput.value = topic.title || "";
                    if (topicDescInput) topicDescInput.value = topic.description || "";
                    
                    const isLeader = (topic.leader_code === user.user_code);

                    const roleRadio = document.querySelector(`input[name="userRole"][value="${isLeader ? 'LEADER' : 'MEMBER'}"]`);
                    if (roleRadio) roleRadio.checked = true;

                    await loadPartnerInfo(leaderNameEl, topic.leader_code);
                    if (!hasEditedMemberCodes) {
                        await loadPartnerInfo(partnerInput, topic.member2_code);
                        await loadPartnerInfo(member3Input, topic.member3_code);
                    }

                    if (topic.status === "JOIN_PENDING" || topic.status === "JOIN_ACCEPTED" || topic.status === "JOIN_REJECTED") {
                        updateRoleUI("MEMBER");
                        await loadPartnerInfo(leaderNameEl, topic.leader_code);
                        if (statusEl) {
                            const joinStatusClass = topic.status === "JOIN_ACCEPTED"
                                ? "status-approved"
                                : topic.status === "JOIN_REJECTED" ? "status-rejected" : "status-pending";
                            statusEl.className = `status-text ${joinStatusClass}`;
                            statusEl.innerHTML = topic.status === "JOIN_ACCEPTED"
                                ? `<i class="fa-solid fa-circle-check"></i> Trưởng nhóm đã xác nhận`
                                : topic.status === "JOIN_REJECTED"
                                    ? `<i class="fa-solid fa-circle-xmark"></i> Yêu cầu tham gia bị từ chối`
                                    : `<i class="fa-solid fa-clock"></i> Đang chờ Trưởng nhóm xác nhận`;
                        }
                        if (submitBtn) {
                            submitBtn.style.display = topic.status === "JOIN_REJECTED" ? "inline-block" : "none";
                            if (topic.status === "JOIN_REJECTED") {
                                const span = submitBtn.querySelector("span");
                                if (span) span.innerHTML = '<i class="fa-solid fa-user-plus"></i> Gửi Lại Yêu Cầu';
                            }
                        }
                        if (editBtn) editBtn.style.display = "none";
                        if (cancelBtn) cancelBtn.style.display = "none";
                        disableForm(topic.status !== "JOIN_REJECTED");
                        const joinMessageBackground = topic.status === "JOIN_ACCEPTED"
                            ? "#f0fdf4" : topic.status === "JOIN_REJECTED" ? "#fef2f2" : "#fff7ed";
                        const joinMessageBorder = topic.status === "JOIN_ACCEPTED"
                            ? "#86efac" : topic.status === "JOIN_REJECTED" ? "#fecaca" : "#fdba74";
                        const joinMessageColor = topic.status === "JOIN_ACCEPTED"
                            ? "#166534" : topic.status === "JOIN_REJECTED" ? "#b91c1c" : "#9a3412";
                        const joinMessageIcon = topic.status === "JOIN_ACCEPTED"
                            ? "fa-circle-check" : topic.status === "JOIN_REJECTED" ? "fa-circle-xmark" : "fa-circle-info";
                        showMessage("info", "", `
                            <div style="background-color: ${joinMessageBackground}; border: 1px solid ${joinMessageBorder}; color: ${joinMessageColor}; padding: 12px 16px; border-radius: 8px; font-size: 14px; margin-bottom: 15px;">
                                <i class="fa-solid ${joinMessageIcon}" style="color: ${joinMessageColor}; margin-right: 6px;"></i>
                                ${topic.status === "JOIN_ACCEPTED"
                                    ? `Trưởng nhóm <strong>${topic.leader_code}</strong> đã xác nhận bạn. Vui lòng chờ Trưởng nhóm đăng ký đề tài.`
                                    : topic.status === "JOIN_REJECTED"
                                        ? `Yêu cầu tham gia nhóm của bạn đã bị từ chối. Bạn có thể nhập mã Trưởng nhóm khác để gửi lại yêu cầu.`
                                        : `Đã gửi yêu cầu đến Trưởng nhóm <strong>${topic.leader_code}</strong>. Vui lòng chờ xác nhận.`}
                            </div>
                        `);
                        return;
                    }

                    // Xử lý UI theo trạng thái
                    if (topic.status === "PENDING") {
                        if (statusEl) {
                            statusEl.className = "status-text status-pending";
                            statusEl.innerHTML = `<i class="fa-solid fa-circle"></i> Đang chờ duyệt`;
                        }
                        disableForm(true);

                        if (isLeader) {
                            if (editBtn) editBtn.style.display = "inline-block";
                            if (cancelBtn) cancelBtn.style.display = "inline-block";
                            if (submitBtn) submitBtn.style.display = "none";
                        } else {
                            if (editBtn) editBtn.style.display = "none";
                            if (cancelBtn) cancelBtn.style.display = "none";
                            if (submitBtn) submitBtn.style.display = "none";

                            showMessage("info", "", `
                                <div style="background-color: #fffbee; border: 1px solid #fde68a; color: #b45309; padding: 12px 16px; border-radius: 8px; font-size: 14px; margin-bottom: 15px;">
                                    <i class="fa-solid fa-triangle-exclamation" style="color: #d97706; margin-right: 6px;"></i> 
                                    Bạn đang tham gia đề tài này với vai trò <strong>Thành viên</strong>. Chỉ Trưởng nhóm (<span style="color: #dc2626; font-weight: 700;">MSSV: ${topic.leader_code}</span>) mới có quyền chỉnh sửa hoặc hủy đề tài.
                                </div>
                            `);
                        }

                    } else if (topic.status === "APPROVED") {
                        if (statusEl) {
                            statusEl.className = "status-text status-approved";
                            statusEl.innerHTML = `<i class="fa-solid fa-circle"></i> Đã phê duyệt`;
                        }
                        disableForm(true);
                        if (editBtn) editBtn.style.display = "none";
                        if (cancelBtn) cancelBtn.style.display = "none";
                        if (submitBtn) {
                            submitBtn.disabled = true;
                            submitBtn.style.display = "inline-block";
                            const span = submitBtn.querySelector("span");
                            if (span) span.innerHTML = `<i class="fa-solid fa-check-double"></i> Đề Tài Đã Được Duyệt`;
                        }

                    } else if (topic.status === "NEED_REVISION" || topic.status === "REJECTED") {
                        const isRevision = topic.status === "NEED_REVISION";
                        if (statusEl) {
                            statusEl.className = isRevision ? "status-text status-pending" : "status-text status-rejected";
                            statusEl.innerHTML = `<i class="fa-solid fa-circle"></i> ${isRevision ? 'Yêu cầu chỉnh sửa' : 'Bị từ chối'}`;
                        }
                        disableForm(!isLeader);
                        if (editBtn) editBtn.style.display = "none";
                        if (cancelBtn) cancelBtn.style.display = "none";
                        if (submitBtn) {
                            submitBtn.disabled = !isLeader;
                            submitBtn.style.display = isLeader ? "inline-block" : "none";
                            const span = submitBtn.querySelector("span");
                            if (span) span.innerHTML = `<i class="fa-solid fa-rotate-right"></i> Gửi Lại Đăng Ký Đề Tài`;
                        }

                        if (topic.feedback) {
                            showMessage("error", "", `<i class="fa-solid fa-comment-dots"></i> <strong>Phản hồi từ Giảng viên:</strong> ${topic.feedback}`);
                        }
                    }
                } else {
                    resetToUnregisteredState();
                }
            } else {
                // Nếu bị lỗi 404 hoặc status khác 200 -> Coi như sinh viên chưa đăng ký
                resetToUnregisteredState();
            }
        } catch (err) {
            console.error("Lỗi kiểm tra trạng thái đề tài:", err);
            resetToUnregisteredState();
        }
    };

    async function loadJoinRequests() {
        if (!joinRequestsSection || !joinRequestsList) return;
        try {
            const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/join-requests/${encodeURIComponent(user.user_code)}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!res.ok) {
                joinRequestsSection.style.display = "none";
                return;
            }
            const data = await res.json();
            const requests = data.requests || [];
            joinRequestsSection.style.display = requests.length ? "block" : "none";
            joinRequestsList.innerHTML = requests.length
                ? requests.map(request => `
                    <div class="join-request-item">
                        <span class="join-request-member"><strong>${request.member_name || "Chưa có tên"}</strong> (${request.member_code})</span>
                        <span class="join-request-status ${request.status === "ACCEPTED" ? "is-accepted" : "is-pending"}">
                            ${request.status === "ACCEPTED" ? '<i class="fa-solid fa-circle-check"></i> Đã xác nhận' : '<i class="fa-solid fa-clock"></i> Đang chờ xác nhận'}
                        </span>
                        ${request.status === "PENDING" ? `<span class="join-request-actions">
                            <button type="button" class="btn-primary-action accept-join-btn" data-id="${request._id}" data-status="ACCEPTED">Xác nhận</button>
                            <button type="button" class="reject-join-btn" data-id="${request._id}" data-status="REJECTED"><i class="fa-solid fa-xmark"></i> Từ chối</button>
                        </span>` : ""}
                    </div>`).join("")
                : "";

            joinRequestsList.querySelectorAll("button[data-id]").forEach(button => {
                button.addEventListener("click", async () => {
                    button.disabled = true;
                    const response = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/join-requests/${encodeURIComponent(user.user_code)}/${button.dataset.id}`, {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`
                        },
                        body: JSON.stringify({ status: button.dataset.status })
                    });
                    const result = await response.json();
                    showMessage(response.ok ? "success" : "error", result.message || "Không thể xử lý yêu cầu!");
                    await Promise.all([loadJoinRequests(), loadMarketplace()]);
                });
            });
        } catch (error) {
            console.error("Lỗi tải yêu cầu tham gia nhóm:", error);
        }
    }

    // Khởi tạo tải dữ liệu danh sách
    await Promise.all([loadRegistrationWindow(), loadLecturers(), loadProposedTopics()]);
    await checkTopicStatus();
    await loadMarketplace();

    // =========================================================================
    // 7. SỰ KIỆN NÚT "CHỈNH SỬA"
    // =========================================================================
    if (editBtn) {
        editBtn.addEventListener("click", () => {
            isEditing = true;
            disableForm(false);
            editBtn.style.display = "none";
            if (cancelBtn) cancelBtn.style.display = "none";

            if (partnerInput) partnerInput.value = extractCode(partnerInput.value);
            if (member3Input) member3Input.value = extractCode(member3Input.value);

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.display = "inline-block";
                const span = submitBtn.querySelector("span");
                if (span) span.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Lưu Cập Nhật Đề Tài`;
            }

            showMessage("success", "Đã mở khóa biểu mẫu. Chỉnh sửa thông tin và nhấn 'Lưu Cập Nhật Đề Tài'.");
        });
    }

    // =========================================================================
    // 8. SỰ KIỆN HỦY ĐĂNG KÝ VÀ MODAL LOGOUT
    // =========================================================================
    if (logoutBtn && logoutModal) {
        logoutBtn.addEventListener("click", event => {
            event.preventDefault();
            logoutModal.style.display = "flex";
        });
    }
    if (cancelLogoutBtn) cancelLogoutBtn.addEventListener("click", () => { if (logoutModal) logoutModal.style.display = "none"; });
    window.addEventListener("click", event => {
        if (logoutModal && event.target === logoutModal) logoutModal.style.display = "none";
    });
    if (confirmLogoutBtn) {
        confirmLogoutBtn.addEventListener("click", () => {
            sessionStorage.clear();
            localStorage.removeItem("studentAuth");
            if (localStorage.getItem("activeRole") === "STUDENT") {
                localStorage.removeItem("activeRole");
            }
            if (localStorage.getItem("token") && JSON.parse(localStorage.getItem("user") || "null")?.role === "STUDENT") {
                localStorage.removeItem("token");
                localStorage.removeItem("user");
            }
            window.location.href = "../auth/index.html";
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            if (cancelModal) cancelModal.style.display = "flex";
        });
    }

    if (closeCancelBtn) {
        closeCancelBtn.addEventListener("click", () => {
            if (cancelModal) cancelModal.style.display = "none";
        });
    }

    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener("click", async () => {
            if (cancelModal) cancelModal.style.display = "none";
            setButtonLoading(confirmCancelBtn, true, "Xác nhận Hủy");

            try {
                const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/cancel/${user.user_code}`, {
                    method: "DELETE",
                    headers: { "Authorization": `Bearer ${token}` }
                });
                const data = await res.json();

                if (res.ok) {
                    showMessage("success", data.message || "Đã hủy đăng ký đề tài thành công!");
                    if (form) form.reset();
                    await Promise.all([checkTopicStatus(), loadMarketplace()]);
                } else {
                    showMessage("error", data.message || "Hủy đăng ký thất bại!");
                }
            } catch (err) {
                showMessage("error", "Lỗi kết nối máy chủ khi hủy đề tài!");
            } finally {
                setButtonLoading(confirmCancelBtn, false, "Xác nhận Hủy");
            }
        });
    }

    // =========================================================================
    // 9. XỬ LÝ SUBMIT FORM (ĐĂNG KÝ / LƯU CẬP NHẬT)
    // =========================================================================
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();

            const selectedRole = document.querySelector('input[name="userRole"]:checked')?.value || "LEADER";
            const rawLeaderInput = extractCode(leaderNameEl ? leaderNameEl.value : "");
            const rawPartnerInput = extractCode(partnerInput ? partnerInput.value : "");
            const rawMember3Input = extractCode(member3Input ? member3Input.value : "");
            const lecturerCode = lecturerSelect ? lecturerSelect.value : "";
            const title = topicTitleInput ? topicTitleInput.value.trim() : "";
            const description = topicDescInput ? topicDescInput.value.trim() : "";

            hideMessage();

            const enteredMemberCodes = selectedRole === "LEADER"
                ? [
                    { code: rawPartnerInput, input: partnerInput },
                    { code: rawMember3Input, input: member3Input }
                ]
                : [{ code: rawLeaderInput, input: leaderNameEl }];
            const incorrectlyCasedCode = enteredMemberCodes.find(({ code }) =>
                code && code !== code.toUpperCase()
            );
            if (incorrectlyCasedCode) {
                showMessage("error", `Mã sinh viên "${incorrectlyCasedCode.code}" không hợp lệ. Vui lòng kiểm tra và nhập đúng mã số sinh viên.`);
                incorrectlyCasedCode.input?.focus();
                return;
            }

            if (!registrationWindowOpen && (!isEditing || selectedRole === "MEMBER")) {
                showMessage("error", "Hiện không trong thời hạn đăng ký đề tài. Vui lòng theo dõi thông báo của quản trị viên.");
                return;
            }

            // Ràng buộc dữ liệu Client-side
            if (selectedRole === "MEMBER" && !rawLeaderInput) {
                showMessage("error", "Vui lòng nhập chính xác MSSV của Trưởng nhóm!");
                if (leaderNameEl) leaderNameEl.focus();
                return;
            }

            if (selectedRole === "MEMBER" && rawLeaderInput.toUpperCase() === user.user_code.toUpperCase()) {
                showMessage("error", "Mã Trưởng nhóm không được trùng với mã sinh viên của bạn!");
                if (leaderNameEl) leaderNameEl.focus();
                return;
            }

            if (selectedRole === "LEADER" && !lecturerCode) {
                showMessage("error", "Vui lòng chọn Giảng viên hướng dẫn!");
                if (lecturerSelect) lecturerSelect.focus();
                return;
            }

            if (selectedRole === "LEADER" && !title) {
                showMessage("error", "Vui lòng nhập Tên đề tài!");
                if (topicTitleInput) topicTitleInput.focus();
                return;
            }

            if (selectedRole === "LEADER") {
                const ownCode = String(user.user_code || "").trim().toUpperCase();
                if (rawPartnerInput.toUpperCase() === ownCode || rawMember3Input.toUpperCase() === ownCode) {
                    showMessage("error", "Mã sinh viên của bạn đã là Trưởng nhóm, không thể đăng ký thêm ở Thành viên 2 hoặc 3.");
                    (rawPartnerInput.toUpperCase() === ownCode ? partnerInput : member3Input)?.focus();
                    return;
                }
            }

            const leaderCode = selectedRole === "LEADER" ? user.user_code : rawLeaderInput;
            const member2Code = selectedRole === "LEADER" ? (rawPartnerInput !== "" ? rawPartnerInput : null) : user.user_code;
            const member3Code = selectedRole === "LEADER" ? (rawMember3Input !== "" ? rawMember3Input : null) : null;

            const bodyData = {
                leader_code: leaderCode,
                member2_code: member2Code,
                member3_code: member3Code,
                registration_role: selectedRole,
                proposed_topic_id: proposedSelect ? proposedSelect.value : null,
                lecturer_code: lecturerCode,
                title: title,
                description: description
            };

            const originalSubmitBtnText = submitBtn?.querySelector("span")?.innerHTML || "Gửi Đăng Ký Đề Tài";
            setButtonLoading(submitBtn, true, originalSubmitBtnText);

            try {
                const res = await apiFetch(window.APP_CONFIG.API_BASE_URL + "/api/topics/register", {
                    method: "POST",
                    headers: { 
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}` 
                    },
                    body: JSON.stringify(bodyData)
                });

                const data = await res.json();

                if (res.ok) {
                    showMessage("success", data.message || "Lưu thông tin đăng ký đề tài thành công!");
                    hasEditedMemberCodes = false;
                    await Promise.all([checkTopicStatus(), loadMarketplace()]);
                } else {
                    showMessage("error", data.message || "Thao tác đăng ký thất bại!");
                }
            } catch (err) {
                showMessage("error", "Lỗi kết nối đến máy chủ! Vui lòng thử lại sau.");
            } finally {
                setButtonLoading(submitBtn, false, originalSubmitBtnText);
            }
        });
    }

    await loadJoinRequests();
});