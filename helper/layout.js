/*
=====================================================================
                        LAYOUT HELPER COLLECTION
=====================================================================
This module defines a large set of helper functions that extend 
Handlebars functionality used throughout the admin and CMS UI.

These helpers provide:
  • Conditional rendering logic  
  • String and array utilities  
  • URL/path matching helpers  
  • Permission validation for RBAC  
  • Dynamic field extraction  
  • Editor rendering utilities  
  • Date/time formatting helpers  
  • Utility helpers (concat, split, eq, gt, or, and, not, etc.)

The goal is to make templates cleaner, reduce repetitive logic inside 
views, and help map complex dynamic data structures (such as CRM 
entities, editor blocks, dynamic fields, and permission sets).
=====================================================================
*/

const { editorDesc } = require('./utils');

const layoutHelper = {

    /*
    =====================================================================
                              SECTION HANDLER
    =====================================================================
    Allows defining named sections inside views that can be injected into
    layouts dynamically. Commonly used to insert scripts, CSS, or page-
    specific blocks into master template layouts.
    =====================================================================
    */
    section: function (name, options) {
        if (!this._sections) this._sections = {};
        this._sections[name] = options.fn(this);
        return null;
    },

    /*
    =====================================================================
                             BASIC LOGIC HELPERS
    =====================================================================
    These helpers simplify conditional rendering in Handlebars templates.
    - eq: checks if two values match
    - eqIf: renders a block only when both values match
    - contains: string includes substring
    - startsWith: true if string begins with specified prefix
    - or, and, not: general boolean logic helpers
    =====================================================================
    */
    eq: (a, b) => a === b,
    eqIf: (a, b, options) => (a === b ? options.fn(this) : options.inverse(this)),
    contains: (str, substr) => str.includes(substr),
    startsWith: (str, prefix) => str && str.startsWith(prefix),
    or: (a, b) => a || b,
    and: (a, b) => a && b,
    not: (v) => !v,

    /*
    =====================================================================
                           STRING + ARRAY UTILITIES
    =====================================================================
    concat     → joins arguments together  
    split      → splits a string using a separator  
    matchAny   → match URL segment with any item in array  
    inc        → increments numeric values  
    length     → returns length of array or keys of object  
    lowercase  → convert string to lowercase  
    substring  → extract a portion of a string
    =====================================================================
    */
    concat: (...args) => args.slice(0, -1).join(""),
    split: (string, separator) => string.split(separator),
    matchAny: function (string, array) {
        const result = string.split("/")[1];
        if (!Array.isArray(array)) return false;
        return array.some((item) => item.includes(result));
    },
    inc: (v) => parseInt(v, 10) + 1,
    length: (arr) => (!arr ? 0 : Array.isArray(arr) ? arr.length : Object.keys(arr).length),
    lowercase: (str) => (str ? String(str).toLowerCase() : ""),
    substring: (str, start, end) => (!str ? "" : String(str).substring(start, end).toUpperCase()),

    /*
    =====================================================================
                             MONTH GENERATOR
    =====================================================================
    Produces an array of 12 month-year combinations starting from the 
    current month. Useful for reports, charts, and date-range selection.
    =====================================================================
    */
    generateMonths: function () {
        const months = [];
        const current = new Date();

        for (let i = 0; i < 12; i++) {
            const monthYear = new Date(current.getFullYear(), current.getMonth() + i, 1);
            const formatted = monthYear.toLocaleString("default", {
                month: "short",
                year: "numeric"
            });
            months.push(formatted.toUpperCase());
        }
        return months;
    },

    /*
    =====================================================================
                            URL / SLUG MATCHING
    =====================================================================
    matchSlug → checks if the active route contains the given slug  
    Useful for menu highlighting, dynamic tabs, and conditional UI.
    =====================================================================
    */
    matchSlug: function (reqUrl, slug) {
        if (!reqUrl || !slug) return false;
        const segments = reqUrl.split("/").filter(Boolean);
        return segments.includes(slug);
    },

    /*
    =====================================================================
                           SELECT DROPDOWN LOGIC
    =====================================================================
    isSelected detects the correct selected option when the value may be:
      • a single string  
      • an array of strings  
      • an array of objects (e.g., { code: "IN" })
    =====================================================================
    */
    isSelected: function (value, selected) {
        if (typeof selected === "string") return value === selected ? "selected" : "";
        if (Array.isArray(selected)) {
            if (typeof selected[0] === "object") {
                return selected.some((i) => i.code === value) ? "selected" : "";
            }
            return selected.includes(value) ? "selected" : "";
        }
        return "";
    },

    /*
    =====================================================================
                             JSON UTILITIES
    =====================================================================
    json → pretty JSON output for debugging inside templates  
    pluck → extracts a specific field from array of objects  
    jsonStringify → serialize object into formatted JSON
    =====================================================================
    */
    json: (ctx) => {
        try { return JSON.stringify(ctx, null, 2); }
        catch { return "{}"; }
    },
    pluck: (arr, field) => (!Array.isArray(arr) ? "[]" : JSON.stringify(arr.map((item) => item[field]))),
    jsonStringify: (obj) => JSON.stringify(obj, null, 2),

    /*
    =====================================================================
                            DATE FORMAT HELPERS
    =====================================================================
    dateFormat     → uses moment.js for formatting  
    formatDateTime → converts to readable local timestamp  
    formatDate     → natural human readable difference (e.g., “2 days ago”)  
    daysSince      → number of days since a date (for aging indicators)
    =====================================================================
    */
    dateFormat: (date, format) => require("moment")(date).format(format),
    formatDateTime: (date) => (!date ? "N/A" : new Date(date).toLocaleString()),

    formatDate: function (date) {
        if (!date) return "Never";

        try {
            const now = new Date();
            const past = new Date(date);
            const diff = now - past;

            const sec = Math.floor(diff / 1000);
            const min = Math.floor(sec / 60);
            const hr = Math.floor(min / 60);
            const day = Math.floor(hr / 24);
            const week = Math.floor(day / 7);
            const month = Math.floor(day / 30);

            if (sec < 60) return "Just now";
            if (min < 60) return min === 1 ? "1 minute ago" : `${min} minutes ago`;
            if (hr < 24) return hr === 1 ? "Today 1 hour ago" : `Today ${hr} hours ago`;
            if (day === 1) return "Yesterday";
            if (day < 7) return `${day} days ago`;
            if (week < 4) return week === 1 ? "1 week ago" : `${week} weeks ago`;
            if (month < 12) return month === 1 ? "1 month ago" : `${month} months ago`;

            const year = Math.floor(day / 365);
            return year === 1 ? "1 year ago" : `${year} years ago`;

        } catch {
            return date;
        }
    },

    daysSince: function (date) {
        if (!date) return "0";
        try {
            const created = new Date(date);
            const now = new Date();
            const diff = now - created;
            return Math.ceil(diff / (1000 * 60 * 60 * 24)).toString();
        } catch {
            return "0";
        }
    },

    /*
    =====================================================================
                              EDITOR BLOCK HELPER
    =====================================================================
    Converts editor JSON data (stored by dynamic editor builder) into 
    an HTML string using the editorDesc formatter. Supports both stored 
    JSON string and parsed object formats.
    =====================================================================
    */
    editor: function (editorData) {
        let parsed = editorData;
        if (typeof editorData === 'string') {
            try { parsed = JSON.parse(editorData); }
            catch { parsed = editorData; }
        }
        return editorDesc(parsed);
    },

    /*
    =====================================================================
                          DYNAMIC FIELD EXTRACTION
    =====================================================================
    CRM entities often contain flexible dynamic attributes stored in 
    keys like "customField__1", "customField__2".
  
    hasDynamicFields → detects if object contains any dynamic fields  
    getDynamicFields → extracts them into structured key/label/value list
    =====================================================================
    */
    hasDynamicFields: function (data) {
        if (!data || typeof data !== "object") return false;
        return Object.keys(data).some(
            (k) => k.includes("__") && !isNaN(k.split("__")[1])
        );
    },

    getDynamicFields: function (data) {
        if (!data || typeof data !== "object") return [];

        const exclude = ['id', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy', 'raw_payload', 'is_archived'];
        const result = [];

        for (let key of Object.keys(data)) {
            if (key.includes("__") && !exclude.includes(key)) {
                const parts = key.split("__");
                if (!isNaN(parts[1])) {
                    const value = data[key];
                    if (value !== null && value !== "") {
                        const clean = key.replace(/__\d+$/, '');
                        const label = clean.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

                        result.push({ key, label, value });
                    }
                }
            }
        }
        return result;
    },

    /*
    =====================================================================
                         PERMISSION VALIDATION (RBAC)
    =====================================================================
    canAccess resolves if a user has permission to perform an action 
    on a module. It supports:
      • Array based permissions  
      • Object based permissions  
      • String based permissions (JSON encoded)  
  
    It auto-detects module name from the URL path or manually supplied 
    permission structure, providing dynamic rule checking for menus, 
    buttons, links, and CRUD operations.
    =====================================================================
    */
    canAccess: function (action, options) {
        try {
            const root = options?.data?.root || this || {};
            const req = root.req || {};
            const user = root.user || {};
            const permissionsMap = user.permissions || {};

            if (!permissionsMap || typeof permissionsMap !== "object") return false;
            if (!action) return false;

            // Get URL segments
            const segments = (req.path || '').split('/').filter(Boolean);
            const menuSlug = segments[2]; // Menu is always at segment 1

            if (!menuSlug) return false;

            let allowed = permissionsMap[menuSlug];

            if (!allowed) return false;

            // Handle stringified JSON
            if (typeof allowed === "string") {
                try { allowed = JSON.parse(allowed); } catch { allowed = []; }
            }

            const actionLc = String(action).toLowerCase();

            if (Array.isArray(allowed)) {
                return allowed.map(a => a.toLowerCase()).includes(actionLc);
            }

            if (allowed && typeof allowed === "object") {
                return !!(allowed[actionLc] || allowed[action] || allowed[action.toUpperCase()]);
            }

            return false;

        } catch {
            return false;
        }
    },



    /*
    =====================================================================
                             NUMERIC COMPARISON
    =====================================================================
    gt → checks if first number is greater than second  
    Useful for pagination, conditional rendering, sorting indicators.
    =====================================================================
    */
    gt: (a, b) => a > b
};

module.exports = layoutHelper;
