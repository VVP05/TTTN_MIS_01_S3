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
    // 2. KHAI BÁO BIẾN TRẠNG THÁI & DOM ELEMENTS
    // =========================================================================
    let studentHasRegisteredTopic = false;
    let studentRegisteredTopicData = null;
    let isEditing = false;
    let hasEditedMemberCodes = false;
    let allPoolTopics = [];
    let allLecturers = [];
    let registrationWindowOpen = false;
    let currentRegistrationStatusData = null;
    let marketplaceData = { lecturerTopics: [], groupTopics: [] };
    let myRecruitmentOpen = false;
    let canPublishRecruitment = false;
    let activeMarketplaceTab = "lecturer";
    let marketplacePage = 1;
    const marketplacePageSize = 10;

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
    const groupMembersSection = document.getElementById("groupMembersSection");
    const formActionsBar = form?.querySelector(".form-actions-bar");
    const roleRadios = document.querySelectorAll('input[name="userRole"]');
    const leaderRoleCard = document.getElementById("roleCardLeader");
    const memberRoleCard = document.getElementById("roleCardMember");
    const memberRoleRadio = document.querySelector('input[name="userRole"][value="MEMBER"]');
    const leaderRoleRadio = document.querySelector('input[name="userRole"][value="LEADER"]');
    const leaderLabel = document.getElementById("leaderLabel");
    const partnerInput = document.getElementById("partnerCodeInput");
    const member3Input = document.getElementById("member3CodeInput");
    const member2Field = document.getElementById("member2Field");
    const member3Field = document.getElementById("member3Field");
    const joinRequestsSection = document.getElementById("joinRequestsSection");
    const joinRequestsList = document.getElementById("joinRequestsList");
    const proposedSelect = document.getElementById("proposedTopic");
    const lecturerSelect = document.getElementById("lecturerCode");
    const lecturerSearch = document.getElementById("lecturerSearch");
    const lecturerPicker = document.getElementById("lecturerPicker");
    const lecturerPickerToggle = document.getElementById("lecturerPickerToggle");
    const lecturerOptions = document.getElementById("lecturerOptions");
    const topicTitleInput = document.getElementById("topicTitle");
    const topicDescInput = document.getElementById("topicDescription");
    const topicDetailsSection = document.getElementById("topicDetailsSection");
    const topicDetailsSubheading = topicDetailsSection?.querySelector(".section-subheading");
    const memberRoleNote = document.getElementById("memberRoleNote");

    // Action Buttons & Status UI
    const editBtn = document.getElementById("editBtn");
    const cancelBtn = document.getElementById("cancelBtn");
    const submitBtn = document.getElementById("submitBtn");
    const msgBox = document.getElementById("formMessage");
    const statusEl = document.getElementById("topicStatus");
    const topicStatusPill = document.getElementById("topicStatusPill");
    const registrationWindowNotice = document.getElementById("registrationWindowNotice");
    const marketplaceCards = document.getElementById("marketplaceCards");
    const marketplaceMessage = document.getElementById("marketplaceMessage");
    const marketplacePagination = document.getElementById("marketplacePagination");
    const marketplaceSearch = document.getElementById("marketplaceSearch");
    const marketplaceCategory = document.getElementById("marketplaceCategory");
    const lecturerTopicCount = document.getElementById("lecturerTopicCount");
    const groupTopicCount = document.getElementById("groupTopicCount");
    const groupRecruitmentBtn = document.getElementById("groupRecruitmentBtn");
    const proposeOwnTopicBtn = document.getElementById("proposeOwnTopicBtn");

    // Modal Cancel Elements
    const cancelModal = document.getElementById("cancelModal");
    const closeCancelBtn = document.getElementById("closeCancelBtn");
    const confirmCancelBtn = document.getElementById("confirmCancelBtn");
    const removeMemberModal = document.getElementById("removeMemberModal");
    const cancelRemoveMemberBtn = document.getElementById("cancelRemoveMemberBtn");
    const confirmRemoveMemberBtn = document.getElementById("confirmRemoveMemberBtn");
    let resolveRemoveMemberConfirmation = null;

    function finishRemoveMemberConfirmation(confirmed) {
        if (removeMemberModal) removeMemberModal.style.display = "none";
        const resolve = resolveRemoveMemberConfirmation;
        resolveRemoveMemberConfirmation = null;
        if (resolve) resolve(confirmed);
    }

    function requestRemoveMemberConfirmation() {
        if (!removeMemberModal || !cancelRemoveMemberBtn || !confirmRemoveMemberBtn) {
            showMessage("error", "Không thể mở hộp xác nhận loại thành viên.");
            return Promise.resolve(false);
        }

        removeMemberModal.style.display = "flex";
        confirmRemoveMemberBtn.focus();
        return new Promise(resolve => {
            resolveRemoveMemberConfirmation = resolve;
        });
    }

    cancelRemoveMemberBtn?.addEventListener("click", () => finishRemoveMemberConfirmation(false));
    confirmRemoveMemberBtn?.addEventListener("click", () => finishRemoveMemberConfirmation(true));
    removeMemberModal?.addEventListener("click", event => {
        if (event.target === removeMemberModal) finishRemoveMemberConfirmation(false);
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && removeMemberModal?.style.display === "flex") {
            finishRemoveMemberConfirmation(false);
        }
    });

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
        if (message && typeof window.showAppNotification === "function") {
            window.showAppNotification(message, type);
        }
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
            currentRegistrationStatusData = data;
            registrationWindowOpen = data.is_open === true;

            // Thống nhất cách viết Học kỳ & đồng bộ tên học kỳ từ CSDL
            const semesterText = document.getElementById("heroSemesterText");
            if (semesterText) {
                if (data.semester?.name) {
                    let semName = String(data.semester.name).replace(/Học kì/g, "Học kỳ");
                    semesterText.textContent = semName;
                } else {
                    semesterText.textContent = "Chưa có học kỳ";
                }
            }

            // Gộp banner hạn đăng ký vào hero header (dòng phụ với icon đồng hồ)
            if (registrationWindowNotice) {
                // Nếu nhóm đã có đề tài và đã được phê duyệt, ẩn hoàn toàn thông báo thời hạn đăng ký
                if (studentRegisteredTopicData?.status === "APPROVED") {
                    registrationWindowNotice.hidden = true;
                    return;
                }

                const isUpcoming = !registrationWindowOpen && data.state === "upcoming";
                registrationWindowNotice.hidden = false;
                registrationWindowNotice.classList.toggle("is-open", registrationWindowOpen);
                registrationWindowNotice.classList.toggle("is-upcoming", isUpcoming);
                registrationWindowNotice.classList.toggle("is-closed", !registrationWindowOpen && !isUpcoming);

                if (registrationWindowOpen && data.semester?.registration_end_date) {
                    const endDate = new Date(data.semester.registration_end_date);
                    const endFormat = data.semester.registration_window_has_time
                        ? { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }
                        : { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" };
                    registrationWindowNotice.innerHTML = `<i class="fa-regular fa-clock" aria-hidden="true"></i> <span>Hạn cuối đăng ký đề tài: <strong>${endDate.toLocaleString("vi-VN", endFormat)}</strong></span>`;
                } else if (isUpcoming && data.semester?.registration_start_date) {
                    const startDate = new Date(data.semester.registration_start_date);
                    const startFormat = data.semester.registration_window_has_time
                        ? { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }
                        : { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" };
                    registrationWindowNotice.innerHTML = `<i class="fa-regular fa-calendar" aria-hidden="true"></i> <span>Hệ thống sẽ mở đăng ký đề tài vào lúc: <strong>${startDate.toLocaleString("vi-VN", startFormat)}</strong></span>`;
                } else {
                    registrationWindowNotice.innerHTML = `<i class="fa-solid fa-lock" aria-hidden="true"></i> <span>Hiện không trong thời hạn đăng ký đề tài</span>`;
                }
            }

            // Đồng bộ lại tin tức chữ chạy theo thời hạn đăng ký thực tế
            if (!studentRegisteredTopicData || studentRegisteredTopicData.status !== "APPROVED") {
                updateStudentTicker(studentRegisteredTopicData ? studentRegisteredTopicData.status : "");
            }
        } catch (error) {
            registrationWindowOpen = false;
            currentRegistrationStatusData = null;
            if (registrationWindowNotice) {
                registrationWindowNotice.hidden = false;
                registrationWindowNotice.classList.add("is-closed");
                registrationWindowNotice.innerHTML = `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> <span>Không thể xác minh thời hạn đăng ký</span>`;
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
        syncLecturerPickerDisabled();
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

        if (selectedLecturerCode === "UNASSIGNED") {
            const option = document.createElement("option");
            option.value = "";
            option.textContent = "-- Tự nhập tên đề tài dự kiến bên dưới --";
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
                    lecturerSelect.innerHTML = `<option value="">-- Chọn Giảng viên hướng dẫn --</option><option value="UNASSIGNED">-- Chưa có GVHD (Nhờ Khoa phân công) --</option>`;
                    allLecturers.forEach(lecturer => {
                        const option = document.createElement("option");
                        option.value = lecturer.code;
                        option.textContent = `${lecturer.name} (${lecturer.code})`;
                        lecturerSelect.appendChild(option);
                    });
                    if (lecturerSearch) lecturerSearch.disabled = false;
                    if (lecturerPickerToggle) lecturerPickerToggle.disabled = false;
                    syncLecturerPicker();
                } else {
                    allLecturers = [];
                    lecturerSelect.innerHTML = `<option value="">-- Chưa có dữ liệu giảng viên --</option>`;
                    if (lecturerSearch) lecturerSearch.disabled = true;
                    if (lecturerPickerToggle) lecturerPickerToggle.disabled = true;
                    syncLecturerPicker();
                }
            } else {
                console.error("Lỗi HTTP khi tải danh sách giảng viên:", res.status, res.statusText);
                lecturerSelect.innerHTML = `<option value="">-- Không thể tải danh sách giảng viên (Lỗi ${res.status}) --</option>`;
                if (lecturerSearch) lecturerSearch.disabled = true;
                if (lecturerPickerToggle) lecturerPickerToggle.disabled = true;
                syncLecturerPicker();
            }
        } catch (err) {
            console.error("Lỗi tải danh sách giảng viên:", err);
            lecturerSelect.innerHTML = `<option value="">-- Lỗi kết nối máy chủ --</option>`;
            if (lecturerSearch) lecturerSearch.disabled = true;
            if (lecturerPickerToggle) lecturerPickerToggle.disabled = true;
            syncLecturerPicker();
        }
    };

    const normalizeLecturerSearch = value => String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .toLowerCase()
        .trim();

    let activeLecturerOptionIndex = -1;

    const getSelectedLecturerLabel = () => {
        const selectedCode = lecturerSelect?.value || "";
        if (selectedCode === "UNASSIGNED") return "-- Chưa có GVHD (Nhờ Khoa phân công) --";
        const selectedLecturer = allLecturers.find(lecturer => lecturer.code === selectedCode);
        if (selectedLecturer) return `${selectedLecturer.name} (${selectedLecturer.code})`;
        return lecturerSelect?.selectedOptions?.[0]?.textContent || "";
    };

    const closeLecturerPicker = (restoreSelection = true) => {
        if (!lecturerPicker || !lecturerSearch || !lecturerOptions) return;
        lecturerPicker.classList.remove("is-open");
        lecturerOptions.hidden = true;
        lecturerSearch.setAttribute("aria-expanded", "false");
        lecturerPickerToggle?.setAttribute("aria-expanded", "false");
        lecturerPickerToggle?.setAttribute("aria-label", "Hiện danh sách giảng viên");
        lecturerSearch.removeAttribute("aria-activedescendant");
        if (restoreSelection) lecturerSearch.value = getSelectedLecturerLabel();
    };

    const syncLecturerPicker = () => {
        if (lecturerSearch) lecturerSearch.value = getSelectedLecturerLabel();
        closeLecturerPicker(false);
    };

    const setActiveLecturerOption = index => {
        if (!lecturerOptions || !lecturerSearch) return;
        const options = Array.from(lecturerOptions.querySelectorAll('[role="option"]:not([aria-disabled="true"])'));
        if (options.length === 0) return;
        activeLecturerOptionIndex = (index % options.length + options.length) % options.length;
        options.forEach(option => option.classList.remove("active"));
        const activeOption = options[activeLecturerOptionIndex];
        activeOption.classList.add("active");
        lecturerSearch.setAttribute("aria-activedescendant", activeOption.id);
        activeOption.scrollIntoView({ block: "nearest" });
    };

    const chooseLecturer = code => {
        if (!lecturerSelect) return;
        lecturerSelect.value = code;
        closeLecturerPicker();
        lecturerSelect.dispatchEvent(new Event("change", { bubbles: true }));
    };

    const renderLecturerOptions = query => {
        if (!lecturerOptions || !lecturerSelect) return;
        const normalizedQuery = normalizeLecturerSearch(query);
        lecturerOptions.replaceChildren();

        const appendOption = (code, label) => {
            const option = document.createElement("div");
            option.className = "lecturer-picker-option";
            option.id = `lecturer-option-${lecturerOptions.children.length}`;
            option.setAttribute("role", "option");
            option.setAttribute("aria-selected", String(lecturerSelect.value === code));
            option.textContent = label;
            if (lecturerSelect.value === code) option.classList.add("selected");
            option.addEventListener("mousedown", event => event.preventDefault());
            option.addEventListener("click", () => chooseLecturer(code));
            lecturerOptions.appendChild(option);
        };

        appendOption("UNASSIGNED", "-- Chưa có GVHD (Nhờ Khoa phân công) --");
        const matchingLecturers = allLecturers.filter(lecturer =>
            normalizeLecturerSearch(`${lecturer.name} ${lecturer.code}`).includes(normalizedQuery)
        );
        matchingLecturers.forEach(lecturer =>
            appendOption(lecturer.code, `${lecturer.name} (${lecturer.code})`)
        );
        if (normalizedQuery && matchingLecturers.length === 0) {
            const emptyMessage = document.createElement("div");
            emptyMessage.className = "lecturer-picker-option";
            emptyMessage.setAttribute("role", "option");
            emptyMessage.setAttribute("aria-disabled", "true");
            emptyMessage.textContent = "Không tìm thấy giảng viên phù hợp";
            lecturerOptions.appendChild(emptyMessage);
        }

        activeLecturerOptionIndex = -1;
        const selectedOption = lecturerOptions.querySelector('[aria-selected="true"]');
        if (selectedOption) {
            setActiveLecturerOption(Array.from(
                lecturerOptions.querySelectorAll('[role="option"]:not([aria-disabled="true"])')
            ).indexOf(selectedOption));
        }
    };

    const openLecturerPicker = clearSearch => {
        if (!lecturerPicker || !lecturerSearch || !lecturerOptions || lecturerSearch.disabled) return;
        if (clearSearch) lecturerSearch.value = "";
        lecturerPicker.classList.add("is-open");
        lecturerOptions.hidden = false;
        lecturerSearch.setAttribute("aria-expanded", "true");
        lecturerPickerToggle?.setAttribute("aria-expanded", "true");
        lecturerPickerToggle?.setAttribute("aria-label", "Ẩn danh sách giảng viên");
        renderLecturerOptions(lecturerSearch.value);
    };

    if (lecturerSearch && lecturerOptions) {
        lecturerSearch.addEventListener("focus", () => {
            if (lecturerOptions.hidden) openLecturerPicker(true);
        });
        lecturerSearch.addEventListener("input", () => {
            if (lecturerOptions.hidden) openLecturerPicker(false);
            else renderLecturerOptions(lecturerSearch.value);
        });
        lecturerSearch.addEventListener("keydown", event => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (lecturerOptions.hidden) openLecturerPicker(true);
                setActiveLecturerOption(activeLecturerOptionIndex + (event.key === "ArrowDown" ? 1 : -1));
            } else if (event.key === "Enter" && !lecturerOptions.hidden && activeLecturerOptionIndex >= 0) {
                event.preventDefault();
                lecturerOptions.querySelector(".lecturer-picker-option.active")?.click();
            } else if (event.key === "Enter" && !lecturerOptions.hidden) {
                event.preventDefault();
            } else if (event.key === "Escape" && !lecturerOptions.hidden) {
                event.preventDefault();
                closeLecturerPicker();
            } else if (event.key === "Tab") {
                closeLecturerPicker();
            }
        });
    }

    if (lecturerPickerToggle) {
        lecturerPickerToggle.addEventListener("click", () => {
            if (lecturerOptions?.hidden) {
                lecturerSearch?.focus();
                openLecturerPicker(true);
            } else {
                closeLecturerPicker();
            }
        });
    }

    document.addEventListener("pointerdown", event => {
        if (lecturerPicker && !lecturerPicker.contains(event.target) && lecturerOptions && !lecturerOptions.hidden) {
            closeLecturerPicker();
        }
    });

    const syncLecturerPickerDisabled = () => {
        const disabled = Boolean(lecturerSelect?.disabled) || allLecturers.length === 0;
        if (lecturerSearch) lecturerSearch.disabled = disabled;
        if (lecturerPickerToggle) lecturerPickerToggle.disabled = disabled;
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
    function setMemberRoleLocked(locked) {
        if (memberRoleRadio) {
            memberRoleRadio.disabled = locked;
        }
        if (memberRoleCard) {
            memberRoleCard.classList.toggle("role-card-disabled", locked);
            memberRoleCard.setAttribute("aria-disabled", String(locked));
            memberRoleCard.title = locked
                ? "Không thể chuyển sang vai trò Thành viên sau khi đã xác nhận thành viên"
                : "";
        }
        if (locked && memberRoleRadio?.checked) {
            if (leaderRoleRadio) leaderRoleRadio.checked = true;
            updateRoleUI("LEADER");
        }
    }

    const updateRoleUI = (role, showSubmittedTopic = false) => {
        const isMemberRole = role === "MEMBER";
        roleRadios.forEach(radio => {
            const isSelected = radio.value === role;
            radio.checked = isSelected;
            radio.closest(".role-card")?.classList.toggle("selected", isSelected);
        });
        if (leaderRoleCard) leaderRoleCard.setAttribute("aria-checked", String(!isMemberRole));
        if (memberRoleCard) memberRoleCard.setAttribute("aria-checked", String(isMemberRole));

        if (member2Field) member2Field.style.display = isMemberRole ? "none" : "block";
        if (member3Field) member3Field.style.display = isMemberRole ? "none" : "block";
        if (leaderNameEl) leaderNameEl.closest('.form-group')?.style.setProperty('display', 'block');

        if (isMemberRole) {
            if (topicDetailsSection) topicDetailsSection.style.display = showSubmittedTopic ? "" : "none";
            if (topicDetailsSubheading) {
                topicDetailsSubheading.textContent = showSubmittedTopic
                    ? "Thông tin đề tài do Trưởng nhóm đăng ký — chế độ chỉ xem"
                    : "Điền tên đề tài, chọn giảng viên hướng dẫn và mô tả nội dung";
            }
            if (memberRoleNote) memberRoleNote.style.display = showSubmittedTopic ? "none" : "block";
            if (submitBtn) submitBtn.querySelector("span").innerHTML = '<i class="fa-solid fa-user-plus"></i> Tham Gia Nhóm';
            if (lecturerSelect) lecturerSelect.disabled = true;
            if (proposedSelect) proposedSelect.disabled = true;
            if (!showSubmittedTopic && lecturerSelect) lecturerSelect.value = "";
            if (!showSubmittedTopic && proposedSelect) proposedSelect.value = "";
            if (!showSubmittedTopic && topicTitleInput) topicTitleInput.value = "";
            if (topicTitleInput) topicTitleInput.disabled = true;
            if (!showSubmittedTopic && topicDescInput) topicDescInput.value = "";
            if (topicDescInput) topicDescInput.disabled = true;
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
            if (topicDetailsSubheading) {
                topicDetailsSubheading.textContent = "Điền tên đề tài, chọn giảng viên hướng dẫn và mô tả nội dung";
            }
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
                partnerInput.placeholder = "Nhập MSSV Thành viên 2...";
                partnerInput.disabled = false;
            }
            if (member3Input) {
                member3Input.placeholder = "Nhập MSSV Thành viên 3...";
                member3Input.disabled = false;
            }
        }
        syncLecturerPickerDisabled();
        syncLecturerPicker();
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
            syncLecturerPicker();
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
                if (lecturerSelect && lecturerCode) {
                    lecturerSelect.value = lecturerCode;
                    syncLecturerPicker();
                }
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

    /**
     * Modal xem nhanh chi tiết đề tài
     */
    /**
     * Modal xem nhanh chi tiết đề tài (Thiết kế hiện đại, đồng bộ màu lĩnh vực)
     */
    function showTopicDetailModal(topic) {
        let modal = document.getElementById("topicDetailModal");
        if (!modal) {
            modal = document.createElement("div");
            modal.id = "topicDetailModal";
            modal.className = "modal-overlay";
            modal.innerHTML = `
                <div class="modal-box topic-detail-modal-box">
                    <div class="modal-top-accent"></div>
                    <div class="modal-header-section">
                        <div class="modal-header-left">
                            <div id="modalCatIcon" class="modal-cat-icon"></div>
                            <span id="topicDetailCatChip" class="modal-cat-chip"></span>
                        </div>
                        <button type="button" id="closeTopicDetailBtn" class="modal-close-btn" aria-label="Đóng">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div class="modal-body-content">
                        <h3 id="topicDetailTitle" class="modal-topic-title"></h3>
                        <div class="modal-lecturer-card">
                            <div class="modal-lecturer-left">
                                <span id="modalLecturerAvatar" class="modal-lecturer-avatar"></span>
                                <div>
                                    <div class="modal-lecturer-role">Giảng viên hướng dẫn</div>
                                    <div id="modalLecturerName" class="modal-lecturer-name"></div>
                                </div>
                            </div>
                            <span class="modal-slot-pill">
                                <span class="modal-slot-dot"></span>
                                <span id="modalSlotText">Đang mở đăng ký</span>
                            </span>
                        </div>
                        <div class="modal-section">
                            <div class="modal-section-title">
                                <i class="fa-solid fa-align-left"></i> Mô tả chi tiết đề tài
                            </div>
                            <div id="topicDetailDesc" class="modal-section-box"></div>
                        </div>
                        <div id="topicDetailReqWrap" class="modal-section" style="display: none;">
                            <div class="modal-section-title" style="color: #D97706;">
                                <i class="fa-solid fa-list-check"></i> Yêu cầu đề tài
                            </div>
                            <div id="topicDetailReq" class="modal-section-box modal-section-req"></div>
                        </div>
                    </div>
                    <div class="modal-footer-section">
                        <button type="button" id="confirmCloseTopicDetailBtn" class="btn-modal-close">
                            <i class="fa-solid fa-check"></i> Đã hiểu &amp; Đóng
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            modal.querySelector("#closeTopicDetailBtn").addEventListener("click", () => modal.style.display = "none");
            modal.querySelector("#confirmCloseTopicDetailBtn").addEventListener("click", () => modal.style.display = "none");
            modal.addEventListener("click", (e) => {
                if (e.target === modal) modal.style.display = "none";
            });
        }

        // 1. Phân loại lĩnh vực (Web, AI, Data, Khác) đồng bộ màu sắc
        const rawCat = String(topic.category || "").toLowerCase();
        let catKey = "other";
        let catIcon = "fa-layer-group";
        let catLabel = topic.category || "Lĩnh vực khác";

        if (rawCat.includes("web") || rawCat.includes("ứng dụng") || rawCat.includes("app")) {
            catKey = "web";
            catIcon = "fa-globe";
            catLabel = "Web / Ứng dụng";
        } else if (rawCat.includes("ai") || rawCat.includes("ml") || rawCat.includes("trí tuệ") || rawCat.includes("máy")) {
            catKey = "ai";
            catIcon = "fa-microchip";
            catLabel = "AI / ML";
        } else if (rawCat.includes("dữ liệu") || rawCat.includes("data") || rawCat.includes("phân tích")) {
            catKey = "data";
            catIcon = "fa-chart-pie";
            catLabel = "Dữ liệu / Phân tích";
        }

        const modalBox = modal.querySelector(".topic-detail-modal-box");
        modalBox.className = `modal-box topic-detail-modal-box cat-${catKey}`;

        modal.querySelector("#modalCatIcon").innerHTML = `<i class="fa-solid ${catIcon}"></i>`;
        const catChipEl = modal.querySelector("#topicDetailCatChip");
        catChipEl.textContent = "";
        const iconI = document.createElement("i");
        iconI.className = `fa-solid ${catIcon}`;
        catChipEl.append(iconI, document.createTextNode(` ${catLabel}`));
        modal.querySelector("#topicDetailTitle").textContent = topic.title || "Chi tiết đề tài";
        modal.querySelector("#topicDetailDesc").textContent = topic.description || "Chưa có mô tả cho đề tài này.";

        const lecturerName = topic.lecturer_name || topic.lecturer_code || "Giảng viên hướng dẫn";
        const avatarLetter = (lecturerName.trim().charAt(0) || "G").toUpperCase();
        modal.querySelector("#modalLecturerAvatar").textContent = avatarLetter;
        modal.querySelector("#modalLecturerName").textContent = lecturerName;

        // Slot hiển thị
        let remSlots = 1;
        if (typeof topic.open_slots === "number") {
            remSlots = Number(topic.open_slots) || 0;
        } else {
            const regCount = Number(topic.registered_groups) || 0;
            const totalSlots = Number(topic.max_groups) || 1;
            remSlots = topic.remaining_groups !== undefined ? Number(topic.remaining_groups) : Math.max(0, totalSlots - regCount);
        }
        const slotTextEl = modal.querySelector("#modalSlotText");
        if (slotTextEl) {
            slotTextEl.textContent = remSlots > 0 ? `Còn ${remSlots} slot đăng ký` : "Đã đủ nhóm";
        }

        const reqWrap = modal.querySelector("#topicDetailReqWrap");
        if (topic.requirements) {
            reqWrap.style.display = "block";
            modal.querySelector("#topicDetailReq").textContent = topic.requirements;
        } else {
            reqWrap.style.display = "none";
        }

        modal.style.display = "flex";
    }

    function createMarketplaceCard(topic, isGroupTopic) {
        const card = document.createElement("article");

        // 1. Phân loại lĩnh vực (Web, AI, Data, Khác)
        const rawCat = String(topic.category || "").toLowerCase();
        let catKey = "other";
        let catIcon = "fa-layer-group";
        let catLabel = topic.category || "Lĩnh vực khác";

        if (rawCat.includes("web") || rawCat.includes("ứng dụng") || rawCat.includes("app")) {
            catKey = "web";
            catIcon = "fa-globe";
            catLabel = "Web / Ứng dụng";
        } else if (rawCat.includes("ai") || rawCat.includes("ml") || rawCat.includes("trí tuệ") || rawCat.includes("máy")) {
            catKey = "ai";
            catIcon = "fa-microchip";
            catLabel = "AI / ML";
        } else if (rawCat.includes("dữ liệu") || rawCat.includes("data") || rawCat.includes("phân tích")) {
            catKey = "data";
            catIcon = "fa-chart-pie";
            catLabel = "Dữ liệu / Phân tích";
        }
        card.className = `marketplace-card cat-${catKey}`;

        // 2. Tiêu đề & mô tả
        const titleText = topic.pre_registration
            ? `Nhóm của ${topic.leader_name || "Trưởng nhóm"}`
            : topic.title || "Đề tài chưa có tên";
        const descText = topic.pre_registration
            ? "Nhóm đang tìm thành viên trước khi đăng ký đề tài."
            : topic.description || "Chưa có mô tả cho đề tài này.";

        const lecturerOrLeaderName = isGroupTopic
            ? (topic.leader_name || topic.leader_code || "Trưởng nhóm")
            : (topic.lecturer_name || topic.lecturer_code || "Giảng viên");
        const avatarLetter = (lecturerOrLeaderName.trim().charAt(0) || "G").toUpperCase();

        // 1. HÀNG ĐẦU: Ô icon lĩnh vực (40px) + chip lĩnh vực cùng một hàng
        const topRow = document.createElement("div");
        topRow.className = "card-top-row";

        const iconBox = document.createElement("div");
        iconBox.className = "card-cat-icon";
        iconBox.innerHTML = `<i class="fa-solid ${catIcon}" aria-hidden="true"></i>`;

        const chipCat = document.createElement("span");
        chipCat.className = "chip-cat";
        chipCat.textContent = catLabel;

        topRow.append(iconBox, chipCat);

        // Badge nếu nhóm tuyển trước đăng ký
        if (isGroupTopic && topic.pre_registration) {
            const preBadge = document.createElement("span");
            preBadge.className = "chip-cat";
            preBadge.style.background = "#FEF3C7";
            preBadge.style.color = "#92400E";
            preBadge.style.borderColor = "#FDE68A";
            preBadge.textContent = "Tuyển trước đăng ký";
            topRow.appendChild(preBadge);
        }
        card.appendChild(topRow);

        // 2. TIẾP THEO: TÊN ĐỀ TÀI (16px/600, line-clamp 3 dòng, tooltip xem đầy đủ, thẳng mép trái)
        const titleEl = document.createElement("h3");
        titleEl.className = "marketplace-card-title";
        titleEl.textContent = titleText;
        titleEl.title = titleText;
        card.appendChild(titleEl);

        // 3. TIẾP THEO: MÔ TẢ (line-clamp 3 dòng, tooltip xem đầy đủ, thẳng mép trái)
        const descEl = document.createElement("p");
        descEl.className = "marketplace-card-desc";
        descEl.textContent = descText;
        descEl.title = descText;
        card.appendChild(descEl);

        // Yêu cầu nếu có (phụ trợ)
        if (topic.requirements) {
            const reqEl = document.createElement("div");
            reqEl.className = "card-req-row";
            reqEl.innerHTML = `<i class="fa-solid fa-list-check" style="margin-right: 6px;"></i><strong>Yêu cầu:</strong> ${topic.requirements}`;
            reqEl.title = topic.requirements;
            card.appendChild(reqEl);
        }

        // 4. TIẾP THEO: DÒNG GIẢNG VIÊN (avatar nhỏ + tên, 13px, thẳng mép trái)
        const lecturerRow = document.createElement("div");
        lecturerRow.className = "card-lecturer-row";
        lecturerRow.innerHTML = `
            <span class="lecturer-avatar">${avatarLetter}</span>
            <span class="lecturer-name">${isGroupTopic ? 'Trưởng nhóm: ' : ''}${lecturerOrLeaderName}</span>
        `;
        card.appendChild(lecturerRow);

        // 5. TIẾP THEO: SỐ SLOT CÒN LẠI
        let remSlots = 1;
        let slotIcon = isGroupTopic ? "fa-user-group" : "fa-users-rectangle";

        if (isGroupTopic && typeof topic.open_slots === "number") {
            remSlots = Number(topic.open_slots) || 0;
        } else if (!isGroupTopic) {
            const regCount = Number(topic.registered_groups) || 0;
            const totalSlots = Number(topic.max_groups) || 1;
            remSlots = topic.remaining_groups !== undefined ? Number(topic.remaining_groups) : Math.max(0, totalSlots - regCount);
        }

        const slotWrap = document.createElement("div");
        slotWrap.className = "card-slot-wrap";
        slotWrap.innerHTML = `
            <span class="card-slot-label"><i class="fa-solid ${slotIcon}"></i>Còn ${remSlots} slot</span>
        `;
        card.appendChild(slotWrap);

        // 6. CHÂN THẺ: Trạng thái bên trái; Bên phải nút "Xem chi tiết" (viền nhẹ) khi đã có đăng ký, hoặc nút "Đăng ký" (primary) khi chưa có
        const footer = document.createElement("div");
        footer.className = "marketplace-card-footer";

        const statusEl = document.createElement("span");
        statusEl.className = "marketplace-card-status";

        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "marketplace-card-action";

        const hasAlreadyRegistered = studentHasRegisteredTopic || (!topic.can_register_as_leader && !isGroupTopic);

        if (isGroupTopic) {
            statusEl.textContent = topic.status === "APPROVED"
                ? "Nhóm đã chốt"
                : `Còn ${topic.open_slots} vị trí`;
            const requestStatus = String(topic.request_status || "").toUpperCase();

            if (requestStatus === "PENDING") {
                actionBtn.textContent = "Đang chờ xác nhận";
                actionBtn.disabled = true;
                footer.append(statusEl, actionBtn);
            } else if (requestStatus === "ACCEPTED") {
                actionBtn.textContent = "Đã vào nhóm";
                actionBtn.disabled = true;
                footer.append(statusEl, actionBtn);
            } else if (!topic.can_join) {
                actionBtn.textContent = topic.cannot_join_reason
                    ? "Không thể tham gia"
                    : "Không thể đăng ký";
                if (topic.cannot_join_reason) actionBtn.title = topic.cannot_join_reason;
                actionBtn.disabled = true;
                footer.append(statusEl, actionBtn);
            } else if (!registrationWindowOpen) {
                actionBtn.textContent = "Ngoài hạn";
                actionBtn.disabled = true;
                footer.append(statusEl, actionBtn);
            } else {
                actionBtn.textContent = "Xin vào nhóm";
                actionBtn.addEventListener("click", () => requestToJoinGroup(topic, actionBtn));
                footer.append(statusEl, actionBtn);
            }
        } else {
            statusEl.textContent = "Đang mở đăng ký";

            if (hasAlreadyRegistered) {
                // Khi sinh viên đã có đăng ký: nút "Xem chi tiết" (viền nhẹ)
                const detailBtn = document.createElement("button");
                detailBtn.type = "button";
                detailBtn.className = "btn-view-detail";
                detailBtn.innerHTML = `<i class="fa-regular fa-eye"></i> Xem chi tiết`;
                detailBtn.addEventListener("click", () => showTopicDetailModal(topic));
                footer.append(statusEl, detailBtn);
            } else if (!registrationWindowOpen) {
                actionBtn.textContent = "Ngoài hạn";
                actionBtn.disabled = true;
                footer.append(statusEl, actionBtn);
            } else {
                // Khi chưa có đăng ký: nút "Đăng ký" primary
                actionBtn.textContent = "Đăng ký";
                actionBtn.addEventListener("click", () => chooseLecturerTopic(topic));
                footer.append(statusEl, actionBtn);
            }
        }

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

        // Cập nhật số đếm trên tab chính xác
        if (lecturerTopicCount) lecturerTopicCount.textContent = String(marketplaceData.lecturerTopics.length);
        if (groupTopicCount) groupTopicCount.textContent = String(marketplaceData.groupTopics.length);

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

        // Trạng thái trống: icon lớn + "Chưa có đề tài nào phù hợp" + nút "Xóa bộ lọc"
        if (filteredTopics.length === 0) {
            marketplaceCards.innerHTML = `
                <div class="marketplace-empty-state">
                    <div class="empty-icon"><i class="fa-solid fa-folder-open"></i></div>
                    <h3>Chưa có đề tài nào phù hợp</h3>
                    <p>Hãy thử thay đổi từ khóa tìm kiếm hoặc chọn tất cả lĩnh vực.</p>
                    <button type="button" class="btn-clear-filters" id="clearMarketplaceFiltersBtn">
                        <i class="fa-solid fa-rotate-left"></i> Xóa bộ lọc
                    </button>
                </div>
            `;
            const clearBtn = document.getElementById("clearMarketplaceFiltersBtn");
            if (clearBtn) {
                clearBtn.addEventListener("click", () => {
                    if (marketplaceSearch) marketplaceSearch.value = "";
                    if (marketplaceCategory) marketplaceCategory.value = "";
                    renderMarketplace();
            updateStudentTicker(studentRegisteredTopicData?.status || "");
                });
            }
            if (marketplaceMessage) marketplaceMessage.textContent = "";
            renderMarketplacePagination(0, 0);
            return;
        }

        const pageCount = Math.max(1, Math.ceil(filteredTopics.length / marketplacePageSize));
        marketplacePage = Math.min(marketplacePage, pageCount);
        const startIndex = (marketplacePage - 1) * marketplacePageSize;
        const pageTopics = filteredTopics.slice(startIndex, startIndex + marketplacePageSize);

        marketplaceCards.replaceChildren(...pageTopics.map(topic =>
            createMarketplaceCard(topic, activeMarketplaceTab === "groups")
        ));
        renderMarketplacePagination(filteredTopics.length, pageCount);
        if (marketplaceMessage) {
            marketplaceMessage.textContent = "";
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
            updateStudentTicker(studentRegisteredTopicData?.status || "");
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
            updateStudentTicker(studentRegisteredTopicData?.status || "");
        });

        marketplacePagination.append(previousButton, pageStatus, nextButton);
    }

    async function loadMarketplace() {
        if (!marketplaceCards) return;

        // Skeleton loading cho lưới thẻ khi đang tải
        marketplaceCards.innerHTML = Array.from({ length: 6 }).map(() => `
            <div class="marketplace-skeleton-card">
                <div style="display: flex; gap: 12px; align-items: center;">
                    <div class="skeleton-shimmer" style="width: 40px; height: 40px; border-radius: 10px;"></div>
                    <div style="flex: 1;">
                        <div class="skeleton-shimmer" style="height: 14px; width: 60%; margin-bottom: 6px;"></div>
                        <div class="skeleton-shimmer" style="height: 12px; width: 40%;"></div>
                    </div>
                </div>
                <div class="skeleton-shimmer" style="height: 18px; width: 90%; margin-top: 8px;"></div>
                <div class="skeleton-shimmer" style="height: 14px; width: 100%;"></div>
                <div class="skeleton-shimmer" style="height: 14px; width: 75%;"></div>
                <div class="skeleton-shimmer" style="height: 32px; width: 100%; margin-top: auto; border-radius: 8px;"></div>
            </div>
        `).join('');

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
            myRecruitmentOpen = result.data?.my_recruitment === true;
            canPublishRecruitment = result.data?.can_publish_recruitment === true;
            renderGroupRecruitmentButton();
            if (lecturerTopicCount) lecturerTopicCount.textContent = String(marketplaceData.lecturerTopics.length);
            if (groupTopicCount) groupTopicCount.textContent = String(marketplaceData.groupTopics.length);
            renderMarketplace();
            updateStudentTicker(studentRegisteredTopicData?.status || "");
        } catch (error) {
            console.error("Lỗi tải sàn đề tài:", error);
            if (marketplaceMessage) marketplaceMessage.textContent =
                error.message || "Không thể tải danh sách đề tài. Vui lòng thử lại.";
            marketplaceCards.replaceChildren();
        }
    }

    function renderGroupRecruitmentButton() {
        const isApproved = studentRegisteredTopicData?.status === "APPROVED";
        if (proposeOwnTopicBtn) {
            proposeOwnTopicBtn.style.display = isApproved ? "none" : "";
        }
        if (!groupRecruitmentBtn) return;
        if (isApproved) {
            groupRecruitmentBtn.style.display = "none";
            return;
        }
        groupRecruitmentBtn.style.display = "";

        if (myRecruitmentOpen) {
            groupRecruitmentBtn.disabled = false;
            groupRecruitmentBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Ngừng công khai nhóm';
            return;
        }

        groupRecruitmentBtn.disabled = !registrationWindowOpen || !canPublishRecruitment;
        groupRecruitmentBtn.innerHTML = registrationWindowOpen && canPublishRecruitment
            ? '<i class="fa-solid fa-bullhorn"></i> Công khai nhóm'
            : '<i class="fa-solid fa-bullhorn"></i> Chưa thể công khai nhóm';
    }

    async function toggleGroupRecruitment() {
        if (!groupRecruitmentBtn) return;
        groupRecruitmentBtn.disabled = true;
        try {
            const recruitmentUrl = myRecruitmentOpen
                ? `${window.APP_CONFIG.API_BASE_URL}/api/topics/group-recruitment/${encodeURIComponent(user.user_code)}`
                : `${window.APP_CONFIG.API_BASE_URL}/api/topics/group-recruitment`;
            const response = await apiFetch(
                recruitmentUrl,
                {
                    method: myRecruitmentOpen ? "DELETE" : "POST",
                    headers: { "Authorization": `Bearer ${token}` }
                }
            );
            const result = await response.json();
            if (!response.ok || result.success !== true) {
                throw new Error(result.message || "Không thể cập nhật trạng thái tuyển thành viên.");
            }
            showMessage("success", result.message);
            await Promise.all([loadMarketplace(), loadJoinRequests()]);
        } catch (error) {
            showMessage("error", error.message || "Không thể cập nhật trạng thái tuyển thành viên.");
            renderGroupRecruitmentButton();
        }
    }

    function chooseLecturerTopic(topic) {
        const leaderRole = document.querySelector('input[name="userRole"][value="LEADER"]');
        if (leaderRole) leaderRole.checked = true;
        updateRoleUI("LEADER");
        if (lecturerSelect) lecturerSelect.value = topic.lecturer_code || "";
        syncLecturerPicker();
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
            updateStudentTicker(studentRegisteredTopicData?.status || "");
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
    groupRecruitmentBtn?.addEventListener("click", toggleGroupRecruitment);

    // =========================================================================
    // 6. KIỂM TRA TRẠNG THÁI ĐĂNG KÝ ĐỀ TÀI CỦA SINH VIÊN
    // =========================================================================
    /**
     * Dải thông báo chữ chạy thích ứng theo trạng thái sinh viên (Hướng A)
     */
    function updateStudentTicker(status = "") {
        const tickerBar = document.getElementById("studentTickerBar");
        const tickerBadge = document.getElementById("tickerBadge");
        const tickerContent = document.getElementById("tickerContent");
        const tickerContentClone = document.getElementById("tickerContentClone");
        if (!tickerBar || !tickerContent) return;

        let barClass = "ticker-warning";
        let badgeClass = "badge-warning";
        let badgeLabel = "HỌC VỤ";
        let iconClass = "fa-bullhorn";
        let items = [];

        const normalizedStatus = String(status || "").toUpperCase();

        if (normalizedStatus === "APPROVED") {
            barClass = "ticker-success";
            badgeClass = "badge-success";
            badgeLabel = "TIẾN ĐỘ";
            iconClass = "fa-circle-check";
            items = [
                { icon: "fa-calendar-check", text: "Hãy vào mục 'Đề tài của tôi' để theo dõi các mốc nộp báo cáo và nhận điểm đánh giá." },
                { icon: "fa-comments", text: "Chủ động liên hệ và cập nhật tiến độ định kỳ với Giảng viên hướng dẫn." },
                { icon: "fa-file-lines", text: "Chuẩn bị đề cương và tài liệu báo cáo theo đúng biểu mẫu chuẩn của khoa." }
            ];
        } else if (["PENDING", "NEED_REVISION", "JOIN_ACCEPTED"].includes(normalizedStatus)) {
            barClass = "ticker-info";
            badgeClass = "badge-info";
            badgeLabel = "ĐANG XỬ LÝ";
            iconClass = "fa-clock";
            items = [
                { icon: "fa-paper-plane", text: "Đề tài của bạn đã được gửi thành công và đang chờ xét duyệt." },
                { icon: "fa-comments", text: "Chủ động trao đổi với Giảng viên hướng dẫn để được hỗ trợ phê duyệt sớm." },
                { icon: "fa-bell", text: "Thường xuyên kiểm tra thông báo và email để nhận phản hồi từ Hội đồng." },
                { icon: "fa-pen", text: "Nếu có yêu cầu chỉnh sửa, bạn có thể cập nhật lại thông tin đề tài trực tiếp trên hệ thống." }
            ];
        } else {
            barClass = "ticker-warning";
            badgeClass = "badge-warning";
            badgeLabel = "HỌC VỤ";
            iconClass = "fa-bullhorn";

            let timingItem = { icon: "fa-calendar-days", text: "Theo dõi thời hạn mở cổng đăng ký đề tài Thực tập Tốt nghiệp của học kỳ." };

            if (currentRegistrationStatusData) {
                if (currentRegistrationStatusData.is_open) {
                    if (currentRegistrationStatusData.semester?.registration_end_date) {
                        const endDate = new Date(currentRegistrationStatusData.semester.registration_end_date);
                        const endFormat = currentRegistrationStatusData.semester.registration_window_has_time
                            ? { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }
                            : { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" };
                        timingItem = { icon: "fa-clock", text: `Cổng đăng ký đề tài đang mở! Hạn cuối: ${endDate.toLocaleString("vi-VN", endFormat)}.` };
                    } else {
                        timingItem = { icon: "fa-clock", text: "Cổng đăng ký đề tài Thực tập Tốt nghiệp đang mở!" };
                    }
                } else if (currentRegistrationStatusData.state === "upcoming") {
                    if (currentRegistrationStatusData.semester?.registration_start_date) {
                        const startDate = new Date(currentRegistrationStatusData.semester.registration_start_date);
                        const startFormat = currentRegistrationStatusData.semester.registration_window_has_time
                            ? { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }
                            : { dateStyle: "short", timeZone: "Asia/Ho_Chi_Minh" };
                        timingItem = { icon: "fa-calendar-days", text: `Cổng đăng ký đề tài chưa mở (Dự kiến mở vào: ${startDate.toLocaleString("vi-VN", startFormat)}). Bạn hãy tham khảo trước các đề tài!` };
                    } else {
                        timingItem = { icon: "fa-calendar-days", text: "Chưa đến thời gian mở cổng đăng ký đề tài. Bạn hãy tham khảo trước các đề tài!" };
                    }
                } else {
                    timingItem = { icon: "fa-lock", text: "Hiện không trong thời hạn đăng ký đề tài Thực tập Tốt nghiệp." };
                }
            } else if (registrationWindowOpen) {
                timingItem = { icon: "fa-clock", text: "Cổng đăng ký đề tài Thực tập Tốt nghiệp đang mở!" };
            }

            const topicCount = marketplaceData?.lecturerTopics?.length || 0;
            const exploreText = topicCount > 0
                ? `Khám phá ${topicCount} đề tài gợi ý từ Giảng viên hoặc Tự đề xuất đề tài mới của nhóm.`
                : "Khám phá các đề tài gợi ý từ Giảng viên hoặc Tự đề xuất đề tài mới của nhóm.";

            items = [
                timingItem,
                { icon: "fa-lightbulb", text: exploreText },
                { icon: "fa-thumbtack", text: "Nếu chưa có Giảng viên hướng dẫn, bạn có thể chọn 'Nhờ Khoa phân công' để Khoa sắp xếp GVHD." },
                { icon: "fa-users", text: "Tìm thêm đồng đội nhanh chóng bằng cách bấm 'Công khai nhóm' hoặc xin vào các nhóm đang tuyển." }
            ];
        }

        tickerBar.className = `student-ticker-bar ${barClass}`;
        if (tickerBadge) {
            tickerBadge.className = `ticker-badge ${badgeClass}`;
            tickerBadge.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${escapeHtml(badgeLabel)}</span>`;
        }

        const htmlContent = items.map(item => 
            `<span class="ticker-item"><i class="fa-solid ${escapeHtml(item.icon)}"></i><span>${escapeHtml(item.text)}</span></span><span class="ticker-separator">•</span>`
        ).join("");

        tickerContent.innerHTML = htmlContent;
        if (tickerContentClone) {
            tickerContentClone.innerHTML = htmlContent;
        }
    }

    function updateStepper(status) {
        // Đã xóa bỏ Stepper 3 bước để giao diện thoáng gọn hơn
    }

    const resetToUnregisteredState = () => {
        isEditing = false;
        studentHasRegisteredTopic = false;
        studentRegisteredTopicData = null;

        const registeredBanner = document.getElementById("registeredTopicBanner");
        if (registeredBanner) registeredBanner.hidden = true;
        if (topicStatusPill) topicStatusPill.style.display = "";
        if (groupMembersSection) groupMembersSection.style.display = "";
        if (formActionsBar) formActionsBar.style.display = "";

        updateStepper("");
        updateStudentTicker("");

        if (statusEl) {
            statusEl.className = "status-text status-none";
            statusEl.innerHTML = `<i class="fa-solid fa-circle"></i> Chưa đăng ký`;
        }
        
        if (lecturerSelect) lecturerSelect.value = "";
        syncLecturerPicker();
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
        if (groupRecruitmentBtn) groupRecruitmentBtn.style.display = "";
        if (proposeOwnTopicBtn) proposeOwnTopicBtn.style.display = "";
        hideMessage();
        loadRegistrationWindow();
        renderMarketplace();
    };

    const checkTopicStatus = async () => {
        try {
            const res = await apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/topics/student/${user.user_code}`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            
            if (res.ok) {
                const topic = await res.json();
                
                if (topic && topic.status) {
                    studentRegisteredTopicData = topic;
                    studentHasRegisteredTopic = ["PENDING", "APPROVED", "NEED_REVISION", "JOIN_ACCEPTED"].includes(topic.status);

                    // Cập nhật Stepper theo trạng thái thực tế
                    updateStepper(topic.status);
                    updateStudentTicker(topic.status);

                    // Banner xanh nhạt phía trên danh sách: hiển thị tên đề tài thay vì mã đề tài
                    const registeredBanner = document.getElementById("registeredTopicBanner");
                    const registeredCode = document.getElementById("registeredTopicCode");
                    if (registeredBanner) {
                        registeredBanner.hidden = !studentHasRegisteredTopic;
                        if (registeredCode && studentHasRegisteredTopic) {
                            const topicName = topic.title || topic.topic_code || "Đề tài thực tập";
                            registeredCode.textContent = `"${topicName}"`;
                            registeredCode.title = topicName;
                        }
                    }

                    const isLeader = (topic.leader_code === user.user_code);
                    const showSubmittedTopic = !isLeader &&
                        ["PENDING", "APPROVED", "NEED_REVISION", "REJECTED"].includes(topic.status);
                    updateRoleUI(isLeader ? "LEADER" : "MEMBER", showSubmittedTopic);
                    const isApproved = topic.status === "APPROVED";
                    if (topicStatusPill) topicStatusPill.style.display = isApproved ? "none" : "";
                    if (groupMembersSection) groupMembersSection.style.display = isApproved ? "none" : "";
                    if (topicDetailsSection && isApproved) topicDetailsSection.style.display = "none";
                    if (formActionsBar) formActionsBar.style.display = isApproved ? "none" : "";
                    if (groupRecruitmentBtn) groupRecruitmentBtn.style.display = isApproved ? "none" : "";
                    if (proposeOwnTopicBtn) proposeOwnTopicBtn.style.display = isApproved ? "none" : "";

                    if (lecturerSelect) lecturerSelect.value = topic.lecturer_code || "";
                    syncLecturerPicker();
                    renderProposedTopics(topic.lecturer_code || "");
                    if (proposedSelect) proposedSelect.value = topic.proposed_topic_id || topic.proposed_topic || "";
                    if (topicTitleInput) topicTitleInput.value = topic.title || "";
                    if (topicDescInput) topicDescInput.value = topic.description || "";

                    await loadPartnerInfo(leaderNameEl, topic.leader_code);
                    if (!hasEditedMemberCodes) {
                        await loadPartnerInfo(partnerInput, topic.member2_code);
                        await loadPartnerInfo(member3Input, topic.member3_code);
                    }

                    if (topic.status === "JOIN_PENDING" || topic.status === "JOIN_ACCEPTED" ||
                        topic.status === "JOIN_REJECTED") {
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
                            <div class="join-request-feedback" style="background-color: ${joinMessageBackground}; border: 1px solid ${joinMessageBorder}; color: ${joinMessageColor};">
                                <span>
                                    <i class="fa-solid ${joinMessageIcon}" style="color: ${joinMessageColor}; margin-right: 6px;"></i>
                                    ${topic.status === "JOIN_ACCEPTED"
                                        ? `Trưởng nhóm <strong>${escapeHtml(topic.leader_code)}</strong> đã xác nhận bạn. Vui lòng chờ Trưởng nhóm đăng ký đề tài.`
                                        : topic.status === "JOIN_REJECTED"
                                            ? `Yêu cầu tham gia nhóm của bạn đã bị từ chối. Bạn có thể nhập mã Trưởng nhóm khác để gửi lại yêu cầu.`
                                            : `Đã gửi yêu cầu đến Trưởng nhóm <strong>${escapeHtml(topic.leader_code)}</strong>. Vui lòng chờ xác nhận.`}
                                </span>
                                ${topic.status === "JOIN_PENDING" && topic.join_request_id
                                    ? `<button type="button" class="cancel-join-request-btn" data-request-id="${escapeHtml(topic.join_request_id)}">Hủy yêu cầu</button>`
                                    : ""}
                            </div>
                        `);
                        renderMarketplace();
            updateStudentTicker(studentRegisteredTopicData?.status || "");
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
                        // Đề tài đã được phê duyệt -> Ẩn thông báo thời hạn đăng ký
                        if (registrationWindowNotice) {
                            registrationWindowNotice.hidden = true;
                        }
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

                    renderMarketplace();
            updateStudentTicker(studentRegisteredTopicData?.status || "");
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

    document.addEventListener("click", async event => {
        const target = event.target;
        const button = target instanceof Element ? target.closest(".cancel-join-request-btn") : null;
        if (!button) return;

        const requestId = button.dataset.requestId;
        if (!requestId) {
            showMessage("error", "Không tìm thấy mã yêu cầu cần hủy.");
            return;
        }

        button.disabled = true;
        try {
            const response = await apiFetch(
                `${window.APP_CONFIG.API_BASE_URL}/api/topics/join-requests/${encodeURIComponent(user.user_code)}/${encodeURIComponent(requestId)}`,
                { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } }
            );
            const result = await response.json();
            if (!response.ok) {
                await checkTopicStatus();
                showMessage("error", result.message || "Không thể hủy yêu cầu tham gia nhóm.");
                return;
            }

            await checkTopicStatus();
            showMessage("success", result.message || "Đã hủy yêu cầu tham gia nhóm.");
        } catch (error) {
            console.error("Lỗi hủy yêu cầu tham gia nhóm:", error);
            button.disabled = false;
            showMessage("error", "Không thể kết nối máy chủ để hủy yêu cầu.");
        }
    });

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
            const hasAcceptedMember = requests.some(request => request.status === "ACCEPTED");
            setMemberRoleLocked(hasAcceptedMember);
            const acceptedMembers = requests
                .filter(request => request.status === "ACCEPTED")
                .map(request => ({
                    code: extractCode(request.member_code),
                    name: String(request.member_name || "").trim()
                }))
                .filter(member => member.code);
            const memberFields = [partnerInput, member3Input];
            acceptedMembers.forEach(member => {
                if (memberFields.some(field => extractCode(field?.value || "") === member.code)) return;
                const emptyField = memberFields.find(field => !extractCode(field?.value || ""));
                if (emptyField) {
                    emptyField.value = member.name
                        ? `${member.name} (${member.code})`
                        : member.code;
                    hasEditedMemberCodes = true;
                }
            });
            joinRequestsSection.style.display = requests.length ? "block" : "none";
            joinRequestsList.innerHTML = requests.length
                ? requests.map(request => `
                    <div class="join-request-item">
                        <span class="join-request-member"><strong>${request.member_name || "Chưa có tên"}</strong> (${request.member_code})</span>
                        <span class="join-request-status ${request.status === "ACCEPTED" ? "is-accepted" : "is-pending"}">
                            ${request.status === "ACCEPTED" ? '<i class="fa-solid fa-circle-check"></i> Đã xác nhận' : '<i class="fa-solid fa-clock"></i> Đang chờ xác nhận'}
                        </span>
                        ${request.status === "PENDING" ? `<span class="join-request-actions">
                            <button type="button" class="btn-primary-action accept-join-btn" data-id="${request._id}" data-member-code="${String(request.member_code || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]))}" data-status="ACCEPTED">Xác nhận</button>
                            <button type="button" class="reject-join-btn" data-id="${request._id}" data-status="REJECTED"><i class="fa-solid fa-xmark"></i> Từ chối</button>
                        </span>` : request.status === "ACCEPTED" && request.can_remove ? `<span class="join-request-actions">
                            <button type="button" class="remove-accepted-member-btn" data-id="${request._id}" data-action="remove-member" data-member-code="${escapeHtml(request.member_code)}">
                                <i class="fa-solid fa-user-minus"></i> Loại khỏi nhóm
                            </button>
                        </span>` : ""}
                    </div>`).join("")
                : "";

            joinRequestsList.querySelectorAll("button[data-id]").forEach(button => {
                button.addEventListener("click", async () => {
                    const isRemovingMember = button.dataset.action === "remove-member";
                    if (isRemovingMember && !await requestRemoveMemberConfirmation()) return;

                    button.disabled = true;
                    try {
                        const requestUrl = `${window.APP_CONFIG.API_BASE_URL}/api/topics/join-requests/${encodeURIComponent(user.user_code)}/${button.dataset.id}`;
                        const response = await apiFetch(
                            isRemovingMember ? `${requestUrl}/remove` : requestUrl,
                            {
                                method: isRemovingMember ? "DELETE" : "PATCH",
                                headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": `Bearer ${token}`
                                },
                                ...(isRemovingMember ? {} : {
                                    body: JSON.stringify({ status: button.dataset.status })
                                })
                            }
                        );
                        const result = await response.json();
                        showMessage(response.ok ? "success" : "error", result.message || "Không thể xử lý yêu cầu!");
                        if (response.ok && isRemovingMember) {
                            const removedCode = extractCode(button.dataset.memberCode || "");
                            [partnerInput, member3Input].forEach(field => {
                                if (extractCode(field?.value || "") === removedCode) field.value = "";
                            });
                            hasEditedMemberCodes = [partnerInput, member3Input]
                                .some(field => extractCode(field?.value || ""));
                        }
                        if (response.ok && button.dataset.status === "ACCEPTED") {
                            const memberCode = String(button.dataset.memberCode || "").trim();
                            if (memberCode) {
                                if (!extractCode(partnerInput?.value || "")) {
                                    await loadPartnerInfo(partnerInput, memberCode);
                                    hasEditedMemberCodes = true;
                                } else if (!extractCode(member3Input?.value || "") &&
                                    extractCode(partnerInput?.value || "") !== memberCode) {
                                    await loadPartnerInfo(member3Input, memberCode);
                                    hasEditedMemberCodes = true;
                                }
                            }
                        }
                        await Promise.all([checkTopicStatus(), loadJoinRequests(), loadMarketplace()]);
                    } catch (error) {
                        console.error("Lỗi xử lý yêu cầu tham gia nhóm:", error);
                        showMessage("error", error.message || "Không thể xử lý yêu cầu tham gia nhóm.");
                        button.disabled = false;
                    }
                });
            });
        } catch (error) {
            console.error("Lỗi tải yêu cầu tham gia nhóm:", error);
        }
    }

    // Khởi tạo tải dữ liệu danh sách
    updateStudentTicker("");
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
                showMessage("error", "Vui lòng chọn Giảng viên hướng dẫn hoặc chọn 'Chưa có GVHD'!");
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
                lecturer_code: (lecturerCode && lecturerCode !== "UNASSIGNED") ? lecturerCode : null,
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