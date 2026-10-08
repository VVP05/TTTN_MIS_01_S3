/* Thu nhỏ / mở rộng sidebar bằng nút 3 gạch (.btn-menu-toggle) */
(function () {
    var KEY = 'sidebarCollapsed';
    var layout = document.querySelector('.app-layout');
    var sidebar = document.querySelector('.sidebar');
    var btn = document.querySelector('.btn-menu-toggle');
    if (!layout || !sidebar || !btn) return;

    // Logo thương hiệu hiện trên topbar khi sidebar thu gọn
    var navLeft = btn.parentElement;
    var brandSrc = sidebar.querySelector('.brand-logo') || sidebar.querySelector('.sidebar-brand');
    var topBrand = null;
    if (navLeft && brandSrc) {
        topBrand = document.createElement('div');
        topBrand.className = 'topbar-brand';
        var icon = brandSrc.querySelector('.logo-icon');
        var title = brandSrc.querySelector('h2') || brandSrc.querySelector('.brand-name');
        if (icon) topBrand.appendChild(icon.cloneNode(true));
        if (title) {
            var t = document.createElement('span');
            t.className = 'topbar-brand-text';
            t.textContent = title.textContent;
            topBrand.appendChild(t);
        }
        navLeft.appendChild(topBrand);
    }

    var style = document.createElement('style');
    style.textContent =
        '.app-layout.sidebar-ready .sidebar{transition:width .25s ease,border-color .25s ease;}' +
        '.navbar-left{display:flex;align-items:center;gap:14px;}' +
        '.topbar-brand{display:none;align-items:center;gap:10px;padding-left:14px;border-left:1px solid #e2e8f0;white-space:nowrap;}' +
        '.topbar-brand .logo-icon{font-size:22px;color:#2563eb;display:flex;}' +
        '.topbar-brand-text{font-size:13.5px;font-weight:800;color:#1d4ed8;letter-spacing:.2px;}' +
        '.app-layout.sidebar-collapsed .topbar-brand{display:flex;animation:topbarBrandIn .3s ease;}' +
        '@keyframes topbarBrandIn{from{opacity:0;transform:translateX(-8px);}to{opacity:1;transform:none;}}' +
        '@media (max-width:480px){.topbar-brand-text{display:none;}}' +
        '.app-layout.sidebar-collapsed .sidebar{width:0 !important;min-width:0;overflow:hidden;border-right-width:0;}';
    document.head.appendChild(style);

    function read() {
        try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
    }
    function save(v) {
        try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {}
    }
    function apply(collapsed) {
        layout.classList.toggle('sidebar-collapsed', collapsed);
        btn.setAttribute('aria-expanded', String(!collapsed));
        btn.setAttribute('title', collapsed ? 'Mở rộng menu' : 'Thu nhỏ menu');
    }

    apply(read());
    // bật hiệu ứng chuyển động sau khi đã áp trạng thái ban đầu (tránh nhấp nháy khi tải trang)
    requestAnimationFrame(function () {
        requestAnimationFrame(function () { layout.classList.add('sidebar-ready'); });
    });

    btn.addEventListener('click', function () {
        var collapsed = !layout.classList.contains('sidebar-collapsed');
        apply(collapsed);
        save(collapsed);
    });
})();
