(function () {
    const notificationIcons = {
        success: 'fa-circle-check',
        error: 'fa-circle-xmark',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };

    function getNotificationType(message, requestedType) {
        if (requestedType) return requestedType;
        const text = String(message || '').toLowerCase();
        if (/thành công|đã lưu|đã gửi|đã cập nhật|đã xóa|hoàn tất/.test(text)) return 'success';
        if (/lỗi|không thể|thất bại|không tìm thấy|hết hạn/.test(text)) return 'error';
        if (/vui lòng|chưa|không được|cảnh báo|đợi/.test(text)) return 'warning';
        return 'info';
    }

    function showAppNotification(message, type, remember = true) {
        const notificationType = getNotificationType(message, type);
        const notificationMessage = String(message || '');
        if (notificationType === 'success' && remember) {
            sessionStorage.setItem('pendingAppNotification', JSON.stringify({ message: notificationMessage, type: notificationType }));
        }
        let container = document.getElementById('appNotificationContainer');

        if (!container) {
            container = document.createElement('div');
            container.id = 'appNotificationContainer';
            container.className = 'app-notification-container';
            container.setAttribute('aria-live', 'polite');
            document.body.appendChild(container);
        }

        const notification = document.createElement('div');
        notification.className = `app-notification app-notification-${notificationType}`;
        notification.setAttribute('role', 'status');
        notification.innerHTML = `
            <span class="app-notification-icon"><i class="fa-solid ${notificationIcons[notificationType] || notificationIcons.info}"></i></span>
            <span class="app-notification-message"></span>
            <button class="app-notification-close" type="button" aria-label="Đóng thông báo"><i class="fa-solid fa-xmark"></i></button>
        `;
        notification.querySelector('.app-notification-message').textContent = notificationMessage;
        container.appendChild(notification);

        const dismiss = () => {
            notification.classList.add('is-closing');
            if (notificationType === 'success') sessionStorage.removeItem('pendingAppNotification');
            window.setTimeout(() => notification.remove(), 220);
        };
        notification.querySelector('.app-notification-close').addEventListener('click', dismiss);
        window.setTimeout(dismiss, notificationType === 'success' ? 8000 : notificationType === 'error' ? 7000 : 5200);
        return notification;
    }

    window.showAppNotification = showAppNotification;

    try {
        const pending = JSON.parse(sessionStorage.getItem('pendingAppNotification') || 'null');
        if (pending?.message) {
            sessionStorage.removeItem('pendingAppNotification');
            window.setTimeout(() => showAppNotification(pending.message, pending.type, false), 0);
        }
    } catch (error) {
        sessionStorage.removeItem('pendingAppNotification');
    }
})();
