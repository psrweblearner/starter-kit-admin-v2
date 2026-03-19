/**
 * PSR Rich Editor
 * ----------------
 * Lightweight Editor.js integration that automatically converts
 * <textarea type="editor"> into EditorJS-powered rich text editors.
 *
 * Supports per-instance tool restrictions via data-tools="paragraph,header,image"
 * and JSON value parsing to restore previous saved data.
 *
 * Author: Pushkar Singh Rawat (PSR)
 * Version: Core Load-only edition
 */

class PSRRichEditor {
    /**
     * Constructor
     * Initializes configuration with sensible defaults.
     * @param {Object} options - Configuration options for EditorJS.
     */
    constructor(options = {}) {
        this.options = {
            holder: 'psr-rich-editor',
            placeholder: 'Start writing...',
            minHeight: 150,
            readOnly: false,
            storageKey: 'psr-editor-content',
            hiddenInputSelector: null,
            allowedTools: null,
            ...options
        };

        this.editor = null;
        this.isReady = false;
        this.toolsLoaded = false;
    }

    /**
     * init()
     * Main initialization method.
     * Loads required EditorJS and tool scripts,
     * prepares holder element, and initializes the editor.
     */
    async init() {
        try {
            await this.loadCDNScripts();
            await this.waitForTools();

            if (typeof EditorJS === 'undefined') {
                throw new Error('EditorJS core library failed to load');
            }

            // --- Find or create the holder div for EditorJS ---
            let holderElement = document.getElementById(this.options.holder);
            if (!holderElement) {
                holderElement = document.createElement('div');
                holderElement.id = this.options.holder;
                holderElement.className = 'psr-rich-editor-container';
                holderElement.style.minHeight = '150px';

                // Hide the linked textarea and place editor after it
                if (this.options.hiddenInputSelector) {
                    const inputEl = document.querySelector(this.options.hiddenInputSelector);
                    if (inputEl && inputEl.parentNode) {
                        inputEl.style.display = 'none';
                        inputEl.parentNode.insertBefore(holderElement, inputEl.nextSibling);
                    } else {
                        document.body.appendChild(holderElement);
                    }
                } else {
                    document.body.appendChild(holderElement);
                }
            }

            // --- Prepare initial data (parse JSON if textarea contains content) ---
            let src = null; // Declare src here to ensure its scope
            if (this.options.hiddenInputSelector) {
                src = document.querySelector(this.options.hiddenInputSelector);
            }

            if (!this.options.initialData && src) {
                try {
                    if (src?.value?.trim()) {
                        this.options.initialData = JSON.parse(src.value);
                    }
                } catch (_) {
                    // fallback: treat as paragraph
                    this.options.initialData = {
                        blocks: [{ type: 'paragraph', data: { text: src?.value || '' } }]
                    };
                }
            }

            // --- Merge Tools Configuration ---
            const defaultTools = this.buildToolsConfig();
            const mergedTools = {};

            if (this.options.allowedTools) {
                this.options.allowedTools.forEach(toolKey => {
                    let targetKey = toolKey;
                    // Handle Aliases
                    if (toolKey === 'video') targetKey = 'image';
                    if (toolKey === 'link') targetKey = 'linkTool';

                    if (defaultTools[targetKey]) {
                        mergedTools[targetKey] = defaultTools[targetKey];
                    }
                });
            } else {
                Object.assign(mergedTools, defaultTools);
            }

            // --- Initialize EditorJS instance ---
            this.editor = new EditorJS({
                holder: this.options.holder,
                placeholder: this.options.placeholder,
                minHeight: this.options.minHeight,
                readOnly: !!this.options.readOnly,
                tools: mergedTools,
                data: this.options.initialData || { blocks: [] },
                onChange: async () => {
                    // Sync to hidden textarea if provided
                    if (this.options.hiddenInputSelector) {
                        try {
                            const data = await this.editor.save();
                            // Filter out time and version, keep only blocks
                            const filteredData = { blocks: data.blocks || [] };
                            const src = document.querySelector(this.options.hiddenInputSelector);
                            if (src) {
                                src.value = JSON.stringify(filteredData);
                            }
                        } catch (e) {
                            console.error('Editor onChange error:', e);
                        }
                    }
                }
            });

            this.isReady = true;
        } catch (error) {
            console.error('❌ Error initializing PSR Rich Editor:', error);
            throw error;
        }
    }

