document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("#pendingTopicsBadge, #pendingBadgeCount").forEach(badge => badge.remove());

    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;

    const collapsibleGroups = new Map([
        ["QUẢN LÝ NGƯỜI DÙNG", "users"],
        ["QUẢN LÝ NGHIỆP VỤ", "workflows"]
    ]);

    sidebar.querySelectorAll(".menu-heading").forEach(heading => {
        const label = heading.textContent.trim().replace(/\s+/g, " ").toLocaleUpperCase("vi-VN");
        const groupKey = collapsibleGroups.get(label);
        const menu = heading.nextElementSibling;
        if (!groupKey || !menu?.matches(".menu-list")) return;

        const menuId = `admin-menu-group-${groupKey}`;
        const storageKey = `adminSidebarGroup:${groupKey}`;
        const isCurrentGroup = Boolean(menu.querySelector(".menu-item.active"));
        const isExpanded = isCurrentGroup || localStorage.getItem(storageKey) === "true";

        menu.id = menuId;
        menu.classList.add("admin-nav-group-panel");
        menu.hidden = !isExpanded;

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "menu-heading admin-menu-heading-toggle";
        toggle.setAttribute("aria-controls", menuId);
        toggle.setAttribute("aria-expanded", String(isExpanded));

        const labelElement = document.createElement("span");
        labelElement.textContent = heading.textContent.trim();
        const chevron = document.createElement("span");
        chevron.className = "admin-menu-chevron";
        chevron.setAttribute("aria-hidden", "true");
        toggle.append(labelElement, chevron);

        toggle.addEventListener("click", () => {
            const expanded = toggle.getAttribute("aria-expanded") !== "true";
            toggle.setAttribute("aria-expanded", String(expanded));
            menu.hidden = !expanded;
            localStorage.setItem(storageKey, String(expanded));
        });

        heading.replaceWith(toggle);
    });

    const layout = document.querySelector(".app-container");
    const toggleButton = layout?.querySelector(".btn-toggle-sidebar");
    if (!layout || !toggleButton) return;

    const mobileQuery = window.matchMedia("(max-width: 1024px)");
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "sidebar-backdrop";
    backdrop.setAttribute("aria-label", "Đóng menu");
    backdrop.hidden = true;
    document.body.appendChild(backdrop);

    const setOpen = isOpen => {
        layout.classList.toggle("sidebar-open", isOpen);
        backdrop.hidden = !isOpen;
        backdrop.classList.toggle("is-visible", isOpen);
        toggleButton.setAttribute("aria-expanded", String(isOpen));
    };

    toggleButton.setAttribute("aria-expanded", "false");
    toggleButton.setAttribute("aria-label", "Mở menu");
    toggleButton.addEventListener("click", () => {
        if (mobileQuery.matches) setOpen(!layout.classList.contains("sidebar-open"));
    });
    backdrop.addEventListener("click", () => setOpen(false));
    sidebar.addEventListener("click", event => {
        if (mobileQuery.matches && event.target.closest("a")) setOpen(false);
    });
    const closeOnDesktop = () => {
        if (!mobileQuery.matches) setOpen(false);
    };
    if (mobileQuery.addEventListener) {
        mobileQuery.addEventListener("change", closeOnDesktop);
    } else {
        mobileQuery.addListener(closeOnDesktop);
    }
});