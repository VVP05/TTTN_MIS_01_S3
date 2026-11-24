// Dịch vụ phản hồi siêu tốc Tầng 1 (Instant Reply - dưới 0.01s)
// Trả lời ngay lập tức các câu hỏi phổ biến về chào hỏi, quy trình, hạn nộp, tạo nhóm

function normalizeText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function getInstantReply(rawMessage) {
    const text = normalizeText(rawMessage);
    if (!text) return null;

    // 1. Chào hỏi
    if (
        /^(?:hi|hello|hey|alo|chao|xin chao)\b/.test(text) ||
        /\b(?:bot oi|peanuts oi|bi oi|chao ban|chao peanuts|chao bi|hi peanuts|hi bi|hello peanuts|hello bi|co ai khong|ban oi)\b/.test(text)
    ) {
        return 'Chào bạn! Mình là Peanuts - Trợ lý đề tài TTTN ✨ Bạn cần hỗ trợ hướng dẫn đăng ký đề tài, cách nộp bài hay tìm gợi ý đề tài nè?';
    }

    // 2. Cảm ơn
    if (/\b(?:cam on|thanks|thank you|thx|tks|ty)\b/.test(text)) {
        return 'Không có gì nè! Nếu cần tư vấn thêm về đề tài hay cách dùng hệ thống thì cứ nhắn Peanuts bất cứ lúc nào nhé ✨';
    }

    // 3. Phản hồi xác nhận / OK
    if (/^(?:(?:da|oke|ok|okay|roi|duoc|vang|um|uh)[\s,]*)+(?:(?:ban|peanuts|bi|nha|nhe|ạ)[\s,]*)?$/.test(text)) {
        return 'Dạ, khi nào cần hỗ trợ gì thêm bạn cứ nhắn Peanuts nhé! Chúc bạn hoàn thành kỳ thực tập thật xuất sắc 💪';
    }

    // 4. Hướng dẫn Đăng ký đề tài
    if (
        (/\b(?:dang ky de tai|cach dang ky|huong dan dang ky|chon de tai|lam sao dang ky)\b/.test(text) ||
         (text.includes('dang ky') && text.includes('the nao'))) &&
        !/\b(?:goi y|y tuong|chon nganh|linh vuc)\b/.test(text)
    ) {
        return 'Để đăng ký đề tài thực tập tốt nghiệp, bạn làm theo các bước sau:\n' +
            '1. Vào mục "Đăng ký đề tài" ở menu bên trái.\n' +
            '2. Nếu là Trưởng nhóm: Chọn Giảng viên hướng dẫn, thêm mã MSSV thành viên (nếu có nhóm), rồi chọn đề tài GV gợi ý hoặc tự điền tên đề tài mới.\n' +
            '3. Nếu là Thành viên: Nhập MSSV Trưởng nhóm để gửi yêu cầu gia nhập nhóm.\n' +
            '4. Nhấn "Gửi Đăng Ký Đề Tài" để hoàn tất và chờ Giảng viên phê duyệt nhé!';
    }

    // 5. Hướng dẫn Nộp bài / Nộp báo cáo
    if (/\b(?:nop bao cao|cach nop bai|nop bai o dau|huong dan nop bai|them bai nop|nop file|dinh dang file)\b/.test(text)) {
        return 'Để nộp báo cáo tiến độ thực tập:\n' +
            '1. Vào mục "Đề tài của tôi" ở menu bên trái (sau khi đề tài đã được GVHD duyệt và mở mốc).\n' +
            '2. Chọn mốc báo cáo đang mở -> nhấn "Thêm bài nộp" -> "Thêm tệp". Hệ thống hỗ trợ tệp PDF, DOC, DOCX, ZIP, RAR tối đa 25 MB.\n' +
            '3. Nhấn "Lưu thay đổi" để lưu bản nháp, sau đó nhấn "Nộp bài" để gửi chính thức cho Giảng viên hướng dẫn chấm nhé!';
    }

    // 6. Thời hạn / Hạn nộp / Hạn chót
    if (/\b(?:han nop|thoi han|khi nao het han|han dang ky|han cuoi|deadline)\b/.test(text)) {
        return 'Về thời hạn trong hệ thống:\n' +
            '- Thời hạn đăng ký đề tài: Bạn xem trực tiếp tại thông báo màu xanh trên đầu trang "Đăng ký đề tài".\n' +
            '- Hạn nộp báo cáo từng mốc: Xem chi tiết trong từng mốc tại trang "Đề tài của tôi".\n' +
            'Mỗi học kỳ và mỗi giảng viên sẽ có lịch cụ thể, bạn chú ý theo dõi để không bị trễ hạn nhé!';
    }

    // 7. Nhóm / Thành viên / Ghép nhóm
    if (/\b(?:tao nhom|vao nhom|tham gia nhom|doi nhom|tach nhom|them thanh vien)\b/.test(text)) {
        return 'Về quy định nhóm thực tập:\n' +
            '- Trưởng nhóm: Nhập MSSV của các thành viên khi tạo đơn đăng ký đề tài.\n' +
            '- Thành viên: Chọn vai trò "Thành viên" và nhập MSSV Trưởng nhóm để gửi yêu cầu tham gia.\n' +
            'Sau khi Trưởng nhóm gửi đề tài thành công, nhóm sẽ cùng theo dõi tiến độ và nộp bài chung trên hệ thống.';
    }

    // 8. Đổi mật khẩu / Tài khoản
    if (/\b(?:doi mat khau|quen mat khau|cai dat tai khoan|thong tin ca nhan|so dien thoai)\b/.test(text)) {
        return 'Để đổi mật khẩu hoặc cập nhật số điện thoại liên hệ, bạn hãy vào mục "Cài đặt tài khoản" ở cuối menu bên trái nhé!';
    }

    // 9. Easter egg: Admin / Tác giả / Người tạo ra website
    if (
        /\b(?:ai la admin|admin la ai|admin cua trang web|admin trang web|admin web|chu web|chu trang web|chu he thong|ai lam ra web|ai tao ra web|ai code web|ai viet web|ai phat trien web|ai xay dung web|web nay cua ai|trang web nay cua ai|he thong nay cua ai|tac gia web|tac gia trang web|ai la creator|developer web nay la ai)\b/.test(text) ||
        (/\badmin\b/.test(text) && /\b(?:ai|la ai|cua ai|ten gi)\b/.test(text)) ||
        (/\b(?:ai tao|ai lam|ai code|ai viet|ai phat trien)\b/.test(text) && /\b(?:web|trang web|he thong|app)\b/.test(text))
    ) {
        return 'Đó chính là anh Võ Văn Phụng đẹp zai của tui đó! Muốn liên hệ thì Zalo: 0362182243, FB: Võ Văn Phụng nha hihi 🥰✨';
    }

    return null;
}

module.exports = { getInstantReply, normalizeText };