    /**
     * loadCDNScripts()
     * Loads all EditorJS core + default tool bundles from CDN.
     * Returns once all scripts are appended and loaded.
     */
    async loadCDNScripts() {
        const scripts = [
            'https://unpkg.com/@editorjs/editorjs@2.28.2/dist/editorjs.umd.js',
            'https://unpkg.com/@editorjs/header@2.7.0/dist/bundle.js',
            'https://unpkg.com/@editorjs/list@1.8.0/dist/bundle.js',
            'https://unpkg.com/@editorjs/paragraph@2.10.0/dist/bundle.js',
            'https://unpkg.com/@editorjs/table@2.2.0/dist/table.js',
            'https://unpkg.com/@editorjs/code@2.8.0/dist/bundle.js',
            'https://unpkg.com/@editorjs/quote@2.5.0/dist/bundle.js',
            'https://unpkg.com/@editorjs/image@2.8.0/dist/bundle.js',
            'https://unpkg.com/@editorjs/link@2.6.0/dist/bundle.js',
            'https://unpkg.com/@editorjs/checklist@1.6.0/dist/bundle.js'
        ];

        const loadScript = (src) =>
            new Promise((resolve) => {
                if (document.querySelector(`script[src="${src}"]`)) return resolve();
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = resolve;
                document.head.appendChild(script);
            });

        for (const script of scripts) {
            await loadScript(script);
            await new Promise((r) => setTimeout(r, 80));
        }
    }

    /**
     * waitForTools()
     * Waits until EditorJS and essential tools are available globally.
     * Prevents premature init before CDN tools are ready.
     */
    async waitForTools() {
        const maxWait = 8000;
        const start = Date.now();

        while (Date.now() - start < maxWait) {
            if (typeof EditorJS !== 'undefined' && typeof Paragraph !== 'undefined') {
                this.toolsLoaded = true;
                return true;
            }
            await new Promise((r) => setTimeout(r, 100));
        }

        console.warn('⚠️ EditorJS tools not fully loaded after timeout.');
        this.toolsLoaded = true;
        return true;
    }

