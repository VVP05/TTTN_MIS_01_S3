const localHosts = new Set(["localhost", "127.0.0.1"]);
const customApiUrl = window.localStorage.getItem("CUSTOM_API_BASE_URL");
const apiBaseUrl = customApiUrl || (
    localHosts.has(window.location.hostname) && window.location.port !== "5000"
        ? `http://${window.location.hostname}:5000`
        : window.location.origin
);
window.APP_CONFIG = Object.freeze({ API_BASE_URL: apiBaseUrl });

const authStorageKeys = ["studentAuth", "lecturerAuth", "adminAuth"];
const authSessionIdKey = "authSessionId";
const authLastActivityKey = "authLastActivityAt";
const authSessionIdPattern = /^[a-f0-9]{32}$/i;
const authIdleTimeoutMs = 5 * 60 * 1000;
let authIdleTimer = null;
let lastAuthActivityWrite = 0;

function getAuthSessionId() {
    let sessionId = sessionStorage.getItem(authSessionIdKey);
    if (!authSessionIdPattern.test(sessionId || "")) {
        const bytes = new Uint8Array(16);
        window.crypto.getRandomValues(bytes);
        sessionId = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
        sessionStorage.setItem(authSessionIdKey, sessionId);
    }
    return sessionId.toLowerCase();
}

function migrateLegacyAuthStorage() {
    for (const key of authStorageKeys) {
        const stored = localStorage.getItem(key);
        if (!stored) continue;

        try {
            const parsed = JSON.parse(stored);
            if (parsed?.user) {
                localStorage.setItem(key, JSON.stringify({ user: parsed.user }));
            } else {
                localStorage.removeItem(key);
            }
        } catch {
            localStorage.removeItem(key);
        }
    }

    const activeSession = sessionStorage.getItem("activeAuth");
    if (activeSession) {
        try {
            const parsed = JSON.parse(activeSession);
            if (parsed?.user) {
                sessionStorage.setItem("activeAuth", JSON.stringify({ user: parsed.user }));
            } else {
                sessionStorage.removeItem("activeAuth");
            }
        } catch {
            sessionStorage.removeItem("activeAuth");
        }
    }

    localStorage.removeItem("activeAuth");
    localStorage.removeItem("token");
    sessionStorage.removeItem("token");
}

migrateLegacyAuthStorage();

function getActiveAuthUser() {
    try {
        return JSON.parse(sessionStorage.getItem("activeAuth") || "null")?.user || null;
    } catch (error) {
        console.error("Không thể đọc phiên đăng nhập hiện tại:", error);
        return null;
    }
}

function scheduleAuthIdleTimeout() {
    window.clearTimeout(authIdleTimer);
    if (!getActiveAuthUser()) return;

    const lastActivity = Number(sessionStorage.getItem(authLastActivityKey));
    if (!Number.isFinite(lastActivity) || lastActivity <= 0) {
        sessionStorage.setItem(authLastActivityKey, String(Date.now()));
        scheduleAuthIdleTimeout();
        return;
    }

    const remainingTime = authIdleTimeoutMs - (Date.now() - lastActivity);
    if (remainingTime <= 0) {
        const loginUrl = new URL("../auth/index.html", document.baseURI).href;
        window.logoutSession?.();
        window.location.replace(loginUrl);
        return;
    }

    authIdleTimer = window.setTimeout(scheduleAuthIdleTimeout, remainingTime);
}

function recordAuthActivity() {
    if (!getActiveAuthUser()) return;

    const now = Date.now();
    if (now - lastAuthActivityWrite < 1000) return;
    lastAuthActivityWrite = now;
    sessionStorage.setItem(authLastActivityKey, String(now));
    scheduleAuthIdleTimeout();
}

["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "click"].forEach(eventName => {
    window.addEventListener(eventName, recordAuthActivity, { passive: true });
});
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleAuthIdleTimeout();
});
window.resetAuthInactivityTimer = () => {
    lastAuthActivityWrite = 0;
    recordAuthActivity();
};

window.storeAuthUser = (user) => {
    if (!user || !authStorageKeys.includes(`${String(user.role || "").toLowerCase()}Auth`)) {
        throw new Error("Không thể lưu phiên đăng nhập với vai trò không hợp lệ.");
    }

    const roleKey = `${String(user.role).toLowerCase()}Auth`;
    localStorage.removeItem("activeAuth");
    const serializedAuth = JSON.stringify({ user });
    sessionStorage.setItem("activeAuth", serializedAuth);
    localStorage.setItem(roleKey, serializedAuth);
};

window.clearAuthUser = (role) => {
    window.clearTimeout(authIdleTimer);
    sessionStorage.removeItem(authLastActivityKey);

    let activeRole = String(role || "").toUpperCase();
    if (!activeRole) {
        try {
            const activeAuth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
            activeRole = String(activeAuth?.user?.role || "").toUpperCase();
        } catch (error) {
            console.error("Không thể đọc vai trò của phiên hiện tại:", error);
        }
    }

    sessionStorage.removeItem("activeAuth");
    localStorage.removeItem("activeAuth");
    const roleKey = `${activeRole.toLowerCase()}Auth`;
    if (authStorageKeys.includes(roleKey)) localStorage.removeItem(roleKey);
    localStorage.removeItem("token");
    try {
        const storedUser = JSON.parse(localStorage.getItem("user") || "null");
        if (!activeRole || String(storedUser?.role || "").toUpperCase() === activeRole) {
            localStorage.removeItem("user");
        }
    } catch (error) {
        console.error("Không thể đọc hồ sơ cũ trong bộ nhớ trình duyệt:", error);
    }
};

