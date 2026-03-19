(function () {
    "use strict";

    // Configuration
    const CONFIG = {
        modalId: "file-picker-modal",
        modalClass: "file-picker-modal",
        overlayClass: "file-picker-overlay",
        iframeId: "file-picker-iframe",
        defaultServerUrl: window.location.origin,
        defaultPlaceholder: "Choose File",
    };

    // Create modal HTML
    function createModal() {
        if (document.getElementById(CONFIG.modalId)) return;

        const modal = document.createElement("div");
        modal.id = CONFIG.modalId;
        modal.className = CONFIG.overlayClass;
        const canCreate = window.canAccess && window.canAccess('create', 'file-picker');
        modal.innerHTML = `
            <div class="${CONFIG.modalClass}">
    <div class="file-picker-modal">
        <div class="file-picker-header">
            <div class="header-main">
                <h3 class="file-picker-title">Choose File</h3>
                <div id="storageIndicator" class="storage-indicator">
                    <i class="fas fa-hdd"></i>
                    <span>Local Storage</span>
                </div>
            </div>
            <div class="toolbar">
                <div class="breadcrumb" id="breadcrumb">
                    <span class="breadcrumb-item" onclick="FilePicker.goToRoot()">Root</span>
                </div>
                <div class="toolbar-actions">
                    <!-- Search Bar -->
                    <div class="search-container">
                        <div class="search-input-wrapper">
                            <input type="text" id="searchInput" placeholder="Search files and folders..."
                                class="search-input" oninput="FilePicker.handleSearchInput(event)"
                                onkeydown="FilePicker.handleSearchKeydown(event)">

                            <button class="search-clear-btn" id="searchClearBtn" onclick="FilePicker.clearSearch()"
                                style="display: none;">
                                <i class="fas fa-times"></i>
                            </button>

                            <button class="search-btn" onclick="FilePicker.toggleAdvancedFilters()"
                                id="filterToggleBtn" title="Toggle Advanced Filters">
                                <i class="fas fa-filter" id="filterIcon"></i>
                            </button>

                            <button class="search-btn" onclick="FilePicker.triggerSearch()" id="searchBtn">
                                <i class="fas fa-search" id="searchIcon"></i>
                                <i class="fas fa-spinner fa-spin" id="searchSpinner" style="display: none;"></i>
                            </button>
                        </div>

                        <div class="search-filters" id="searchFilters" style="display: none;">
                            <div class="filter-group">
                                <label class="filter-label">File Type</label>
                                <select class="filter-select" id="fileTypeFilter"
                                    onchange="FilePicker.handleFilterChange()">
                                    <option value="all">All Items</option>
                                    <option value="files">Files Only</option>
                                    <option value="folders">Folders Only</option>
                                </select>
                            </div>

                            <div class="filter-group">
                                <label class="filter-label">Search Scope</label>
                                <div class="filter-toggle" id="folderScopeToggle"
                                    onclick="FilePicker.toggleFolderScope()">
                                    <input type="checkbox" id="folderScopeCheckbox">
                                    <span>Current Folder Only</span>
                                </div>
                            </div>

                            <div class="filter-group">
                                <label class="filter-label">Search Mode</label>
                                <div class="filter-toggle" id="exactMatchToggle"
                                    onclick="FilePicker.toggleExactMatch()">
                                    <input type="checkbox" id="exactMatchCheckbox">
                                    <span>Exact Match</span>
                                </div>
                            </div>
                        </div>
                    </div>


                    <!-- Action Buttons -->
                    ${canCreate ? `
                    <div class="action-buttons">
                        <button class="psr-btn psr-btn-primary psr-btn-icon"
                            onclick="FilePicker.openUploadModal()" id="uploadFile" title="Upload Files">
                            <i class="fa fa-upload"></i>
                        </button>
                        <button class="psr-btn psr-btn-primary psr-btn-icon" onclick="FilePicker.showCreateFolderDialog()"
                            id="createFolder" title="Create New Folder">
                            <i class="fa fa-plus"></i>
                        </button>
                    </div>
                    ` : ''}
                </div>
            </div>
            <button class="file-picker-close" id="file-picker-close-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
        <div class="file-picker-body">
            <!-- Content Area -->
            <div class="content-area">
                <div class="loading-state" id="loadingState" style="display: none;">
                    <div class="loading-spinner"></div>
                    <p id="loadingText">Loading files...</p>
                </div>
                <div class="file-grid" id="fileGrid"></div>
                <div class="pagination-controls" id="paginationControls" style="display: none;"></div>
                <!-- Empty State -->
                <div class="empty-state" id="emptyState" style="display: none;">
                    <i class="fas fa-folder-open"></i>
                    <h3>No files in this folder</h3>
                    <p>Upload some files to get started</p>
                </div>
            </div>
        </div>
        <div class="file-picker-footer">
            <div class="file-picker-selected-info">
                <span id="selectedCount">0 files selected</span>
            </div>
            <div class="file-picker-actions">
                <button type="button" id="file-picker-cancel"
                    class="file-picker-btn file-picker-btn-secondary">Cancel</button>
                <button type="button" id="file-picker-confirm" class="file-picker-btn file-picker-btn-primary"
                    disabled="">Select</button>
            </div>
        </div>
    </div>
</div>
        `;

        document.body.appendChild(modal);
    }

    class FilePicker {
        constructor(input) {
            this.input = input;
            this.config = this.parseConfig(input);
            this.currentFolder = null;
            this.currentFolderId = null;
            this.folderHistory = [];
            this.items = [];
            this.selectedFiles = new Set();
            this.currentPage = 1;
            this.itemsPerPage = 12;
            this.totalPages = 1;
            this.totalItems = 0;
            this.isSearchMode = false;
            this.searchQuery = "";
            this.searchResults = [];
            this.searchPage = 1;
            this.allLoadedItems = [];
            this.isClientSideSearch = false;
            this.searchFilters = {
                fileType: "all",
                folderScope: false,
                exactMatch: false,
            };
            this.showAdvancedFilters = false;
            this.lastSelectedIndex = -1;
            this.providerName = "Local";
            this._hasInitialized = false;
        }

        /**
         * Initializes the FilePicker once.
         * Loads storage provider info and initial file list.
         */
        async initData() {
            if (this._hasInitialized) return;
            this._hasInitialized = true;
            await this.loadStrorageInfo();
            // loadFiles is handled by open()
        }

        /**
         * Fetches the current storage provider information from API.
         */
        async loadStrorageInfo() {
            try {
                const res = await fetchData("storage/info", { cache: "no-store" });
                if (res.status) {
                    this.providerName = res.providerName;
                }
                this.updateStorageIndicator();
            } catch (error) {
                console.error("Error loading storage info:", error);
            }
        }

        /**
         * Updates the UI element that shows which storage provider is active.
         */
        updateStorageIndicator() {
            const storageIndicator = this.modal ? this.modal.querySelector("#storageIndicator") : null;
            if (storageIndicator) {
                storageIndicator.innerHTML = `
                <i class="fas fa-${this.getStorageIcon()}"></i>
                <span>${this.providerName} Storage</span>
              `;
                storageIndicator.title = `Currently using ${this.providerName} storage provider`;
            }
        }

        /**
         * Returns the appropriate icon based on provider.
         */
        getStorageIcon() {
            switch (this.providerName.toLowerCase()) {
                case "aws":
                case "gcp":
                case "azure":
                    return "cloud";
                default:
                    return "hdd";
            }
        }
        parseConfig(input) {
            // Parse allowed types from data-types or accept attribute
            let allowedTypes = [];
            if (input.dataset.types) {
                allowedTypes = input.dataset.types
                    .split(",")
                    .map((type) => type.trim());
            } else {
                // read accept attribute even if element is non-input (e.g., div)
                const acceptAttr =
                    (input.getAttribute &&
                        (input.getAttribute("accept") || input.dataset?.accept)) ||
                    "";
                if (acceptAttr) {
                    allowedTypes = acceptAttr
                        .split(",")
                        .map((type) => type.trim())
                        .filter(Boolean);
                } else {
                    allowedTypes = [];
                }
            }

            const config = {
                multiple: input.dataset.multiple === "true",
                serverUrl: input.dataset.serverUrl || CONFIG.defaultServerUrl,
                placeholder: input.dataset.placeholder || CONFIG.defaultPlaceholder,
                previewStyle: input.dataset.previewStyle || "rectangle",
                allowedTypes: allowedTypes,

                // ✅ unified maxFiles logic
                maxFiles:
                    input.dataset.maxFiles === "*" ||
                        input.dataset.maxFiles === "unlimited" ||
                        input.dataset.maxFiles === "∞"
                        ? Infinity
                        : parseInt(
                            input.dataset.maxFiles ||
                            (input.dataset.multiple === "true" ? 5 : 1),
                            10
                        ),

                folder:
                    input.dataset.folder || input.getAttribute("folder") || "default",
            };

            return config;
        }
        init() {
            this.createTrigger();
            if (this.trigger) {
                this.setupTriggerEvents();
            }
        }
        createTrigger() {
            // If this element itself is the clickable picker (your camera box)
            if (this.input.hasAttribute("data-file-picker")) {
                this.trigger = this.input;
                this.input.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    this.createModal();
                    window.currentFilePicker = this;
                    this.open();
                });
                return;
            }

            // Otherwise, find external trigger using data-trigger-id
            const triggerId = this.input.dataset.triggerId;
            if (triggerId) {
                const triggerEl =
                    document.getElementById(triggerId) ||
                    document.querySelector(`[data-trigger-id="${triggerId}"]`);
                if (triggerEl) {
                    this.trigger = triggerEl;
                    // Store picker by trigger ID to prevent conflicts
                    window.filePickers[triggerId] = this;
                    this.trigger.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        this.createModal();
                        window.currentFilePicker = this;
                        this.open();
                    });
                    return;
                }
            }

            // No trigger found — just skip UI creation (no DOM changes)
            this.trigger = null;
        }

        setupTriggerEvents() {
            // Set up click event on the trigger button
            if (this.trigger) {
                // Remove any existing event listeners to prevent duplicates
                if (this.triggerClickHandler) {
                    this.trigger.removeEventListener("click", this.triggerClickHandler);
                }

                // Create the handler function
                this.triggerClickHandler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // Initialize the picker only when clicked
                    if (!this.initialized) {
                        this.initialized = true;
                        this.createModal();
                    }

                    // Open the picker
                    this.open();
                };

                // Add the event listener
                this.trigger.addEventListener("click", this.triggerClickHandler);
            }
        }
        open() {
            this.createModal();
            this.showModal();
            this.setupModalEvents();

            // Set current picker for onclick handlers
            window.currentFilePicker = this;

            // Initialize data (storage info etc) before first load
            this.initData();

            // Load files directly via API
            this.loadFiles();
        }
        showModal() {
            if (this.modal) {
                this.modal.classList.add("active");
                document.body.style.overflow = "hidden";
            }
        }
        setupModalEvents() {
            // Add close button event listener
            const closeBtn = this.modal.querySelector("#file-picker-close-btn");
            if (closeBtn) {
                closeBtn.addEventListener("click", () => this.close());
            }

            // Add footer button listeners
            const cancelBtn = this.modal.querySelector("#file-picker-cancel");
            const confirmBtn = this.modal.querySelector("#file-picker-confirm");

            if (cancelBtn) {
                cancelBtn.addEventListener("click", () => this.close());
            }

            if (confirmBtn) {
                confirmBtn.addEventListener("click", () => this.confirmSelection());
            }

            // Add upload button listener
            const uploadBtn = this.modal.querySelector("#uploadBtn");
            const fileInput = this.modal.querySelector("#fileInput");
            if (uploadBtn && fileInput) {
                uploadBtn.addEventListener("click", () => fileInput.click());
                fileInput.addEventListener("change", (e) =>
                    this.handleFileSelection(e.target.files)
                );
            }

            // Add create folder button listener
            const createFolderBtn = this.modal.querySelector("#createFolderBtn");
            if (createFolderBtn) {
                createFolderBtn.addEventListener("click", () => this.createFolder());
            }

            // Add click outside to close
            this.modal.addEventListener("click", (e) => {
                if (e.target === this.modal) {
                    this.close();
                }
            });
        }
        createModal() {
            if (this.modal) return;
            createModal();

            this.modal = document.getElementById(CONFIG.modalId);

            // Update title
            const title = this.modal.querySelector(".file-picker-title");
            if (title) {
                title.textContent = this.config.multiple
                    ? "Choose Files"
                    : "Choose File";
            }

            // // Show/hide create folder button based on access
            // const createFolderBtn = this.modal.querySelector("#createFolderBtn");
            // if (createFolderBtn) {
            //   if (this.config.access === "full") {
            //     createFolderBtn.style.display = "inline-flex";
            //   } else {
            //     createFolderBtn.style.display = "none";
            //   }
            // }
        }
        close() {
            const modal = document.getElementById(CONFIG.modalId);
            if (modal) {
                modal.classList.remove("active");
                document.body.style.overflow = "auto";
            }
        }

        static initAll() {
            const inputs = document.querySelectorAll('[data-file-picker="true"]');
            inputs.forEach((input) => {
                if (!input._filePicker) {
                    input._filePicker = new FilePicker(input);
                    input._filePicker.init();
                }
            });
        }

        /**
         * Loads files and folders from the backend API.
         * Updates pagination, file grid, and folder navigation.
         * @param {number} [page=1] - The page number to load.
         * @returns {Promise<void>}
         */
        async loadFiles(page = 1) {
            try {
                this.showLoading(
                    true,
                    `Loading files${this.currentFolderId ? ` in folder` : ""}...`
                );

                const data = await fetchData("files", {
                    cache: "no-store",
                    params: {
                        page: page,
                        limit: this.itemsPerPage,
                        folder_id: this.currentFolderId
                    }
                });

                if (data.status) {
                    this.currentPage = page;
                    this.processApiData(data);
                    this.renderFiles();
                    this.updateFolderNavigation();
                } else {
                    console.error(
                        "Failed to load files:",
                        data.message || "Unknown error"
                    );
                    this.showEmptyState("Failed to load files. Please try again.");
                }
            } catch (error) {
                console.error("Error loading files:", error);
                this.showEmptyState(
                    "Failed to load files. Please check your connection."
                );
            } finally {
                this.showLoading(false);
            }
        }
        /**
         * Processes API response data, updates pagination info,
         * and normalizes mixed file/folder items into a unified format.
         * @param {Object} data - API response object containing items and pagination.
         */
        processApiData(data) {
            if (data.pagination) {
                const p = data.pagination;
                this.totalPages = p.totalPages || 1;
                this.totalItems = data.totalItems || 0;
                this.currentPage = p.currentPage || 1;
                this.visiblePages = p.visiblePages || [];
                this.hasMoreData = p.hasMoreData || p.hasNextPage || false;
                this.displayText =
                    p.displayText ||
                    `Showing ${p.showingFrom || 1} to ${p.showingTo || 0} of ${p.totalItems || 0
                    } entries`;

                this.updatePaginationControls();
            }

            let allItems = [];
            if (Array.isArray(data.items)) {
                allItems = data.items.map((item) => {
                    const normalized = this.normalizeItem(item, item.isFolder);
                    if (!normalized.fileName && item.name) {
                        normalized.fileName = item.name;
                    }
                    return normalized;
                });
            }

            allItems.sort((a, b) => {
                if (a.isFolder && !b.isFolder) return -1;
                if (!a.isFolder && b.isFolder) return 1;
                if (a.isFolder && b.isFolder) {
                    return a.fileName.localeCompare(b.fileName);
                }
                return new Date(b.created) - new Date(a.created);
            });
            this.items = allItems;
            if (!this.isSearchMode) {
                if (this.currentPage === 1) {
                    this.allLoadedItems = [];
                }
                this.allLoadedItems = [...this.allLoadedItems, ...allItems];
            }
        }
        // =============================================
        // 📄 Update Pagination Controls (smart display)
        // =============================================
        updatePaginationControls() {
            const paginationEl = document.getElementById("paginationControls");
            if (!paginationEl) return;

            // ✅ Hide pagination during search mode
            if (this.isSearchMode) {
                paginationEl.style.display = "none";
                return;
            }

            // ✅ Determine if pagination is needed
            const showPagination = this.totalItems > this.itemsPerPage;
            if (!showPagination) {
                paginationEl.style.display = "none";
                return;
            }

            // ✅ Render pagination normally
            paginationEl.style.display = "flex";
            const paginationHTML = this.generateDataTablePagination(
                this.currentPage,
                this.totalPages
            );
            paginationEl.innerHTML = paginationHTML;
        }
        /**
         * Generates the HTML for paginated navigation in the DataTable-style footer.
         * Dynamically builds previous/next buttons and page numbers based on backend pagination.
         * Works in both normal and search modes by switching click handlers accordingly.
         *
         * @param {number} currentPage - The currently active page number.
         * @param {number} totalPages - The total number of available pages.
         * @returns {string} - HTML markup for the pagination section.
         */
        generateDataTablePagination(currentPage, totalPages) {
            const clickHandler = this.isSearchMode
                ? "FilePicker.loadSearchPage"
                : "FilePicker.loadFiles";
            const maxVisible = 5; // Show up to 5 pages (you can change to 4 if you prefer)
            let pageNumbersHTML = "";

            // --- Previous Button ---
            pageNumbersHTML += `
    <button class="page-btn ${currentPage === 1 ? "disabled" : ""}"
            ${currentPage === 1 ? "disabled" : ""}
            onclick="${clickHandler}(${currentPage - 1})">
      <i class="fas fa-chevron-left"></i>
    </button>
  `;

            // --- Smart Range Calculation ---
            let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
            let endPage = startPage + maxVisible - 1;

            if (endPage > totalPages) {
                endPage = totalPages;
                startPage = Math.max(1, endPage - maxVisible + 1);
            }

            // --- First Page + Ellipsis ---
            if (startPage > 1) {
                pageNumbersHTML += `
      <button class="page-btn" onclick="${clickHandler}(1)">1</button>
    `;
                if (startPage > 2) {
                    pageNumbersHTML += `<span class="ellipsis">...</span>`;
                }
            }

            // --- Page Buttons ---
            for (let i = startPage; i <= endPage; i++) {
                pageNumbersHTML += `
      <button class="page-btn ${i === currentPage ? "active" : ""}"
              onclick="${clickHandler}(${i})">${i}</button>
    `;
            }

            // --- Last Page + Ellipsis ---
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    pageNumbersHTML += `<span class="ellipsis">...</span>`;
                }
                pageNumbersHTML += `
      <button class="page-btn" onclick="${clickHandler}(${totalPages})">${totalPages}</button>
    `;
            }

            // --- Next Button ---
            pageNumbersHTML += `
    <button class="page-btn ${currentPage === totalPages ? "disabled" : ""}" 
            ${currentPage === totalPages ? "disabled" : ""}
            onclick="${clickHandler}(${currentPage + 1})">
      <i class="fas fa-chevron-right"></i>
    </button>
  `;

            // --- Header + Info ---
            const title = this.isSearchMode
                ? `Search: "${this.searchQuery}"`
                : "Files & Folders";
            return `
    <div class="pagination-section">
      <div class="pagination-header">
        <h4>${title}</h4>
        <span class="pagination-info">
          ${this.displayText ||
                `Showing ${Math.min(
                    (currentPage - 1) * this.itemsPerPage + 1,
                    this.totalItems
                )} 
             to ${Math.min(currentPage * this.itemsPerPage, this.totalItems)} 
             of ${this.totalItems} entries`
                }
        </span>
      </div>
      <div class="pagination-numbers">
        ${pageNumbersHTML}
      </div>
    </div>
  `;
        }
        /**
         * Normalizes raw file/folder record from API into a standard item structure
         * for consistent UI rendering and operations.
         * Handles nested file objects (id.file), paths, and metadata cleanup.
         * @param {Object} item - File or folder record from API.
         * @param {boolean} [isFolderOverride] - Optional flag to force folder/file type.
         * @returns {Object} Normalized item object.
         */
        normalizeItem(item, isFolderOverride) {
            const isFolder =
                typeof isFolderOverride === "boolean"
                    ? isFolderOverride
                    : item.type === "folder" || !!item.isFolder;

            // Extract nested file info if exists
            const nestedFile =
                item.id && typeof item.id === "object" ? item.id : null;
            const fileId = nestedFile ? nestedFile.id : item.id;
            const fileUrl = nestedFile ? nestedFile.file : item.file || null;
            const mimeType =
                item.mime_type || item.type || (nestedFile ? nestedFile.type : "");

            // Build unique item ID
            const itemId = String(fileId || `tmp_${Date.now()}`);

            // Derive file/folder name
            let fileName = "";
            if (isFolder) {
                fileName = item.name || "";
            } else {
                fileName =
                    item.original_name ||
                    item.file_name ||
                    item.complete_path?.split("/").pop() ||
                    item.name ||
                    "";
            }
            if (fileName.includes("/")) fileName = fileName.split("/").pop();

            return {
                id: itemId,
                fileName,
                isFolder,
                mimeType,
                fileSize: item.file_size || item.size || 0,
                fullPath:
                    item.full_path ||
                    item.complete_path ||
                    item.filePath ||
                    item.file_name ||
                    item.name ||
                    "",
                created: item.createdAt || item.created_at || null,
                modified: item.updatedAt || item.updated_at || null,
                storageProvider: item.storage_provider || "local",
                parentId: item.parent_id || item.folder_id || null,
                canRename: true,
                renameMessage: "",
                file: fileUrl, // file URL for preview/download
            };
        }
        /**
         * Renders the grid of files and folders in the file manager.
         * If no items exist, shows an empty state message. Otherwise,
         * generates HTML for all items using renderFileItem().
         */
        renderFiles() {
            const fileGrid = document.getElementById("fileGrid");
            if (!fileGrid) return;

            // If no items exist, show empty state
            if (this.items.length === 0) {
                fileGrid.classList.add("full-grid");
                fileGrid.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-folder-open"></i>
        <h3>No files in this folder</h3>
        <p>Upload some files to get started</p>
      </div>
    `;
                // Don't return immediately — allow toolbar/UI updates to run
                this.lastRenderHash = null; // reset hash so next load always re-renders
                this.updateSelectionUI();
                return;
            }

            // Remove empty-state layout when files exist
            fileGrid.classList.remove("full-grid");

            // Create hash for re-render check
            const currentHash = this.createRenderHash();

            // If nothing changed, just update selection (prevents unnecessary re-render)
            if (currentHash === this.lastRenderHash && !this.pendingRender) {
                this.updateFileSelectionStates();
                return;
            }

            this.lastRenderHash = currentHash;
            this.pendingRender = false;

            // Render files/folders grid
            fileGrid.innerHTML = this.items
                .map(this.renderFileItem.bind(this))
                .join("");

            // Update toolbar/UI
            this.updateSelectionUI();
        }
        createRenderHash() {
            const itemsHash = this.items
                .map((i) => `${i.id}_${i.fileName}_${i.mimeType}`)
                .join("|");
            const selectionHash = [...this.selectedFiles].sort().join(",");
            return `${itemsHash}|${selectionHash}`;
        }
        updateFileSelectionStates() {
            const fileGrid = document.getElementById("fileGrid");
            if (!fileGrid) return;

            // update selection visuals
            document.querySelectorAll(".file-item").forEach((item) => {
                const fileId = item.dataset.fileId;
                const isSelected = this.selectedFiles.has(fileId);
                if (fileId) {
                    item.classList.toggle("selected", isSelected);
                }
            });

            // update toolbar buttons etc.
            this.updateSelectionUI();
        }
        updateSelectionUI() {
            const selectedCount = this.selectedFiles.size;
            const downloadBtn = document.getElementById("downloadSelectedBtn");
            const deleteBtn = document.getElementById("deleteSelectedBtn");

            if (downloadBtn) downloadBtn.disabled = selectedCount === 0;
            if (deleteBtn) deleteBtn.disabled = selectedCount === 0;
        }
        /**
         * Renders a single file or folder card for display in the grid view.
         * Handles click and double-click behaviors, selection logic, file actions,
         * and visual cues (active, disabled, or selectable states).
         *
         * @param {Object} file - The file or folder object to render.
         * @param {boolean} [isSearchResult=false] - Whether this item appears in search mode.
         * @returns {string} - HTML markup for a single file/folder item.
         */
        renderFileItem(file, isSearchResult = false) {
            const isFolder = file.isFolder;
            const isSelected = this.selectedFiles.has(file.id);

            const fileUrl = file.file || "";
            const clickHandler = isFolder
                ? `FilePicker.openFolder('${file.id}')`
                : `FilePicker.copyPath('${fileUrl}')`;

            // Dynamic data attributes based on item type
            const dataAttributes = `data-file-id="${file.id}" data-file-url="${fileUrl || ""
                }"`;

            // Apply selection & picker mode state classes
            let itemClasses = isSelected ? "selected" : "";

            return `
    <div class="file-item ${itemClasses}" ${dataAttributes}
         ondblclick="${clickHandler}"
         onclick="FilePicker.toggleFileSelection('${file.id}', event)">
      
      <div class="file-preview">
        ${this.renderFilePreview(file, fileUrl)}
      </div>
      
      ${this.shouldShowFileInfo(file)
                    ? `
      <div class="file-name">${file.highlightedName || file.fileName}</div>
      <div class="file-meta">
        <div class="file-size">${isFolder ? "Folder" : this.formatFileSize(file.fileSize)
                    }</div>
        <div class="file-date">${this.formatDate(
                        file.created || file.modified
                    )}</div>
      </div>
      `
                    : ""
                }
      
      <div class="file-actions">
        ${!isFolder
                    ? this.renderFileActions(file, fileUrl)
                    : this.renderFolderActions(file)
                }
      </div>
    </div>
  `;
        }
        /**
         * Renders a visual preview for a given file or folder.
         * - Folders show a folder icon.
         * - Images display a thumbnail preview with overlay info.
         * - Videos show a video icon.
         * - Other files show an icon based on document type.
         * @param {Object} file - File object containing metadata.
         * @returns {string} HTML string representing file preview.
         */
        renderFilePreview(file) {
            if (file.isFolder) {
                return '<i class="fas fa-folder folder-icon"></i>';
            }

            const fileName = file.fileName.toLowerCase();
            const mimeType = file.mimeType || "";

            if (mimeType.startsWith("image/") || this.isImageFile(fileName)) {
                return `
      <div class="preview-container image-bg-container" style="background-image: url('${file.file
                    }')">
        <div class="image-overlay">
          <div class="image-info">
            <div class="image-name">${file.fileName}</div>
            <div class="image-meta">
              <span class="image-size">${this.formatFileSize(
                        file.fileSize
                    )}</span>
              <span class="image-date">${this.formatDate(
                        file.created || file.modified
                    )}</span>
            </div>
          </div>
        </div>
      </div>
    `;
            } else if (mimeType.startsWith("video/") || this.isVideoFile(fileName)) {
                return `
      <div class="preview-container">
        <i class="fas fa-file-video file-icon video-icon"></i>
      </div>
    `;
            } else {
                const iconClass = this.getDocumentIcon(fileName);
                return `<i class="${iconClass} file-icon document-icon"></i>`;
            }
        }
        /**
         * Renders action buttons for a given file (Preview, Download, Rename, Delete).
         * Handles file-type detection (image, video, document) to determine the correct preview behavior.
         * Disables rename if the file cannot be renamed.
         * @param {Object} file - File metadata object.
         * @returns {string} HTML string for file actions.
         */
        renderFileActions(file) {
            const fileExtension = file.fileName.split(".").pop().toLowerCase();
            const isImage = [
                "jpg",
                "jpeg",
                "png",
                "gif",
                "bmp",
                "webp",
                "svg",
            ].includes(fileExtension);
            const isVideo = [
                "mp4",
                "avi",
                "mov",
                "wmv",
                "flv",
                "webm",
                "mkv",
            ].includes(fileExtension);
            const isDocument = [
                "pdf",
                "doc",
                "docx",
                "xls",
                "xlsx",
                "ppt",
                "pptx",
                "txt",
            ].includes(fileExtension);

            const canRename =
                file.canRename !== false && window.canAccess("update", "file-picker");
            const canDelete = window.canAccess("delete", "file-picker");
            const canDownload = window.canAccess("download", "file-picker");

            const renameDisabled = canRename ? "" : "disabled";
            const renameTitle = canRename
                ? "Rename"
                : file.renameMessage || "Cannot rename - file is in use";

            let previewType = "document",
                previewIcon = "fas fa-file";
            if (isImage) (previewType = "image"), (previewIcon = "fas fa-image");
            else if (isVideo) (previewType = "video"), (previewIcon = "fas fa-play");
            else if (isDocument)
                (previewType = "document"), (previewIcon = "fas fa-file-alt");

            return `
        <button class="action-btn-small" onclick="event.stopPropagation(); FilePicker.showPreviewModal('${previewType}', '${file.file
                }', '${file.fileName
                }')" title="Preview"><i class="${previewIcon}"></i></button>
        ${canDownload
                    ? `<button class="action-btn-small" onclick="event.stopPropagation(); FilePicker.downloadFile('${file.file}', '${file.fileName}')" title="Download"><i class="fas fa-download"></i></button>`
                    : ""
                }
        ${canRename
                    ? `<button class="action-btn-small ${renameDisabled}" onclick="event.stopPropagation(); FilePicker.renameItem('${file.id}', false)" title="${renameTitle}" ${renameDisabled}><i class="fas fa-edit"></i></button>`
                    : ""
                }
        ${canDelete
                    ? `<button class="action-btn-small" onclick="event.stopPropagation(); FilePicker.deleteItem('${file.id}', false)" title="Delete"><i class="fas fa-trash"></i></button>`
                    : ""
                }
      `;
        }

        /**
         * Renders action buttons for folders (Rename and Delete).
         * Handles rename permission logic similarly to files.
         * @param {Object} file - Folder metadata object.
         * @returns {string} HTML string for folder actions.
         */
        renderFolderActions(file) {
            const canRename =
                file.canRename !== false && window.canAccess("update", "file-picker");
            const canDelete = window.canAccess("delete", "file-picker");
            const renameDisabled = canRename ? "" : "disabled";
            const renameTitle = canRename
                ? "Rename"
                : file.renameMessage || "Cannot rename - folder is in use";

            return `
    ${canRename
                    ? `<button class="action-btn-small ${renameDisabled}" onclick="event.stopPropagation(); FilePicker.renameItem('${file.id}', true)" title="${renameTitle}" ${renameDisabled}><i class="fas fa-edit"></i></button>`
                    : ""
                }
    ${canDelete
                    ? `<button class="action-btn-small" onclick="event.stopPropagation(); FilePicker.deleteItem('${file.id}', true)" title="Delete"><i class="fas fa-trash"></i></button>`
                    : ""
                }
  `;
        }

        isImageFile(fileName) {
            const imageExtensions = [
                ".jpg",
                ".jpeg",
                ".png",
                ".gif",
                ".bmp",
                ".webp",
                ".svg",
                ".ico",
                ".tiff",
                ".tif",
            ];
            return imageExtensions.some((ext) => fileName.endsWith(ext));
        }

        isVideoFile(fileName) {
            const videoExtensions = [
                ".mp4",
                ".avi",
                ".mov",
                ".wmv",
                ".flv",
                ".webm",
                ".mkv",
                ".m4v",
                ".3gp",
                ".ogv",
            ];
            return videoExtensions.some((ext) => fileName.endsWith(ext));
        }
        shouldShowFileInfo(file) {
            // Don't show file name/meta for images since they're shown in the overlay
            if (file.isFolder) return true;

            const fileName = file.fileName.toLowerCase();
            const mimeType = file.mimeType || "";

            // Hide file info for images (they show in overlay)
            if (mimeType.startsWith("image/") || this.isImageFile(fileName)) {
                return false;
            }

            return true;
        }

        getDocumentIcon(fileName) {
            const extension = fileName.split(".").pop().toLowerCase();

            const iconMap = {
                // PDF
                pdf: "fas fa-file-pdf",

                // Microsoft Office
                doc: "fas fa-file-word",
                docx: "fas fa-file-word",
                xls: "fas fa-file-excel",
                xlsx: "fas fa-file-excel",
                ppt: "fas fa-file-powerpoint",
                pptx: "fas fa-file-powerpoint",

                // Text files
                txt: "fas fa-file-alt",
                rtf: "fas fa-file-alt",
                csv: "fas fa-file-csv",

                // Code files
                js: "fab fa-js-square",
                html: "fab fa-html5",
                css: "fab fa-css3-alt",
                php: "fab fa-php",
                py: "fab fa-python",
                java: "fab fa-java",
                cpp: "fas fa-file-code",
                c: "fas fa-file-code",
                cs: "fab fa-microsoft",
                json: "fas fa-file-code",
                xml: "fas fa-file-code",

                // Archive files
                zip: "fas fa-file-archive",
                rar: "fas fa-file-archive",
                "7z": "fas fa-file-archive",
                tar: "fas fa-file-archive",
                gz: "fas fa-file-archive",

                // Audio files
                mp3: "fas fa-file-audio",
                wav: "fas fa-file-audio",
                flac: "fas fa-file-audio",
                aac: "fas fa-file-audio",
                ogg: "fas fa-file-audio",

                // Other documents
                epub: "fas fa-file-alt",
                mobi: "fas fa-file-alt",
                odt: "fas fa-file-alt",
                ods: "fas fa-file-excel",
                odp: "fas fa-file-powerpoint",
            };

            return iconMap[extension] || "fas fa-file";
        }

        formatFileSize(bytes) {
            if (!bytes || bytes === 0) return "0 Bytes";
            const k = 1024;
            const sizes = ["Bytes", "KB", "MB", "GB"];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
        }

        formatDate(date) {
            if (!date) return "Unknown";

            // Handle different date formats
            let dateObj;
            if (typeof date === "string") {
                dateObj = new Date(date);
            } else if (date instanceof Date) {
                dateObj = date;
            } else {
                dateObj = new Date(date);
            }

            if (isNaN(dateObj.getTime())) {
                // Try to parse as ISO string or other formats
                const parsedDate = Date.parse(date);
                if (isNaN(parsedDate)) {
                    return "Invalid Date";
                }
                dateObj = new Date(parsedDate);
            }

            const now = new Date();

            // Reset time to start of day for accurate day comparison
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const fileDate = new Date(
                dateObj.getFullYear(),
                dateObj.getMonth(),
                dateObj.getDate()
            );

            const diffMs = today - fileDate;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return "Today";
            } else if (diffDays === 1) {
                return "Yesterday";
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else if (diffDays < 30) {
                const weeks = Math.floor(diffDays / 7);
                return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
            } else if (diffDays < 365) {
                const months = Math.floor(diffDays / 30);
                return `${months} month${months > 1 ? "s" : ""} ago`;
            } else {
                return dateObj.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                });
            }
        }
        updateFolderNavigation() {
            this.updateBreadcrumb();
            this.updateBackButton();
        }
        updateBreadcrumb() {
            const breadcrumbEl = document.getElementById("breadcrumb");
            if (!breadcrumbEl) return;

            // Build breadcrumb from folder history
            let breadcrumbHTML =
                '<span class="breadcrumb-item" onclick="FilePicker.goToRoot()">Root</span>';

            // Add all folders in the history path
            for (let i = 0; i < this.folderHistory.length; i++) {
                const folder = this.folderHistory[i];
                if (folder && folder.path && folder.id) {
                    const folderName = folder.path.split("/").pop();
                    breadcrumbHTML += `<span class="breadcrumb-separator">/</span>
                          <span class="breadcrumb-item" onclick="FilePicker.goToFolderById('${folder.id}', '${folder.path}')">${folderName}</span>`;
                }
            }

            // Add current folder if we're not at root
            if (this.currentFolderId && this.currentFolder) {
                const currentFolderName =
                    this.currentFolder.split("/").pop() || this.currentFolder;
                breadcrumbHTML += `<span class="breadcrumb-separator">/</span>
                        <span class="breadcrumb-item active">${currentFolderName}</span>`;
            }

            breadcrumbEl.innerHTML = breadcrumbHTML;
        }
        updateBackButton() {
            const backBtn = document.getElementById("backBtn");
            if (backBtn) {
                // Enable back button if we have history OR if we're not at root
                const canGoBack =
                    this.folderHistory.length > 0 ||
                    this.currentFolderId ||
                    this.currentFolder;
                backBtn.disabled = !canGoBack;
            }
        }
        openFolder(itemId) {
            const folder = this.items.find((f) => f.id === itemId);
            if (!folder) return;

            // Always record current folder before switching
            this.folderHistory.push({
                id: this.currentFolderId,
                path: this.currentFolder,
            });

            const folderId = folder.id;
            const folderPath = folder.fullPath || folder.fileName || folder.name;

            this.selectFolder(folderId, folderPath);
        }
        selectFolder(folderId, folderPath = null) {
            this.currentFolderId = folderId;
            this.currentFolder = folderPath;
            this.selectedFiles.clear();
            this.currentPage = 1;
            this.loadFiles(1);
            this.updateBreadcrumb();
        }
        goToRoot() {
            this.currentFolder = null;
            this.currentFolderId = null;
            this.folderHistory = [];
            this.selectedFiles.clear();
            this.currentPage = 1;
            this.loadFiles(1);
            this.updateBreadcrumb();
        }
        toggleFileSelection(fileId, event) {
            event?.stopPropagation?.();

            const item = this.items.find((f) => f.id === fileId);
            if (!item) return;

            const currentIndex = this.items.findIndex((f) => f.id === fileId);

            // --- SHIFT + Click (Range Selection)
            if (event?.shiftKey && this.lastSelectedIndex !== -1) {
                const start = Math.min(this.lastSelectedIndex, currentIndex);
                const end = Math.max(this.lastSelectedIndex, currentIndex);
                this.selectedFiles.clear();
                for (let i = start; i <= end; i++) {
                    this.selectedFiles.add(this.items[i].id);
                }
            }

            // --- CTRL / CMD + Click (Toggle Single)
            else if (event?.ctrlKey || event?.metaKey) {
                if (this.selectedFiles.has(fileId)) {
                    this.selectedFiles.delete(fileId);
                } else {
                    this.selectedFiles.add(fileId);
                }
                this.lastSelectedIndex = currentIndex;
            }

            // --- Normal Click (Single Select)
            else {
                this.selectedFiles.clear();
                this.selectedFiles.add(fileId);
                this.lastSelectedIndex = currentIndex;
            }
            // === Enforce file type & count limits ===
            const confirmBtn = document.getElementById("file-picker-confirm");
            const selectedItems = [...this.selectedFiles].map((id) =>
                this.items.find((f) => f.id === id)
            );
            let validSelection = [];

            // Filter out folders (only allow files)
            validSelection = selectedItems.filter((f) => f && !f.isFolder);

            // Filter by accept type (if not '*')
            // Robust accept handling: read attribute (works for input or div triggers)
            const acceptAttr =
                (this.input.getAttribute &&
                    (this.input.getAttribute("accept") || this.input.dataset?.accept)) ||
                (this.trigger &&
                    this.trigger.getAttribute &&
                    (this.trigger.getAttribute("accept") ||
                        this.trigger.dataset?.accept)) ||
                "";
            if (acceptAttr && acceptAttr.trim() !== "*") {
                const accepted = acceptAttr
                    .split(",")
                    .map((a) => a.trim().toLowerCase())
                    .filter(Boolean);
                validSelection = validSelection.filter((f) => {
                    const type = (f.mimeType || "").toLowerCase();
                    const name = (f.fileName || f.file || "").toLowerCase();

                    if (!type && !name) return false;

                    return accepted.some((acc) => {
                        // wildcard like image/*
                        if (acc.endsWith("/*")) {
                            const base = acc.replace("/*", "");
                            return type.startsWith(base + "/");
                        }
                        // extension like .jpg
                        if (acc.startsWith(".")) {
                            return name.endsWith(acc);
                        }
                        // exact mime type like image/jpeg
                        if (acc.includes("/")) {
                            return type === acc;
                        }
                        // fallback: if someone passed 'image' treat as image/*
                        return type.startsWith(acc + "/") || name.endsWith("." + acc);
                    });
                });
            }

            // Enforce maxFiles limit
            if (validSelection.length > this.config.maxFiles) {
                toastr.warning(
                    `You can select up to ${this.config.maxFiles} file${this.config.maxFiles > 1 ? "s" : ""
                    }.`
                );
                validSelection = validSelection.slice(0, this.config.maxFiles);
            }

            // Replace selectedFiles set with valid ones
            this.selectedFiles = new Set(validSelection.map((f) => f.id));

            // Update confirm button & selected count
            const selectedCount = this.selectedFiles.size;
            const countEl = document.getElementById("selectedCount");
            if (countEl)
                countEl.textContent = `${selectedCount} file${selectedCount !== 1 ? "s" : ""
                    } selected`;
            confirmBtn.disabled = selectedCount === 0;

            this.updateFileSelectionStates();
        }

        async renameItem(itemId, isFolder) {
            const item = this.items.find((f) => f.id === itemId);
            if (!item) return;

            const oldName = item.fileName;
            const oldPath = item.filePath || item.fullPath || oldName;

            this.promptDialog({
                title: `Rename ${isFolder ? "folder" : "file"}`,
                value: oldName,
                confirmText: "Rename",
            }).then((newName) => {
                if (!newName || newName.trim() === oldName) return;
                const trimmed = newName.trim();
                const parent = oldPath.includes("/")
                    ? oldPath.substring(0, oldPath.lastIndexOf("/"))
                    : "";
                const newPath = parent ? `${parent}/${trimmed}` : trimmed;

                const endpoint = isFolder ? "folders/rename" : "files/rename";

                // Use fileId/folderId for more reliable renaming
                const requestBody = isFolder
                    ? { folderId: itemId, newPath: trimmed }
                    : { fileId: itemId, newPath: trimmed };

                fetchData(endpoint, {
                    method: "PUT",
                    body: requestBody,
                })
                    .then((res) => {
                        if (res && res.status) {
                            toastr.success("Renamed successfully");
                            this.loadFiles();
                        } else {
                            toastr.error(res?.message || "Failed to rename");
                        }
                    })
                    .catch((e) => {
                        console.error("Rename error:", e);
                        toastr.error("Failed to rename");
                    });
            });
        }
        confirmDialog({
            title,
            text,
            confirmText = "OK",
            confirmColor = "#3b82f6",
            icon = "question",
        }) {
            return new Promise((resolve) => {
                if (window.Swal && Swal.fire) {
                    Swal.fire({
                        title: title || "",
                        text: text || "",
                        icon,
                        showCancelButton: true,
                        confirmButtonText: confirmText,
                        confirmButtonColor: confirmColor,
                        cancelButtonText: "Cancel",
                    }).then((r) => resolve(!!r.isConfirmed));
                } else {
                    const ok = confirm(text || title || "Are you sure?");
                    resolve(ok);
                }
            });
        }

        promptDialog({ title, value = "", confirmText = "OK" }) {
            return new Promise((resolve) => {
                if (window.Swal && Swal.fire) {
                    Swal.fire({
                        title: title || "",
                        input: "text",
                        inputValue: value,
                        showCancelButton: true,
                        confirmButtonText: confirmText,
                        inputValidator: (v) => {
                            if (!v || !v.trim()) return "Please enter a valid name";
                            if (!/^[^\\/:*?"<>|]+$/.test(v.trim()))
                                return "Name contains invalid characters";
                            return undefined;
                        },
                    }).then((r) => {
                        if (r.isConfirmed) resolve(r.value);
                        else resolve(null);
                    });
                } else {
                    const v = prompt(title || "Enter value", value);
                    resolve(v);
                }
            });
        }
        goToFolderById(folderId, folderPath) {
            if (!folderId) {
                this.goToRoot();
                return;
            }

            // Update folder history to only include folders up to this point
            const targetIndex = this.folderHistory.findIndex(
                (f) => f.id === folderId
            );
            if (targetIndex >= 0) {
                // Truncate history to this point
                this.folderHistory = this.folderHistory.slice(0, targetIndex);
            }

            // Navigate to the folder
            this.currentFolderId = folderId;
            this.currentFolder = folderPath;
            this.selectedFiles.clear();
            this.currentPage = 1;
            this.loadFiles(1);
            this.updateBreadcrumb(); // Ensure breadcrumb is updated
        }
        async deleteItem(itemId, isFolder) {
            const item = this.items.find((f) => f.id === itemId);
            if (!item) return;

            const name = item.fileName || item.name || "";
            const id = item.id || "";
            const type = isFolder ? "folder" : "file";

            // Show confirmation dialog with input
            const result = await Swal.fire({
                title: "Are you sure?",
                html: `
      <p>You are about to delete the <strong>${type}</strong> "<strong>${name}</strong>".</p>
      <p><strong>This action cannot be undone.</strong></p>
      <p>If this ${type} is used elsewhere in the system, it may cause errors or broken links.</p>
      <p>Please make sure it is not in use before deleting.</p>
      <hr>
      <p>To confirm, type the exact name of the ${type} below:</p>
      <input id="swal-confirm-input" class="swal2-input" placeholder="${name}">
    `,
                icon: "warning",
                showCancelButton: true,
                focusConfirm: false,
                confirmButtonText: `Delete ${type}`,
                confirmButtonColor: "#ef4444",
                cancelButtonText: "Cancel",
                // Validate input before allowing confirm
                preConfirm: () => {
                    const input =
                        document.getElementById("swal-confirm-input")?.value || "";
                    if (input.trim() === "") {
                        Swal.showValidationMessage(
                            "Please type the name to confirm deletion"
                        );
                        return false;
                    }
                    if (input.trim() !== name) {
                        Swal.showValidationMessage(
                            `Name does not match. Please type exactly: "${name}"`
                        );
                        return false;
                    }
                    return true;
                },
            });

            // If user cancelled or didn't confirm, do nothing
            if (!result.isConfirmed) return;

            // Proceed with delete (only after exact match)
            try {
                const url = api(`${isFolder ? "folders" : "files"}/${id}`);
                const res = await fetchData(url, { method: "DELETE" });

                if (res && res.status) {
                    toastr.success(
                        `${type.charAt(0).toUpperCase() + type.slice(1)
                        } deleted successfully`
                    );
                    this.loadFiles();
                } else {
                    toastr.error(res?.message || `Failed to delete ${type}`);
                }
            } catch (e) {
                console.error(`Delete ${type} error:`, e);
                toastr.error(`Failed to delete ${type}`);
            }
        }
        showPreviewModal(type, url, fileName) {
            const modal = document.getElementById("filePreviewModal");
            const previewFileName = document.getElementById("previewFileName");
            const previewContainer = document.getElementById("previewContainer");

            previewFileName.textContent = fileName;
            this.currentPreviewFile = { url, fileName, type };
            previewContainer.innerHTML = "";

            if (type === "image") {
                const img = document.createElement("img");
                img.src = url;
                img.alt = fileName;
                img.className = "preview-image";
                img.onerror = () => {
                    previewContainer.innerHTML = `<div class="preview-error"><i class="fas fa-exclamation-triangle"></i><h3>Failed to load image</h3><p>Unable to preview this file</p></div>`;
                };
                previewContainer.appendChild(img);
            } else if (type === "video") {
                const video = document.createElement("video");
                video.controls = true;
                video.className = "preview-video";
                video.preload = "metadata";
                video.innerHTML = `<source src="${url}" type="video/mp4">Your browser does not support the video tag.`;
                previewContainer.appendChild(video);
            } else if (type === "document") {
                const iframe = document.createElement("iframe");
                iframe.src = url;
                iframe.className = "preview-document";
                previewContainer.appendChild(iframe);
            } else {
                previewContainer.innerHTML = `<div class="preview-error"><i class="fas fa-file"></i><h3>Preview not available</h3><p>This file type cannot be previewed</p></div>`;
            }

            modal.classList.add("active");
            document.body.style.overflow = "hidden";

            // Bind keyboard event once
            this.handleModalKeydown =
                this.handleModalKeydown?.bind(this) ||
                ((e) => {
                    if (e.key === "Escape") this.closePreviewModal();
                });
            document.addEventListener("keydown", this.handleModalKeydown);
        }

        closePreviewModal() {
            const modal = document.getElementById("filePreviewModal");
            if (modal) {
                modal.classList.remove("active");
                document.body.style.overflow = "auto";

                // Stop any playing videos
                const videos = modal.querySelectorAll("video");
                videos.forEach((video) => {
                    video.pause();
                    video.currentTime = 0;
                });

                // Remove keyboard event listener
                document.removeEventListener("keydown", this.handleModalKeydown);
            }
        }
        downloadFile(fileUrl, fileName) {
            try {
                if (!fileUrl) return;
                const a = document.createElement("a");
                a.href = fileUrl;
                a.download = fileName || "";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } catch (e) {
                console.error("Download failed:", e);
                toastr.error("Failed to start download");
            }
        }
        showCreateFolderDialog() {
            const modal = document.getElementById("createFolderModal");
            const currentFolderPath = document.getElementById("currentFolderPath");
            const folderNameInput = document.getElementById("folderNameInput");

            const baseFolder = this.config?.folder || ""; // e.g. "admin-profile"
            const selectedFolder = this.currentFolder || ""; // e.g. "developers"
            const userRole = window.authUser?.role?.title?.toLowerCase?.() || "admin";

            // 🧠 Access control for non-admin users
            if (userRole !== "admin") {
                if (baseFolder && !selectedFolder.startsWith(baseFolder)) {
                    toastr.info(
                        `You can only create folders inside your assigned folder. <b>${baseFolder}</b>`
                    );
                    return; // ❌ Stop execution
                }
            }

            // 🟢 Proceed to open modal
            if (this.currentFolder) {
                currentFolderPath.textContent = this.currentFolder;
            } else {
                currentFolderPath.textContent = "Root";
            }

            folderNameInput.value = "";
            modal.classList.add("active");
            setTimeout(() => folderNameInput.focus(), 100);

            folderNameInput.onkeydown = (event) => {
                if (event.key === "Enter") {
                    this.createNewFolder();
                } else if (event.key === "Escape") {
                    this.hideCreateFolderDialog();
                }
            };
        }

        hideCreateFolderDialog() {
            const modal = document.getElementById("createFolderModal");
            modal.classList.remove("active");
        }

        async createNewFolder() {
            const folderNameInput = document.getElementById("folderNameInput");
            const folderName = folderNameInput.value.trim();

            if (!folderName) {
                toastr.error("Please enter a folder name");
                return;
            }

            // Validate folder name (no special characters except - and _)
            if (!/^[a-zA-Z0-9\s\-_]+$/.test(folderName)) {
                toastr.error(
                    "Folder name can only contain letters, numbers, spaces, hyphens, and underscores"
                );
                return;
            }

            try {
                this.showLoading(true);

                // Merge current folder with new folder name to create full path
                const fullFolderPath = this.currentFolder
                    ? `${this.currentFolder}/${folderName}`
                    : folderName;

                const response = await fetchData("folders", {
                    method: "POST",
                    body: {
                        folderName: fullFolderPath,
                    },
                });

                if (response && response.status === true) {
                    toastr.success("Folder created successfully!");
                    this.hideCreateFolderDialog();

                    // Refresh the current folder to show the new folder
                    this.loadFiles(1);
                } else {
                    toastr.error(response?.message || "Failed to create folder");
                }
            } catch (error) {
                console.error("Error creating folder:", error);
                toastr.error("Failed to create folder: " + error.message);
            } finally {
                this.showLoading(false);
            }
        }

        openUploadModal() {
            const baseFolder = this.config?.folder || ""; // e.g. "admin-profile"
            const selectedFolder = this.currentFolder || ""; // e.g. "developers"
            const userRole = window.authUser?.role?.title?.toLowerCase?.() || "admin";

            // 🧠 Access control for non-admin users
            if (userRole !== "admin") {
                if (baseFolder && !selectedFolder.startsWith(baseFolder)) {
                    toastr.info(
                        `You can only upload files inside your assigned folder. <b>${baseFolder}</b>`
                    );
                    return; // ❌ Stop execution — do not open modal
                }
            }

            // 🟢 If allowed, open upload modal
            this.showUploadModal();
        }

        hideUploadModal() {
            const modal = document.getElementById("uploadFilesModal");
            modal.classList.remove("active");
        }

        setupDragAndDrop() {
            const uploadArea = document.getElementById("uploadArea");

            uploadArea.addEventListener("dragover", (e) => {
                e.preventDefault();
                uploadArea.classList.add("dragover");
            });

            uploadArea.addEventListener("dragleave", (e) => {
                e.preventDefault();
                uploadArea.classList.remove("dragover");
            });

            uploadArea.addEventListener("drop", (e) => {
                e.preventDefault();
                uploadArea.classList.remove("dragover");
                this.handleFileSelection(e.dataTransfer.files);
            });
        }
        showUploadModal() {
            const modal = document.getElementById("uploadFilesModal");
            const uploadFolderPath = document.getElementById("uploadFolderPath");
            const fileInput = document.getElementById("fileInput");
            const uploadArea = document.getElementById("uploadArea");
            const fileList = document.getElementById("fileList");
            const uploadBtn = document.getElementById("uploadBtn");

            // Update the upload folder path display
            if (this.currentFolder) {
                uploadFolderPath.textContent = this.currentFolder;
            } else {
                uploadFolderPath.textContent = "Root";
            }

            // Reset modal state
            fileList.style.display = "none";
            uploadBtn.disabled = true;
            this.selectedFilesToUpload = [];

            // Show modal
            modal.classList.add("active");

            // Setup drag and drop
            this.setupDragAndDrop();

            // Setup file input click
            uploadArea.onclick = () => fileInput.click();

            // Setup file input change
            fileInput.onchange = (event) =>
                this.handleFileSelection(event.target.files);
        }
        handleFileSelection(files) {
            this.selectedFilesToUpload = Array.from(files);
            this.updateFileList();
            this.updateUploadButton();
        }
        updateFileList() {
            const fileList = document.getElementById("fileList");
            const fileItems = document.getElementById("fileItems");

            if (this.selectedFilesToUpload.length === 0) {
                fileList.style.display = "none";
                return;
            }

            fileList.style.display = "block";

            fileItems.innerHTML = this.selectedFilesToUpload
                .map(
                    (file, index) => `
      <div class="file-item" data-upload-index="${index}">
        <div class="file-item-icon">
          <i class="${this.getFileIconClass(file)}"></i>
        </div>
        <div class="file-item-info">
          <div class="file-item-name">${file.name}</div>
          <div class="file-item-size">${this.formatFileSize(file.size)}</div>
        </div>
        <button class="file-item-remove" onclick="FilePicker.removeFileFromList(${index})" title="Remove">
          <i class="fas fa-times"></i>
        </button>
        <div class="file-item-progress">
          <div class="file-item-progress-bar">
            <div class="file-item-progress-fill" id="uploadProgressFill_${index}"></div>
          </div>
          <div class="file-item-progress-text" id="uploadProgressText_${index}">0%</div>
        </div>
      </div>
    `
                )
                .join("");
        }

        removeFileFromList(index) {
            this.selectedFilesToUpload.splice(index, 1);
            this.updateFileList();
            this.updateUploadButton();
        }

        clearFileList() {
            this.selectedFilesToUpload = [];
            this.updateFileList();
            this.updateUploadButton();
        }

        updateUploadButton() {
            const uploadBtn = document.getElementById("uploadBtn");
            uploadBtn.disabled = this.selectedFilesToUpload.length === 0;
        }

        getFileIconClass(file) {
            const extension = file.name.split(".").pop().toLowerCase();
            const iconMap = {
                pdf: "fas fa-file-pdf",
                doc: "fas fa-file-word",
                docx: "fas fa-file-word",
                xls: "fas fa-file-excel",
                xlsx: "fas fa-file-excel",
                ppt: "fas fa-file-powerpoint",
                pptx: "fas fa-file-powerpoint",
                txt: "fas fa-file-alt",
                jpg: "fas fa-file-image",
                jpeg: "fas fa-file-image",
                png: "fas fa-file-image",
                gif: "fas fa-file-image",
                mp4: "fas fa-file-video",
                avi: "fas fa-file-video",
                mov: "fas fa-file-video",
                zip: "fas fa-file-archive",
                rar: "fas fa-file-archive",
            };
            return iconMap[extension] || "fas fa-file";
        }

        async uploadFiles() {
            if (this.selectedFilesToUpload.length === 0) return;

            const uploadProgress = document.getElementById("uploadProgress");
            const progressFill = document.getElementById("progressFill");
            const progressPercentage = document.getElementById("progressPercentage");
            const progressDetails = document.getElementById("progressDetails");
            const uploadBtn = document.getElementById("uploadBtn");

            // Show progress
            uploadProgress.style.display = "block";
            uploadBtn.disabled = true;

            // Aggregate progress across all files
            const totalBytes = this.selectedFilesToUpload.reduce(
                (sum, f) => sum + (f.size || 0),
                0
            );
            let uploadedBytes = 0;

            const updateProgressUi = () => {
                const pct =
                    totalBytes > 0
                        ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))
                        : 0;
                progressFill.style.width = pct + "%";
                progressPercentage.textContent = pct + "%";
                progressDetails.textContent = `${this.formatFileSize(
                    uploadedBytes
                )} / ${this.formatFileSize(totalBytes)}`;
            };

            updateProgressUi();

            try {
                // Upload files sequentially to simplify progress aggregation
                for (const file of this.selectedFilesToUpload) {
                    if (!file || typeof file.size !== "number") continue;

                    const currentIndex = this.selectedFilesToUpload.indexOf(file);
                    const perItemFill = document.getElementById(
                        `uploadProgressFill_${currentIndex}`
                    );
                    const perItemText = document.getElementById(
                        `uploadProgressText_${currentIndex}`
                    );
                    let uploadedForThisFile = 0;
                    const onChunkProgress = (delta) => {
                        uploadedBytes += delta;
                        uploadedForThisFile += delta;
                        // Update overall
                        updateProgressUi();
                        // Update per-item
                        if (file.size && perItemFill && perItemText) {
                            const pctItem = Math.min(
                                100,
                                Math.round((uploadedForThisFile / file.size) * 100)
                            );
                            perItemFill.style.width = pctItem + "%";
                            perItemText.textContent = pctItem + "%";
                        }
                    };

                    // Use chunked upload for large files; threshold 5MB
                    const CHUNK_THRESHOLD = 5 * 1024 * 1024;
                    if (file.size > CHUNK_THRESHOLD) {
                        await this.uploadFileInChunks(file, onChunkProgress);
                    } else {
                        await this.uploadSingleFile(file, onChunkProgress);
                    }
                }

                toastr.success("Files uploaded successfully!");
                this.hideUploadModal();
                // Brief delay to ensure database indexing/cache propagation
                setTimeout(() => this.loadFiles(1), 500);
            } catch (error) {
                console.error("Error uploading files:", error);
                toastr.error("Failed to upload files: " + error.message);
            } finally {
                uploadProgress.style.display = "none";
                uploadBtn.disabled = false;
            }
        }
        async uploadSingleFile(file, onProgress) {
            // XHR to get upload progress
            const url = api("files");
            const formData = new FormData();

            // Use folder_id for database-driven approach
            if (this.currentFolderId) {
                formData.append("folder_id", this.currentFolderId);
            }

            // Also include folder_path for backward compatibility
            if (this.currentFolder) {
                formData.append("folder_path", this.currentFolder);
            }

            // Backend expects single field name 'file'
            formData.append("file", file);

            const response = await this.xhrPost(url, formData, (loadedDelta) =>
                onProgress(loadedDelta)
            );
            const parsed = this.tryParseJson(response);
            if (!parsed || parsed.status !== true) {
                throw new Error((parsed && parsed.message) || "Upload failed");
            }
        }

        async uploadFileInChunks(file, onProgress) {
            // Align with compatibility endpoints and field names expected by client
            const CHUNK_SIZE = Math.floor(1.5 * 1024 * 1024); // ~1.5MB chunks
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
            const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
            const folderName = this.currentFolder || "";
            const folderId = this.currentFolderId || "";

            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = file.slice(start, end);

                const formData = new FormData();
                formData.append("chunk", chunk);
                formData.append("folderName", folderName);
                if (folderId) {
                    formData.append("folder_id", folderId);
                }
                formData.append("fileName", file.name);
                formData.append("chunkIndex", String(chunkIndex));
                formData.append("totalChunks", String(totalChunks));
                formData.append("fileId", fileId);

                // POST /admin-api/files/upload-chunk
                const url = api("files/upload-chunk");
                const responseText = await this.xhrPost(url, formData, (loadedDelta) =>
                    onProgress(loadedDelta)
                );
                const parsed = this.tryParseJson(responseText);
                if (!parsed || parsed.success !== true) {
                    throw new Error((parsed && parsed.message) || "Chunk upload failed");
                }
            }

            // Finalize: POST /admin-api/files/merge-chunks
            const completeJson = await fetchData("files/merge-chunks", {
                method: "POST",
                body: {
                    folderName,
                    folder_id: folderId,
                    fileName: file.name,
                    fileId,
                    fileType: file.type,
                    fileSize: file.size,
                }
            });

            if (!completeJson || completeJson.success !== true) {
                throw new Error(
                    (completeJson && completeJson.message) || "Failed to merge chunks"
                );
            }
        }

        xhrPost(url, formData, onProgress) {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.withCredentials = true;
                xhr.open("POST", url, true);
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        onProgress(e.loaded - (xhr._lastLoaded || 0));
                        xhr._lastLoaded = e.loaded;
                    }
                };
                xhr.onreadystatechange = () => {
                    if (xhr.readyState === 4) {
                        if (xhr.status >= 200 && xhr.status < 300) {
                            resolve(xhr.responseText || "");
                        } else {
                            reject(new Error(`HTTP ${xhr.status}`));
                        }
                    }
                };
                xhr.onerror = () => reject(new Error("Network error"));
                xhr.send(formData);
            });
        }

        tryParseJson(text) {
            try {
                return JSON.parse(text);
            } catch (_) {
                return null;
            }
        }

        async safeJson(response) {
            const contentType = response.headers.get("content-type") || "";
            const text = await response.text();
            if (contentType.includes("application/json")) {
                return this.tryParseJson(text);
            }
            // Return a synthetic object indicating error to avoid unexpected token issues
            return {
                status: false,
                message:
                    text && text.substring ? text.substring(0, 200) : "Non-JSON response",
            };
        }
        // Called only when search button is clicked
        async triggerSearch() {
            const input = document.getElementById("searchInput");
            this.searchQuery = input.value.trim();

            if (!this.searchQuery) {
                toastr.warning("Please enter a search term.");
                return;
            }

            await this.performServerSideSearch();
        }

        // Actual API call for search
        // ===========================================
        // 🔍 Perform Server-Side Search (no pagination)
        // ===========================================
        async performServerSideSearch() {
            try {
                this.showSearchLoading(true);
                this.showLoading(true);

                // ⚡ this.isSearchMode is already set true in triggerSearch()

                // ✅ Fetch data
                const res = await fetchData("files/search", {
                    cache: "no-store",
                    params: {
                        query: this.searchQuery,
                        fileType: this.searchFilters.fileType,
                        folderScope: this.searchFilters.folderScope.toString(),
                        exactMatch: this.searchFilters.exactMatch.toString(),
                        currentFolder: this.currentFolder || "",
                        limit: "100"
                    }
                });

                if (!res || !res.status)
                    throw new Error(res?.message || "Search failed");

                // ✅ Process and render results
                this.processSearchResults(res);
                this.renderSearchResults();
                this.updateSearchNavigation();

                // ✅ Hide pagination while searching
                const paginationEl = document.getElementById("paginationControls");
                if (paginationEl) paginationEl.style.display = "none";
            } catch (err) {
                console.error(err);
                toastr.error("Failed to search: " + err.message);
            } finally {
                this.showSearchLoading(false);
                this.showLoading(false);
            }
        }

        // Handle filter dropdown/toggles — only update, no fetch yet
        handleFilterChange() {
            const fileType = document.getElementById("fileTypeFilter");
            if (fileType) this.searchFilters.fileType = fileType.value;
        }

        toggleFolderScope() {
            this.searchFilters.folderScope = !this.searchFilters.folderScope;
            const checkbox = document.getElementById("folderScopeCheckbox");
            checkbox.checked = this.searchFilters.folderScope;
        }

        toggleExactMatch() {
            this.searchFilters.exactMatch = !this.searchFilters.exactMatch;
            const checkbox = document.getElementById("exactMatchCheckbox");
            checkbox.checked = this.searchFilters.exactMatch;
        }

        toggleAdvancedFilters() {
            this.showAdvancedFilters = !this.showAdvancedFilters;
            const filters = document.getElementById("searchFilters");
            const icon = document.getElementById("filterIcon");
            if (filters && icon) {
                filters.style.display = this.showAdvancedFilters ? "flex" : "none";
                icon.style.color = this.showAdvancedFilters ? "#007bff" : "";
            }
        }
        handleSearchKeydown(event) {
            if (event.key === "Enter") {
                event.preventDefault();
                this.triggerSearch();
            } else if (event.key === "Escape") {
                this.clearSearch();
            }
        }
        showSearchLoading(show) {
            const searchIcon = document.getElementById("searchIcon");
            const searchSpinner = document.getElementById("searchSpinner");
            const searchBtn = document.getElementById("searchBtn");

            if (searchIcon && searchSpinner && searchBtn) {
                if (show) {
                    searchIcon.style.display = "none";
                    searchSpinner.style.display = "block";
                    searchBtn.disabled = true;
                } else {
                    searchIcon.style.display = "block";
                    searchSpinner.style.display = "none";
                    searchBtn.disabled = false;
                }
            }
        }
        processSearchResults(data) {
            // Update pagination
            if (data.pagination) {
                this.totalPages = data.pagination.totalPages;
                this.totalItems = data.pagination.totalItems;
                this.currentPage = data.pagination.currentPage;
                this.visiblePages = data.pagination.visiblePages || [];
                this.hasMoreData = data.pagination.hasMoreData || false;
                this.displayText =
                    data.pagination.displayText ||
                    `Showing ${data.pagination.showingFrom || 1} to ${data.pagination.showingTo || 0
                    } of ${data.pagination.totalItems || 0} entries`;
                this.updatePaginationControls();
            }

            // Process search results
            let allItems = [];
            if (Array.isArray(data.items)) {
                allItems = data.items.map((item) => {
                    const normalized = this.normalizeItem(item, item.isFolder);
                    // Add search highlighting
                    normalized.highlightedName = this.highlightSearchTerm(
                        item.name,
                        this.searchQuery
                    );
                    normalized.parentPath = item.parentPath || "";
                    return normalized;
                });
            }

            this.searchResults = allItems;
            this.items = allItems; // For rendering
        }
        highlightSearchTerm(text, query) {
            if (!query || !text) return text;

            const regex = new RegExp(
                `(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
                "gi"
            );
            return text.replace(regex, '<mark class="search-highlight">$1</mark>');
        }
        renderSearchResults() {
            const fileGrid = document.getElementById("fileGrid");
            if (!fileGrid) return;

            if (this.searchResults.length === 0) {
                fileGrid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-search"></i>
          <h3>No results found</h3>
          <p>No files or folders match "${this.searchQuery}"</p>
        </div>
      `;
                return;
            }

            const fileItems = this.searchResults
                .map((item) => this.renderFileItem(item, true))
                .join("");
            fileGrid.innerHTML = fileItems;
            this.updateSelectionUI();
        }
        updateSearchNavigation() {
            const breadcrumb = document.getElementById("breadcrumb");
            if (!breadcrumb) return;

            // Build filter description
            let filterDesc = "";
            if (this.searchFilters.fileType !== "all") {
                filterDesc += ` (${this.searchFilters.fileType})`;
            }
            if (this.searchFilters.folderScope) {
                filterDesc += " [Current Folder]";
            }
            if (this.searchFilters.exactMatch) {
                filterDesc += " [Exact Match]";
            }

            breadcrumb.innerHTML = `
      <span class="breadcrumb-item" onclick="FilePicker.clearSearch()">Root</span>
      <i class="fas fa-chevron-right"></i>
      <span class="breadcrumb-item active">Search: "${this.searchQuery}"${filterDesc}</span>
    `;

            // Update back button for search mode
            const backBtn = document.getElementById("backBtn");
            if (backBtn) {
                backBtn.disabled = false;
                backBtn.onclick = () => this.clearSearch();
                backBtn.title = "Clear Search";
            }
        }
        async loadSearchPage(page) {
            if (!this.isSearchMode || !this.searchQuery) {
                return;
            }

            try {
                this.showSearchLoading(true);
                this.showLoading(true);
                this.searchPage = page;

                const data = await fetchData("files/search", {
                    cache: "no-store",
                    params: {
                        query: this.searchQuery,
                        page: page.toString(),
                        limit: this.itemsPerPage.toString(),
                        fileType: this.searchFilters.fileType,
                        folderScope: this.searchFilters.folderScope.toString(),
                        exactMatch: this.searchFilters.exactMatch.toString(),
                        currentFolder: this.currentFolder || "",
                    }
                });

                if (!data) {
                    throw new Error("No data received from server");
                }

                if (!data.status) {
                    throw new Error(data.message || "Failed to search files");
                }

                this.processSearchResults(data);
                this.renderSearchResults();
            } catch (error) {
                console.error("Error loading search page:", error);
                toastr.error("Failed to load search results: " + error.message);
            } finally {
                this.showSearchLoading(false);
                this.showLoading(false);
            }
        }
        handleSearchInput(event) {
            const input = event.target;
            const clearBtn = document.getElementById("searchClearBtn");

            if (clearBtn) {
                if (input.value.trim().length > 0) {
                    clearBtn.style.display = "block";
                } else {
                    clearBtn.style.display = "none";
                }
            }
        }
        async clearSearch() {
            try {
                if (this.searchTimeout) clearTimeout(this.searchTimeout);

                // --- Reset search state ---
                this.isSearchMode = false;
                this.searchQuery = "";
                this.searchResults = [];
                this.searchPage = 1;
                this.searchFilters = {
                    fileType: "all",
                    folderScope: false,
                    exactMatch: false,
                };

                // --- Reset navigation to root (match goToRoot behavior) ---
                this.currentFolder = null; // use null like goToRoot()
                this.currentFolderId = null;
                this.folderHistory = [];
                this.selectedFiles.clear();
                this.currentPage = 1;

                // --- Clear caches to avoid duplicates / stale render hashing ---
                this.items = [];
                this.allLoadedItems = []; // optional: clear if you rely on this for UI
                this.lastRenderHash = null;
                this.pendingRender = false;

                // --- Reset UI elements ---
                const searchInput = document.getElementById("searchInput");
                const clearBtn = document.getElementById("searchClearBtn");
                if (searchInput) searchInput.value = "";
                if (clearBtn) clearBtn.style.display = "none";

                this.showAdvancedFilters = false;
                this.updateAdvancedFiltersVisibility();

                // Breadcrumb and back button
                this.updateBreadcrumb(); // will render root breadcrumb correctly
                const backBtn = document.getElementById("backBtn");
                if (backBtn) {
                    backBtn.onclick = () => this.goBack();
                    backBtn.title = "Go Back";
                }

                // Show quick loading placeholder (clear old search UI)
                const fileGrid = document.getElementById("fileGrid");
                if (fileGrid) {
                    fileGrid.innerHTML = `
        <div class="loading-state">
          <i class="fas fa-spinner fa-spin"></i>
          <p>Loading root files...</p>
        </div>
      `;
                }

                // --- Fetch root and force render ---
                this.showLoading(true);
                await this.loadFiles(1);

                // In case loadFiles didn't call render (safety), force render once
                this.lastRenderHash = null;
                this.renderFiles();
            } catch (error) {
                console.error("Error clearing search:", error);
                toastr.error("Error restoring root: " + error.message);
            } finally {
                this.showLoading(false);
            }
        }
        updateAdvancedFiltersVisibility() {
            const filtersEl = document.getElementById("searchFilters");
            const filterIcon = document.getElementById("filterIcon");

            if (filtersEl && filterIcon) {
                filtersEl.style.display = this.showAdvancedFilters ? "flex" : "none";
                filterIcon.className = this.showAdvancedFilters
                    ? "fas fa-filter"
                    : "fas fa-filter";
                filterIcon.style.color = this.showAdvancedFilters ? "#007bff" : "";
            }
        }
        showLoading(show, message = "Loading files...") {
            const loadingEl = document.getElementById("loadingState");
            const fileGridEl = document.getElementById("fileGrid");
            const loadingText = document.getElementById("loadingText");

            if (loadingEl && fileGridEl) {
                loadingEl.style.display = show ? "flex" : "none";
                fileGridEl.style.display = show ? "none" : "grid";
                if (loadingText && show) {
                    loadingText.textContent = message;
                }
            }
        }

        showEmptyState(message = "No files in this folder") {
            const fileGrid = document.getElementById("fileGrid");
            if (!fileGrid) return;

            fileGrid.classList.add("full-grid");
            fileGrid.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-triangle"></i>
          <h3>Error</h3>
          <p>${message}</p>
        </div>
      `;
            this.updateSelectionUI();
        }

        confirmSelection() {
            const selectedArr = [...this.selectedFiles]
                .map((id) => this.items.find((f) => f.id === id))
                .filter(Boolean);

            if (selectedArr.length === 0 && !this._slotToReplace) return;

            // ---- Check if this is editor scope ----
            const isEditorScope = this.input.dataset.scope === "editor";

            // ---- Resolve maxFiles ----
            let maxFiles = this.config.maxFiles;
            if (maxFiles === "unlimited" || maxFiles === "*" || maxFiles === "∞") {
                maxFiles = Infinity;
            } else {
                maxFiles = parseInt(maxFiles || 1, 10);
                if (isNaN(maxFiles) || maxFiles <= 0) maxFiles = 1;
            }

            // ---- Ensure slot array ----
            if (!Array.isArray(this._slots)) this._slots = [];

            // ---- If replacing specific slot ----
            if (typeof this._slotToReplace === "number") {
                if (selectedArr.length > 0) {
                    this._slots[this._slotToReplace] = selectedArr[0];
                }
                this._slotToReplace = null;
            } else {
                // ---- Append mode ----
                let freeSlots =
                    maxFiles === Infinity
                        ? Infinity
                        : Math.max(0, maxFiles - this._slots.filter(Boolean).length);

                for (const fileObj of selectedArr) {
                    if (freeSlots <= 0) break;

                    const already = this._slots.some((s) => s && s.id === fileObj.id);
                    if (already) continue;

                    // find first empty slot
                    const emptyIndex = this._slots.findIndex((s) => s === null);
                    if (emptyIndex !== -1) {
                        this._slots[emptyIndex] = fileObj;
                    } else {
                        this._slots.push(fileObj);
                    }

                    freeSlots--;
                }
            }

            // ---- Trim to maxFiles ----
            if (maxFiles !== Infinity) this._slots = this._slots.slice(0, maxFiles);

            // ---- Sync selectedFiles ----
            this.selectedFiles = new Set(
                this._slots.filter(Boolean).map((f) => f.id)
            );

            // ---- Re-render without merging ----
            this.updateInput(this._slots.filter(Boolean));
            this.updateFormBindings(null);

            // ---- Handle editor scope differently ----
            if (
                isEditorScope &&
                window.currentFilePicker === this &&
                selectedArr.length > 0
            ) {
                // For editor scope, always call the multiple handler for consistency
                if (
                    window.currentFilePicker &&
                    window.currentFilePicker._editorMultipleCallback
                ) {
                    try {
                        window.currentFilePicker._editorMultipleCallback(selectedArr);
                        // Close modal immediately after selection for better UX
                        this.close();
                        return; // Exit early for editor scope
                    } catch (e) {
                        console.warn("Editor multiple callback failed:", e);
                    }
                } else if (
                    window.currentFilePicker &&
                    window.currentFilePicker._editorCallback
                ) {
                    // Fallback: call single callback for each file if multiple not available
                    try {
                        selectedArr.forEach((file, index) => {
                            window.currentFilePicker._editorCallback(file);
                        });
                        // Close modal immediately after selection for better UX
                        this.close();
                        return; // Exit early for editor scope
                    } catch (e) {
                        console.warn("Editor callback failed:", e);
                    }
                }
            }

            // ---- For non-editor scope: set the selected file on a hidden input ----
            if (
                window.currentFilePicker === this &&
                selectedArr.length > 0 &&
                !isEditorScope
            ) {
                // Find the hidden input created by the editor
                const hiddenInputs = document.querySelectorAll(
                    `input[id^="editor-picker-"]`
                );
                hiddenInputs.forEach((hidden) => {
                    if (hidden.value === "") {
                        hidden.value = JSON.stringify(selectedArr[0]);
                        hidden.dispatchEvent(new Event("change", { bubbles: true }));

                        // Also try to directly call the editor's handleFileSelection if available
                        if (
                            window.currentFilePicker &&
                            window.currentFilePicker._editorCallback
                        ) {
                            try {
                                window.currentFilePicker._editorCallback(selectedArr[0]);
                                // Close modal immediately after selection for better UX
                                this.close();
                            } catch (e) {
                                console.warn("Editor callback failed:", e);
                            }
                        }
                    }
                });
            }

            // ---- Update the correct hidden input based on trigger ID ----
            if (selectedArr.length > 0 && !isEditorScope) {
                const triggerId = this.input.dataset.triggerId;
                if (triggerId) {
                    const hiddenInput = document.getElementById(triggerId);
                    if (hiddenInput) {
                        hiddenInput.value =
                            maxFiles === 1
                                ? selectedArr[0].id
                                : selectedArr.map((f) => f.id).join(",");
                        hiddenInput.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                }
            }

            this.close();

            // ---- Dispatch final event ----
            this.input.dispatchEvent(
                new CustomEvent("filepicker:change", {
                    detail: { files: [...this._slots.filter(Boolean)] },
                    bubbles: true,
                })
            );
        }

        updateInput(selected) {
            if (!Array.isArray(selected) || selected.length === 0) {
                this.input._selectedFiles = [];
                return;
            }

            const fileList = selected.map((file) => {
                const mockFile = new File(
                    [],
                    file.fileName || file.original_name || file.name || "file",
                    {
                        type: file.mimeType || file.mime_type || "application/octet-stream",
                    }
                );
                mockFile.url = file.file || file.fileUrl || file.url || "";
                mockFile.id = file.id;
                mockFile.folder = file.folder || this.config.folder;
                return mockFile;
            });

            this.input._selectedFiles = fileList;
        }
        updateFormBindings(selected) {
            try {
                // ---- Normalise slots ----
                if (!Array.isArray(this._slots)) this._slots = [];
                this._slots = this._slots.filter(
                    (s) => s && s !== null && s !== undefined
                );

                // ---- Read & normalise maxFiles ----
                let maxFiles = this.config.maxFiles;
                if (["unlimited", "*", "∞"].includes(maxFiles)) maxFiles = Infinity;
                else {
                    maxFiles = parseInt(maxFiles || 1, 10);
                    if (isNaN(maxFiles) || maxFiles <= 0) maxFiles = 1;
                }

                // ---- Handle new selection ----
                if (Array.isArray(selected) && selected.length > 0) {
                    const currentCount = this._slots.length;
                    const remaining = maxFiles - currentCount;

                    if (maxFiles === 1) {
                        this._slots = [selected[0]];
                    } else if (
                        this._slotToReplace !== undefined &&
                        this._slotToReplace !== null
                    ) {
                        this._slots[this._slotToReplace] = selected[0];
                        this._slotToReplace = null;
                    } else if (remaining > 0) {
                        const toAdd = selected.slice(0, remaining);
                        this._slots = [...this._slots, ...toAdd];
                    } else {
                        const merged = [...this._slots, ...selected];
                        this._slots = merged.slice(-maxFiles);
                    }
                }

                // ---- DOM refs ----
                const triggerId = this.input.dataset.triggerId;
                const isEditorScope = this.input.dataset.scope === "editor";

                // Skip preview updates for editor scope
                if (isEditorScope) return;

                const previewContainer =
                    document.querySelector(
                        `.feature-image-preview[data-trigger-id="${triggerId}"]`
                    ) || document.querySelector(".feature-image-preview");
                if (!previewContainer) return;
                const triggerBox = previewContainer.querySelector(".add-new-file-box");
                let linkedInput = triggerBox?.dataset.triggerId
                    ? document.getElementById(triggerBox.dataset.triggerId)
                    : null;

                // ---- Preview style ----
                const previewStyle =
                    triggerBox?.dataset.previewStyle ||
                    this.input?.dataset.previewStyle ||
                    "rectangle";
                const styleClass = previewStyle === "round" ? "round" : "rectangle";

                // ---- Remove existing previews ----
                previewContainer
                    .querySelectorAll(".preview-thumb-wrapper")
                    .forEach((el) => el.remove());

                // ---- Render previews ----
                this._slots.forEach((slotObj, slotIndex) => {
                    if (!slotObj) return;
                    const fileUrl = slotObj.file || slotObj.fileUrl || slotObj.url || "";
                    const fileName =
                        slotObj.name || fileUrl.split("/").pop() || `File ${slotIndex + 1}`;
                    const ext = (fileName.split(".").pop() || "").toLowerCase();

                    const wrapper = document.createElement("div");
                    wrapper.classList.add("preview-thumb-wrapper", styleClass);

                    const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(
                        ext
                    );
                    const isVideo = ["mp4", "mov", "avi", "webm", "mkv"].includes(ext);
                    let mediaEl;

                    if (isImage) {
                        mediaEl = document.createElement("img");
                        mediaEl.src = fileUrl;
                        mediaEl.alt = fileName;
                        mediaEl.classList.add("preview-media", styleClass);
                    } else if (isVideo) {
                        mediaEl = document.createElement("video");
                        Object.assign(mediaEl, {
                            src: fileUrl,
                            autoplay: true,
                            loop: true,
                            muted: true,
                            playsInline: true,
                        });
                        mediaEl.classList.add("preview-media", styleClass);
                    } else {
                        const iconClass = this.getFileIconClass({ name: fileName });
                        mediaEl = document.createElement("div");
                        mediaEl.classList.add("file-icon-preview", styleClass);
                        mediaEl.innerHTML = `<i class="${iconClass}"></i>`;
                    }

                    const removeBtn = document.createElement("button");
                    removeBtn.type = "button";
                    removeBtn.classList.add("remove-preview-btn");
                    removeBtn.innerHTML = '<i class="fas fa-times"></i>';

                    removeBtn.addEventListener("click", (e) => {
                        e.stopPropagation();
                        this._slots.splice(slotIndex, 1);
                        this.selectedFiles = new Set(this._slots.map((f) => f.id));
                        const remainingNow = maxFiles - this._slots.length;
                        triggerBox.dataset.maxFiles = maxFiles;
                        this.updateFormBindings(null);
                    });

                    wrapper.appendChild(mediaEl);
                    wrapper.appendChild(removeBtn);
                    previewContainer.insertBefore(wrapper, triggerBox);
                });

                // ---- Update hidden input ----
                if (linkedInput) {
                    const ids = this._slots.map(
                        (s) => s.id || s.file || s.fileUrl || s.url
                    );
                    linkedInput.value = maxFiles === 1 ? ids[0] || "" : ids.join(",");
                    linkedInput.dispatchEvent(new Event("change", { bubbles: true }));
                }

                // ---- Manage add-new-file-box visibility ----
                if (triggerBox) {
                    const canAddMore =
                        maxFiles === Infinity || this._slots.length < maxFiles;
                    triggerBox.classList.remove("round", "rectangle");
                    triggerBox.classList.add(styleClass);
                    triggerBox.style.display = canAddMore ? "inline-flex" : "none";
                    triggerBox.dataset.remaining = Math.max(
                        0,
                        maxFiles - this._slots.length
                    );
                    triggerBox.dataset.maxFiles = maxFiles;
                    triggerBox.innerHTML = `<i class="fas fa-camera"></i>`;
                    triggerBox.onclick = (e) => {
                        e.stopPropagation();
                        this._slotToReplace = null;
                        this.createModal();
                        window.currentFilePicker = this;
                        this.open();
                    };
                }
            } catch (e) {
                console.error("updateFormBindings failed:", e);
            }
        }
    }

    // Auto-initialize on DOM ready
    // ----------------------
    // ✅ Initialize all inputs
    // ----------------------
    function init() {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => FilePicker.initAll());
        } else {
            FilePicker.initAll();
        }
    }
    init();

    // ----------------------
    // ✅ Global Instance (like fileManager.js)
    // ----------------------
    // This makes FilePicker behave like FileManager — globally callable, one instance
    window.FilePicker = new FilePicker(document.createElement("input"));
    window.FilePicker._isGlobal = true;

    // When any picker opens via input, that instance becomes the active modal
    FilePicker.prototype._setActive = function () {
        window.FilePicker = this;
    };

    // Patch open() so that the active picker updates automatically
    const _originalOpen = FilePicker.prototype.open;
    FilePicker.prototype.open = function (...args) {
        this._setActive();
        if (_originalOpen) _originalOpen.apply(this, args);
    };

    // ----------------------
    // ✅ MutationObserver to re-init dynamically added inputs
    // ----------------------
    // ✅ Modern observer for new FilePicker version
    if (window.MutationObserver) {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) {
                        // Direct element with data-file-picker
                        if (node.matches?.('[data-file-picker="true"]')) {
                            if (!node._filePicker) {
                                node._filePicker = new FilePicker(node);
                                if (typeof node._filePicker.init === 'function') {
                                    node._filePicker.init();
                                }
                            }
                        }
                        // Or any nested inputs
                        else if (node.querySelectorAll) {
                            node.querySelectorAll('[data-file-picker="true"]').forEach((input) => {
                                if (!input._filePicker) {
                                    input._filePicker = new FilePicker(input);
                                    if (typeof input._filePicker.init === 'function') {
                                        input._filePicker.init();
                                    }
                                }
                            });
                        }
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });

        // Initialize any existing pickers on first load
        document.querySelectorAll('[data-file-picker="true"]').forEach((input) => {
            if (!input._filePicker) {
                input._filePicker = new FilePicker(input);
                if (typeof input._filePicker.init === 'function') {
                    input._filePicker.init();
                }
            }
        });
    }

    // ✅ Store pickers by trigger ID to prevent conflicts
    window.filePickers = window.filePickers || {};

    // ======================================================
    // 📦 Additional Modals for File Picker (Global Modals)
    // ======================================================
    function appendFilePickerModals() {
        // Prevent duplicates
        if (document.getElementById("createFolderModal")) return;

        const modalsHTML = `
    <!-- Create Folder Modal -->
    <div class="psr-modal-overlay" id="createFolderModal">
        <div class="psr-modal compact-modal">
            <div class="psr-modal-header">
                <div class="modal-title-section">
                    <div class="modal-icon">
                        <i class="fas fa-folder-plus"></i>
                    </div>
                    <div class="modal-title-content">
                        <h3 class="psr-modal-title">Create New Folder</h3>
                        <div class="location-in-header">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>Location: </span>
                            <span class="location-path" id="currentFolderPath">Root</span>
                        </div>
                    </div>
                </div>
                <button class="psr-modal-close" onclick="FilePicker.hideCreateFolderDialog()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="psr-modal-body">
                <div class="psr-form-group">
                    <label for="folderNameInput" class="psr-form-label">Folder Name</label>
                    <div class="input-wrapper">
                        <input type="text" id="folderNameInput" class="psr-form-input" placeholder="Enter folder name..." maxlength="255" autocomplete="off">
                        <div class="input-icon">
                            <i class="fas fa-folder"></i>
                        </div>
                    </div>
                    <div class="input-hint">Use letters, numbers, spaces, hyphens, and underscores only</div>
                </div>
            </div>
            <div class="psr-modal-footer">
                <button class="psr-btn psr-btn-secondary" onclick="FilePicker.hideCreateFolderDialog()">
                    <i class="fas fa-times"></i>
                    Cancel
                </button>
                <button class="psr-btn psr-btn-success" onclick="FilePicker.createNewFolder()">
                    <i class="fas fa-plus"></i>
                    Create Folder
                </button>
            </div>
        </div>
    </div>

    <!-- Upload Files Modal -->
    <div class="psr-modal-overlay" id="uploadFilesModal">
        <div class="psr-modal upload-modal">
            <div class="psr-modal-header">
                <div class="modal-title-section">
                    <div class="modal-icon">
                        <i class="fas fa-cloud-upload-alt"></i>
                    </div>
                    <div class="modal-title-content">
                        <h3 class="psr-modal-title">Upload Files</h3>
                        <p class="modal-subtitle">Select files to upload to your current folder</p>
                        <div class="location-in-header">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>Upload to:</span>
                            <span class="location-path" id="uploadFolderPath">Root</span>
                        </div>
                    </div>
                </div>
                <button class="psr-modal-close" onclick="FilePicker.hideUploadModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="psr-modal-body">
                <div class="upload-area" id="uploadArea">
                    <div class="upload-content">
                        <div class="upload-icon">
                            <i class="fas fa-cloud-upload-alt"></i>
                        </div>
                        <div class="upload-text">
                            <h4>Drag & Drop Files Here</h4>
                            <p>or click to browse files</p>
                        </div>
                        <div class="upload-hint">
                            <span>Supports: Images, Documents, Videos, Archives</span>
                            <span>Max size: 50MB per file</span>
                        </div>
                    </div>
                    <input type="file" id="fileInput" multiple accept="*/*" style="display: none;">
                </div>

                <div class="file-list" id="fileList" style="display: none;">
                    <div class="file-list-header">
                        <h4>Selected Files</h4>
                        <button class="clear-files-btn" onclick="FilePicker.clearFileList()">
                            <i class="fas fa-trash"></i>
                            Clear All
                        </button>
                    </div>
                    <div class="file-items" id="fileItems"></div>
                </div>

                <div class="upload-progress" id="uploadProgress" style="display: none;">
                    <div class="progress-header">
                        <span>Uploading files...</span>
                        <span class="progress-percentage" id="progressPercentage">0%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <div class="progress-details" id="progressDetails"></div>
                </div>
            </div>
            <div class="psr-modal-footer">
                <button class="psr-btn psr-btn-secondary" onclick="FilePicker.hideUploadModal()">
                    <i class="fas fa-times"></i>
                    Cancel
                </button>
                <button class="psr-btn psr-btn-primary" id="uploadBtn" onclick="FilePicker.uploadFiles()" disabled>
                    <i class="fas fa-upload"></i>
                    Upload Files
                </button>
            </div>
        </div>
    </div>

    <!-- File Preview Modal -->
    <div class="psr-modal-overlay" id="filePreviewModal">
        <div class="psr-modal preview-modal">
            <div class="psr-modal-header">
                <div class="modal-title-section">
                    <div class="modal-icon">
                        <i class="fas fa-file"></i>
                    </div>
                    <div class="modal-title-content">
                        <h3 class="psr-modal-title" id="previewFileName">File Preview</h3>
                    </div>
                </div>
                <button class="psr-modal-close" onclick="FilePicker.closePreviewModal()" aria-label="Close preview">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="psr-modal-body">
                <div class="preview-content" id="previewContainer">
                    <!-- Preview content will be inserted here -->
                </div>
            </div>
        </div>
    </div>
    `;

        document.body.insertAdjacentHTML("beforeend", modalsHTML);
    }

    // Automatically append modals when script loads
    document.addEventListener("DOMContentLoaded", appendFilePickerModals);


})();