    /**
     * buildToolsConfig()
     * Defines which EditorJS tools are available.
     * Returns a dictionary used by EditorJS.
     */
    buildToolsConfig() {
        const tools = {};

        if (typeof Header !== 'undefined') {
            tools.header = {
                class: Header,
                config: {
                    placeholder: 'Enter a header',
                    levels: [1, 2, 3, 4, 5, 6],
                    defaultLevel: 2
                }
            };
        }

        if (typeof Paragraph !== 'undefined') {
            tools.paragraph = {
                class: Paragraph, inlineToolbar: true,
                config: { placeholder: 'Enter a paragraph' }
            };
        }

        if (typeof List !== 'undefined') {
            tools.list = {
                class: List, inlineToolbar: true,
                config: { defaultStyle: 'unordered' }
            };
        }

        if (typeof Checklist !== 'undefined') {
            tools.checklist = { class: Checklist, inlineToolbar: true };
        }

        if (typeof Quote !== 'undefined') {
            tools.quote = {
                class: Quote, inlineToolbar: true,
                config: { quotePlaceholder: 'Enter a quote', captionPlaceholder: 'Quote\'s author' }
            };
        }

        if (typeof CodeTool !== 'undefined') {
            tools.code = { class: CodeTool };
        }

        if (typeof Table !== 'undefined') {
            tools.table = {
                class: Table,
                inlineToolbar: true,
                config: {
                    rows: 2,
                    cols: 3,
                },
            };
        }

        if (typeof LinkTool !== 'undefined') {
            tools.linkTool = { class: LinkTool, config: { endpoint: '/api/link-preview' } };
        }
        tools.image = {
            class: class {
                constructor({ data, config, readOnly, api }) {
                    this.readOnly = readOnly;
                    this.api = api;
                    this.config = config || {};
                    this.data = data || {};
                    this.wrapper = null;
                    this._lastInsertSignature = null;
                    this._lastInsertAt = 0;
                    // Store filePickerOptions from editor config
                    this.filePickerOptions = this.config.filePickerOptions || {};
                }
                static get toolbox() {
                    return { title: "Media", icon: "📹" };
                }
                static get isReadOnlySupported() {
                    return true;
                }
                validate(savedData) {
                    if (!savedData) return false;
                    if (savedData.fileId) return true;
                    return false;
                }
                render() {
                    // console.log(this.data)
                    this.wrapper = document.createElement("div");
                    this.wrapper.className = "psr-image-tool";

                    // Consider fileId renderable too; renderImage() can resolve via API
                    const hasRenderableMedia = !!(
                        this.data &&
                        (this.data.file || this.data.fileId)
                    );
                    if (hasRenderableMedia) {
                        this.renderImage();
                    } else {
                        this.renderPlaceholder();
                    }

                    return this.wrapper;
                }
                /**
                 * Render image or video inside the custom Editor.js "image" tool block.
                 * This version is simplified since `this.data` already includes:
                 * { id, file, caption, type }
                 */
                renderImage() {
                    /**
                     * Create the main wrapper container for this block's media.
                     * It will hold either <img> or <video> along with caption and actions.
                     */
                    const mediaContainer = document.createElement("div");
                    mediaContainer.className = "psr-media-container";

                    // Extract key data fields from this.data (safe defaults)
                    const fileUrl = this.data.file || "";
                    const captionText = this.data.caption || "";
                    const mimeType = this.data.type || "";

                    // Determine whether the media is an image or a video
                    const isVideo =
                        mimeType.startsWith("video/") || this.isVideoFile(fileUrl);

                    /**
                     * Create and append the actual media element.
                     * Either a <video> tag (for videos) or <img> (for images).
                     */
                    let mediaEl = null;

                    if (isVideo) {
                        const video = document.createElement("video");
                        video.src = fileUrl;
                        video.controls = true;
                        video.style.maxWidth = "100%";
                        video.style.height = "auto";
                        video.style.borderRadius = "8px";
                        video.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                        mediaContainer.appendChild(video);
                        mediaEl = video;
                    } else {
                        const img = document.createElement("img");
                        img.src = fileUrl;
                        img.alt = captionText;
                        img.style.maxWidth = "100%";
                        img.style.height = "auto";
                        img.style.borderRadius = "8px";
                        img.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                        mediaContainer.appendChild(img);
                        mediaEl = img;
                    }

                    /**
                     * Add editable caption below media (if not in read-only mode)
                     */
                    const caption = document.createElement("div");
                    caption.className = "psr-media-caption";
                    caption.contentEditable = !this.readOnly;
                    caption.textContent = captionText;
                    caption.placeholder = "Media caption (optional)";
                    mediaContainer.appendChild(caption);

                    /**
                     * If editor is editable, allow setting or removing links
                     * via SweetAlert2 modal or prompt (for images only).
                     */
                    if (!isVideo && !this.readOnly && mediaEl) {
                        const handleEditLink = async () => {
                            const currentUrl = this.data.linkUrl || "";
                            const currentTarget = !!this.data.linkTargetBlank;
                            if (window.Swal && typeof window.Swal.fire === "function") {
                                const { value: formValues } = await window.Swal.fire({
                                    title: "Set image link",
                                    html: `
                                    <input id="psr-link-url" type="url" class="swal2-input" placeholder="https://example.com" value="${currentUrl}">
                                    <label style="display:flex;align-items:center;gap:8px;justify-content:center;margin-top:6px;">
                                        <input id="psr-link-target" type="checkbox" ${currentTarget ? "checked" : ""
                                        }> Open in new tab
                                    </label>
                                `,
                                    focusConfirm: false,
                                    showCancelButton: true,
                                    preConfirm: () => ({
                                        url: document
                                            .getElementById("psr-link-url")
                                            .value.trim(),
                                        targetBlank:
                                            document.getElementById("psr-link-target").checked,
                                    }),
                                });
                                if (formValues) {
                                    this.data.linkUrl = formValues.url || "";
                                    this.data.linkTargetBlank = !!formValues.targetBlank;
                                    this.renderImage(); // re-render with updated link
                                }
                            } else {
                                const url = (
                                    prompt(
                                        "Enter link URL (leave empty to remove):",
                                        currentUrl
                                    ) || ""
                                ).trim();
                                const targetBlank = confirm(
                                    "Open in new tab? OK = Yes, Cancel = No"
                                );
                                this.data.linkUrl = url;
                                this.data.linkTargetBlank = targetBlank;
                                this.renderImage();
                            }
                        };

                        // Allow clicking on image to set or edit link
                        mediaEl.style.cursor = "pointer";
                        mediaEl.addEventListener("click", (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleEditLink();
                        });
                    }

                    /**
                     * Add "Remove" button (×) to delete the media block entirely
                     */
                    if (!this.readOnly) {
                        const removeBtn = document.createElement("button");
                        removeBtn.className = "psr-media-remove";
                        removeBtn.innerHTML = "×";
                        removeBtn.title = "Remove media";
                        removeBtn.onclick = () => this.removeImage();
                        mediaContainer.appendChild(removeBtn);
                    }

                    /**
                     * Clear previous content and attach the media container to wrapper
                     */
                    this.wrapper.innerHTML = "";
                    this.wrapper.appendChild(mediaContainer);

                    /**
                     * Sync caption text with this.data in real-time while typing
                     */
                    if (!this.readOnly) {
                        caption.addEventListener("input", () => {
                            this.data.caption = caption.textContent;
                        });
                    }
                }
                isVideoFile(url) {
                    const videoExtensions = [
                        ".mp4",
                        ".webm",
                        ".ogg",
                        ".avi",
                        ".mov",
                        ".wmv",
                        ".flv",
                        ".mkv",
                    ];
                    return videoExtensions.some((ext) =>
                        url.toLowerCase().includes(ext)
                    );
                }
                removeImage() {
                    this.data = {};
                    this.renderPlaceholder();
                }
                renderPlaceholder() {
                    const placeholder = document.createElement("div");
                    placeholder.className = "psr-media-placeholder";
                    placeholder.innerHTML = `
                        <div class="psr-media-placeholder-content">
                            <i class="fa-solid fa-photo-film"></i>
                            <p>Click to select image</p>
                        </div>
                    `;

                    if (!this.readOnly) {
                        placeholder.onclick = () => this.openFilePicker();
                    }

                    this.wrapper.innerHTML = "";
                    this.wrapper.appendChild(placeholder);
                }
                openFilePicker() {
                    if (window.FilePicker && typeof window.FilePicker.constructor === 'function') {
                        const trigger = document.createElement('div');
                        const access = window.authUser?.access || window.currentUser?.access || 'full';
                        const folder = this.filePickerOptions?.folder || 'uploads';
                        const pickerId = `editor-${folder}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                        trigger.dataset.filePicker = 'true';
                        trigger.setAttribute('accept', 'image/*,video/*');
                        trigger.dataset.folder = folder;
                        trigger.dataset.access = access;
                        trigger.dataset.maxFiles = 10;
                        trigger.dataset.triggerId = pickerId;
                        trigger.dataset.scope = 'editor'; // Mark as editor scope
                        document.body.appendChild(trigger);
                        const hidden = document.createElement('input');
                        hidden.type = 'hidden';
                        hidden.id = pickerId;
                        document.body.appendChild(hidden);
                        const pickerInstance = new window.FilePicker.constructor(trigger);

                        pickerInstance.init();
                        window.currentFilePicker = pickerInstance;
                        pickerInstance._editorCallback = (file) => this.handleFileSelection(file);
                        pickerInstance._editorMultipleCallback = (files) => this.handleMultipleFileSelection(files);
                        pickerInstance.open();
                    } else {
                        console.log('file picker not working')
                    }
                }
                handleFileSelection(file) {
                    if (!file) return;
                    console.log('handleFileSelection called with:', file);

                    // Normalize object - match the format from your API/database
                    const fileData = {
                        id: file.id || file.fileId || file.file_id || null,
                        file: file.file || file.file_url || file.fileUrl || file.url || file.path || '',
                        type: file.type || file.mime_type || file.mimeType || '',
                        caption: file.caption || '',
                        name: file.name || file.original_name || file.fileName || '',
                        size: file.size || file.file_size || file.fileSize || 0
                    };

                    console.log('FilePicker selected file object:', file);
                    console.log('Normalized fileData for editor:', fileData);

                    // Avoid duplicate double-insert
                    try {
                        const sig = JSON.stringify([fileData.id || fileData.file]);
                        const now = PSRUtils.now();
                        if (this._lastInsertSignature === sig && (now - this._lastInsertAt) < 800) return;
                        this._lastInsertSignature = sig; this._lastInsertAt = now;
                    } catch (_) { }

                    // Set data for this block
                    this.data = {
                        id: fileData.id,
                        file: fileData.file,
                        type: fileData.type,
                        caption: fileData.caption,
                        name: fileData.name,
                        size: fileData.size
                    };
                    console.log('Setting image data on current block:', this.data);
                    this.renderImage();
                }

                handleMultipleFileSelection(files) {
                    console.log('handleMultipleFileSelection called with:', files);

                    if (!files || files.length === 0) return;

                    // De-dup guard: ignore same selection fired twice rapidly
                    try {
                        const sig = JSON.stringify((files || []).map(f => f.id || f.fileId || f.file_id || f.url || f.path));
                        const now = PSRUtils.now();
                        if (this._lastInsertSignature === sig && (now - this._lastInsertAt) < 800) return;
                        this._lastInsertSignature = sig; this._lastInsertAt = now;
                    } catch (_) { }

                    // For multiple files: first updates current, rest append new blocks
                    console.log('Processing multiple files:', files.length);
                    files.forEach((file, index) => {
                        console.log(`Processing file ${index + 1}:`, file);

                        // Normalize object - match the format from your API/database
                        const fileData = {
                            id: file.id || file.fileId || file.file_id || null,
                            file: file.file || file.file_url || file.fileUrl || file.url || file.path || '',
                            type: file.type || file.mime_type || file.mimeType || '',
                            caption: file.caption || '',
                            name: file.name || file.original_name || file.fileName || '',
                            size: file.size || file.file_size || file.fileSize || 0
                        };

                        if (index === 0) {
                            // Update current block for the first file
                            this.data = {
                                id: fileData.id,
                                file: fileData.file,
                                type: fileData.type,
                                caption: fileData.caption,
                                name: fileData.name,
                                size: fileData.size
                            };
                            console.log('Setting first file data:', this.data);
                            this.renderImage();
                        } else {
                            // Append new blocks for subsequent files
                            console.log(`Creating new block for file ${index + 1}`);
                            this.createNewImageBlock(fileData);
                        }
                    });
                }

                createNewImageBlock(fileData) {
                    // Create a new image block for additional files
                    if (this.api && this.api.blocks) {
                        const blockData = {
                            id: fileData.id,
                            file: fileData.file,
                            type: fileData.type,
                            caption: fileData.caption || '',
                            name: fileData.name,
                            size: fileData.size
                        };

                        console.log('Creating new image block with data:', blockData);
                        try {
                            // Insert new block after the current block, or at end if current is invalid
                            let currentIndex = this.api.blocks.getCurrentBlockIndex();
                            const totalBlocks = this.api.blocks.getBlocksCount();

                            if (currentIndex === -1 || currentIndex >= totalBlocks) {
                                currentIndex = totalBlocks - 1;
                            }

                            console.log('Inserting new image block after index:', currentIndex);
                            this.api.blocks.insert('image', blockData, {}, currentIndex + 1);

                            // Move cursor to the newly inserted block
                            this.api.caret.setToLastBlock('image');

                            console.log('✅ Successfully created new image block after current block');
                        } catch (e) {
                            console.error('Failed to create new image block:', e);
                        }
                    } else {
                        console.error('API or blocks not available for creating new image block');
                    }
                }


                save() {
                    return {
                        fileId: this.data.id || this.data.fileId,
                        file_path: '',
                        storage_provider: '',
                        mimeType: this.data.type,
                        caption: this.data.caption || '',
                        link: (this.data.linkUrl || this.data.linkTargetBlank) ? { url: this.data.linkUrl || null, targetBlank: !!this.data.linkTargetBlank } : undefined
                    };
                }
            },
        };
        return tools;
    }
}

/**
 * Auto Initialization Logic
 * -------------------------
 * On DOM load, finds all <textarea type="editor"> elements,
 * hides them, creates a holder div, and converts them into PSRRichEditor.
 */
(function autoInitEditorFromTextarea() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInitEditorFromTextarea);
        return;
    }

    // Prevent if global flag disables auto-init
    if (window.PSR_RICH_EDITOR_AUTO_INIT === false) return;

    // Inject editor stylesheet if missing
    if (!document.querySelector('link[href*="psr-rich-editor.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = '/admin/css/psr-rich-editor.css';
        document.head.appendChild(link);
    }

    try {
        const textareas = Array.from(document.querySelectorAll('textarea[type="editor"]'))
            .filter((ta) => (ta.dataset.autoInit || 'true') !== 'false')
            .filter((ta) => ta.dataset.psrInitialized !== 'true');

        if (!textareas.length) return;

        window.PSREditors = window.PSREditors || {};

        textareas.forEach(async (ta) => {
            const holderId = `psr-editor-${Math.random().toString(36).slice(2)}`;
            const holder = document.createElement('div');
            holder.id = holderId;
            holder.className = 'psr-rich-editor-container';
            holder.style.minHeight = '150px';
            ta.style.display = 'none';
            ta.parentNode.insertBefore(holder, ta.nextSibling);

            // Parse allowed tools list if provided via data-tools=""
            let allowedTools = null;
            try {
                const toolsAttr = ta.getAttribute('data-tools');
                if (toolsAttr?.trim()) {
                    allowedTools = toolsAttr.split(',').map((s) => s.trim());
                }
            } catch (_) { }

            // Parse file picker options from textarea attributes
            const filePickerOptions = {
                accept: ta.getAttribute('accept') || 'image/*',
                folder: ta.getAttribute('folder') || ta.dataset.folder || 'uploads',
                access: ta.getAttribute('access') || ta.dataset.access || 'full',
                maxFiles: parseInt(ta.getAttribute('data-max-files') || ta.dataset.maxFiles || 1, 10)
            };

            // Initialize Editor Instance
            const editor = new PSRRichEditor({
                holder: holderId,
                hiddenInputSelector: `#${ta.id}`,
                filePickerOptions,
                ...(allowedTools ? { allowedTools } : {}),
            });

            await editor.init();

            window.PSREditors[ta.id] = editor;
            ta.dataset.psrInitialized = 'true';
        });
    } catch (error) {
        console.error('❌ PSR Editor auto-init failed:', error);
    }
})();

/**
 * Export class globally for external scripts.
 */
window.PSRRichEditor = PSRRichEditor;
