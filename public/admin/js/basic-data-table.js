/**
 * PSR Basic DataTable - HTML-Driven Library for Static Data
 * Auto-initializes from selected-data attributes
 * Optimized for Manual Edits: Conditional search, sticky header by default, column resizing.
 * Includes Media Preview for Images, Videos, and Files.
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

            const selectedDataAttr = tableElement.getAttribute('selected-data');
            try {
                this.initialData = selectedDataAttr ? JSON.parse(selectedDataAttr) : [];
            } catch (e) {
                console.error('Failed to parse selected-data:', e);
                this.initialData = [];
            }

            this.hasActions = tableElement.getAttribute('data-actions') === 'true';
            this.hasFilter = tableElement.getAttribute('data-filter') === 'true';
            this.defaultField = tableElement.getAttribute('data-default-field') || 'title';
            const pageSizeAttr = tableElement.getAttribute('data-page-size');
            this.pageSize = pageSizeAttr === 'all' ? 'all' : (parseInt(pageSizeAttr) || 10);

            this.columns = [];
            this.data = [];
            this.currentPage = 1;
            this.totalRecords = 0;
            this.searchQuery = '';

            this.visibleColumns = new Set();
            this.sortField = null;
            this.sortDirection = null;
            this.columnWidths = {};

            // Sticky header option (Default to true for basic table refinement)
            this.stickyHeader = tableElement.getAttribute('data-sticky-header') !== 'false';

            if (this.table.id) {
                PSRDataTable.instances.set(this.table.id, this);
            }

            this.init();
        }

        async init() {
            this.container = document.createElement('div');
            this.container.className = 'psr-datatable-wrapper';
            this.table.parentNode.insertBefore(this.container, this.table);
            this.table.remove();

            this.loadSettings();
            await this.fetchData();

            if (this.columns.length === 0 && this.initialData.length > 0) {
                this.discoverColumns(this.initialData[0]);
                this.loadSettings();
            } else if (this.hasActions) {
                this.addActionsColumn();
            }

            this.render();
            this.injectStyles();
        }

        async fetchData() {
            let processed = [...this.initialData];

            if (this.searchQuery && this.hasFilter) {
                const query = this.searchQuery.toLowerCase();
                processed = processed.filter(row => {
                    return Object.values(row).some(val => {
                        if (val && typeof val === 'object') {
                            return Object.values(val).some(v => v && v.toString().toLowerCase().includes(query));
                        }
                        return val && val.toString().toLowerCase().includes(query);
                    });
                });
            }

            if (this.sortField && this.sortDirection) {
                processed.sort((a, b) => {
                    let valA = this.getNestedValue(a, this.sortField);
                    let valB = this.getNestedValue(b, this.sortField);
                    if (valA == null) return 1;
                    if (valB == null) return -1;
                    if (typeof valA === 'string') valA = valA.toLowerCase();
                    if (typeof valB === 'string') valB = valB.toLowerCase();
                    if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
                    if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
                    return 0;
                });
            }

            this.totalRecords = processed.length;

            if (this.pageSize === 'all') {
                this.data = processed;
            } else {
                const start = (this.currentPage - 1) * this.pageSize;
                this.data = processed.slice(start, start + this.pageSize);
            }
        }

        async updateData(newData) {
            this.initialData = Array.isArray(newData) ? newData : [];
            if (this.columns.length === 0 && this.initialData.length > 0) {
                this.discoverColumns(this.initialData[0]);
            } else {
                this.addActionsColumn();
            }
            this.currentPage = 1;
            await this.fetchData();
            this.render();
        }

        discoverColumns(sampleRecord) {
            const defaultFields = (this.defaultField || '').split(',').map(f => f.trim());
            const cols = [];

            const flattenObject = (obj, prefix = '') => {
                for (const key in obj) {
                    const value = obj[key];
                    const field = prefix ? `${prefix}.${key}` : key;
                    if (value && typeof value === 'object' && !Array.isArray(value) && !this.isEditorData(value)) {
                        flattenObject(value, field);
                    } else {
                        const isVisible = defaultFields.includes(field) || defaultFields.includes(prefix) || defaultFields.includes(key);
                        cols.push({ field: field, label: this.formatLabel(field), visible: isVisible });
                    }
                }
            };

            flattenObject(sampleRecord);

            this.columns = cols.map(c => {
                if (c.visible) this.visibleColumns.add(c.field);
                return { ...c, type: this.detectColumnType(c.field, this.getNestedValue(sampleRecord, c.field)) };
            });

            this.addActionsColumn();
        }

        addActionsColumn() {
            if (this.hasActions && !this.columns.some(c => c.field === 'actions')) {
                this.columns.push({ field: 'actions', label: 'Actions', type: 'actions', visible: true });
                this.visibleColumns.add('actions');
            }
        }

        formatLabel(fieldName) {
            return fieldName.replace(/\./g, ' ').replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim();
        }

        isEditorData(value) {
            if (!value || typeof value !== 'object') return false;
            if (Array.isArray(value)) return false;
            return value.hasOwnProperty('blocks') && Array.isArray(value.blocks);
        }

        detectColumnType(fieldName, value) {
            const lower = fieldName.toLowerCase();
            const valStr = (value || '').toString().toLowerCase();

            if (lower.includes('image') || lower.endsWith('.file') || valStr.match(/\.(jpg|jpeg|png|gif|webp)$/i)) return 'image';
            if (lower.includes('video') || valStr.match(/\.(mp4|webm|ogg)$/i)) return 'video';
            if (lower.includes('file') || valStr.match(/\.(pdf|doc|docx|zip|txt)$/i)) return 'file';

            if (lower.includes('icon')) return 'icon';
            if (lower.includes('status') || lower.includes('active')) return 'toggle';

            let parsed = value;
            if (typeof value === 'string' && value.trim().startsWith('{')) {
                try { parsed = JSON.parse(value); } catch (e) { }
            }
            if (this.isEditorData(parsed)) return 'editor';

            return 'text';
        }

        render() {
            this.container.innerHTML = `
                ${this.renderToolbar()}
                <div class="psr-datatable-content">
                    <div id="datatable-view"></div>
                    ${this.renderPagination()}
                </div>
            `;
            this.renderView();
            this.attachEventListeners();
        }

        renderToolbar() {
            if (!this.hasFilter && (this.pageSize === 'all' || this.totalRecords <= this.pageSize)) return '';

            const sizes = [5, 10, 20, 50, 'all'];
            return `
                <div class="psr-table-toolbar">
                    <div class="psr-toolbar-left">
                        ${this.hasFilter ? `
                        <div class="psr-table-search-wrapper">
                            <i class="fa fa-search"></i>
                            <input type="text" id="search-input" class="psr-table-search" placeholder="Search..." value="${this.searchQuery}">
                        </div>` : ''}
                        <div class="psr-limit-selector">
                            <select id="page-size-select" class="psr-select">
                                ${sizes.map(size => `<option value="${size}" ${this.pageSize === size ? 'selected' : ''}>${size}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                </div>
            `;
        }

        renderView() {
            const viewContainer = this.container.querySelector('#datatable-view');
            const visibleCols = this.columns.filter(c => this.visibleColumns.has(c.field));

            let html = `
                <div class="psr-table-scroll-container">
                    <table class="psr-table">
                        <thead>
                            <tr>
                                <th style="width: 50px;">S.No</th>
                                ${visibleCols.map(col => {
                const width = this.columnWidths[col.field] ? `style="width: ${this.columnWidths[col.field]}px;"` : '';
                return `
                                        <th data-field="${col.field}" class="${col.type !== 'actions' ? 'psr-sortable' : ''}" ${width}>
                                            <div class="psr-th-content">
                                                <span>${col.label}</span>
                                                ${this.sortField === col.field ? `<i class="fa fa-sort-${this.sortDirection === 'asc' ? 'up' : 'down'} psr-sort-icon"></i>` : ''}
                                            </div>
                                            <div class="psr-resize-handle" data-field="${col.field}"></div>
                                        </th>
                                    `;
            }).join('')}
                            </tr>
                        </thead>
                        <tbody>
                            ${this.data.length ? this.data.map((row, i) => `
                                <tr data-index="${(this.currentPage - 1) * (this.pageSize === 'all' ? 0 : this.pageSize) + i}">
                                    <td>${(this.currentPage - 1) * (this.pageSize === 'all' ? 0 : this.pageSize) + i + 1}</td>
                                    ${visibleCols.map(col => `<td>${this.renderCell(row, col)}</td>`).join('')}
                                </tr>
                            `).join('') : '<tr><td colspan="100%" style="text-align:center;padding:20px;">No data available</td></tr>'}
                        </tbody>
                    </table>
                </div>
            `;
            viewContainer.innerHTML = html;
            this.applyStickyHeader();
        }

        renderCell(row, column) {
            const value = this.getNestedValue(row, column.field);
            if (column.type === 'actions') {
                return `<div class="psr-table-actions"><button class="psr-btn psr-btn-sm psr-btn-danger psr-btn-icon" data-action="delete" data-id="${row.id || ''}"><i class="fa fa-trash"></i></button></div>`;
            }
            if (column.type === 'toggle') {
                const checked = value === 1 || value === true || value === '1';
                return `<div class="psr-toggle psr-toggle-sm ${checked ? 'active' : ''}"><span class="psr-toggle-handle"></span></div>`;
            }

            const url = this.getImageUrl(value);

            if (column.type === 'image') {
                return url ? `<div class="psr-media-preview" data-url="${url}" data-type="image"><img src="${url}" class="psr-table-img" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer;"></div>` : '<i class="fa fa-image psr-text-muted"></i>';
            }
            if (column.type === 'video') {
                return url ? `<div class="psr-media-preview" data-url="${url}" data-type="video" style="cursor:pointer; display:flex; align-items:center; gap:5px;"><i class="fa fa-play-circle psr-text-primary" style="font-size:20px;"></i> <span style="font-size:12px;">Watch</span></div>` : '<i class="fa fa-video-camera psr-text-muted"></i>';
            }
            if (column.type === 'file') {
                return url ? `<div class="psr-media-preview" data-url="${url}" data-type="file" style="cursor:pointer; display:flex; align-items:center; gap:5px;"><i class="fa fa-file-text psr-text-info" style="font-size:20px;"></i> <span style="font-size:12px;">View</span></div>` : '<i class="fa fa-file psr-text-muted"></i>';
            }

            if (column.type === 'editor') {
                return `<div class="psr-editor-content">${this.renderEditor(value)}</div>`;
            }
            return value != null ? value : '<span class="psr-text-muted">N/A</span>';
        }

        getImageUrl(value) {
            if (!value) return null;
            if (typeof value === 'string') {
                if (value.startsWith('http')) return value;
                if (value.startsWith('/')) return 'https://cdn.inchbrick.com' + value;
                return value;
            }
            if (typeof value === 'object') {
                if (value.file) return this.getImageUrl(value.file);
                if (value.path) return this.getImageUrl(value.path);
                if (value.url) return this.getImageUrl(value.url);
            }
            return null;
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
                        const url = bData.file?.file || bData.file || '';
                        const resolvedUrl = this.getImageUrl(url);
                        return `<div class="psr-media-preview" data-url="${resolvedUrl}" data-type="image"><img src="${resolvedUrl}" style="max-width:100px;display:block;margin:5px 0;cursor:pointer;"></div>`;
                    case 'table':
                        const rows = (bData.content || []).map(row =>
                            `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
                        return `<table class="inner-table">${rows}</table>`;
                    default:
                        return bData.text || '';
                }
            }).join('');
        }

        renderPagination() {
            if (this.pageSize === 'all' || this.totalRecords <= this.pageSize) return '';
            const totalPages = Math.ceil(this.totalRecords / this.pageSize);
            let btns = '';
            for (let i = 1; i <= totalPages; i++) {
                btns += `<button class="psr-page-btn ${this.currentPage === i ? 'active' : ''}" data-page="${i}">${i}</button>`;
            }
            return `<div class="psr-pagination">${btns}</div>`;
        }

        attachEventListeners() {
            const container = this.container;

            let searchTimeout;
            container.querySelector('#search-input')?.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.searchQuery = e.target.value;
                    this.currentPage = 1;
                    this.fetchData().then(() => this.renderView());
                }, 300);
            });

            container.querySelector('#page-size-select')?.addEventListener('change', (e) => {
                this.pageSize = e.target.value === 'all' ? 'all' : parseInt(e.target.value);
                this.currentPage = 1;
                this.fetchData().then(() => this.render());
            });

            container.addEventListener('click', (e) => {
                const th = e.target.closest('.psr-sortable');
                if (th && !e.target.classList.contains('psr-resize-handle')) {
                    const field = th.getAttribute('data-field');
                    this.sortDirection = (this.sortField === field && this.sortDirection === 'asc') ? 'desc' : 'asc';
                    this.sortField = field;
                    this.fetchData().then(() => this.renderView());
                }

                const pageBtn = e.target.closest('.psr-page-btn');
                if (pageBtn) {
                    this.currentPage = parseInt(pageBtn.getAttribute('data-page'));
                    this.fetchData().then(() => this.render());
                }

                const actionBtn = e.target.closest('[data-action]');
                if (actionBtn) {
                    const action = actionBtn.getAttribute('data-action');
                    const id = actionBtn.getAttribute('data-id');
                    const index = actionBtn.closest('tr')?.getAttribute('data-index');
                    const rowData = this.initialData[index];
                    if (PSRDataTable.globalHandlers[action]) {
                        PSRDataTable.globalHandlers[action](id, rowData, this);
                    }
                }

                const mediaPreview = e.target.closest('.psr-media-preview');
                if (mediaPreview) {
                    this.showPreview(mediaPreview.getAttribute('data-url'), mediaPreview.getAttribute('data-type'));
                }
            });

            this.setupColumnResize();
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

        setupColumnResize() {
            const container = this.container;
            let startX, startWidth, currentTh;

            const onMouseMove = (e) => {
                if (!currentTh) return;
                const width = startWidth + (e.pageX - startX);
                if (width > 50) {
                    currentTh.style.width = width + 'px';
                    const field = currentTh.getAttribute('data-field');
                    this.columnWidths[field] = width;
                }
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                this.saveSettings();
                currentTh = null;
            };

            container.querySelectorAll('.psr-resize-handle').forEach(handle => {
                handle.addEventListener('mousedown', (e) => {
                    currentTh = e.target.parentElement;
                    startX = e.pageX;
                    startWidth = currentTh.offsetWidth;
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                    e.preventDefault();
                });
            });
        }

        applyStickyHeader() {
            if (!this.stickyHeader) return;
            const ths = this.container.querySelectorAll('.psr-table th');
            ths.forEach(th => {
                th.style.position = 'sticky';
                th.style.top = '0';
                th.style.zIndex = '10';
                th.style.background = '#fff';
                th.style.boxShadow = 'inset 0 -1px 0 #ddd';
            });
        }

        getNestedValue(row, field) {
            if (!field) return null;
            const parts = field.split('.');
            let current = row;
            for (const part of parts) {
                if (current == null) return null;
                current = current[part];
            }
            return current;
        }

        loadSettings() {
            const saved = localStorage.getItem(this.getStorageKey());
            if (saved) {
                const settings = JSON.parse(saved);
                this.columnWidths = settings.columnWidths || {};
                this.sortField = settings.sortField;
                this.sortDirection = settings.sortDirection;
            }
        }

        saveSettings() {
            const settings = {
                columnWidths: this.columnWidths,
                sortField: this.sortField,
                sortDirection: this.sortDirection
            };
            localStorage.setItem(this.getStorageKey(), JSON.stringify(settings));
        }

        getStorageKey() {
            return `psr-basic-dt-${this.table.id || 'default'}`;
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
    }

    window.PSRDataTable = PSRDataTable;

    document.addEventListener('DOMContentLoaded', () => {
        const selector = 'table[selected-data], table.psr-datatable-clone, table.psr-basic-datatable';
        document.querySelectorAll(selector).forEach(table => {
            if (!PSRDataTable.instances.has(table.id)) {
                new PSRDataTable(table);
            }
        });
    });
})();
