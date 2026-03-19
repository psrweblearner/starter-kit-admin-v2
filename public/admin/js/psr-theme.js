// ===== MODALS COMPONENT =====

class PSRModals {
    constructor() {
        this.init();
    }

    init() {
        this.initModalEvents();
    }

    initModalEvents() {
        // Open modal (support clicks on nested elements like icons inside buttons)
        document.addEventListener("click", (e) => {
            const trigger = e.target.closest("[data-psr-modal]");
            if (trigger) {
                const modalId = trigger.getAttribute("data-psr-modal");
                this.openModal(modalId);
            }
        });

        // Close modal only via explicit close button
        document.addEventListener("click", (e) => {
            if (e.target.classList.contains("psr-modal-close")) {
                this.closeModal(e.target.closest(".psr-modal-overlay"));
            }
        });
    }

    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add("active");
            document.body.style.overflow = "hidden";
        }
    }

    closeModal(modal) {
        if (modal) {
            modal.classList.remove("active");
            document.body.style.overflow = "";
        }
    }

    // Create modal dynamically
    createModal(options = {}) {
        const {
            id = "dynamic-modal",
            title = "Modal Title",
            content = "<p>Modal content goes here.</p>",
            buttons = [],
        } = options;

        const modalHtml = `
            <div class="psr-modal-overlay" id="${id}">
                <div class="psr-modal">
                    <div class="psr-modal-header">
                        <h3 class="psr-modal-title">${title}</h3>
                        <button class="psr-modal-close">&times;</button>
                    </div>
                    <div class="psr-modal-body">
                        ${content}
                    </div>
                    ${buttons.length > 0
                ? `
                        <div class="psr-modal-footer">
                            ${buttons
                    .map(
                        (btn) => `
                                <button class="psr-btn ${btn.class || "psr-btn-secondary"}" 
                                        ${btn.action ? `data-action="${btn.action}"` : ""}
                                        ${typeof btn.onClick === 'string' ? `onclick="${btn.onClick}"` : ""}>
                                    ${btn.text}
                                </button>
                            `
                    )
                    .join("")}
                        </div>
                    `
                : ""
            }
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML("beforeend", modalHtml);
        return document.getElementById(id);
    }

    // Show confirmation modal
    showConfirm(message, onConfirm, onCancel) {
        const modal = this.createModal({
            id: "confirm-modal",
            title: "Confirm Action",
            content: `<p>${message}</p>`,
            buttons: [
                {
                    text: "Cancel",
                    class: "psr-btn-secondary",
                    action: "cancel"
                },
                {
                    text: "Confirm",
                    class: "psr-btn-danger",
                    action: "confirm"
                },
            ],
        });

        const confirmBtn = modal.querySelector('button[data-action="confirm"]');
        const cancelBtn = modal.querySelector('button[data-action="cancel"]');

        if (confirmBtn) {
            confirmBtn.onclick = () => {
                this.closeModal(modal);
                if (typeof onConfirm === 'function') onConfirm();
                else if (typeof onConfirm === 'string') eval(onConfirm);
            };
        }

        if (cancelBtn) {
            cancelBtn.onclick = () => {
                this.closeModal(modal);
                if (typeof onCancel === 'function') onCancel();
                else if (typeof onCancel === 'string') eval(onCancel);
            };
        }

        this.openModal("confirm-modal");
    }

    // Show alert modal
    showAlert(message, type = "info") {
        const iconMap = {
            success: "fa-check-circle",
            danger: "fa-exclamation-triangle",
            warning: "fa-exclamation-circle",
            info: "fa-info-circle",
        };

        const modal = this.createModal({
            id: "alert-modal",
            title: "Alert",
            content: `
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <i class="fa-solid ${iconMap[type] || iconMap.info
                }" style="font-size: 2rem; color: var(--clr-${type || "info"
                });"></i>
                    <p>${message}</p>
                </div>
            `,
            buttons: [
                {
                    text: "OK",
                    class: "psr-btn-primary",
                    onClick: `psrModals.closeModal(document.getElementById('alert-modal'))`,
                },
            ],
        });

        this.openModal("alert-modal");
    }
}

// Initialize modals when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
    window.psrModals = new PSRModals();
});

// Export for module usage
if (typeof module !== "undefined" && module.exports) {
    module.exports = PSRModals;
}

// ===== MODALS COMPONENT End=====

// ===== TABS COMPONENT =====

(function () {
    function initTabs(root) {
        const tablist = root.querySelector('[role="tablist"]');
        const tabs = Array.from(root.querySelectorAll('[role="tab"]'));
        const panels = Array.from(root.querySelectorAll('[role="tabpanel"]'));

        function setActive(index) {
            tabs.forEach((t, i) => {
                const selected = i === index;
                t.classList.toggle("active", selected);
                t.setAttribute("aria-selected", selected ? "true" : "false");
                const panelId = t.getAttribute("aria-controls");
                const panel = root.querySelector("#" + panelId);
                if (panel) {
                    panel.classList.toggle("active", selected);
                    if (selected) panel.focus({ preventScroll: true });
                }
            });
        }

        // Click
        tabs.forEach((t, i) => {
            t.addEventListener("click", () => setActive(i));
        });

        // Keyboard navigation
        tablist.addEventListener("keydown", (e) => {
            const current = tabs.findIndex((t) => t.classList.contains("active"));
            let next = current;
            if (e.key === "ArrowRight") {
                next = (current + 1) % tabs.length;
            } else if (e.key === "ArrowLeft") {
                next = (current - 1 + tabs.length) % tabs.length;
            } else if (e.key === "Home") {
                next = 0;
            } else if (e.key === "End") {
                next = tabs.length - 1;
            } else {
                return;
            }
            e.preventDefault();
            tabs[next].focus();
            setActive(next);
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        document.querySelectorAll("[data-psr-tabs]").forEach(initTabs);
    });
})();
// ===== TABS COMPONENT End=====

// ===== MULTISELECT COMPONENT =====
/**
 * PSR Multiselect Component
 * A modern, reusable multiselect component with search functionality
 */
(function ($) {
    $.fn.PSRMultiselect = function (options) {
        const defaults = {
            dataUrl: null,
            dataRoot: null,
            data: [],
            selected: [],
            valueField: "id",
            labelField: "title",
            descriptionField: "description",
            imageField: "image", // New: field for image preview
            concatFields: null, // New: comma-separated field names to concatenate
            placeholder: "Select options...",
            searchPlaceholder: "Search...",
            onChange: function (values, objects) { },
        };

        const initOne = function ($select, settings) {
            if ($select.is("[multiple]")) $select.attr("multiple", true);
            $select.hide();
            const $container = $('<div class="psr-multiselect"></div>').insertAfter(
                $select
            );
            const isReadonly = $select.is('[readonly]');
            if (isReadonly || $select.is('[disabled]')) {
                $container.addClass('psr-disabled');
                $container.css({ 'pointer-events': 'none', 'opacity': '0.6' });
            }
            // Container
            // Trigger + selected display
            const $trigger = $(
                '<div class="psr-multiselect-trigger"></div>'
            ).appendTo($container);
            const $selectedBox = $(
                '<div class="psr-multiselect-selected"><span class="psr-placeholder"></span></div>'
            ).appendTo($trigger);
            $selectedBox.find(".psr-placeholder").text(settings.placeholder);
            $(
                '<i class="fa-solid fa-chevron-down psr-multiselect-arrow"></i>'
            ).appendTo($trigger);

            // Dropdown
            const $dropdown = $(
                '<div class="psr-multiselect-dropdown"></div>'
            ).appendTo($container);
            const $searchWrap = $(
                '<div class="psr-multiselect-search"></div>'
            ).appendTo($dropdown);
            const $search = $(
                `<input type="text" class="psr-multiselect-search-input" placeholder="${settings.searchPlaceholder}">`
            ).appendTo($searchWrap);
            const $options = $(
                '<div class="psr-multiselect-options"></div>'
            ).appendTo($dropdown);

            function getImageUrl(value) {
                if (!value) return null;
                if (typeof value === 'string') {
                    if (value.startsWith('http')) return value;
                    if (value.startsWith('/')) return 'https://cdn.inchbrick.com' + value;
                    return value;
                }
                if (typeof value === 'object') {
                    if (value.file) return getImageUrl(value.file);
                    if (value.path) return getImageUrl(value.path);
                    if (value.url) return getImageUrl(value.url);
                }
                return null;
            }

            function getNestedValue(row, field) {
                if (!field) return null;
                const parts = field.split('.');
                let current = row;
                for (const part of parts) {
                    if (current == null) return null;
                    current = current[part];
                }
                return current;
            }

            function syncSelect(values) {
                const set = new Set(values.map(String));
                $select.find("option").each(function () {
                    this.selected = set.has(String(this.value));
                });
            }

            function getSelectedValues() {
                return $select
                    .find("option:selected")
                    .map(function () {
                        return this.value;
                    })
                    .get()
                    .filter(function (val) {
                        // ✅ Filter out empty placeholder values - treat as no selection
                        return val !== "" && val !== null && val !== undefined;
                    });
            }

            function getSelectedObjects() {
                const values = getSelectedValues();
                const items = $select.data("psr-items") || [];
                const valueField = settings.valueField;
                return items.filter(item => {
                    const val = String(getNestedValue(item, valueField) ?? item.value ?? item.id);
                    return values.includes(val);
                });
            }

            function renderDisplay() {
                const values = getSelectedValues();
                if (!values.length) {
                    $selectedBox.html(
                        `<span class="psr-placeholder">${settings.placeholder}</span>`
                    );
                    return;
                }
                const labels = values.map((v) =>
                    $select.find(`option[value="${v}"]`).text()
                );
                // chips with +N more
                const maxVisible = 2;
                const chips = labels
                    .slice(0, maxVisible)
                    .map(
                        (text, idx) => `
					<div class="psr-multiselect-chip" data-value="${values[idx]}">
						<span>${text}</span>
						<button type="button" class="psr-multiselect-chip-remove" aria-label="Remove ${text}"><i class="fa-solid fa-times"></i></button>
					</div>
				`
                    )
                    .join("");
                const more =
                    labels.length > maxVisible
                        ? `<span class="psr-multiselect-count">+${labels.length - maxVisible
                        } more</span>`
                        : "";
                $selectedBox.html(chips + more);

                $selectedBox
                    .find(".psr-multiselect-chip-remove")
                    .on("click", function (e) {
                        e.stopPropagation();
                        const val = $(this).closest(".psr-multiselect-chip").data("value");
                        const $opt = $select.find(`option[value="${val}"]`);
                        $opt.prop("selected", false);
                        $options
                            .find(`.psr-multiselect-option[data-value="${val}"]`)
                            .removeClass("selected");
                        renderDisplay();
                        settings.onChange(getSelectedValues(), getSelectedObjects());
                    });
            }

            function renderOptions(items) {
                $options.empty();
                // ✅ CRITICAL: Clear ALL existing options first to prevent any browser auto-selection
                $select.empty();

                // ✅ For single-select mode: Add a hidden placeholder option with empty value
                // This allows browser to select it (satisfying HTML requirement) but we treat it as "no selection"
                const isSingleSelect = !$select.is("[multiple]");
                if (isSingleSelect) {
                    // Add hidden placeholder option that browser can auto-select
                    // We'll filter this out in getSelectedValues()
                    const placeholderOpt = new Option("", "", true, true); // selected by default
                    placeholderOpt.style.display = "none"; // Hide it
                    $select.append(placeholderOpt);
                }

                items.forEach((item) => {
                    const value = item[settings.valueField];

                    // Handle concatenated fields
                    let label;
                    if (settings.concatFields) {
                        const fieldNames = settings.concatFields.split(",");
                        label = fieldNames
                            .map((field) => item[field.trim()] || "")
                            .join(" ")
                            .trim();
                    } else {
                        label = item[settings.labelField];
                    }

                    const desc = item[settings.descriptionField] || "";
                    const imgUrl = getImageUrl(item[settings.imageField]);

                    // ✅ Create option with explicit selected=false
                    const option = new Option(label, value, false, false);
                    $select.append(option);

                    // ✅ Don't check browser's selection state here - rely on applySelected() to set selection
                    const $opt = $(`
						<div class="psr-multiselect-option" data-value="${value}" role="option" aria-selected="false">
							<div class="psr-multiselect-checkbox"></div>
                            ${imgUrl ? `<div class="psr-multiselect-option-image"><img src="${imgUrl}" alt="${label}"></div>` : ""}
							<div class="psr-multiselect-option-content">
								<div class="psr-multiselect-option-label">${label}</div>
								${desc ? `<div class="psr-multiselect-option-description">${desc}</div>` : ""}
							</div>
						</div>
					`);
                    $opt.on("click", function (e) {
                        e.stopPropagation();
                        const $li = $(this);
                        const val = String($li.data("value"));
                        const $selOpt = $select.find(`option[value="${val}"]`);

                        if ($select.is("[multiple]")) {
                            // ✅ Multi-select toggle
                            const newState = !$li.hasClass("selected");
                            $li
                                .toggleClass("selected", newState)
                                .attr("aria-selected", newState);
                            $selOpt.prop("selected", newState);
                        } else {
                            // ✅ Single-select mode
                            $options
                                .find(".psr-multiselect-option")
                                .removeClass("selected")
                                .attr("aria-selected", false);
                            // Deselect all including placeholder
                            $select.find("option").prop("selected", false);

                            $li.addClass("selected").attr("aria-selected", true);
                            $selOpt.prop("selected", true);

                            // Close dropdown after selecting one
                            $container.removeClass("active");
                        }

                        renderDisplay();
                        settings.onChange(getSelectedValues(), getSelectedObjects());
                    });

                    $options.append($opt);
                });
                // ✅ Don't call renderDisplay() here - let the caller handle it after applying selection
                // The caller (applyData) will handle selecting placeholder or applying selected values
            }

            function applySelected(selectedList) {
                if (!Array.isArray(selectedList) || !selectedList.length) return;

                const set = new Set(selectedList.map(String));

                // Update the hidden <select>
                // ✅ First deselect placeholder option if it exists
                $select.find('option[value=""]').prop("selected", false);
                $select.find("option").each(function () {
                    this.selected = set.has(String(this.value));
                });

                // ✅ Update the rendered dropdown options
                $options.find(".psr-multiselect-option").each(function () {
                    const val = String($(this).data("value"));
                    const isSel = set.has(val);
                    $(this).toggleClass("selected", isSel).attr("aria-selected", isSel);
                });
            }

            // Search filter (client-side)
            $search.on("input", function () {
                const term = $(this).val().toLowerCase();
                $options.children(".psr-multiselect-option").each(function () {
                    const text = $(this)
                        .find(".psr-multiselect-option-label")
                        .text()
                        .toLowerCase();
                    const desc = $(this)
                        .find(".psr-multiselect-option-description")
                        .text()
                        .toLowerCase();
                    $(this).toggle(text.includes(term) || desc.includes(term));
                });
            });

            // Toggle dropdown
            $trigger.on("click", function () {
                $container.toggleClass("active");
            });
            $(document).on("click", function (e) {
                if (!$container.is(e.target) && $container.has(e.target).length === 0) {
                    $container.removeClass("active");
                }
            });

            // Load data: prefer options.data; else dataUrl
            const selectedInit =
                settings.selected && settings.selected.length
                    ? settings.selected
                    : (function () {
                        // ✅ Check if data-selected attribute exists (even if empty string)
                        // Use data() first, then fallback to attr() for compatibility
                        let dataSelected = $select.attr("data-selected");
                        if (dataSelected === undefined || dataSelected === null) {
                            dataSelected = $select.attr("data-selected");
                        }

                        // ✅ If data-selected attribute exists at all (including empty string), use it
                        // Empty string means explicitly no selection - don't check HTML options
                        if (dataSelected !== undefined && dataSelected !== null) {
                            // Empty string means explicitly no selection
                            if (dataSelected === "" || (Array.isArray(dataSelected) && dataSelected.length === 0)) {
                                return [];
                            }

                            // Handle single value (not JSON array)
                            if (
                                typeof dataSelected === "string" &&
                                dataSelected &&
                                !dataSelected.startsWith("[") &&
                                !dataSelected.startsWith("{")
                            ) {
                                return [dataSelected];
                            }

                            // If already an array, return it
                            if (Array.isArray(dataSelected)) {
                                return dataSelected;
                            }

                            // Try to parse as JSON
                            if (typeof dataSelected === "string") {
                                try {
                                    const parsed = JSON.parse(dataSelected || "[]");
                                    return Array.isArray(parsed) ? parsed : [];
                                } catch (e) {
                                    return [];
                                }
                            }

                            return [];
                        }

                        // ✅ If data-selected is NOT provided at all, check select element's selected options
                        // This preserves pre-selected options from HTML (useful for edit forms)
                        // But ONLY if data-selected was never set
                        const preSelected = $select.find("option:selected").map(function () {
                            return this.value;
                        }).get();
                        return preSelected.length > 0 ? preSelected : [];
                    })();

            const applyData = function (items) {
                // Store raw items but normalize them for our internal use
                $select.data("psr-items", items);
                // Normalize and render
                const normalized = items.map(function (it) {
                    return {
                        [settings.valueField]: getNestedValue(it, settings.valueField) ?? it.value ?? it.id,
                        [settings.labelField]:
                            (settings.concatFields ? (function () {
                                const fieldNames = settings.concatFields.split(",");
                                return fieldNames
                                    .map((field) => getNestedValue(it, field.trim()) || "")
                                    .join(" ")
                                    .trim();
                            })() : getNestedValue(it, settings.labelField)) ?? it.label ?? it.title ?? it.name,
                        [settings.descriptionField]:
                            getNestedValue(it, settings.descriptionField) ??
                            it.description ??
                            (it.desc || ""),
                        [settings.imageField]:
                            getImageUrl(getNestedValue(it, settings.imageField)) ??
                            it.image ??
                            it.file ??
                            it.path ??
                            it.url ??
                            "",
                    };
                });

                renderOptions(normalized);

                // ✅ Apply default selected
                if (selectedInit && selectedInit.length) {
                    // Real values to select - deselect placeholder first
                    applySelected(selectedInit);
                    renderDisplay();
                } else {
                    // ✅ No selection wanted - ensure placeholder is selected (for single-select)
                    // This satisfies browser requirement while showing placeholder text
                    const isSingleSelect = !$select.is("[multiple]");
                    if (isSingleSelect) {
                        // Select placeholder option (empty value) - will be filtered out in getSelectedValues()
                        const $placeholderOpt = $select.find('option[value=""]').first();
                        if ($placeholderOpt.length) {
                            $select.find("option").prop("selected", false);
                            $placeholderOpt.prop("selected", true);
                        }
                    } else {
                        // Multi-select: just deselect all
                        $select.find("option").prop("selected", false);
                    }
                    $options.find(".psr-multiselect-option").removeClass("selected").attr("aria-selected", false);
                    renderDisplay();
                }
            };

            fetch(api(`${settings.dataUrl}?limit=all`)).then((res) => res.json()).then((json) => {
                const items = settings.dataRoot ? json && json[settings.dataRoot] : json;
                const arr = Array.isArray(items) ? items : [];
                applyData(arr);
            })
                .catch(() => applyData([]));
        };

        return this.each(function () {
            // Merge defaults with options and data-attributes
            const $select = $(this);
            const dataOpts = {
                dataUrl: $select.data("url") || undefined,
                dataRoot: $select.data("root") || undefined,
                valueField:
                    $select.data("valueField") ||
                    $select.data("value-field") ||
                    undefined,
                labelField:
                    $select.data("labelField") ||
                    $select.data("label-field") ||
                    undefined,
                descriptionField:
                    $select.data("descriptionField") ||
                    $select.data("description-field") ||
                    undefined,
                imageField:
                    $select.data("imageField") ||
                    $select.data("image-field") ||
                    undefined,
                concatFields:
                    $select.data("concatFields") ||
                    $select.data("concat-fields") ||
                    undefined,
                placeholder: $select.data("placeholder") || undefined,
                searchPlaceholder:
                    $select.data("searchPlaceholder") ||
                    $select.data("search-placeholder") ||
                    undefined,
            };
            const settings = $.extend({}, defaults, options, dataOpts);
            initOne($select, settings);
        });
    };
})(jQuery);

/* Permission toggle  */

(function ($) {
    "use strict";

    const defaults = {
        dataUrl: null,
        dataRoot: "data",
        idField: "id",
        titleField: "title",
        // selected can be object map: { [pageId]: { create:true, read:true, update:false, delete:false } }
        selected: {},
        roleId: null,
        onChange: function (state) { },
    };

    $.fn.PSRPagePermissions = function (options) {
        const $host = $(this);
        if (typeof options === "string") {
            const method = options;
            const api = $host.data("psr-pp-api");
            if (!api) return $host;
            if (method === "get") return api.get();
            if (method === "set") {
                api.set(arguments[1] || {});
                return $host;
            }
            if (method === "reset") {
                api.reset();
                return $host;
            }
            if (method === "refresh") {
                api.refresh();
                return $host;
            }
            return $host;
        }

        const settings = $.extend({}, defaults, options, {
            // allow data-* overrides
            dataUrl: $host.data("url") || options?.dataUrl || defaults.dataUrl,
            dataRoot: $host.data("root") || options?.dataRoot || defaults.dataRoot,
            roleId:
                $host.data("roleId") ||
                $host.data("role-id") ||
                options?.roleId ||
                defaults.roleId,
        });

        let pages = [];
        let state = {}; // { [roleId_pageId]: { create, read, update, delete, download } }

        function init() {
            state = clone(settings.selected || {});
            load();
            bindGlobal();
        }

        function load() {
            if (settings.data && Array.isArray(settings.data)) {
                // if direct data is provided, render that
                pages = settings.data;
                render(pages);
                return;
            }

            if (!settings.dataUrl) {
                render([]);
                return;
            }

            // otherwise, fetch from remote API
            $host.html(
                '<div class="psr-permissions-loading" style="padding:24px;text-align:center;color:#6b7280">Loading...</div>'
            );
            $.getJSON(window.api(settings.dataUrl), { limit: "all", sort: "id:desc" })
                .done(function (res) {
                    const arr = settings.dataRoot ? res && res[settings.dataRoot] : res;
                    pages = Array.isArray(arr) ? arr : [];
                    render(pages);
                })
                .fail(function () {
                    $host.html(
                        '<div class="psr-permissions-empty" style="padding:24px;text-align:center;color:#6b7280">Failed to load pages</div>'
                    );
                });
        }

        function render(items) {
            const html = `
         <div class="psr-page-permissions-inner">
            <div class="psr-page-permissions-search d-flex align-items-center gap-2">
                <div class="d-flex align-items-center gap-1 pp-select-all-wrap">
                  <input type="checkbox" id="pp-select-all" class="pp-select-all">
                  <label for="pp-select-all" style="margin:0; user-select:none;">Select All</label>
                </div>
                <input type="text" class="pp-search psr-table-search" placeholder="Search page...">
            </div>
            <div class="psr-page-permissions-list"></div>
        </div>
    `;
            $host.html(html);

            renderList(items);

            // Bind search input
            $host.find(".pp-search")
                .off("input")
                .on("input", function () {
                    const term = $(this).val().toLowerCase();
                    filterPages(term, items);
                });

            // Bind select all checkbox
            $host
                .find("#pp-select-all")
                .off("change")
                .on("change", function () {
                    const checked = $(this).is(":checked");
                    Object.keys(state).forEach((key) => {
                        const s = state[key];
                        s.create = checked;
                        s.read = checked;
                        s.update = checked;
                        s.delete = checked;
                        s.download = checked;
                    });
                    // Reflect in UI
                    $host
                        .find(".pp-row .pp-action input[type=checkbox]")
                        .prop("checked", checked);
                    $host.find(".pp-row .pp-page").prop("checked", checked);
                    notify();
                });
        }

        function renderList(items) {
            let html = "";

            items.forEach((group) => {
                if (group.roleTitle && Array.isArray(group.pages)) {
                    html += `<div class="pp-role-group">
                        <div class="pp-role-title">${escapeHtml(
                        group.roleTitle
                    )}</div>`;
                    group.pages.forEach((it) => {
                        const id = it[settings.idField];
                        const title = it[settings.titleField] || "Untitled";
                        const s = ensureState(id, group.roleId);
                        html += rowTemplate(id, group.roleId, title, allCrudOn(s), s);
                    });
                    html += `</div>`;
                } else {
                    // fallback: no grouping
                    const id = group[settings.idField];
                    const title = group[settings.titleField] || "Untitled";
                    const s = ensureState(id, settings.roleId);
                    html += rowTemplate(id, settings.roleId, title, allCrudOn(s), s);
                }
            });

            $host.find(".psr-page-permissions-list").html(html);
            bindRows();
            notify();
        }

        function rowTemplate(id, roleId, title, pageChecked, s) {
            return (
                '<div class="pp-row" data-id="' +
                id +
                '" data-role-id="' +
                roleId +
                '">' +
                '<div class="pp-check"><input type="checkbox" class="pp-page" ' +
                (pageChecked ? "checked" : "") +
                "></div>" +
                '<div class="pp-title">' +
                escapeHtml(title) +
                "</div>" +
                '<div class="pp-controls">' +
                inlineItem("create", s.create) +
                inlineItem("read", s.read) +
                inlineItem("update", s.update) +
                inlineItem("delete", s.delete) +
                inlineItem("download", s.download) +
                "</div>" +
                "</div>"
            );
        }

        function inlineItem(action, isOn) {
            return (
                '<div class="pp-action" data-action="' +
                action +
                '">' +
                '<span class="pp-action-label">' +
                action +
                "</span>" +
                '<label class="pp-toggle">' +
                '<input type="checkbox" ' +
                (isOn ? "checked" : "") +
                ">" +
                '<span class="pp-slider"></span>' +
                "</label>" +
                "</div>"
            );
        }

        function bindGlobal() {
            // click outside to close any open dropdowns
            $(document).on("click.psrpp", function (e) {
                if (!$host.has(e.target).length) {
                    $host.find(".pp-dd").removeClass("active");
                }
            });
        }

        function bindRows() {
            $host
                .find(".pp-row .pp-page")
                .off("change")
                .on("change", function () {
                    const $row = $(this).closest(".pp-row");
                    const id = $row.data("id");
                    const roleId = $row.data("role-id");
                    const checked = $(this).is(":checked");
                    const s = ensureState(id, roleId);
                    s.create = checked;
                    s.read = checked;
                    s.update = checked;
                    s.delete = checked;
                    s.download = checked;

                    $row.find(".pp-action input[type=checkbox]").prop("checked", checked);
                    applyReadRule($row, s);
                    notify();

                    // Update central "Select All"
                    const allChecked = Object.keys(state).every((pid) =>
                        allCrudOn(state[pid])
                    );
                    $host.find("#pp-select-all").prop("checked", allChecked);
                });

            // per-action toggles
            $host
                .find(".pp-action input[type=checkbox]")
                .off("change")
                .on("change", function () {
                    const $item = $(this).closest(".pp-action");
                    const action = $item.data("action");
                    const $row = $(this).closest(".pp-row");
                    const id = $row.data("id");
                    const roleId = $row.data("role-id");
                    const s = ensureState(id, roleId);
                    const on = $(this).is(":checked");
                    s[action] = on;

                    if (action === "read" && !on) {
                        s.create = false;
                        s.update = false;
                        s.delete = false;
                        s.download = false;
                        $row.find(".pp-action input[type=checkbox]").prop("checked", false);
                        $row.find(".pp-page").prop("checked", false);
                    } else {
                        $row.find(".pp-page").prop("checked", allCrudOn(s));
                    }

                    // Update central "Select All"
                    const allChecked = Object.keys(state).every((pid) =>
                        allCrudOn(state[pid])
                    );
                    $host.find("#pp-select-all").prop("checked", allChecked);

                    applyReadRule($row, s);
                    notify();
                });
        }

        function applyReadRule($row, s) {
            // When read is off, visually dim row (access off)
            $row.toggleClass("disabled", !s.read);
        }

        function allCrudOn(s) {
            return !!(s.create && s.read && s.update && s.delete && s.download);
        }

        function ensureState(pageId, roleId) {
            const key = roleId ? `${roleId}_${pageId}` : pageId;
            if (!state[key]) {
                state[key] = {
                    create: false,
                    read: false,
                    update: false,
                    delete: false,
                    download: false,
                };
            }
            return state[key];
        }

        function get() {
            return clone(state);
        }
        function set(newState) {
            state = clone(newState || {});
            rerenderWithState();
        }
        function reset() {
            state = {};
            rerenderWithState();
        }
        function refresh() {
            load();
        }

        function rerenderWithState() {
            // rebind to reflect new state
            render(pages);
        }

        function notify() {
            settings.onChange(get());
        }

        // Build payload: [{ pageId, roleId, actions: [..] }]
        function toPayload() {
            const out = [];
            Object.keys(state).forEach(function (key) {
                const s = state[key] || {};
                const actions = [];
                if (s.create) actions.push("create");
                if (s.read) actions.push("read");
                if (s.update) actions.push("update");
                if (s.delete) actions.push("delete");
                if (s.download) actions.push("download");

                if (actions.length) {
                    const parts = key.split('_');
                    const roleId = parts.length > 1 ? parts[0] : settings.roleId;
                    const pageIdOnly = parts.length > 1 ? parts[1] : key;

                    out.push({
                        pageId: String(pageIdOnly),
                        roleId: roleId,
                        actions: actions,
                    });
                }
            });
            return out;
        }

        // helper to find the page object by ID (works for grouped pages)
        function findPageById(id) {
            for (let group of pages) {
                for (let p of group.pages || []) {
                    if (String(p.id) === String(id)) return p;
                }
            }
            return null;
        }

        function escapeHtml(str) {
            return String(str).replace(/[&<>"']/g, function (m) {
                return {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#39;",
                }[m];
            });
        }
        function clone(obj) {
            return JSON.parse(JSON.stringify(obj || {}));
        }

        function setRoleId(val) {
            settings.roleId = val;
        }

        function filterPages(term, items) {
            if (!term) {
                renderList(items);
                return;
            }

            const filtered = items.map(group => {
                if (group.roleTitle && Array.isArray(group.pages)) {
                    const matchedPages = group.pages.filter(p =>
                        (p[settings.titleField] || "").toLowerCase().includes(term)
                    );
                    if (matchedPages.length > 0) {
                        return { ...group, pages: matchedPages };
                    }
                } else {
                    const title = group[settings.titleField] || "";
                    if (title.toLowerCase().includes(term)) return group;
                }
                return null;
            }).filter(Boolean);

            renderList(filtered);
        }

        const api = { get, set, reset, refresh, getPayload: toPayload, setRoleId };
        $host.data("psr-pp-api", api);
        init();
        return $host;
    };
})(jQuery);

/*permission toggle*/

/*Advanced Kanban Drag and Drop System*/
(function () {
    const DEFAULTS = {
        allowCopy: true,
        allowMove: true,
        getItemId: (item) => item.id,
        getItemTitle: (item) => item.title || String(item.id),
        getItemBadge: (item) => item.badge || "",
        renderItem: null,
        isSectionCopyOnly: (section) => !!section.copyOnly,
        isSectionLibrary: (section) => !!section.library,
        showRemove: (section) => !section.library,
        onRemove: () => { },
        onChange: () => { },
        onDragStart: () => { },
        onDragEnd: () => { },
        onDrop: () => { },
        enableAnimations: true,
        enableHoverEffects: true,
        enableTouchSupport: true,
    };

    function createElement(tag, className, attrs) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    }

    function deepClone(data) {
        return JSON.parse(JSON.stringify(data));
    }

    function addAnimationClass(element, className, duration = 300) {
        element.classList.add(className);
        setTimeout(() => element.classList.remove(className), duration);
    }

    function createTooltip(text, position = "top") {
        const tooltip = createElement("div", "kanban-tooltip");
        tooltip.textContent = text;
        tooltip.setAttribute("data-position", position);
        return tooltip;
    }

    class AdvancedKanbanBoard {
        constructor(rootEl, sections, options = {}) {
            this.rootEl = rootEl;
            this.sections = deepClone(sections);
            this.options = Object.assign({}, DEFAULTS, options);
            this.mode = this.options.mode || "move";
            this.dragState = null;
            this.touchState = null;
            this.animations = this.options.enableAnimations;
            this.hoverEffects = this.options.enableHoverEffects;
            this.touchSupport = this.options.enableTouchSupport;

            this.init();
        }

        init() {
            this.render();
            this.setupTouchSupport();
            this.setupKeyboardSupport();
        }

        setData(sections) {
            this.sections = deepClone(sections);
            this.render();
        }

        getData() {
            return deepClone(this.sections);
        }

        setupTouchSupport() {
            if (!this.touchSupport) return;

            this.rootEl.addEventListener(
                "touchstart",
                this.handleTouchStart.bind(this),
                { passive: false }
            );
            this.rootEl.addEventListener(
                "touchmove",
                this.handleTouchMove.bind(this),
                { passive: false }
            );
            this.rootEl.addEventListener("touchend", this.handleTouchEnd.bind(this), {
                passive: false,
            });
        }

        setupKeyboardSupport() {
            this.rootEl.addEventListener("keydown", this.handleKeyboard.bind(this));
            this.rootEl.setAttribute("tabindex", "0");
        }

        handleTouchStart(e) {
            const item = e.target.closest(".kanban-item");
            if (!item) return;

            this.touchState = {
                startX: e.touches[0].clientX,
                startY: e.touches[0].clientY,
                item: item,
                dragged: false,
            };
        }

        handleTouchMove(e) {
            if (!this.touchState) return;

            const deltaX = e.touches[0].clientX - this.touchState.startX;
            const deltaY = e.touches[0].clientY - this.touchState.startY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            if (distance > 10 && !this.touchState.dragged) {
                this.touchState.dragged = true;
                this.startDrag(e, this.touchState.item);
            }
        }

        handleTouchEnd(e) {
            if (this.touchState && this.touchState.dragged) {
                this.endDrag(e);
            }
            this.touchState = null;
        }

        handleKeyboard(e) {
            if (e.key === "Escape" && this.dragState) {
                this.cancelDrag();
            }
        }

        startDrag(e, item) {
            const sectionIndex = this.getItemSectionIndex(item);
            const itemIndex = this.getItemIndexInSection(item, sectionIndex);

            if (sectionIndex === -1 || itemIndex === -1) return;

            const dragItem = this.sections[sectionIndex].items[itemIndex];
            const section = this.sections[sectionIndex];
            const sectionForcesCopy = this.options.isSectionCopyOnly(section);

            this.dragState = {
                sourceEl: item,
                sectionIndex,
                itemIndex,
                item: dragItem,
                mode: sectionForcesCopy ? "copy" : this.mode,
            };

            item.classList.add("dragging");
            this.rootEl.classList.add("drag-active");

            if (this.animations) {
                addAnimationClass(item, "drag-start-animation");
            }

            this.options.onDragStart?.(dragItem);
        }

        endDrag(e) {
            if (!this.dragState) return;

            this.dragState.sourceEl.classList.remove("dragging");
            this.rootEl.classList.remove("drag-active");
            this.clearDropTargets();

            this.options.onDragEnd?.(this.dragState.item);
            this.dragState = null;
        }

        cancelDrag() {
            if (!this.dragState) return;

            this.dragState.sourceEl.classList.remove("dragging");
            this.rootEl.classList.remove("drag-active");
            this.clearDropTargets();
            this.dragState = null;
        }

        onDragStart = (e, sectionIndex, itemIndex) => {
            const item = this.sections[sectionIndex].items[itemIndex];
            const section = this.sections[sectionIndex];
            const sectionForcesCopy = this.options.isSectionCopyOnly(section);
            const payload = {
                sectionIndex,
                itemIndex,
                item,
                mode: sectionForcesCopy ? "copy" : this.mode,
            };

            e.dataTransfer.effectAllowed = payload.mode === "copy" ? "copy" : "move";
            e.dataTransfer.setData("application/json", JSON.stringify(payload));

            e.currentTarget.classList.add("dragging");
            this.rootEl.classList.add("drag-active");
            this.dragState = { sourceEl: e.currentTarget, ...payload };

            if (this.animations) {
                addAnimationClass(e.currentTarget, "drag-start-animation");
            }

            this.options.onDragStart?.(item);
        };

        onDragEnd = (e) => {
            e.currentTarget.classList.remove("dragging");
            this.rootEl.classList.remove("drag-active");
            this.clearDropTargets();

            if (this.animations) {
                addAnimationClass(e.currentTarget, "drag-end-animation");
            }

            this.options.onDragEnd?.(this.dragState?.item);
            this.dragState = null;
        };

        onDragOver = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = this.mode === "copy" ? "copy" : "move";

            const dropZone = e.currentTarget.closest(".kanban-column");
            if (dropZone) {
                dropZone.classList.add("drop-target");

                if (this.animations) {
                    addAnimationClass(dropZone, "drop-target-animation");
                }
            }
        };

        onDragLeave = (e) => {
            const dropZone = e.currentTarget.closest(".kanban-column");
            if (dropZone && !dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove("drop-target");
            }
        };

        onDrop = (e, targetSectionIndex) => {
            e.preventDefault();
            const dropZone = e.currentTarget.closest(".kanban-column");
            if (dropZone) {
                dropZone.classList.remove("drop-target");
            }

            const raw = e.dataTransfer.getData("application/json");
            if (!raw) return;

            const payload = JSON.parse(raw);
            const { sectionIndex: fromIdx, itemIndex: fromItemIdx, item } = payload;

            const sourceItems = this.sections[fromIdx].items;
            const targetItems = this.sections[targetSectionIndex].items;
            const targetSection = this.sections[targetSectionIndex];
            const originSection = this.sections[fromIdx];

            const effectiveMode =
                this.options.isSectionCopyOnly(originSection) ||
                    this.options.isSectionCopyOnly(targetSection)
                    ? "copy"
                    : this.mode;

            if (effectiveMode === "copy") {
                // Prevent duplicates
                const existingIds = new Set(
                    targetItems.map((x) => this.options.getItemId(x))
                );
                if (existingIds.has(this.options.getItemId(item))) {
                    this.showNotification(
                        "Item already exists in target section",
                        "warning"
                    );
                    return;
                }

                const newItem = deepClone(item);
                targetItems.push(newItem);

                if (this.animations) {
                    addAnimationClass(dropZone, "drop-success-animation");
                }
            } else {
                const [moved] = sourceItems.splice(fromItemIdx, 1);
                targetItems.push(moved);

                if (this.animations) {
                    addAnimationClass(dropZone, "drop-success-animation");
                }
            }

            this.render();
            this.options.onChange(this.getData());
            this.options.onDrop?.(item, targetSection);
        };

        clearDropTargets() {
            this.rootEl
                .querySelectorAll(".drop-target")
                .forEach((el) => el.classList.remove("drop-target"));
        }

        getItemSectionIndex(item) {
            for (let i = 0; i < this.sections.length; i++) {
                const section = this.sections[i];
                if (section.items.some((it) => it.id === item.dataset.itemId)) {
                    return i;
                }
            }
            return -1;
        }

        getItemIndexInSection(item, sectionIndex) {
            if (sectionIndex === -1) return -1;
            const itemId = item.dataset.itemId;
            return this.sections[sectionIndex].items.findIndex(
                (it) => it.id === itemId
            );
        }

        showNotification(message, type = "info") {
            const notification = createElement(
                "div",
                `kanban-notification kanban-notification-${type}`
            );
            notification.innerHTML = `
        <i class="fa-solid fa-${this.getNotificationIcon(type)}"></i>
        <span>${message}</span>
      `;

            this.rootEl.appendChild(notification);

            setTimeout(() => {
                notification.classList.add("show");
            }, 10);

            setTimeout(() => {
                notification.classList.remove("show");
                setTimeout(() => notification.remove(), 300);
            }, 3000);
        }

        getNotificationIcon(type) {
            const icons = {
                success: "check-circle",
                error: "exclamation-triangle",
                warning: "exclamation-circle",
                info: "info-circle",
            };
            return icons[type] || "info-circle";
        }

        renderColumn(section, sectionIndex) {
            const col = createElement("div", "kanban-column");
            if (section.library) col.classList.add("library");
            if (section.id === "assigned") col.classList.add("assigned");

            const header = createElement("div", "kanban-column-header");
            const title = createElement("div", "kanban-column-title");
            title.innerHTML = `
        <i class="fa-solid fa-${this.getSectionIcon(section)}"></i>
        <span>${section.title}</span>
      `;
            header.appendChild(title);

            const badge = createElement("span", "kanban-badge");
            badge.textContent = section.items.length;
            header.appendChild(badge);
            col.appendChild(header);

            const body = createElement("div", "kanban-column-body");
            col.appendChild(body);

            // Make the entire body droppable
            if (section.library || section.id === "assigned") {
                body.addEventListener("dragover", (e) => this.onDragOver(e));
                body.addEventListener("dragleave", (e) => this.onDragLeave(e));
                body.addEventListener("drop", (e) => {
                    e.preventDefault();
                    this.onDrop(e, sectionIndex);
                });
            }

            section.items.forEach((item, itemIndex) => {
                const itemEl = this.renderItem(item, section, sectionIndex, itemIndex);
                body.appendChild(itemEl);
            });

            return col;
        }

        renderItem(item, section, sectionIndex, itemIndex) {
            const itemEl = createElement("div", "kanban-item");
            itemEl.dataset.itemId = item.id;

            if (section.library) {
                itemEl.setAttribute("draggable", "true");
                itemEl.addEventListener("dragstart", (e) =>
                    this.onDragStart(e, sectionIndex, itemIndex)
                );
                itemEl.addEventListener("dragend", this.onDragEnd);
            }

            // Item content
            const content = createElement("div", "kanban-item-content");

            // Checkbox for library items
            if (section.library) {
                const checkbox = createElement("input", "kanban-checkbox");
                checkbox.type = "checkbox";
                checkbox.dataset.sourceId = item.sourceId;
                content.appendChild(checkbox);
            }

            // Icon
            if (item.icon) {
                const icon = createElement("div", "kanban-item-icon");
                icon.innerHTML = `<i class="${item.icon}"></i>`;
                content.appendChild(icon);
            }

            // Title and description
            const textContent = createElement("div", "kanban-item-text");
            const title = createElement("div", "kanban-item-title");
            title.textContent = item.title;
            textContent.appendChild(title);

            if (item.description) {
                const desc = createElement("div", "kanban-item-description");
                desc.textContent = item.description;
                textContent.appendChild(desc);
            }

            content.appendChild(textContent);

            // Status badge
            if (item.status !== undefined) {
                const status = createElement(
                    "div",
                    `kanban-item-status ${item.status ? "active" : "inactive"}`
                );
                status.textContent = item.status ? "Active" : "Inactive";
                content.appendChild(status);
            }

            // Remove button for assigned items
            if (section.id === "assigned" && this.options.showRemove(section)) {
                const removeBtn = createElement("button", "kanban-remove-btn");
                removeBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
                removeBtn.title = "Remove";
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.removeItem(item, section, sectionIndex);
                };
                content.appendChild(removeBtn);
            }

            itemEl.appendChild(content);

            // Hover effects
            if (this.hoverEffects) {
                itemEl.addEventListener("mouseenter", () => {
                    itemEl.classList.add("hover");
                });
                itemEl.addEventListener("mouseleave", () => {
                    itemEl.classList.remove("hover");
                });
            }

            return itemEl;
        }

        removeItem(item, section, sectionIndex) {
            const itemIndex = section.items.findIndex((it) => it.id === item.id);
            if (itemIndex !== -1) {
                section.items.splice(itemIndex, 1);
                this.render();
                this.options.onRemove?.(item);
                this.options.onChange(this.getData());
            }
        }

        getSectionIcon(section) {
            const icons = {
                "submenu-library": "list",
                assigned: "check-circle",
                default: "columns",
            };
            return icons[section.id] || icons.default;
        }

        render() {
            if (!this.boardEl) {
                this.boardEl = createElement("div", "kanban-board");
                this.rootEl.innerHTML = "";
                this.rootEl.appendChild(this.boardEl);
            } else {
                this.boardEl.innerHTML = "";
            }

            this.sections.forEach((section, idx) => {
                this.boardEl.appendChild(this.renderColumn(section, idx));
            });
        }
    }

    // Legacy KanbanBoard for backward compatibility
    class KanbanBoard extends AdvancedKanbanBoard {
        constructor(rootEl, sections, options = {}) {
            super(rootEl, sections, options);
        }
    }

    window.KanbanBoard = KanbanBoard;
    window.AdvancedKanbanBoard = AdvancedKanbanBoard;
})();

/*karban board*/
