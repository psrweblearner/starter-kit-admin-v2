const catchAsync = require('../../utils/catchAsync');
const MENU_CONFIG = require("../../config/menuConfig");
const fs = require("fs");
const path = require("path");
const { FetchData } = require('../../helper/utils');
exports.dashboard = catchAsync(async (req, res) => {
    res.render('v1/admin/dashboard', { layout: 'v1/layouts/basic' });
});

exports.categoryMenu = catchAsync(async (req, res) => {
    const { category } = req.params;
    const hasGroup = req.user?.groups?.some(g => g.slug === category);
    if (!hasGroup) {
        return res.redirect('/admin/dashboard');
    }
    res.render('v1/menu-category/view', { layout: 'v1/layouts/basic' });
});

exports.menu = catchAsync(async (req, res) => {
    const { menu, category } = req.params;
    const menuEntry = MENU_CONFIG[menu] || {};
    const apis = menuEntry.api?.list || [];
    const view = menuEntry.view?.list || `v1/menu/${menu}/view`;
    const layout = menuEntry.layout || "v1/layouts/main";
    // Check folder exists
    if (!viewExists(menu, "view")) {
        return res.status(404).render("v1/errors/404", { message: "Page not found" });
    }

    const data = {};

    for (let api of apis) {
        const url = typeof api.url === "function" ? api.url() : api.url;
        data[api.name] = await FetchData(url, {}, req, true);
    }
    res.render(view, { menu, category, layout, data });
});

exports.edit = catchAsync(async (req, res) => {
    const { menu, category, id } = req.params;
    const menuEntry = MENU_CONFIG[menu] || {};
    const viewPath = menuEntry.view?.edit || `v1/menu/${menu}/edit`;
    const layout = menuEntry.layout || "v1/layouts/main";
    const apis = menuEntry.api?.edit || [];
    // Check if view exists
    if (!viewExists(menu, "edit")) {
        return res.status(404).render("v1/errors/404", { message: "Edit page not found" });
    }

    const data = {};

    try {
        for (let i = 0; i < apis.length; i++) {
            const api = apis[i];

            const url = typeof api.url === "function"
                ? api.url(id, data)
                : api.url;

            const result = await FetchData(url, {}, req, true);

            // 🔥 Extract actual payload safely
            const payload = result?.data?.data ?? result?.data ?? result;

            if (!api.name) {
                // Primary API → merge directly
                Object.assign(data, payload);
            } else {
                // Secondary API → assign under name
                data[api.name] = payload;
            }
        }
        // Render **after** all APIs are fetched
        res.render(viewPath, { menu, category, layout, data });

    } catch (err) {
        console.error("Error fetching edit APIs:", err);
        res.status(500).render("v1/errors/500", { message: "Server error", layout: false });
    }
});

exports.create = catchAsync(async (req, res) => {
    const { menu, category } = req.params;
    const menuEntry = MENU_CONFIG[menu] || {};
    const layout = menuEntry.layout || "v1/layouts/main";

    // Determine view path
    const viewPath = menuEntry.view?.create || `v1/menu/${menu}/create`;

    // Check if create view exists
    if (!viewExists(menu, "create")) {
        return res.status(404).render("v1/errors/404", { message: "Create page not found" });
    }

    // Fetch APIs if defined
    const apis = menuEntry.api?.create || [];
    const data = {};
    let primaryData = null;

    try {
        for (let i = 0; i < apis.length; i++) {
            const api = apis[i];
            const url = typeof api.url === "function" ? api.url(null, primaryData) : api.url;
            const result = await FetchData(url, {}, req, true);

            if (!api.name) {
                // Primary API → merge directly
                Object.assign(data, result);
                primaryData = result;
            } else {
                // Secondary API → store under its name
                data[api.name] = result;
            }
        }

        // Render **after** all APIs are fetched
        res.render(viewPath, { menu, category, layout, data });

    } catch (err) {
        console.error("Error fetching create APIs:", err);
        res.status(500).render("v1/errors/500", { message: "Server error", layout: false });
    }
});




/**
 * Check if a page view exists.
 * @param {string} menu - Menu key
 * @param {string} type - Page type: 'view', 'edit', 'create'
 * @returns {boolean} true if exists
 */
const viewExists = (menu, type = "view") => {
    const config = MENU_CONFIG[menu];
    if (config?.view?.[type]) return true;
    const template = path.join(__dirname, "../../resources/v1/menu", menu, `${type}.hbs`);
    return fs.existsSync(template);
};