const nodemailer = require('nodemailer');

const parseSender = (fromValue, fallbackEmail) => {
    const raw = String(fromValue || '').trim().replace(/^["']|["']$/g, '');
    const match = raw.match(/^(.*?)\s*<([^<>]+)>$/);
    if (match) {
        return {
            name: match[1].trim() || 'Hệ thống Quản lý TTTN',
            email: match[2].trim()
        };
    }
    if (raw.includes('@')) {
        return { name: 'Hệ thống Quản lý TTTN', email: raw };
    }
    return {
        name: 'Hệ thống Quản lý TTTN',
        email: String(fallbackEmail || '').trim()
    };
};

const getSettings = () => {
    const brevoApiKey = String(process.env.BREVO_API_KEY || '').trim();
    const hasSmtpConfig = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
        .every(name => Boolean(String(process.env[name] || '').trim()));

    if (!brevoApiKey && !hasSmtpConfig) {
        throw new Error('Thiếu cấu hình email: cần BREVO_API_KEY hoặc bộ cấu hình SMTP.');
    }

    if (!String(process.env.FRONTEND_RESET_URL || '').trim()) {
        throw new Error('Thiếu cấu hình email: FRONTEND_RESET_URL.');
    }

    let resetPageUrl;
    try {
        resetPageUrl = new URL(process.env.FRONTEND_RESET_URL);
    } catch (error) {
        throw new Error('FRONTEND_RESET_URL không hợp lệ.');
    }
    if (!['http:', 'https:'].includes(resetPageUrl.protocol) ||
        (process.env.NODE_ENV === 'production' && resetPageUrl.protocol !== 'https:')) {
        throw new Error('FRONTEND_RESET_URL phải dùng HTTPS trong môi trường production.');
    }

    const sender = parseSender(
        process.env.SMTP_FROM,
        process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER
    );
    if (!sender.email) {
        throw new Error('Thiếu email người gửi (SMTP_FROM hoặc BREVO_SENDER_EMAIL).');
    }

    if (brevoApiKey) {
        return { mode: 'brevo', apiKey: brevoApiKey, sender, resetPageUrl };
    }

    const port = Number(process.env.SMTP_PORT || 465);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('SMTP_PORT không hợp lệ.');
    }

    return {
        mode: 'smtp',
        host: process.env.SMTP_HOST.trim(),
        port,
        secure: port === 465 ? true : (String(process.env.SMTP_SECURE || '').toLowerCase() === 'true'),
        auth: {
            user: process.env.SMTP_USER.trim(),
            pass: process.env.SMTP_PASS
        },
        from: process.env.SMTP_FROM.trim(),
        resetPageUrl
    };
};

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
})[character]);

