document.addEventListener("DOMContentLoaded", () => {
    // 1. KIỂM TRA QUYỀN TRUY CẬP
    const user = JSON.parse(localStorage.getItem("user"));
    if (!user || user.role !== "LECTURER") {
        window.location.href = "index.html";
        return;
    }

    if (user.full_name) document.getElementById("userName").textContent = user.full_name;
    if (user.user_code) document.getElementById("userCode").textContent = user.user_code;

    // 2. XỬ LÝ LƯU HỒ SƠ
    const profileForm = document.getElementById("profileForm");
    if (profileForm) {
        profileForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const email = document.getElementById("lecturerEmail").value;
            const phone = document.getElementById("lecturerPhone").value;
            const maxGroups = document.getElementById("maxGroups").value;

            alert(`Đã cập nhật hồ sơ thành công!\n• Email: ${email}\n• SĐT: ${phone}\n• Chỉ tiêu hướng dẫn tối đa: ${maxGroups} nhóm.`);
        });
    }

    // 3. XỬ LÝ ĐỔI MẬT KHẨU
    const changePasswordForm = document.getElementById("changePasswordForm");
    if (changePasswordForm) {
        changePasswordForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const oldPass = document.getElementById("oldPassword").value;
            const newPass = document.getElementById("newPassword").value;
            const confirmPass = document.getElementById("confirmPassword").value;

            if (newPass.length < 8) {
                alert("Mật khẩu mới phải có ít nhất 8 ký tự!");
                return;
            }

            if (newPass !== confirmPass) {
                alert("Xác nhận mật khẩu mới không khớp!");
                return;
            }

            alert("Đổi mật khẩu thành công! Vui lòng sử dụng mật khẩu mới cho lần đăng nhập tiếp theo.");
            changePasswordForm.reset();
        });
    }

    // 4. ĐĂNG XUẤT
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            localStorage.removeItem("user");
            window.location.href = "index.html";
        });
    }
});