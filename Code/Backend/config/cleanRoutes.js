const fs = require('fs');
const path = require('path');

/**
 * Bảng ánh xạ Clean URLs <-> Đường dẫn file HTML vật lý
 */
const CLEAN_ROUTES = [
    // Auth
    { clean: '/login', legacy: '/html/auth/index.html', base: '/html/auth/', aliases: ['/', '/index.html'] },
    { clean: '/force-change-password', legacy: '/html/auth/force-change-password.html', base: '/html/auth/' },
    { clean: '/reset-password', legacy: '/html/auth/reset-password.html', base: '/html/auth/' },
    { clean: '/change-password', legacy: '/html/auth/change-password.html', base: '/html/auth/' },

    // Student
    { clean: '/student', legacy: '/html/student/student-dashboard.html', base: '/html/student/', aliases: ['/student/dashboard'] },
    { clean: '/student/my-topic', legacy: '/html/student/my-topic.html', base: '/html/student/' },
    { clean: '/student/schedule', legacy: '/html/student/work-schedule.html', base: '/html/student/' },

    // Lecturer
    { clean: '/lecturer', legacy: '/html/lecturer/lecturer-dashboard.html', base: '/html/lecturer/', aliases: ['/lecturer/dashboard'] },
    { clean: '/lecturer/topics', legacy: '/html/lecturer/lecturer-topics.html', base: '/html/lecturer/' },
    { clean: '/lecturer/groups', legacy: '/html/lecturer/lecturer-groups.html', base: '/html/lecturer/' },
    { clean: '/lecturer/milestones', legacy: '/html/lecturer/lecturer-milestones.html', base: '/html/lecturer/' },
    { clean: '/lecturer/schedule', legacy: '/html/lecturer/lecturer-schedule.html', base: '/html/lecturer/' },
    { clean: '/lecturer/docs', legacy: '/html/lecturer/lecturer-docs.html', base: '/html/lecturer/' },
    { clean: '/lecturer/notifications', legacy: '/html/lecturer/lecturer-notifications.html', base: '/html/lecturer/' },
    { clean: '/lecturer/settings', legacy: '/html/lecturer/lecturer-settings.html', base: '/html/lecturer/' },
    { clean: '/lecturer/progress-detail', legacy: '/html/lecturer/lecturer-progress-detail.html', base: '/html/lecturer/' },

    // Admin
    { clean: '/admin', legacy: '/html/admin/admin-dashboard.html', base: '/html/admin/', aliases: ['/admin/dashboard'] },
    { clean: '/admin/students', legacy: '/html/admin/admin-students.html', base: '/html/admin/' },
    { clean: '/admin/lecturers', legacy: '/html/admin/admin-lecturers.html', base: '/html/admin/' },
    { clean: '/admin/teams', legacy: '/html/admin/admin-teams.html', base: '/html/admin/' },
    { clean: '/admin/semesters', legacy: '/html/admin/admin-semesters.html', base: '/html/admin/' },
    { clean: '/admin/milestones', legacy: '/html/admin/admin-milestones.html', base: '/html/admin/' },
    { clean: '/admin/documents', legacy: '/html/admin/admin-documents.html', base: '/html/admin/' },
    { clean: '/admin/notifications', legacy: '/html/admin/admin-notifications.html', base: '/html/admin/' },
    { clean: '/admin/logs', legacy: '/html/admin/admin-logs.html', base: '/html/admin/' },

    // Shared
    { clean: '/notifications', legacy: '/html/shared/notifications.html', base: '/html/shared/' },
    { clean: '/guidelines', legacy: '/html/shared/guidelines.html', base: '/html/shared/' }
];

function sendHtmlWithBase(res, filePath, baseHref) {
    fs.readFile(filePath, 'utf8', (err, html) => {
        if (err) {
            return res.status(404).send('Không tìm thấy trang yêu cầu.');
        }

        const output = /<base\s+href=/i.test(html)
            ? html
            : html.replace(/<head([^>]*)>/i, `<head$1>\n    <base href="${baseHref}">`);

        res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        res.type('html').send(output);
    });
}

function registerCleanFrontendRoutes(app, frontendDir) {
    for (const route of CLEAN_ROUTES) {
        const filePath = path.join(frontendDir, route.legacy);
        const cleanPaths = [route.clean, ...(route.aliases || [])];

        app.get(cleanPaths, (req, res) => {
            sendHtmlWithBase(res, filePath, route.base);
        });

        app.get(route.legacy, (req, res) => {
            const queryIndex = req.originalUrl.indexOf('?');
            const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : '';
            res.redirect(302, `${route.clean}${query}`);
        });
    }
}

module.exports = { registerCleanFrontendRoutes, CLEAN_ROUTES };