function buildEmailHtml({ resetUrl, userName, userCode }) {
    const greetingName = userName ? escapeHtml(userName) : 'Quý người dùng';
    const codeTag = userCode ? ` (Mã: <strong>${escapeHtml(userCode)}</strong>)` : '';
    const safeUrl = escapeHtml(resetUrl.toString());

    return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Đặt lại mật khẩu</title>
</head>
<body style="margin: 0; padding: 30px 10px; background-color: #F4F7FE; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 580px; margin: 0 auto; background-color: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.08); border: 1px solid #E2E8F0;">
        <!-- Header Banner -->
        <tr>
            <td style="padding: 32px 30px; background: linear-gradient(135deg, #1D4ED8 0%, #2563EB 100%); text-align: center; color: #FFFFFF;">
                <div style="font-size: 36px; line-height: 1; margin-bottom: 10px;">🎓</div>
                <h1 style="margin: 0; font-size: 19px; font-weight: 700; letter-spacing: -0.2px; text-transform: uppercase;">Hệ Thống Quản Lý TTTN</h1>
            </td>
        </tr>

        <!-- Main Content -->
        <tr>
            <td style="padding: 32px 30px 24px;">
                <h2 style="margin: 0 0 16px; font-size: 18px; font-weight: 700; color: #0F172A;">Yêu cầu đặt lại mật khẩu</h2>
                <p style="margin: 0 0 14px; font-size: 14.5px; color: #334155; line-height: 1.6;">
                    Hi <strong>${greetingName}</strong>${codeTag},
                </p>
                <p style="margin: 0 0 24px; font-size: 14px; color: #475569; line-height: 1.6;">
                    Hệ thống nhận được yêu cầu khôi phục mật khẩu cho tài khoản của bạn. Vui lòng nhấn vào nút bên dưới để tiến hành thiết lập mật khẩu mới:
                </p>

                <!-- Button CTA -->
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${safeUrl}" target="_blank" style="display: inline-block; background-color: #2563EB; color: #FFFFFF; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35); text-align: center;">
                        Đặt lại mật khẩu
                    </a>
                </div>

                <!-- Expiration notice -->
                <div style="background-color: #EFF6FF; border-left: 4px solid #3B82F6; padding: 12px 16px; border-radius: 6px; margin: 24px 0;">
                    <p style="margin: 0; font-size: 13px; color: #1E40AF; line-height: 1.5;">
                        ⏱️ <strong>Thời hạn hiệu lực:</strong> Liên kết này chỉ dùng <strong>01 lần</strong> và sẽ hết hạn sau <strong>15 phút</strong> kể từ khi gửi email.
                    </p>
                </div>

                <!-- Security Alert Box -->
                <div style="background-color: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 14px 16px; margin-top: 26px;">
                    <p style="margin: 0; font-size: 12.5px; color: #991B1B; line-height: 1.5;">
                        🔒 <strong>Cảnh báo bảo mật:</strong> Nếu bạn không gửi yêu cầu này, vui lòng bỏ qua email và tuyệt đối không chia sẻ đường link cho bất kỳ ai. Mật khẩu hiện tại của bạn vẫn được bảo vệ an toàn.
                    </p>
                </div>
            </td>
        </tr>

        <!-- Footer -->
        <tr>
            <td style="padding: 20px 30px 24px; background-color: #F8FAFC; border-top: 1px solid #E2E8F0; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #94A3B8;">
                    Đây là email tự động từ Hệ thống Quản lý Thực tập Tốt nghiệp. Vui lòng không phản hồi thư này.
                </p>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

const sendPasswordResetEmail = async ({ to, token, userName, userCode }) => {
    const settings = getSettings();
    const resetUrl = new URL(settings.resetPageUrl);
    resetUrl.searchParams.set('token', token);

    const subject = 'Đặt lại mật khẩu tài khoản - Hệ thống Quản lý TTTN';
    const textContent = `Xin chào ${userName || 'bạn'},\n\nBạn vừa gửi yêu cầu đặt lại mật khẩu cho tài khoản ${userCode ? `(${userCode})` : ''}.\nVui lòng truy cập liên kết sau để đặt lại mật khẩu. Liên kết chỉ dùng 1 lần và có hiệu lực trong 15 phút:\n${resetUrl.toString()}\n\nNếu bạn không yêu cầu, vui lòng bỏ qua email này.`;
    const htmlContent = buildEmailHtml({ resetUrl, userName, userCode });

    if (settings.mode === 'brevo') {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'api-key': settings.apiKey
            },
            body: JSON.stringify({
                sender: settings.sender,
                to: [{ email: to, name: userName || to }],
                subject,
                textContent,
                htmlContent
            }),
            signal: AbortSignal.timeout(15000)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Brevo gửi email thất bại (${response.status}): ${errorData.message || response.statusText}`);
        }
        return;
    }

    const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        auth: settings.auth
    });

    try {
        await transporter.sendMail({
            from: settings.from,
            to,
            subject,
            text: textContent,
            html: htmlContent
        });
    } finally {
        transporter.close();
    }
};

module.exports = { sendPasswordResetEmail, getSettings };
