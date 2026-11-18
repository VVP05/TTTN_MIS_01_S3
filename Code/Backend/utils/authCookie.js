const AUTH_COOKIE_NAME = 'tttn_session';
const AUTH_COOKIE_ROLES = Object.freeze(['ADMIN', 'LECTURER', 'STUDENT']);
const AUTH_COOKIE_MAX_AGE = 24 * 60 * 60 * 1000;
const TAB_SESSION_ID_PATTERN = /^[a-f0-9]{32}$/i;

const defaultSameSite = process.env.NODE_ENV === 'production' ? 'none' : 'lax';
const sameSite = String(process.env.AUTH_COOKIE_SAME_SITE || defaultSameSite).toLowerCase();
if (!['strict', 'lax', 'none'].includes(sameSite)) {
    throw new Error('AUTH_COOKIE_SAME_SITE must be Strict, Lax, or None.');
}

const secure = process.env.NODE_ENV === 'production' ||
    String(process.env.AUTH_COOKIE_SECURE).toLowerCase() === 'true';
if (sameSite === 'none' && !secure) {
    throw new Error('AUTH_COOKIE_SECURE=true is required when AUTH_COOKIE_SAME_SITE=None.');
}

const authCookieOptions = Object.freeze({
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE
});
const authCookieClearOptions = Object.freeze({
    httpOnly: authCookieOptions.httpOnly,
    secure: authCookieOptions.secure,
    sameSite: authCookieOptions.sameSite,
    path: authCookieOptions.path
});

function getCookie(req, name) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    for (const cookie of cookieHeader.split(';')) {
        const separatorIndex = cookie.indexOf('=');
        if (separatorIndex < 0 || cookie.slice(0, separatorIndex).trim() !== name) continue;

        try {
            return decodeURIComponent(cookie.slice(separatorIndex + 1).trim());
        } catch {
            return null;
        }
    }

    return null;
}

function getAuthCookieName(role) {
    const normalizedRole = String(role || '').toUpperCase();
    if (!AUTH_COOKIE_ROLES.includes(normalizedRole)) {
        throw new Error('Unsupported authentication cookie role.');
    }
    return `${AUTH_COOKIE_NAME}_${normalizedRole.toLowerCase()}`;
}

function getTabAuthCookieName(sessionId) {
    if (!TAB_SESSION_ID_PATTERN.test(String(sessionId || ''))) {
        throw new Error('Invalid authentication tab session ID.');
    }
    return `${AUTH_COOKIE_NAME}_${String(sessionId).toLowerCase()}`;
}

function getTabSessionIdFromRequest(req) {
    const sessionId = String(req.get('X-Auth-Session') || '').trim();
    return TAB_SESSION_ID_PATTERN.test(sessionId) ? sessionId.toLowerCase() : null;
}

function hasInvalidTabSessionId(req) {
    const sessionId = String(req.get('X-Auth-Session') || '').trim();
    return Boolean(sessionId) && !TAB_SESSION_ID_PATTERN.test(sessionId);
}

function hasAuthCookie(req, role, sessionId) {
    const cookieNames = new Set(
        String(req.headers.cookie || '')
            .split(';')
            .map(cookie => cookie.slice(0, cookie.indexOf('=')).trim())
            .filter(Boolean)
    );
    if (sessionId) return cookieNames.has(getTabAuthCookieName(sessionId));
    if (role) {
        return cookieNames.has(getAuthCookieName(role)) || cookieNames.has(AUTH_COOKIE_NAME);
    }
    return [...cookieNames].some(name =>
        name === AUTH_COOKIE_NAME || AUTH_COOKIE_ROLES.some(
            authRole => name === getAuthCookieName(authRole)
        )
    );
}

function getTokenFromRequest(req, role, sessionId) {
    if (sessionId) return getCookie(req, getTabAuthCookieName(sessionId));

    const normalizedRole = String(role || '').toUpperCase();
    const roleCookieToken = AUTH_COOKIE_ROLES.includes(normalizedRole)
        ? getCookie(req, getAuthCookieName(normalizedRole))
        : null;
    if (roleCookieToken !== null) return roleCookieToken;

    const legacyCookieToken = getCookie(req, AUTH_COOKIE_NAME);
    if (legacyCookieToken !== null) return legacyCookieToken;

    const authHeader = req.headers.authorization || req.headers.Authorization;
    return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}

function getRoleFromRequest(req) {
    const role = String(req.get('X-Auth-Role') || '').trim().toUpperCase();
    return role || null;
}

function clearAuthCookies(res, role, sessionId) {
    if (sessionId) {
        res.clearCookie(getTabAuthCookieName(sessionId), authCookieClearOptions);
    } else if (role && AUTH_COOKIE_ROLES.includes(String(role).toUpperCase())) {
        res.clearCookie(getAuthCookieName(role), authCookieClearOptions);
    }
    res.clearCookie(AUTH_COOKIE_NAME, authCookieClearOptions);
}

module.exports = {
    AUTH_COOKIE_NAME,
    AUTH_COOKIE_ROLES,
    AUTH_COOKIE_MAX_AGE,
    authCookieOptions,
    authCookieClearOptions,
    getAuthCookieName,
    getTabAuthCookieName,
    getTabSessionIdFromRequest,
    hasInvalidTabSessionId,
    getRoleFromRequest,
    hasAuthCookie,
    getTokenFromRequest,
    clearAuthCookies
};
