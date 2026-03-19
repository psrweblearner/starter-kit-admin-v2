/**
 * PSR DataTable - HTML-Driven Library
 * Auto-initializes from data-api attributes
 */

(function () {
    'use strict';

    class PSRDataTable {
        static globalHandlers = {};
        static instances = new Map();

        static setHandlers(handlers) {
            this.globalHandlers = handlers;
        }

        static getInstance(id) {
            return this.instances.get(id);
        }

        constructor(tableElement) {
            this.table = tableElement;
            this.container = null;
            this.apiUrl = tableElement.getAttribute('data-api');
            this.hasFilter = tableElement.getAttribute('data-filter') === 'true';
            this.hasActions = tableElement.getAttribute('data-actions') === 'true';
            this.defaultField = tableElement.getAttribute('data-default-field') || 'title';
            this.filterFields = (tableElement.getAttribute('data-filter-fields') || '').split(',').map(f => f.trim()).filter(f => f);
            const pageSizeAttr = tableElement.getAttribute('data-page-size');
            this.pageSize = pageSizeAttr === 'all' ? 'all' : (parseInt(pageSizeAttr) || 10);

            // Blur configuration
            this.blurFields = new Set((tableElement.getAttribute('data-blur-field') || '').split(',').map(f => f.trim()).filter(f => f));
            this.unblurredFields = new Set(); // Fields user has unblurred


            // Concat configuration (support both attribute names)
            const concatAttr = tableElement.getAttribute('data-concat') || tableElement.getAttribute('data-combined-field') || '';
            this.concatConfig = this.parseConcatConfig(concatAttr);

            // Toggle field configuration - parse fields that should be rendered as toggles
            const toggleFieldsAttr = tableElement.getAttribute('data-toggle-field') || '';
            this.toggleFields = new Set(
                toggleFieldsAttr.split(',')
                    .map(f => f.trim())
                    .filter(f => f)
            );

            this.columns = [];
            this.data = [];
            this.filteredData = [];
            this.currentPage = 1;
            this.totalRecords = 0;
            this.searchQuery = '';

            // View Mode configuration
            this.hasCardView = tableElement.getAttribute('data-card-view') === 'true';
            this.currentView = 'list'; // 'list' or 'kanban'

            this.visibleColumns = new Set();
            this.filterSidebarOpen = false;
            this.filters = {};
            this.containerListenersAttached = false; // Track if container event listeners are attached

            // Sort state
            this.sortField = null; // Currently sorted column field
            this.sortDirection = null; // 'asc' or 'desc'

            // Sticky header option (data-sticky-header="true")
            this.stickyHeader = tableElement.getAttribute('data-sticky-header') === 'true';

            // Permission & Access Setup
            this.currentUser = window.authUser || {};
            this.userPermissions = this.currentUser.permissions || {};
            this.isAdmin = this.currentUser.role?.title?.toLowerCase() === 'admin';

            // Access level passed from data-access="{{user.access}}"
            this.accessLevel = tableElement.getAttribute('data-access') || 'own';

            // Field to check for ownership (default: createdBy)
            this.createdByField = tableElement.getAttribute('data-created-by-field') || 'createdBy';

            this.pageSlug = this.getPageSlug();

            // Refine hasActions based on permissions
            // If user has neither update nor delete permission, force hasActions to false
            if (this.hasActions) {
                const perms = this.userPermissions[this.pageSlug] || [];
                const canUpdate = this.isAdmin || perms.includes('update');
                const canDelete = this.isAdmin || perms.includes('delete');

                if (!canUpdate && !canDelete) {
                    this.hasActions = false;
                }
            }

            if (this.table.id) {
                PSRDataTable.instances.set(this.table.id, this);
            }

            this.init();
        }

        getPageSlug() {
            const path = window.location.pathname;
            const parts = path.split('/').filter(p => p);
            return parts[parts.length - 1] || 'dashboard';
        }

        parseConcatConfig(concatAttr) {
            // Parse concat configuration: "field1+field2:format:heading" or "field1+field2:format"
            if (!concatAttr) return [];

            return concatAttr.split(',').map(config => {
                const parts = config.trim().split(':');
                const fields = parts[0];
                const format = parts[1] || 'paren';
                const customHeading = parts[2] || null; // Optional custom heading

                const fieldList = fields.split('+').map(f => f.trim()).filter(f => f);

                if (fieldList.length < 2) return null; // Need at least 2 fields

                return {
                    fields: fieldList,
                    format: format.trim(),
                    customHeading: customHeading ? customHeading.trim() : null,
                    combinedField: fieldList.join('_') // e.g., "icon_title"
                };
            }).filter(c => c !== null);
        }

        async init() {
            // Create wrapper container
            this.container = document.createElement('div');
            this.container.className = 'psr-datatable-wrapper';
            this.table.parentNode.insertBefore(this.container, this.table);
            this.table.remove();

            // Load saved column settings FIRST (before fetching data)
            // This ensures stickyHeader value is correct before rendering
            this.loadColumnSettings();

            // Fetch data and discover columns
            await this.fetchData();

            // Load column settings again after columns are discovered
            // to apply widths and visibility to the discovered columns
            this.loadColumnSettings();

            // Render UI
            this.render();
            this.injectStyles();
        }

        async fetchData() {
            try {
                // Parse the base URL and existing query parameters
                const urlObj = new URL(this.apiUrl, window.location.origin);
                const params = new URLSearchParams(urlObj.search);

                // Add dynamic parameters (these will override if they exist in base URL)
                params.set('page', this.currentPage);
                params.set('limit', this.pageSize);

                // Data Scope Logic
                // If not admin AND access is not 'full', filter by own data
                if (!this.isAdmin && this.accessLevel !== 'full' && this.currentUser.id) {
                    params.set(this.createdByField, this.currentUser.id);
                }

                if (this.searchQuery) {
                    params.set('search', this.searchQuery);

                    // Use currently visible columns for search
                    // Filter out actions, images, and toggles if needed, or just send all visible fields
                    const visibleSearchFields = Array.from(this.visibleColumns).filter(field => {
                        const col = this.columns.find(c => c.field === field);
                        // Exclude actions and maybe images/toggles from text search
                        return col && col.type !== 'actions' && col.type !== 'image' && col.type !== 'toggle';
                    });

                    if (visibleSearchFields.length > 0) {
                        params.set('searchColumns', visibleSearchFields.join(','));
                    }
                }

                // Add sort parameter
                if (this.sortField && this.sortDirection) {
                    // Check if this is a combined field
                    let sortParam = `${this.sortField}:${this.sortDirection}`;

                    if (this.sortField.includes('_')) {
                        // Find the concat config for this field
                        const concatConfig = this.concatConfig.find(config =>
                            config.combinedField === this.sortField
                        );

                        if (concatConfig && concatConfig.fields.length > 0) {
                            // Build multi-field sort: field1:dir,field2:dir,...
                            sortParam = concatConfig.fields
                                .map(f => `${f}:${this.sortDirection}`)
                                .join(',');
                        }
                    }

                    params.set('sort', sortParam);
                }

                // Add column filters to query params
                for (const field in this.filters) {
                    const value = this.filters[field];
                    if (value !== null && value !== undefined && value !== '') {
                        // Handle range filters (min/max for numbers)
                        if (typeof value === 'object' && (value.min || value.max)) {
                            if (value.min) params.append(field, `>=${value.min}`);
                            if (value.max) params.append(field, `<=${value.max}`);
                        } else {
                            params.append(field, value);
                        }
                    }
                }
                // Convert URLSearchParams to plain object for fetchData
                const option = Object.fromEntries(params.entries());
                const url = `${urlObj.pathname}`;
                const data = await fetchData(url, { params: option });
                if (!data.status) throw new Error(`HTTP ${data.status}`);

                // Handle different API response formats
                if (Array.isArray(data.data)) {
                    this.data = data.data;
                    this.totalRecords = data.total;
                } else {
                    this.data = [];
                    this.totalRecords = 0;
                }

                // Auto-discover columns from first record
                if (this.columns.length === 0 && this.data.length > 0) {
                    this.discoverColumns(this.data[0]);
                    // Load saved column settings from localStorage
                    this.loadColumnSettings();
                }

                this.filteredData = [...this.data];

            } catch (error) {
                console.error('Fetch error:', error);
                this.data = [];
                this.filteredData = [];
            }
        }

        async reloadData(keepPage = true) {
            if (!keepPage) {
                this.currentPage = 1;
            }
            await this.fetchData();
            this.renderView();
        }

        async applyFilters() {
            // Reset to first page when applying filters
            this.currentPage = 1;

            // Fetch data with new filters
            await this.fetchData();

            // Re-render the view
            this.renderView();

            // Close the filter sidebar
            const filterSidebar = this.container.querySelector('#filter-sidebar');
            if (filterSidebar) {
                filterSidebar.classList.remove('active');
            }
        }

        discoverColumns(sampleRecord) {
            // We'll scan up to 10 records to discover all possible columns
            // This handles cases where the first record might have null values for nested objects
            const recordsToScan = this.data.slice(0, 10);
            const allColumnsMap = new Map();

            // Parse default fields for initial visibility
            const defaultFields = (this.defaultField || '').split(',').map(f => f.trim());

            // Helper function to flatten nested objects
            const flattenObject = (obj, prefix = '') => {
                const flattened = [];

                for (const key in obj) {
                    const value = obj[key];
                    const fieldPath = prefix ? `${prefix}.${key}` : key;

                    // Check if value is a nested object (but not null or array)
                    if (value && typeof value === 'object' && !Array.isArray(value) &&
                        !(value instanceof Date) && key !== 'actions') {
                        // Recursively flatten nested object
                        flattened.push(...flattenObject(value, fieldPath));
                    } else {
                        // Add as regular field
                        flattened.push({
                            field: fieldPath,
                            parentField: prefix || null,
                            value: value
                        });
                    }
                }

                return flattened;
            };

            // Iterate through sample records and collect all unique columns
            recordsToScan.forEach(record => {
                const flattenedFields = flattenObject(record);

                for (const item of flattenedFields) {
                    const { field, parentField, value } = item;

                    if (!allColumnsMap.has(field)) {
                        // Check if this field should be visible by default
                        const isVisible = defaultFields.includes(field) || defaultFields.includes(field.split('.')[0]);

                        const column = {
                            field: field,
                            parentField: parentField,
                            label: this.formatLabel(field),
                            type: this.detectColumnType(field, value),
                            visible: isVisible
                        };

                        allColumnsMap.set(field, column);
                        if (isVisible) {
                            this.visibleColumns.add(field);
                        }
                    } else {
                        // Update type if we found a better value (e.g. not null)
                        const existingCol = allColumnsMap.get(field);
                        if (existingCol.type === 'text' && value !== null && value !== undefined) {
                            const newType = this.detectColumnType(field, value);
                            if (newType !== 'text') {
                                existingCol.type = newType;
                            }
                        }
                    }
                }
            });

            // Convert map to array
            const columns = Array.from(allColumnsMap.values());

            // Add actions column if enabled
            if (this.hasActions) {
                columns.push({
                    field: 'actions',
                    parentField: null,
                    label: 'Actions',
                    type: 'actions',
                    visible: true
                });
                this.visibleColumns.add('actions');
            }

            this.columns = columns;
        }

        formatLabel(fieldName) {
            // Use the full field path for the label, replacing dots with spaces
            // e.g. "profile.file" -> "Profile File"
            return fieldName
                .replace(/\./g, ' ') // Replace dots with spaces
                .replace(/_/g, ' ')
                .replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase())
                .trim();
        }

        isEditorData(value) {
            if (!value || typeof value !== 'object') return false;
            if (Array.isArray(value)) return false;
            return value.hasOwnProperty('blocks') && Array.isArray(value.blocks);
        }

        renderEditor(editorData) {
            let data = editorData;
            if (typeof editorData === 'string') {
                try { data = JSON.parse(editorData); } catch (e) { return editorData; }
            }
            if (!data || !data.blocks) return editorData;

            return data.blocks.map(block => {
                const bData = block.data || {};
                switch (block.type) {
                    case 'header':
                        const level = Math.min(Math.max(bData.level || 1, 1), 6);
                        return `<h${level}>${bData.text}</h${level}>`;
                    case 'paragraph':
                        return `<p>${bData.text || ''}</p>`;
                    case 'list':
                        const tag = bData.style === 'ordered' ? 'ol' : 'ul';
                        const items = (bData.items || []).map(i => `<li>${i}</li>`).join('');
                        return `<${tag}>${items}</${tag}>`;
                    case 'image':
                        const url = bData.file?.file || bData.file?.url || bData.file || '';
                        const imgUrl = this.getImageUrl(url);
                        return imgUrl ? `<div class="psr-media-preview" data-url="${imgUrl}" data-type="image"><img src="${imgUrl}" style="max-width:100px;display:block;margin:5px 0;cursor:pointer;"></div>` : '';
                    case 'table':
                        const rows = (bData.content || []).map(row =>
                            `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
                        return `<table class="inner-table">${rows}</table>`;
                    default:
                        return bData.text || '';
                }
            }).join('');
        }

        detectColumnType(fieldName, value) {
            const lowerField = fieldName.toLowerCase();
            const valStr = (value || '').toString().toLowerCase();

            // Check field name patterns
            if (lowerField.includes('image') || lowerField.includes('thumbnail') || lowerField.includes('photo') || lowerField.endsWith('.file') || valStr.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                return 'image';
            }
            if (lowerField.includes('video') || valStr.match(/\.(mp4|webm|ogg)$/i)) {
                return 'video';
            }
            if (lowerField.includes('file') || valStr.match(/\.(pdf|doc|docx|zip|txt)$/i)) {
                return 'file';
            }
            if (lowerField.includes('icon')) {
                return 'icon';
            }

            // Check if field is in toggle fields list (configured via data-toggle-field)
            if (this.toggleFields.has(fieldName)) {
                // Verify value is 0/1 or boolean
                if (typeof value === 'number' || typeof value === 'boolean' ||
                    value === '1' || value === '0' || value === 1 || value === 0 || value === null) {
                    return 'toggle';
                }
            }

            if (lowerField === 'id' || lowerField.endsWith('.id')) {
                return 'number';
            }

            // Check value type
            if (typeof value === 'number') return 'number';
            if (typeof value === 'boolean') return 'boolean';
            if (Array.isArray(value)) return 'array';

            // Editor Detection
            let parsed = value;
            if (typeof value === 'string' && value.trim().startsWith('{')) {
                try { parsed = JSON.parse(value); } catch (e) { }
            }
            if (this.isEditorData(parsed)) return 'editor';

            if (value && typeof value === 'string') {
                if (value.startsWith('http') || value.startsWith('/')) {
                    if (value.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return 'image';
                }
                if (value.trim().startsWith('fa ') || value.trim().startsWith('fas ') ||
                    value.trim().startsWith('far ') || value.trim().startsWith('fab ') ||
                    value.trim().startsWith('fa-')) {
                    return 'icon';
                }
            }

            return 'text';
        }

        // Get concat config if field is part of one
        getConcatConfigForField(field) {
            return this.concatConfig.find(config => config.fields.includes(field));
        }

        // Process visible columns to group concat fields
        getProcessedColumns() {
            const processed = [];
            const handledFields = new Set();

            for (const col of this.columns) {
                if (handledFields.has(col.field)) continue;

                // Check if this field is part of a concat config
                const concatConfig = this.getConcatConfigForField(col.field);

                if (concatConfig) {
                    // Check which fields from this concat are visible
                    const visibleConcatFields = concatConfig.fields.filter(f =>
                        this.visibleColumns.has(f)
                    );

                    if (visibleConcatFields.length > 0) {
                        // Create a virtual concat column
                        const isIconOrImage = (f) => {
                            const column = this.columns.find(c => c.field === f);
                            return column && (column.type === 'icon' || column.type === 'image');
                        };

                        // Determine heading
                        let heading;
                        if (concatConfig.customHeading) {
                            heading = concatConfig.customHeading;
                        } else if (visibleConcatFields.length === 1) {
                            heading = this.formatLabel(visibleConcatFields[0]);
                        } else {
                            // Use the text field name, or first field if all are icons/images
                            const textField = visibleConcatFields.find(f => !isIconOrImage(f));
                            heading = textField ? this.formatLabel(textField) : this.formatLabel(visibleConcatFields[0]);
                        }

                        processed.push({
                            field: concatConfig.combinedField,
                            label: heading,
                            type: 'concat',
                            concatConfig: concatConfig,
                            visibleFields: visibleConcatFields,
                            visible: true
                        });

                        // Mark all concat fields as handled
                        concatConfig.fields.forEach(f => handledFields.add(f));
                    }
                } else if (this.visibleColumns.has(col.field)) {
                    // Regular visible column
                    processed.push(col);
                }
            }

            return processed;
        }

        render() {
            this.container.innerHTML = `
                ${this.renderToolbar()}
                <div class="psr-datatable-content">
                    <div class="psr-datatable-main">
                        <div id="datatable-view"></div>
                        ${this.renderPagination()}
                    </div>
                </div>
                <div class="psr-settings-sidebar" id="settings-sidebar"></div>
                ${this.hasFilter ? '<div class="psr-filter-sidebar" id="filter-sidebar"></div>' : ''}
            `;

            this.renderView();

            // Populate settings sidebar
            const settingsSidebar = this.container.querySelector('#settings-sidebar');
            if (settingsSidebar) {
                settingsSidebar.innerHTML = this.renderSettingsSidebar();
            }

            // Populate filter sidebar if enabled
            if (this.hasFilter) {
                const filterSidebar = this.container.querySelector('#filter-sidebar');
                if (filterSidebar) {
                    filterSidebar.innerHTML = this.renderFilterSidebar();
                }
            }

            this.attachEventListeners();
        }

        // LocalStorage methods for column settings
        getStorageKey() {
            // Use API URL as unique key for different tables
            return `psr-datatable-settings-${this.apiUrl}`;
        }

        renderFilterSidebar() {
            if (this.columns.length === 0) {
                return '<div class="psr-filter-empty">No filters available</div>';
            }

            const filterableColumns = this.columns.filter(col => {
                if (col.type === 'actions' || col.type === 'image') return false;
                if (this.filterFields.length > 0) {
                    return this.filterFields.includes(col.field);
                }
                return true;
            });

            return `
                <div class="psr-filter-header">
                    <h3><i class="fa fa-filter"></i> Filters</h3>
                    <div class="psr-filter-actions">
                        <button class="psr-btn psr-btn-sm" id="clear-filters">Clear All</button>
                        <button class="psr-btn psr-btn-icon psr-btn-sm" id="close-filter" style="margin-left: 8px; background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 6px 10px;">
                            <i class="fa fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="psr-filter-list">
                    ${filterableColumns.map(col => this.renderFilterControl(col)).join('')}
                </div>
                <div class="psr-filter-footer" style="padding: 1rem; border-top: 1px solid rgba(255,255,255,0.1);">
                    <button class="psr-btn psr-btn-primary" id="apply-filters" style="width: 100%; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 0.8rem; font-weight: 500;">
                        <i class="fa fa-check"></i> Apply Filters
                    </button>
                </div>
            `;
        }

        renderFilterControl(column) {
            const filterId = `filter-${column.field}`;
            const currentValue = this.filters[column.field] || '';

            if (column.type === 'number') {
                return `
                    <div class="psr-filter-group">
                        <label class="psr-filter-label">${column.label}</label>
                        <div class="psr-filter-range">
                            <input type="number" 
                                   class="psr-filter-input psr-filter-min" 
                                   data-field="${column.field}" 
                                   data-type="min"
                                   placeholder="Min" 
                                   value="${currentValue.min || ''}">
                            <span>-</span>
                            <input type="number" 
                                   class="psr-filter-input psr-filter-max" 
                                   data-field="${column.field}" 
                                   data-type="max"
                                   placeholder="Max" 
                                   value="${currentValue.max || ''}">
                        </div>
                    </div>
                `;
            } else if (column.type === 'boolean' || column.type === 'toggle') {
                return `
                    <div class="psr-filter-group">
                        <label class="psr-filter-label">
                            <input type="checkbox" 
                                   class="psr-filter-checkbox" 
                                   data-field="${column.field}"
                                   ${currentValue ? 'checked' : ''}>
                            ${column.label}
                        </label>
                    </div>
                `;
            } else {
                // Text filter (default)
                return `
                    <div class="psr-filter-group">
                        <label class="psr-filter-label">${column.label}</label>
                        <input type="text" 
                               class="psr-filter-input" 
                               data-field="${column.field}"
                               placeholder="Filter ${column.label}..." 
                               value="${currentValue}">
                    </div>
                `;
            }
        }


        renderToolbar() {
            // Generate page size options
            const sizes = [5, 10, 15, 20, 25, 50, 100, 'all'];
            if (!sizes.includes(this.pageSize)) {
                sizes.push(this.pageSize);
                sizes.sort((a, b) => a - b);
            }

            return `
                <div class="psr-table-toolbar">
                    <div class="psr-toolbar-left">
                        <div class="psr-table-search-wrapper">
                            <i class="fa fa-search"></i>
                            <input type="text" 
                                   id="search-input" 
                                   class="psr-table-search" 
                                   placeholder="Search..." 
                                   value="${this.searchQuery}">
                        </div>
                        <div class="psr-limit-selector">
                            <label for="page-size-select">Show:</label>
                            <select id="page-size-select" class="psr-select">
                                ${sizes.map(size => `<option value="${size}" ${this.pageSize === size ? 'selected' : ''}>${size}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div class="psr-toolbar-right">
                        <button class="psr-btn psr-btn-icon" id="clear-settings-btn" title="Clear All Settings & Reset">
                            <i class="fa fa-rotate-left"></i>
                        </button>
                        <button class="psr-btn psr-btn-icon ${this.stickyHeader ? 'active' : ''}" id="sticky-header-toggle" title="Toggle Sticky Header">
                            <i class="fa fa-thumbtack" style="transform: rotate(45deg);"></i>
                        </button>
                        <div class="psr-scroll-controls hidden">
                            <div class="psr-speed-control" title="Scroll Speed">
                                <i class="fa fa-gauge-high"></i>
                                <div class="psr-slider-wrapper">
                                    <input type="range" min="1" max="100" value="15" class="psr-speed-slider">
                                    <span class="psr-speed-tooltip">1.15x</span>
                                </div>
                            </div>
                        </div>
                        ${this.hasCardView ? `
                        <div class="psr-view-toggle">
                            <button class="psr-view-btn ${this.currentView === 'list' ? 'active' : ''}" data-view="list" title="List View">
                                <i class="fa fa-list"></i>
                            </button>
                            <button class="psr-view-btn ${this.currentView === 'kanban' ? 'active' : ''}" data-view="kanban" title="Kanban View">
                                <i class="fa fa-th-large"></i>
                            </button>
                        </div>` : ''}
                        ${this.hasFilter ? `
                        <button class="psr-btn psr-btn-icon" id="filter-toggle" title="Toggle Filters">
                            <i class="fa fa-filter"></i>
                        </button>` : ''}
                        <button class="psr-btn psr-btn-icon" id="settings-toggle" title="Column Settings">
                            <i class="fa fa-cog"></i>
                        </button>
                    </div>
                </div>
            `;
        }

        renderView() {
            const viewContainer = this.container.querySelector('#datatable-view');
            if (!viewContainer) return;

            if (this.currentView === 'list') {
                viewContainer.innerHTML = this.renderListView();
            } else {
                viewContainer.innerHTML = this.renderKanbanView();
            }

            this.setupScrollNavigation();
            this.setupColumnSort();

            // Re-initialize Excel-like features after view render
            this.setupFixedColumns();
            this.setupStickyHeader();
            this.setupColumnResize();
        }

        renderListView() {
            const visibleCols = this.getProcessedColumns();

            // Determine body content: either data rows or a "No records found" row
            let bodyContent = '';

            if (this.filteredData.length === 0) {
                // +1 for S.No column
                const colSpan = visibleCols.length + 1;
                bodyContent = `
                    <tr>
                        <td colspan="${colSpan}" style="text-align: center; padding: 20px;">
                            <div class="psr-no-data" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: #6c757d;">
                                <i class="fa fa-folder-open" style="font-size: 24px; opacity: 0.5;"></i>
                                <span>No records found</span>
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                bodyContent = this.filteredData.map((row, index) => `
                    <tr>
                        <td>${this.pageSize === 'all' ? (index + 1) : ((this.currentPage - 1) * this.pageSize + index + 1)}</td>
                        ${visibleCols.map(col => `<td>${this.renderCell(row, col)}</td>`).join('')}
                    </tr>
                `).join('');
            }

            return `
                <div class="psr-table-wrapper-relative">
                    <!-- INVISIBLE FULL-HEIGHT HOVER ZONES -->
                    <div class="psr-scroll-zone psr-scroll-zone-left"></div>
                    <div class="psr-scroll-zone psr-scroll-zone-right"></div>
                    
                    <!-- VISIBLE CENTERED BUTTONS -->
                    <button class="psr-scroll-btn-floating psr-scroll-left" data-direction="left" title="Scroll Left">
                        <i class="fa fa-chevron-left"></i>
                    </button>
                    <div class="psr-table-scroll-container">
                        <table class="psr-table">
                            <thead>
                                <tr>
                                    <th>
                                        S.No
                                        <div class="psr-resize-handle" data-col="sno"></div>
                                    </th>
                                    ${visibleCols.map(col => {
                // For combined fields, check if we're sorting by the first field in the combination
                let actualSortField = this.sortField;
                if (col.field && col.field.includes('_')) {
                    const concatConfig = this.concatConfig.find(config =>
                        config.combinedField === col.field
                    );
                    if (concatConfig && concatConfig.fields.length > 0) {
                        // Check if we're sorting by the first field of this combination
                        if (this.sortField === concatConfig.fields[0]) {
                            actualSortField = col.field; // Treat as if sorting by combined field
                        }
                    }
                }

                // Determine sort icon based on current sort state
                let sortIcon = 'fa-sort'; // default unsorted
                if (actualSortField === col.field) {
                    sortIcon = this.sortDirection === 'asc' ? 'fa-sort-up' : 'fa-sort-down';
                }

                // Don't show sort icon for actions, images, or toggles
                const showSort = col.type !== 'actions' &&
                    col.type !== 'image' &&
                    col.type !== 'toggle';

                return `
                                        <th data-field="${col.field}" class="${showSort ? 'psr-sortable' : ''}">
                                            <i class="fa fa-thumbtack psr-pin-icon" data-field="${col.field}" title="Pin column"></i>
                                            <span class="psr-column-label">${col.label}</span>
                                            ${showSort ? `<i class="fa ${sortIcon} psr-sort-icon" title="Sort by ${col.label}"></i>` : ''}
                                            <div class="psr-resize-handle" data-col="${col.field}"></div>
                                        </th>
                                        `;
            }).join('')}
                                </tr>
                            </thead>
                            <tbody>
                                ${bodyContent}
                            </tbody>
                        </table>
                    </div>
                    <button class="psr-scroll-btn-floating psr-scroll-right" data-direction="right" title="Scroll Right">
                        <i class="fa fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }

        renderKanbanView() {
            if (this.filteredData.length === 0) {
                return '<div class="psr-no-data">No records found</div>';
            }

            return `
                <div class="psr-kanban-grid">
                    ${this.filteredData.map(row => this.renderKanbanCard(row)).join('')}
                </div>
            `;
        }

        renderKanbanCard(row) {
            // Get processed columns (respects visibility and order from settings)
            const visibleCols = this.getProcessedColumns();

            // Determine the title field
            // Priority: 1) Combined field, 2) First non-image default field, 3) First default field
            let titleField = null;
            let title = 'Untitled';

            // Check if there's a combined field to use as title
            const combinedCol = visibleCols.find(c => c.field && c.field.includes('_'));
            if (combinedCol) {
                titleField = combinedCol.field;
                title = this.renderCell(row, combinedCol);
                // Remove HTML tags from title for clean display
                title = title.replace(/<[^>]*>/g, ' ').trim() || 'Untitled';
            } else {
                // Use first non-image default field as title
                const defaultFields = (this.defaultField || '').split(',').map(f => f.trim());
                for (const field of defaultFields) {
                    const col = visibleCols.find(c => c.field === field);
                    if (col && col.type !== 'image') {
                        titleField = field;
                        title = this.getNestedValue(row, titleField) || 'Untitled';
                        break;
                    }
                }
                // Fallback to first default field if all are images
                if (!titleField && defaultFields.length > 0) {
                    titleField = defaultFields[0];
                    title = this.getNestedValue(row, titleField) || 'Untitled';
                }
            }

            // Find image column from visible columns
            const imageCol = visibleCols.find(c => c.type === 'image');
            const imageUrl = imageCol ? this.getImageUrl(this.getNestedValue(row, imageCol.field)) : null;

            // Find toggle column from visible columns
            const toggleCol = visibleCols.find(c => c.type === 'toggle');

            // Get source fields for combined columns to exclude them from body
            const combinedSourceFields = new Set();
            this.concatConfig.forEach(config => {
                config.fields.forEach(field => combinedSourceFields.add(field));
            });

            // Filter visible columns for card body
            // Exclude: title field, image, actions, toggle, and source fields of combined columns
            const bodyFields = visibleCols.filter(c => {
                // Exclude title field
                if (c.field === titleField) return false;

                // Exclude image, actions, toggle
                if (c.type === 'image' || c.type === 'actions' || c.type === 'toggle') return false;

                // Exclude source fields of combined columns (e.g., firstName, lastName if Name exists)
                if (combinedSourceFields.has(c.field)) return false;

                return true;
            });

            // Check permissions
            const perms = this.userPermissions[this.pageSlug] || [];
            const canUpdate = this.isAdmin || perms.includes('update');
            const canDelete = this.isAdmin || perms.includes('delete');

            return `
                <div class="psr-kanban-card">
                    ${imageUrl ? `<div class="psr-card-image"><img src="${imageUrl}" alt="${title}"></div>` : ''}
                    <div class="psr-card-content">
                        <h3 class="psr-card-title">${title}</h3>
                        ${bodyFields.map(col => `<div class="psr-card-field"><strong>${col.label}:</strong> ${this.renderCell(row, col)}</div>`).join('')}
                    </div>
                    ${(this.hasActions || toggleCol) ? `
                    <div class="psr-card-actions">
                        ${toggleCol ? `<div class="psr-card-toggle">${this.renderCell(row, toggleCol)}</div>` : ''}
                        
                        ${(this.hasActions && (canUpdate || canDelete)) ? `
                            ${canUpdate ? `
                            <button class="psr-btn psr-btn-sm psr-btn-icon" data-action="edit" data-id="${row.id}">
                                <i class="fa fa-pencil"></i>
                            </button>` : ''}
                            ${canDelete ? `
                            <button class="psr-btn psr-btn-sm psr-btn-danger psr-btn-icon" data-action="delete" data-id="${row.id}">
                                <i class="fa fa-trash"></i>
                            </button>` : ''}
                        ` : ''}
                    </div>` : ''}
                </div>
            `;
        }

        // Helper function to get nested value using dot notation (e.g., "createdBy.name")
        getNestedValue(obj, path) {
            if (!obj || !path) return null;
            return path.split('.').reduce((current, key) => current?.[key], obj);
        }

        renderCell(row, column) {
            // Use dot notation to access nested values
            const value = this.getNestedValue(row, column.field);

            // Handle special column types FIRST, before checking for null value
            // This prevents "N/A" from showing up for columns that don't rely on a single field value

            if (column.type === 'actions') {
                const perms = this.userPermissions[this.pageSlug] || [];
                const canUpdate = this.isAdmin || perms.includes('update');
                const canDelete = this.isAdmin || perms.includes('delete');

                // If no permissions, return empty
                if (!canUpdate && !canDelete) return '';

                return `
                    <div class="psr-table-actions">
                        ${canUpdate ? `
                        <button class="psr-btn psr-btn-sm psr-btn-icon" data-action="edit" data-id="${row.id}">
                            <i class="fa fa-pencil"></i>
                        </button>` : ''}
                        ${canDelete ? `
                        <button class="psr-btn psr-btn-sm psr-btn-danger psr-btn-icon" data-action="delete" data-id="${row.id}">
                            <i class="fa fa-trash"></i>
                        </button>` : ''}
                    </div>`;
            }

            if (column.type === 'toggle') {
                const checked = value === 1 || value === true || value === '1';
                const perms = this.userPermissions[this.pageSlug] || [];
                const canUpdate = this.isAdmin || perms.includes('update');

                if (canUpdate) {
                    const uid = `tg-${column.field}-${row.id}`;
                    return `
                        <input type="checkbox"
                               id="${uid}"
                               class="psr-toggle-input"
                               data-field="${column.field}"
                               data-id="${row.id}"
                               ${checked ? 'checked' : ''}>
                        <label for="${uid}" class="psr-toggle psr-toggle-sm">
                            <span class="psr-toggle-handle"></span>
                        </label>
                    `;
                } else {
                    return checked
                        ? '<span class="psr-badge psr-badge-success">Active</span>'
                        : '<span class="psr-badge psr-badge-secondary">Inactive</span>';
                }
            }

            if (column.type === 'image') {
                const imgUrl = this.getImageUrl(value);
                return imgUrl ? `<div class="psr-media-preview" data-url="${imgUrl}" data-type="image"><img src="${imgUrl}" class="psr-table-img" alt="image" style="cursor:pointer;"></div>` : '<i class="fa fa-image psr-text-muted"></i>';
            }

            if (column.type === 'video') {
                const url = this.getImageUrl(value);
                return url ? `<div class="psr-media-preview" data-url="${url}" data-type="video" style="cursor:pointer; display:flex; align-items:center; gap:5px;"><i class="fa fa-play-circle psr-text-primary" style="font-size:20px;"></i> <span style="font-size:12px;">Watch</span></div>` : '<i class="fa fa-video-camera psr-text-muted"></i>';
            }

            if (column.type === 'file') {
                const url = this.getImageUrl(value);
                return url ? `<div class="psr-media-preview" data-url="${url}" data-type="file" style="cursor:pointer; display:flex; align-items:center; gap:5px;"><i class="fa fa-file-text psr-text-info" style="font-size:20px;"></i> <span style="font-size:12px;">View</span></div>` : '<i class="fa fa-file psr-text-muted"></i>';
            }

            if (column.type === 'editor') {
                return `<div class="psr-editor-content">${this.renderEditor(value)}</div>`;
            }

            if (column.type === 'icon') {
                return value ? `<i class="${value}"></i>` : '';
            }

            // Handle concat columns
            if (column.type === 'concat') {
                const concatConfig = column.concatConfig;
                const fieldsToRender = column.visibleFields || concatConfig.fields;

                // Helper function to render a value (check if it's an icon or image)
                const renderValue = (val) => {
                    if (!val) return '';
                    const strVal = val.toString().trim();
                    // Check if value is a Font Awesome icon class
                    if (strVal.startsWith('fa ') || strVal.startsWith('fas ') ||
                        strVal.startsWith('far ') || strVal.startsWith('fab ') ||
                        strVal.startsWith('fa-')) {
                        return `<i class="${strVal}"></i>`;
                    }
                    // Check if value is an image URL
                    if (strVal.startsWith('http') || strVal.startsWith('/')) {
                        if (strVal.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
                            return `<img src="${this.getImageUrl(strVal)}" class="psr-table-img" alt="image">`;
                        }
                    }
                    return strVal;
                };

                const values = fieldsToRender
                    .map(f => this.getNestedValue(row, f))
                    .filter(v => v)
                    .map(v => renderValue(v));

                if (values.length === 0) return '<span class="psr-text-muted">N/A</span>';

                let result = '';
                switch (concatConfig.format) {
                    case 'paren':
                        result = values.length > 1 ? `${values[0]} (${values.slice(1).join(', ')})` : values[0];
                        break;
                    case 'span':
                        result = values.length > 1
                            ? `${values[0]} <span class="psr-concat-secondary">${values.slice(1).join(', ')}</span>`
                            : values[0];
                        break;
                    case 'newline':
                        result = values.join('<br>');
                        break;
                    case 'comma':
                        result = values.join(', ');
                        break;
                    default:
                        result = values.join(' ');
                }
                return result;
            }

            // NOW check for null/undefined for standard fields
            if (value === null || value === undefined || value === '') {
                return '<span class="psr-text-muted">N/A</span>';
            }

            // Handle arrays (e.g. roles)
            if (Array.isArray(value)) {
                if (value.length === 0) return '<span class="psr-text-muted">N/A</span>';

                // Try to find a display field
                const firstItem = value[0];
                if (typeof firstItem === 'object') {
                    const displayField = ['title', 'name', 'label', 'value', 'id'].find(f => firstItem[f]);
                    if (displayField) {
                        return value.map(item => `<span class="psr-dt-badge psr-badge-info">${item[displayField]}</span>`).join(' ');
                    }
                    return `<p class="psr-json-data">${JSON.stringify(value, null, 2)}</p>`;
                }

                return value.join(', ');
            }

            // Handle objects (render as JSON)
            if (typeof value === 'object' && !(value instanceof Date)) {
                return `<p class="psr-json-data">${JSON.stringify(value, null, 2)}</p>`;
            }

            if (column.type === 'number' && typeof value === 'number') {
                return value.toLocaleString();
            }

            // Handle Dates automatically
            const isDateField = column.field.toLowerCase().endsWith('at') ||
                column.field.toLowerCase().endsWith('date') ||
                column.type === 'date';

            if (isDateField && typeof value === 'string' && typeof window.formatDate === 'function') {
                const formatted = window.formatDate(value);
                if (formatted !== 'N/A') return formatted;
            }

            // Apply blur effect if field is marked as blurred and not unblurred by user
            let displayValue = value !== null && value !== undefined ? value : '';
            if (this.blurFields.has(column.field) && !this.unblurredFields.has(column.field)) {
                // Mask the actual data to prevent inspection
                const maskedValue = displayValue.toString().replace(/./g, '•');
                displayValue = `<span class="psr-blur" data-field="${column.field}">${maskedValue}</span>`;
            }

            return displayValue;
        }

        getImageUrl(url) {
            if (!url) return null;
            if (typeof url === 'string') {
                if (url.startsWith('http')) return url;
                if (url.startsWith('/')) return 'https://cdn.inchbrick.com' + url;
                return url;
            }
            if (typeof url === 'object') {
                if (url.file) return this.getImageUrl(url.file);
                if (url.path) return this.getImageUrl(url.path);
                if (url.url) return this.getImageUrl(url.url);
            }
            return null;
        }

        showPreview(url, type) {
            const overlay = document.createElement('div');
            overlay.className = 'psr-preview-overlay';
            overlay.innerHTML = `
                <div class="psr-preview-container">
                    <div class="psr-preview-header">
                        <span>Preview</span>
                        <button class="psr-preview-close">&times;</button>
                    </div>
                    <div class="psr-preview-body">
                        ${this.getPreviewContent(url, type)}
                    </div>
                    <div class="psr-preview-footer">
                        <a href="${url}" target="_blank" class="psr-btn psr-btn-sm psr-btn-primary">Open in New Tab</a>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const close = overlay.querySelector('.psr-preview-close');
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay || e.target === close) {
                    overlay.remove();
                }
            });
        }

        getPreviewContent(url, type) {
            if (type === 'image') return `<img src="${url}" style="max-width:100%; max-height:70vh; display:block; margin:auto; border-radius:4px;">`;
            if (type === 'video') return `<video src="${url}" controls autoPlay style="max-width:100%; max-height:70vh; display:block; margin:auto;"></video>`;
            if (type === 'file') return `<iframe src="${url}" style="width:100%; height:70vh; border:none;"></iframe>`;
            return 'Unsupported preview type';
        }

        injectStyles() {
            if (document.getElementById('psr-dt-dynamic-styles')) return;
            const style = document.createElement('style');
            style.id = 'psr-dt-dynamic-styles';
            style.textContent = `
                .psr-preview-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.8); z-index: 9999;
                    display: flex; align-items: center; justify-content: center;
                }
                .psr-preview-container {
                    background: white; border-radius: 8px; width: 80%; max-width: 900px;
                    display: flex; flex-direction: column; overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                }
                .psr-preview-header {
                    padding: 15px; border-bottom: 1px solid #ddd;
                    display: flex; justify-content: space-between; align-items: center;
                    font-weight: bold; background: #f9f9f9;
                }
                .psr-preview-close {
                    background: none; border: none; font-size: 24px; cursor: pointer; color: #666;
                }
                .psr-preview-body { padding: 0; background: #000; display: flex; align-items: center; justify-content: center; min-height: 200px; }
                .psr-preview-footer { padding: 10px; border-top: 1px solid #ddd; text-align: right; background: #f9f9f9; }
                .psr-text-primary { color: #007bff; }
                .psr-text-info { color: #17a2b8; }
            `;
            document.head.appendChild(style);
        }

        renderPagination() {
            if (this.pageSize === 'all') return '';
            const totalPages = Math.ceil(this.totalRecords / this.pageSize);
            if (totalPages <= 1) return '';

            return `
                <div class="psr-pagination" id="pagination">
                    <button class="psr-page-btn" data-page="${this.currentPage - 1}" ${this.currentPage === 1 ? 'disabled' : ''}>&laquo;</button>
                    ${this.getPaginationButtons(totalPages).map(page =>
                page === '...'
                    ? '<span class="psr-page-ellipsis">&hellip;</span>'
                    : `<button class="psr-page-btn ${page === this.currentPage ? 'active' : ''}" data-page="${page}">${page}</button>`
            ).join('')
                }
                    <button class="psr-page-btn" data-page="${this.currentPage + 1}" ${this.currentPage === totalPages ? 'disabled' : ''}>&raquo;</button>
                </div>
            `;
        }

        getPaginationButtons(totalPages) {
            const pages = [];
            const current = this.currentPage;

            if (totalPages <= 7) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
            } else {
                pages.push(1);
                if (current > 3) pages.push('...');
                for (let i = Math.max(2, current - 1); i <= Math.min(totalPages - 1, current + 1); i++) {
                    pages.push(i);
                }
                if (current < totalPages - 2) pages.push('...');
                pages.push(totalPages);
            }

            return pages;
        }

        renderSettingsSidebar() {
            // Check if user has permission to unblur
            // Admin OR (Full Access AND All Permissions)
            const perms = this.userPermissions[this.pageSlug] || [];
            const requiredPerms = ['read', 'create', 'update', 'delete', 'download'];
            const hasAllPerms = requiredPerms.every(p => perms.includes(p));

            const canUnblur = this.isAdmin || (this.accessLevel === 'full' && hasAllPerms);

            return `
                <div class="psr-settings-header">
                    <h3><i class="fa fa-cog"></i> Column Settings</h3>
                    <div class="psr-settings-actions">
                        <button class="psr-btn psr-btn-sm" id="select-all-columns" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 6px 12px;">
                            <i class="fa fa-check-double"></i> Select All
                        </button>
                        <button class="psr-btn psr-btn-icon psr-btn-sm" id="close-settings" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 6px 10px;">
                            <i class="fa fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="psr-settings-body">
                    <p class="psr-modal-hint"><i class="fa fa-info-circle"></i> Drag to reorder columns</p>
                    <div class="psr-column-list" id="column-list">
                        ${this.columns.map((col, index) => `
                            <div class="psr-column-item" 
                                 draggable="true" 
                                 data-field="${col.field}"
                                 data-index="${index}">
                                <i class="fa fa-grip-vertical psr-drag-handle"></i>
                                <label class="psr-column-label">
                                    <input type="checkbox" 
                                           class="column-toggle" 
                                           data-field="${col.field}" 
                                           ${this.visibleColumns.has(col.field) ? 'checked' : ''}>
                                    <span>${col.label}</span>
                                </label>
                                ${this.blurFields.has(col.field) ? `
                                    ${canUnblur ? `
                                        <i class="fa ${this.unblurredFields.has(col.field) ? 'fa-eye' : 'fa-eye-slash'} psr-blur-toggle" 
                                           data-field="${col.field}" 
                                           title="${this.unblurredFields.has(col.field) ? 'Click to blur' : 'Click to unblur'}"></i>
                                    ` : `
                                        <i class="fa fa-eye-slash psr-blur-disabled" title="Restricted" style="opacity: 0.5; cursor: not-allowed;"></i>
                                    `}
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        renderFilterSidebar() {
            // Determine which fields to show in filter
            let filterableFields = [];

            if (this.filterFields.length > 0 && this.filterFields[0] === '*') {
                // Show all columns except actions
                filterableFields = this.columns.filter(col => col.type !== 'actions');
            } else if (this.filterFields.length > 0) {
                // Show only specified fields
                filterableFields = this.columns.filter(col =>
                    this.filterFields.includes(col.field) && col.type !== 'actions'
                );
            } else {
                // Show all columns except actions (default when data-filter="true" but no data-filter-fields)
                filterableFields = this.columns.filter(col => col.type !== 'actions');
            }

            return `
                <div class="psr-filter-header">
                    <h3><i class="fa fa-filter"></i> Filters</h3>
                    <div class="psr-filter-actions">
                        <button class="psr-btn psr-btn-sm" id="clear-filters" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 6px 12px;">
                            <i class="fa fa-eraser"></i> Clear All
                        </button>
                        <button class="psr-btn psr-btn-icon psr-btn-sm" id="close-filter" style="background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.3); color: white; padding: 6px 10px;">
                            <i class="fa fa-times"></i>
                        </button>
                    </div>
                </div>
                <div class="psr-filter-list">
                    ${filterableFields.map(col => {
                const isToggleField = this.toggleFields.has(col.field);
                const currentValue = this.filters[col.field] || '';

                if (isToggleField) {
                    // Render dropdown for toggle fields
                    return `
                                <div class="psr-sidebar-section">
                                    <label class="psr-filter-label">${col.label}</label>
                                    <select class="psr-filter-select psr-filter-toggle" data-field="${col.field}">
                                        <option value="">All</option>
                                        <option value="1" ${currentValue === '1' || currentValue === 1 ? 'selected' : ''}>Active / Yes</option>
                                        <option value="0" ${currentValue === '0' || currentValue === 0 ? 'selected' : ''}>Inactive / No</option>
                                    </select>
                                </div>
                            `;
                } else {
                    // Render text input for other fields
                    return `
                                <div class="psr-sidebar-section">
                                    <label class="psr-filter-label">${col.label}</label>
                                    <input type="text" 
                                           class="psr-filter-input" 
                                           data-field="${col.field}" 
                                           placeholder="Filter by ${col.label.toLowerCase()}..."
                                           value="${currentValue}">
                                </div>
                            `;
                }
            }).join('')}
                </div>
                <div class="psr-filter-footer">
                    <button class="psr-btn psr-btn-primary" id="apply-filters">
                        <i class="fa fa-check"></i> Apply Filters
                    </button>
                </div>
            `;
        }

        attachEventListeners() {
            // Search
            const searchInput = this.container.querySelector('#search-input');
            if (searchInput) {
                // Trigger search on Enter key
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        this.searchQuery = e.target.value;
                        this.currentPage = 1;
                        this.applyFilters();
                    }
                });

                // Trigger search on blur (click outside)
                searchInput.addEventListener('change', (e) => {
                    this.searchQuery = e.target.value;
                    this.currentPage = 1;
                    this.applyFilters();
                });
            }

            // View toggle
            this.container.querySelectorAll('.psr-view-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.currentView = btn.getAttribute('data-view');
                    this.container.querySelectorAll('.psr-view-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    this.renderView();
                });
            });

            // Page size selector
            const pageSizeSelect = this.container.querySelector('#page-size-select');
            if (pageSizeSelect) {
                pageSizeSelect.addEventListener('change', async (e) => {
                    const val = e.target.value;
                    this.pageSize = val === 'all' ? 'all' : parseInt(val);
                    this.currentPage = 1;
                    await this.fetchData();
                    this.render();
                });
            }

            // Sticky Header Toggle
            const stickyToggle = this.container.querySelector('#sticky-header-toggle');
            if (stickyToggle) {
                stickyToggle.addEventListener('click', () => {
                    this.stickyHeader = !this.stickyHeader;
                    stickyToggle.classList.toggle('active', this.stickyHeader);

                    // Re-apply sticky header settings
                    this.setupStickyHeader();
                    this.saveColumnSettings();
                });
            }

            // Clear Settings Button
            console.log('Looking for clear settings button...');
            const clearSettingsBtn = this.container.querySelector('#clear-settings-btn');
            if (clearSettingsBtn) {
                console.log('Clear settings button found, attaching listener');
                let confirmTimeout;

                clearSettingsBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent bubbling

                    if (clearSettingsBtn.classList.contains('confirming')) {
                        // Second click - CONFIRMED
                        console.log('Clear settings CONFIRMED');
                        const key = this.getStorageKey();
                        console.log('Clearing storage key:', key);
                        localStorage.removeItem(key);
                        console.log('Reloading page...');
                        window.location.reload();
                    } else {
                        // First click - Show confirmation state
                        console.log('Clear settings clicked - waiting for confirmation');
                        clearSettingsBtn.classList.add('confirming');
                        clearSettingsBtn.innerHTML = '<i class="fa fa-check"></i>';
                        clearSettingsBtn.title = 'Click again to confirm reset';
                        clearSettingsBtn.style.borderColor = '#ef4444'; // Red border
                        clearSettingsBtn.style.color = '#ef4444'; // Red icon

                        // Reset after 3 seconds if not clicked
                        confirmTimeout = setTimeout(() => {
                            clearSettingsBtn.classList.remove('confirming');
                            clearSettingsBtn.innerHTML = '<i class="fa fa-trash"></i>';
                            clearSettingsBtn.title = 'Clear All Settings & Reset';
                            clearSettingsBtn.style.borderColor = '';
                            clearSettingsBtn.style.color = '';
                        }, 3000);
                    }
                });
            } else {
                console.error('Clear settings button NOT found in container');
            }



            // Use event delegation for filter and settings toggle to prevent listener loss
            // Only attach once to prevent duplicate listeners
            if (!this.containerListenersAttached) {
                this.container.addEventListener('click', (e) => {
                    // Filter toggle
                    if (e.target.closest('#filter-toggle')) {
                        const filterSidebar = this.container.querySelector('#filter-sidebar');
                        if (filterSidebar) {
                            this.filterSidebarOpen = !this.filterSidebarOpen;
                            filterSidebar.classList.toggle('active');
                        }
                    }

                    // Settings toggle
                    if (e.target.closest('#settings-toggle')) {
                        const settingsSidebar = this.container.querySelector('#settings-sidebar');
                        if (settingsSidebar) {
                            settingsSidebar.classList.toggle('active');
                        }
                    }
                });
                this.containerListenersAttached = true;
            }

            // Close Settings Button
            const closeSettingsBtn = this.container.querySelector('#close-settings');
            if (closeSettingsBtn) {
                closeSettingsBtn.addEventListener('click', () => {
                    const settingsSidebar = this.container.querySelector('#settings-sidebar');
                    if (settingsSidebar) {
                        settingsSidebar.classList.remove('active');
                    }
                });
            }

            // Select All Columns Button
            const selectAllBtn = this.container.querySelector('#select-all-columns');
            if (selectAllBtn) {
                selectAllBtn.addEventListener('click', () => {
                    const allCheckboxes = this.container.querySelectorAll('.column-toggle');
                    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);

                    if (allChecked) {
                        // Deselect All
                        this.visibleColumns.clear();
                        allCheckboxes.forEach(cb => cb.checked = false);
                    } else {
                        // Select All
                        allCheckboxes.forEach(cb => {
                            cb.checked = true;
                            this.visibleColumns.add(cb.getAttribute('data-field'));
                        });
                    }

                    this.saveColumnSettings();
                    this.renderView();
                });
            }

            // Column toggles
            this.container.querySelectorAll('.column-toggle').forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const field = checkbox.getAttribute('data-field');
                    if (checkbox.checked) {
                        this.visibleColumns.add(field);
                    } else {
                        this.visibleColumns.delete(field);
                    }
                    this.saveColumnSettings();
                    this.renderView();
                });
            });

            // Blur toggle icons
            this.container.querySelectorAll('.psr-blur-toggle').forEach(icon => {
                icon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const field = icon.getAttribute('data-field');

                    if (this.unblurredFields.has(field)) {
                        this.unblurredFields.delete(field);
                    } else {
                        this.unblurredFields.add(field);
                    }

                    // Update icon
                    if (this.unblurredFields.has(field)) {
                        icon.classList.remove('fa-eye-slash');
                        icon.classList.add('fa-eye');
                        icon.setAttribute('title', 'Click to blur');
                    } else {
                        icon.classList.remove('fa-eye');
                        icon.classList.add('fa-eye-slash');
                        icon.setAttribute('title', 'Click to unblur');
                    }

                    // Re-render view to apply blur changes
                    this.renderView();
                });
            });

            // Pagination
            this.container.querySelectorAll('.psr-page-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const page = parseInt(btn.getAttribute('data-page'));
                    if (page > 0 && page !== this.currentPage) {
                        this.currentPage = page;
                        await this.fetchData();
                        this.render();
                    }
                });
            });

            // Action buttons (Unified for List and Kanban)
            // Use event delegation on the container to handle both views
            this.container.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;

                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');

                // Find the row data
                const rowData = this.data.find(r => r.id == id); // Loose equality for string/number id

                // Check for global handler
                if (PSRDataTable.globalHandlers && PSRDataTable.globalHandlers[action]) {
                    PSRDataTable.globalHandlers[action](id, rowData, this);
                } else {
                    // Fallback / Default behavior (optional, or just log)
                    console.warn(`No handler defined for action: ${action}`);

                    // Dispatch custom event for backward compatibility or alternative usage
                    const event = new CustomEvent(`psr-datatable:${action}`, {
                        detail: { id, rowData, tableInstance: this },
                        bubbles: true,
                        cancelable: true
                    });
                    this.container.dispatchEvent(event);
                }
            });

            // Toggle inputs (Unified)
            this.container.addEventListener('change', (e) => {
                if (e.target.classList.contains('psr-toggle-input')) {
                    const input = e.target;
                    const field = input.getAttribute('data-field');
                    const id = input.getAttribute('data-id');
                    const newValue = input.checked;
                    const oldValue = !newValue;
                    const rowData = this.data.find(r => r.id == id);
                    // Check for global handler
                    if (PSRDataTable.globalHandlers && PSRDataTable.globalHandlers.toggle) {
                        PSRDataTable.globalHandlers.toggle(id, field, newValue, rowData, this);
                    } else {
                        // Dispatch custom event
                        const event = new CustomEvent('psr-datatable:toggle', {
                            detail: { id, field, oldValue, newValue, rowData, tableInstance: this },
                            bubbles: true,
                            cancelable: true
                        });
                        this.container.dispatchEvent(event);
                    }
                }
            });

            // Filter inputs - store values but don't apply automatically
            this.container.querySelectorAll('.psr-filter-input').forEach(input => {
                input.addEventListener('input', (e) => {
                    const field = input.getAttribute('data-field');
                    const type = input.getAttribute('data-type'); // 'min' or 'max' for number ranges

                    if (type) {
                        // Number range filter
                        if (!this.filters[field]) {
                            this.filters[field] = {};
                        }
                        this.filters[field][type] = input.value;
                    } else {
                        // Text filter
                        this.filters[field] = input.value;
                    }
                    // Don't call applyFilters() here - wait for Apply button
                });
            });

            // Filter toggle dropdowns - store values but don't apply automatically
            this.container.querySelectorAll('.psr-filter-toggle').forEach(select => {
                select.addEventListener('change', (e) => {
                    const field = select.getAttribute('data-field');
                    const value = select.value; // Will be "", "0", or "1"

                    if (value === "") {
                        // Remove filter if "All" is selected
                        delete this.filters[field];
                    } else {
                        // Store the filter value
                        this.filters[field] = value;
                    }
                    // Don't call applyFilters() here - wait for Apply button
                });
            });

            // Filter checkboxes - store values but don't apply automatically
            this.container.querySelectorAll('.psr-filter-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', (e) => {
                    const field = checkbox.getAttribute('data-field');
                    this.filters[field] = checkbox.checked;
                    // Don't call applyFilters() here - wait for Apply button
                });
            });

            // Close Filter Button
            const closeFilterBtn = this.container.querySelector('#close-filter');
            if (closeFilterBtn) {
                closeFilterBtn.addEventListener('click', () => {
                    const filterSidebar = this.container.querySelector('#filter-sidebar');
                    if (filterSidebar) {
                        filterSidebar.classList.remove('active');
                    }
                });
            }

            // Apply Filters Button
            const applyFiltersBtn = this.container.querySelector('#apply-filters');
            if (applyFiltersBtn) {
                applyFiltersBtn.addEventListener('click', async () => {
                    await this.applyFilters();
                });
            }

            // Clear Filters Button
            const clearFiltersBtn = this.container.querySelector('#clear-filters');
            if (clearFiltersBtn) {
                clearFiltersBtn.addEventListener('click', async () => {
                    this.filters = {};
                    await this.applyFilters();

                    // Re-render filter sidebar to reset inputs
                    if (this.hasFilter) {
                        const filterSidebar = this.container.querySelector('#filter-sidebar');
                        if (filterSidebar) {
                            filterSidebar.innerHTML = this.renderFilterSidebar();
                        }
                    }

                    // Re-attach filter event listeners
                    this.attachEventListeners();
                });
            }

            // Drag and drop for column reordering
            const columnList = this.container.querySelector('#column-list');
            if (columnList) {
                let draggedElement = null;
                let draggedIndex = null;

                this.container.querySelectorAll('.psr-column-item').forEach(item => {
                    item.addEventListener('dragstart', (e) => {
                        draggedElement = item;
                        draggedIndex = parseInt(item.getAttribute('data-index'));
                        item.classList.add('dragging');
                        e.dataTransfer.effectAllowed = 'move';
                    });

                    item.addEventListener('dragend', (e) => {
                        item.classList.remove('dragging');
                        draggedElement = null;
                    });

                    item.addEventListener('dragover', (e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';

                        if (draggedElement && draggedElement !== item) {
                            const targetIndex = parseInt(item.getAttribute('data-index'));
                            const rect = item.getBoundingClientRect();
                            const midpoint = rect.top + rect.height / 2;

                            if (e.clientY < midpoint) {
                                item.classList.add('drag-over-top');
                                item.classList.remove('drag-over-bottom');
                            } else {
                                item.classList.add('drag-over-bottom');
                                item.classList.remove('drag-over-top');
                            }
                        }
                    });

                    item.addEventListener('dragleave', (e) => {
                        item.classList.remove('drag-over-top', 'drag-over-bottom');
                    });

                    item.addEventListener('drop', (e) => {
                        e.preventDefault();
                        item.classList.remove('drag-over-top', 'drag-over-bottom');

                        if (draggedElement && draggedElement !== item) {
                            const targetIndex = parseInt(item.getAttribute('data-index'));

                            // Reorder columns array
                            const [removed] = this.columns.splice(draggedIndex, 1);
                            this.columns.splice(targetIndex, 0, removed);

                            // Re-render the view with new column order
                            this.renderView();
                            this.saveColumnSettings();

                            // Re-render the settings sidebar
                            const settingsSidebar = this.container.querySelector('#settings-sidebar');
                            if (settingsSidebar) {
                                settingsSidebar.innerHTML = this.renderSettingsSidebar();
                            }

                            // Re-attach event listeners
                            this.attachEventListeners();
                        }
                    });
                });
            }

            // Escape key to close sidebars
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    const settingsSidebar = this.container.querySelector('#settings-sidebar');
                    if (settingsSidebar && settingsSidebar.classList.contains('active')) {
                        settingsSidebar.classList.remove('active');
                    }
                    const filterSidebar = this.container.querySelector('#filter-sidebar');
                    if (filterSidebar && filterSidebar.classList.contains('active')) {
                        filterSidebar.classList.remove('active');
                    }
                }
            });

            // Initialize Excel-like features
            this.setupFixedColumns(); // Fixed columns first to set sticky positioning
            this.setupStickyHeader(); // NEW - Sticky header for vertical scroll
            this.setupColumnResize(); // Resize handles respect fixed state

            // Media Preview delegation
            this.container.addEventListener('click', (e) => {
                const mediaPreview = e.target.closest('.psr-media-preview');
                if (mediaPreview) {
                    this.showPreview(mediaPreview.getAttribute('data-url'), mediaPreview.getAttribute('data-type'));
                }
            });
        }

        setupScrollNavigation() {
            const scrollContainer = this.container.querySelector('.psr-table-scroll-container');
            const scrollControls = this.container.querySelector('.psr-scroll-controls');
            const wrapperRelative = this.container.querySelector('.psr-table-wrapper-relative');

            // Get speed slider from toolbar
            let speedSlider = scrollControls ? scrollControls.querySelector('.psr-speed-slider') : null;
            const speedTooltip = scrollControls ? scrollControls.querySelector('.psr-speed-tooltip') : null;

            // If no scroll container (e.g. Kanban view), hide controls and return
            if (!scrollContainer) {
                if (scrollControls) scrollControls.classList.add('hidden');
                return;
            }

            // Get floating buttons
            let leftBtn = wrapperRelative ? wrapperRelative.querySelector('.psr-scroll-btn-floating[data-direction="left"]') : null;
            let rightBtn = wrapperRelative ? wrapperRelative.querySelector('.psr-scroll-btn-floating[data-direction="right"]') : null;

            if (!leftBtn || !rightBtn) return;

            // Clone buttons to remove existing event listeners
            const newLeftBtn = leftBtn.cloneNode(true);
            leftBtn.replaceWith(newLeftBtn);
            leftBtn = newLeftBtn;

            const newRightBtn = rightBtn.cloneNode(true);
            rightBtn.replaceWith(newRightBtn);
            rightBtn = newRightBtn;

            // Clean up old resize listener
            if (this.scrollResizeHandler) {
                window.removeEventListener('resize', this.scrollResizeHandler);
                this.scrollResizeHandler = null;
            }

            let scrollInterval = null;
            let scrollSpeed = speedSlider ? parseInt(speedSlider.value) : 5;
            const fastScrollSpeed = 15; // pixels per frame when holding

            // Helper to update tooltip
            const updateTooltip = (val) => {
                if (speedTooltip) {
                    const multiplier = (val / 5).toFixed(1);
                    speedTooltip.textContent = `${multiplier}x`;

                    // Position tooltip relative to thumb (approximate)
                    const percent = (val - 1) / (50 - 1);
                    // 80px is width, 12px is thumb width. 
                    // This is a rough calculation, CSS centering might be better if fixed
                }
            };

            // Update speed when slider changes
            if (speedSlider) {
                // Remove old listeners if any (though we are re-rendering usually)
                const newSlider = speedSlider.cloneNode(true);
                speedSlider.replaceWith(newSlider);
                speedSlider = newSlider; // Update reference to the new element

                // Initialize tooltip
                updateTooltip(parseInt(speedSlider.value));

                speedSlider.addEventListener('input', (e) => {
                    const val = parseInt(e.target.value);
                    scrollSpeed = val;
                    updateTooltip(val);
                });

                // Update local reference
                scrollSpeed = parseInt(speedSlider.value);
            }

            // Function to check if scrolling is needed
            const updateNavVisibility = () => {
                const hasOverflow = scrollContainer.scrollWidth > scrollContainer.clientWidth;

                if (!hasOverflow) {
                    if (scrollControls) scrollControls.classList.add('hidden');
                    leftBtn.classList.add('hidden');
                    rightBtn.classList.add('hidden');
                } else {
                    if (scrollControls) scrollControls.classList.remove('hidden');
                    leftBtn.classList.remove('hidden');
                    rightBtn.classList.remove('hidden');

                    // Optional: Disable buttons if at start/end
                    const atStart = scrollContainer.scrollLeft <= 0;
                    const atEnd = scrollContainer.scrollLeft >= scrollContainer.scrollWidth - scrollContainer.clientWidth - 1;

                    leftBtn.disabled = atStart;
                    // Opacity handled by .visible class now, but we can set a flag or attribute if needed
                    // For now, just rely on disabled attribute for styling if needed, or CSS :disabled

                    rightBtn.disabled = atEnd;
                }
            };

            // Get the hover zones
            const leftZone = wrapperRelative ? wrapperRelative.querySelector('.psr-scroll-zone-left') : null;
            const rightZone = wrapperRelative ? wrapperRelative.querySelector('.psr-scroll-zone-right') : null;

            // LEFT ZONE EVENT HANDLERS
            if (leftZone) {
                leftZone.addEventListener('mouseenter', () => {
                    if (!leftBtn.disabled) {
                        leftBtn.classList.add('visible');
                        startAutoScroll('left', scrollSpeed);
                    }
                });

                leftZone.addEventListener('mouseleave', () => {
                    leftBtn.classList.remove('visible');
                    stopAutoScroll();
                });

                // Touch support
                leftZone.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    if (!leftBtn.disabled) {
                        leftBtn.classList.add('visible');
                        startAutoScroll('left', scrollSpeed);
                    }
                });

                leftZone.addEventListener('touchend', () => {
                    leftBtn.classList.remove('visible');
                    stopAutoScroll();
                });
            }

            // RIGHT ZONE EVENT HANDLERS
            if (rightZone) {
                rightZone.addEventListener('mouseenter', () => {
                    if (!rightBtn.disabled) {
                        rightBtn.classList.add('visible');
                        startAutoScroll('right', scrollSpeed);
                    }
                });

                rightZone.addEventListener('mouseleave', () => {
                    rightBtn.classList.remove('visible');
                    stopAutoScroll();
                });

                // Touch support
                rightZone.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    if (!rightBtn.disabled) {
                        rightBtn.classList.add('visible');
                        startAutoScroll('right', scrollSpeed);
                    }
                });

                rightZone.addEventListener('touchend', () => {
                    rightBtn.classList.remove('visible');
                    stopAutoScroll();
                });
            }

            // Auto-scroll function
            const startAutoScroll = (direction, speed) => {
                if (scrollInterval) clearInterval(scrollInterval);

                // Use current slider value if available
                const currentSpeed = speedSlider ? parseInt(speedSlider.value) : speed;

                scrollInterval = setInterval(() => {
                    if (direction === 'left') {
                        scrollContainer.scrollLeft -= currentSpeed;
                    } else {
                        scrollContainer.scrollLeft += currentSpeed;
                    }
                    updateNavVisibility();
                }, 16); // ~60fps
            };

            const stopAutoScroll = () => {
                if (scrollInterval) {
                    clearInterval(scrollInterval);
                    scrollInterval = null;
                }
            };

            // Left button events
            leftBtn.addEventListener('mouseenter', () => !leftBtn.disabled && startAutoScroll('left', scrollSpeed));
            leftBtn.addEventListener('mouseleave', stopAutoScroll);
            leftBtn.addEventListener('mousedown', () => {
                if (!leftBtn.disabled) {
                    stopAutoScroll();
                    const currentSpeed = speedSlider ? parseInt(speedSlider.value) : scrollSpeed;
                    startAutoScroll('left', currentSpeed * 3);
                }
            });
            leftBtn.addEventListener('mouseup', () => {
                if (!leftBtn.disabled) {
                    stopAutoScroll();
                    startAutoScroll('left', scrollSpeed);
                }
            });

            // Right button events
            rightBtn.addEventListener('mouseenter', () => !rightBtn.disabled && startAutoScroll('right', scrollSpeed));
            rightBtn.addEventListener('mouseleave', stopAutoScroll);
            rightBtn.addEventListener('mousedown', () => {
                if (!rightBtn.disabled) {
                    stopAutoScroll();
                    const currentSpeed = speedSlider ? parseInt(speedSlider.value) : scrollSpeed;
                    startAutoScroll('right', currentSpeed * 3);
                }
            });
            rightBtn.addEventListener('mouseup', () => {
                if (!rightBtn.disabled) {
                    stopAutoScroll();
                    startAutoScroll('right', scrollSpeed);
                }
            });

            // Touch events
            leftBtn.addEventListener('touchstart', (e) => {
                if (!leftBtn.disabled) {
                    e.preventDefault();
                    const currentSpeed = speedSlider ? parseInt(speedSlider.value) : scrollSpeed;
                    startAutoScroll('left', currentSpeed * 3);
                }
            });
            leftBtn.addEventListener('touchend', stopAutoScroll);

            rightBtn.addEventListener('touchstart', (e) => {
                if (!rightBtn.disabled) {
                    e.preventDefault();
                    const currentSpeed = speedSlider ? parseInt(speedSlider.value) : scrollSpeed;
                    startAutoScroll('right', currentSpeed * 3);
                }
            });
            rightBtn.addEventListener('touchend', stopAutoScroll);

            // Update visibility on scroll
            scrollContainer.addEventListener('scroll', updateNavVisibility);

            // Initial check
            updateNavVisibility();

            // Re-check on window resize
            this.scrollResizeHandler = updateNavVisibility;
            window.addEventListener('resize', this.scrollResizeHandler);
        }

        setupColumnSort() {
            const headers = this.container.querySelectorAll('.psr-table th.psr-sortable');

            headers.forEach(th => {
                th.style.cursor = 'pointer';

                th.addEventListener('click', (e) => {
                    // Don't trigger sort if clicking on pin icon or resize handle
                    if (e.target.classList.contains('psr-pin-icon') ||
                        e.target.classList.contains('psr-resize-handle')) {
                        return;
                    }

                    let field = th.getAttribute('data-field');
                    if (!field) return;

                    // Check if this is a combined field
                    let isCombinedField = false;
                    let sortFields = [field]; // Array of fields to sort by

                    if (field.includes('_')) {
                        // Find the concat config for this field
                        const concatConfig = this.concatConfig.find(config =>
                            config.combinedField === field
                        );

                        if (concatConfig && concatConfig.fields.length > 0) {
                            // This is a combined field - use all fields in the combination
                            isCombinedField = true;
                            sortFields = concatConfig.fields;
                        }
                    }

                    // Toggle sort logic
                    if (this.sortField === field) {
                        // Same field - toggle direction or clear
                        if (this.sortDirection === 'asc') {
                            this.sortDirection = 'desc';
                        } else {
                            // Clear sort
                            this.sortField = null;
                            this.sortDirection = null;
                        }
                    } else {
                        // New field - start with ascending
                        this.sortField = field;
                        this.sortDirection = 'asc';
                    }

                    // Save sort state
                    this.saveColumnSettings();

                    // Reset to first page and fetch new data
                    this.currentPage = 1;
                    this.fetchData().then(() => this.renderView());
                });
            });
        }

        async applyFilters() {
            // Server-side filtering: fetch new data from API with filter parameters
            this.currentPage = 1; // Reset to first page when filters change
            await this.fetchData();
            this.render(); // Re-render to show filtered data
        }

        // --- EXCEL-LIKE FEATURES ---

        loadColumnSettings() {
            try {
                const saved = localStorage.getItem(this.getStorageKey());
                if (saved) {
                    const settings = JSON.parse(saved);
                    this.columnWidths = settings.columnWidths || {};
                    this.fixedColumns = new Set(settings.fixedColumns || []);
                    this.fixedColumnsRight = new Set(settings.fixedColumnsRight || []); // NEW

                    if (settings.visibleColumns && Array.isArray(settings.visibleColumns)) {
                        this.visibleColumns = new Set(settings.visibleColumns);
                    }

                    // Restore column order if saved (only if columns exist)
                    if (this.columns.length > 0 && settings.columnOrder && Array.isArray(settings.columnOrder)) {
                        const orderMap = new Map(settings.columnOrder.map((field, index) => [field, index]));
                        this.columns.sort((a, b) => {
                            const indexA = orderMap.has(a.field) ? orderMap.get(a.field) : 999;
                            const indexB = orderMap.has(b.field) ? orderMap.get(b.field) : 999;
                            return indexA - indexB;
                        });
                    }

                    // Load sticky header setting if exists (PRIORITY: localStorage > HTML attribute)
                    if (typeof settings.stickyHeader !== 'undefined') {
                        this.stickyHeader = settings.stickyHeader;
                    }

                    // Load sort state if exists
                    if (settings.sortField) {
                        this.sortField = settings.sortField;
                        this.sortDirection = settings.sortDirection || 'asc';
                    }
                } else {
                    this.columnWidths = {};
                    this.fixedColumns = new Set();
                    this.fixedColumnsRight = new Set(); // NEW
                }
            } catch (e) {
                console.error('Error loading column settings:', e);
                this.columnWidths = {};
                this.fixedColumns = new Set();
                this.fixedColumnsRight = new Set(); // NEW
            }
        }

        saveColumnSettings() {
            try {
                const settings = {
                    columnWidths: this.columnWidths,
                    fixedColumns: Array.from(this.fixedColumns),
                    fixedColumnsRight: Array.from(this.fixedColumnsRight), // NEW
                    visibleColumns: Array.from(this.visibleColumns),
                    columnOrder: this.columns.map(col => col.field),
                    stickyHeader: this.stickyHeader,
                    sortField: this.sortField,
                    sortDirection: this.sortDirection
                };
                localStorage.setItem(this.getStorageKey(), JSON.stringify(settings));
            } catch (e) {
                console.error('Error saving column settings:', e);
            }
        }

        setupColumnResize() {
            const headers = this.container.querySelectorAll('.psr-table th');

            headers.forEach(th => {
                // Only set position relative if:
                // 1. Not a fixed column (those need sticky for horizontal freeze)
                // 2. Sticky headers are disabled (otherwise we'd override sticky positioning)
                if (!th.classList.contains('psr-fixed-column') && !this.stickyHeader) {
                    th.style.position = 'relative';
                }
                // If sticky headers are enabled, position is already set by setupStickyHeader()
                // so we don't touch it here

                const handle = th.querySelector('.psr-resize-handle');
                if (!handle) return;

                // Apply saved width
                const field = th.getAttribute('data-field');
                if (field && this.columnWidths[field]) {
                    th.style.width = this.columnWidths[field];
                    th.style.minWidth = this.columnWidths[field];
                    th.style.maxWidth = this.columnWidths[field]; // Fix max-width conflict
                } else if (th.dataset.col === 'sno' && this.columnWidths['sno']) {
                    th.style.width = this.columnWidths['sno'];
                    th.style.minWidth = this.columnWidths['sno'];
                    th.style.maxWidth = this.columnWidths['sno'];
                }

                handle.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const startX = e.pageX;
                    const startWidth = th.offsetWidth;
                    handle.classList.add('resizing');

                    const onMouseMove = (e) => {
                        const width = startWidth + (e.pageX - startX);
                        if (width > 50) { // Minimum width
                            const newWidth = `${width}px`;
                            th.style.width = newWidth;
                            th.style.minWidth = newWidth;
                            th.style.maxWidth = newWidth; // Fix max-width conflict

                            // Save width
                            if (field) {
                                this.columnWidths[field] = newWidth;
                            } else if (th.dataset.col === 'sno') {
                                this.columnWidths['sno'] = newWidth;
                            }
                        }
                    };

                    const onMouseUp = () => {
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                        handle.classList.remove('resizing');
                        this.saveColumnSettings();
                    };

                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                });
            });
        }


        setupFixedColumns() {
            const headers = this.container.querySelectorAll('.psr-table th');
            const rows = this.container.querySelectorAll('.psr-table tbody tr');

            // 1. Apply fixed state from saved settings (LEFT side)
            headers.forEach((th, index) => {
                const field = th.getAttribute('data-field');
                const pinIcon = th.querySelector('.psr-pin-icon');

                // Check if this column is frozen on LEFT
                if (field && this.fixedColumns.has(field)) {
                    th.classList.add('psr-fixed-column');
                    th.classList.remove('psr-fixed-column-right'); // Remove right if exists
                    th.style.position = 'sticky';
                    th.style.zIndex = '4';
                    th.style.left = '0'; // Set initial left position
                    th.style.right = ''; // Clear right
                    if (pinIcon) pinIcon.classList.add('pinned');

                    rows.forEach(row => {
                        const cell = row.children[index];
                        if (cell) {
                            cell.classList.add('psr-fixed-column');
                            cell.classList.remove('psr-fixed-column-right');
                            cell.style.position = 'sticky';
                            cell.style.zIndex = '2';
                            cell.style.left = '0';
                            cell.style.right = '';
                        }
                    });
                }
                // Check if this column is frozen on RIGHT
                else if (field && this.fixedColumnsRight.has(field)) {
                    th.classList.add('psr-fixed-column-right');
                    th.classList.remove('psr-fixed-column'); // Remove left if exists
                    th.style.position = 'sticky';
                    th.style.zIndex = '4';
                    th.style.left = ''; // Clear left
                    th.style.right = '0'; // Set initial right position
                    if (pinIcon) pinIcon.classList.add('pinned');

                    rows.forEach(row => {
                        const cell = row.children[index];
                        if (cell) {
                            cell.classList.add('psr-fixed-column-right');
                            cell.classList.remove('psr-fixed-column');
                            cell.style.position = 'sticky';
                            cell.style.zIndex = '2';
                            cell.style.left = '';
                            cell.style.right = '0'; // Set initial right position
                        }
                    });
                }
                // Not frozen
                else {
                    th.classList.remove('psr-fixed-column', 'psr-fixed-column-right');
                    th.style.position = '';
                    th.style.left = '';
                    th.style.right = '';
                    th.style.zIndex = '';
                    if (pinIcon) pinIcon.classList.remove('pinned');

                    rows.forEach(row => {
                        const cell = row.children[index];
                        if (cell) {
                            cell.classList.remove('psr-fixed-column', 'psr-fixed-column-right');
                            cell.style.position = '';
                            cell.style.left = '';
                            cell.style.right = '';
                            cell.style.zIndex = '';
                        }
                    });
                }
            });

            // 2. Calculate LEFT offsets for left-frozen columns
            let leftOffset = 0;
            headers.forEach((th, index) => {
                if (th.classList.contains('psr-fixed-column')) {
                    th.style.left = `${leftOffset}px`;

                    rows.forEach(row => {
                        const cell = row.children[index];
                        if (cell) cell.style.left = `${leftOffset}px`;
                    });

                    leftOffset += th.offsetWidth;
                }
            });

            // 3. Calculate RIGHT offsets for right-frozen columns
            let rightOffset = 0;
            // Iterate from right to left
            for (let index = headers.length - 1; index >= 0; index--) {
                const th = headers[index];
                if (th.classList.contains('psr-fixed-column-right')) {
                    th.style.right = `${rightOffset}px`;

                    rows.forEach(row => {
                        const cell = row.children[index];
                        if (cell) cell.style.right = `${rightOffset}px`;
                    });

                    rightOffset += th.offsetWidth;
                }
            }

            // 4. Attach click listeners to pin icons
            this.container.querySelectorAll('.psr-pin-icon').forEach(icon => {
                const newIcon = icon.cloneNode(true);
                icon.parentNode.replaceChild(newIcon, icon);

                newIcon.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const field = newIcon.getAttribute('data-field');
                    const th = newIcon.closest('th');
                    const index = Array.from(th.parentNode.children).indexOf(th);

                    // Determine current state and toggle
                    const isLeftFrozen = this.fixedColumns.has(field);
                    const isRightFrozen = this.fixedColumnsRight.has(field);

                    // Cycle: None -> Left -> Right -> None
                    if (!isLeftFrozen && !isRightFrozen) {
                        // Add to LEFT
                        this.fixedColumns.add(field);
                    } else if (isLeftFrozen) {
                        // Move from LEFT to RIGHT
                        this.fixedColumns.delete(field);
                        this.fixedColumnsRight.add(field);
                    } else {
                        // Remove from RIGHT (back to none)
                        this.fixedColumnsRight.delete(field);
                    }

                    // Re-apply all frozen columns
                    this.setupFixedColumns();
                    this.saveColumnSettings();
                });
            });
        }

        setupStickyHeader() {
            const headers = this.container.querySelectorAll('.psr-table th');

            if (!this.stickyHeader) {
                // Remove sticky styles if disabled
                headers.forEach(th => {
                    if (!th.classList.contains('psr-fixed-column') && !th.classList.contains('psr-fixed-column-right')) {
                        th.style.position = 'static';
                        th.style.top = '';
                        th.style.background = '';
                        th.style.zIndex = '';
                        th.style.boxShadow = '';
                    }
                });
                return;
            }

            // Apply sticky styles
            headers.forEach(th => {
                // ALL headers get sticky positioning for vertical scroll
                // But we must respect existing sticky positioning for frozen columns

                if (th.classList.contains('psr-fixed-column') || th.classList.contains('psr-fixed-column-right')) {
                    // Frozen columns are already sticky, just ensure top is 0
                    th.style.top = '0';
                } else {
                    // Regular columns - apply sticky positioning
                    th.style.position = 'sticky';
                    th.style.top = '0';
                    th.style.background = '#fff';
                    th.style.zIndex = '3';
                    th.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.1)';
                }
            });
        }
    }

    // Expose PSRDataTable to global scope
    window.PSRDataTable = PSRDataTable;



    // Auto-initialize on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        const tables = document.querySelectorAll('table[data-api]');
        tables.forEach((table, index) => {
            new PSRDataTable(table);
        });
    });

    // Dispatch ready event
    document.dispatchEvent(new CustomEvent('psr-datatable:ready'));
})();