window.verifyAuthSession = async (expectedRole) => {
    let response;
    try {
        response = await window.fetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/session`, {
            headers: {
                Accept: "application/json",
                "X-Auth-Session": getAuthSessionId(),
                "X-Auth-Role": String(expectedRole || "").toUpperCase()
            },
            credentials: "include",
            cache: "no-store"
        });
    } catch (error) {
        console.error("Không thể xác minh phiên đăng nhập:", error);
        window.showAppNotification?.("Không thể xác minh phiên đăng nhập. Vui lòng kiểm tra kết nối máy chủ.");
        return null;
    }

    const result = await response.json().catch(() => null);
    if (response.status === 401) {
        window.clearAuthUser(expectedRole);
        if (!window.location.pathname.endsWith("/auth/index.html")) {
            window.location.replace(new URL("../auth/index.html", document.baseURI).href);
        }
        return null;
    }

    if (!response.ok || !result?.success || !result.user) {
        const message = result?.message || "Không thể xác minh phiên đăng nhập.";
        console.error(message);
        window.showAppNotification?.(message);
        return null;
    }

    const user = result.user;
    const role = String(user.role || "").toUpperCase();
    const rolePages = {
        ADMIN: "../admin/admin-dashboard.html",
        LECTURER: "../lecturer/lecturer-dashboard.html",
        STUDENT: "../student/student-dashboard.html"
    };
    if (!rolePages[role]) {
        window.clearAuthUser();
        window.location.replace(new URL("../auth/index.html", document.baseURI).href);
        return null;
    }

    window.storeAuthUser(user);
    if (user.must_change_password &&
        !window.location.pathname.endsWith("/auth/force-change-password.html")) {
        window.location.replace(new URL("../auth/force-change-password.html", document.baseURI).href);
        return null;
    }

    if (expectedRole && role !== String(expectedRole).toUpperCase()) {
        window.location.replace(new URL(rolePages[role], document.baseURI).href);
        return null;
    }

    return user;
};

window.apiFetch = async (input, init = {}) => {
    const apiOrigin = new URL(window.APP_CONFIG.API_BASE_URL).origin;
    const requestUrl = new URL(
        input instanceof Request ? input.url : input,
        window.location.href
    );
    const isApiRequest = requestUrl.origin === apiOrigin;

    if (!isApiRequest) return window.fetch(input, init);

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.delete("Authorization");
    if (!headers.has("X-Auth-Session")) {
        headers.set("X-Auth-Session", getAuthSessionId());
    }
    if (!headers.has("X-Auth-Role")) {
        try {
            const activeAuth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
            const role = String(activeAuth?.user?.role || "").toUpperCase();
            if (authStorageKeys.includes(`${role.toLowerCase()}Auth`)) {
                headers.set("X-Auth-Role", role);
            }
        } catch (error) {
            console.error("Không thể xác định vai trò của tab hiện tại:", error);
        }
    }
    if (!["GET", "HEAD", "OPTIONS"].includes((init.method || (input instanceof Request ? input.method : "GET")).toUpperCase())) {
        headers.set("X-CSRF-Protection", "1");
    }

    const response = await window.fetch(input, {
        ...init,
        headers,
        credentials: "include"
    });

    const isLoginPage = window.location.pathname.endsWith("/auth/index.html");
    const isAuthEntry = /\/api\/auth\/(login|forgot-password|logout)$/.test(requestUrl.pathname);
    if (response.status === 401 && !isLoginPage && !isAuthEntry) {
        window.clearAuthUser();
        window.location.href = new URL("../auth/index.html", document.baseURI).href;
    }

    return response;
};

window.logoutSession = () => {
    let role = "";
    const sessionId = getAuthSessionId();
    try {
        const activeAuth = JSON.parse(sessionStorage.getItem("activeAuth") || "null");
        role = String(activeAuth?.user?.role || "").toUpperCase();
    } catch (error) {
        console.error("Không thể xác định vai trò cần đăng xuất:", error);
    }

    window.clearAuthUser(role);
    return window.apiFetch(`${window.APP_CONFIG.API_BASE_URL}/api/auth/logout`, {
        method: "POST",
        headers: {
            "X-Auth-Session": sessionId,
            ...(role ? { "X-Auth-Role": role } : {})
        },
        keepalive: true
    }).then(response => {
        if (!response.ok) throw new Error("Không thể kết thúc phiên đăng nhập.");
    }).catch(error => {
        console.error("Không thể kết thúc phiên đăng nhập trên máy chủ:", error);
    });
};

scheduleAuthIdleTimeout();

document.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("#confirmLogoutBtn, #confirmLogout")) {
        window.logoutSession();
    }
}, true);
