(function ($) {
    // Simple, reusable jQuery validation plugin
    // Usage: $('form').psrValidate({ rules: {...}, messages: {...}, onValid, onInvalid })
    var DEFAULTS = {
        rules: {},
        messages: {},
        beforeSubmit: null,
        onValid: null,
        onInvalid: null,
        // class names used by this plugin
        classes: {
            field: 'psr-form-input',
            error: 'error',
            success: 'success',
            errorText: 'psr-field-error'
        }
    };

    function isSummernoteField($field) {
        return typeof $field.summernote === 'function' && ($field.hasClass('psr-summernote') || $field.is('[data-summernote]'));
    }

    function isEditorField($field) {
        return $field.is('textarea') && ($field.attr('type') === 'editor');
    }

    function getFieldValue($field) {
        if ($field.is(':file')) {
            // Check if this is a file picker input
            if ($field.attr('data-file-picker') === 'true') {
                // For file picker inputs, check the corresponding hidden input
                var fieldName = $field.attr('name');
                if (fieldName) {
                    var hiddenInput = $('input[name="' + fieldName + '"]').not(':file');
                    var hiddenValue = hiddenInput.val();
                    console.log('PSR Validator - File picker hidden input value:', hiddenValue, 'for field:', fieldName);
                    return hiddenValue && hiddenValue.trim() ? hiddenValue.trim() : null;
                }
                return null;
            }
            // Traditional file input
            return $field[0].files && $field[0].files.length ? $field[0].files[0] : null;
        }
        if ($field.is('select')) {
            if ($field.prop('multiple')) {
                return $field.val() || [];
            }
            return ($field.val() || '').toString().trim();
        }
        if (isSummernoteField($field)) {
            // Return HTML code for rich editor
            try { return ($field.summernote('code') || '').toString(); } catch (e) { return ''; }
        }
        if (isEditorField($field)) {
            // Editor.js stores JSON in the textarea value (kept in sync by CDN)
            return ($field.val() || '').toString();
        }
        return ($field.val() || '').toString().trim();
    }

    function getPlainText(htmlOrText) {
        var text = $('<div>').html(htmlOrText || '').text();
        return (text || '').replace(/\u00A0|&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    }

    // Choose where to render error for a field (works for hidden enhanced widgets)
    function getErrorContainer($field) {
        // Prefer the form group wrapper
        var $group = $field.closest('.psr-form-group');
        if ($group.length) return $group;
        // If a hidden select is enhanced, its next sibling may be the multiselect UI
        if ($field.is('select')) {
            var $ui = $field.next('.psr-multiselect');
            if ($ui.length) return $ui.parent().length ? $ui.parent() : $ui;
        }
        // Summernote: place near the rendered editor wrapper
        if (isSummernoteField($field)) {
            var $editor = $field.next('.note-editor');
            if ($editor.length) return $editor.parent().length ? $editor.parent() : $editor;
            return $field.parent();
        }
        // Editor.js: place near the rendered editor container
        if (isEditorField($field)) {
            var $holder = $field.next('.psr-rich-editor-container');
            if ($holder.length) return $holder.parent().length ? $holder.parent() : $holder;
            return $field.parent();
        }
        // Fallback: parent
        return $field.parent();
    }

    var validators = {
        required: function (value, param, $field) {
            if ($field.is(':file')) {
                return !!value;
            }
            if (Array.isArray(value)) {
                return value.length > 0;
            }
            return (value || '').toString().trim().length > 0;
        },
        minLength: function (value, param) {
            return value.length >= param;
        },
        maxLength: function (value, param) {
            return value.length <= param;
        },
        minWords: function (value, param, $field) {
            var text = getPlainText(value);
            var words = (text.match(/\S+/g) || []).length;
            return words >= param;
        },
        maxWords: function (value, param, $field) {
            var text = getPlainText(value);
            var words = (text.match(/\S+/g) || []).length;
            return words <= param;
        },
        // Aliases for rich editors (same logic, name clarity)
        richMinWords: function (value, param, $field) {
            var text = getPlainText(value);
            var words = (text.match(/\S+/g) || []).length;
            return words >= param;
        },
        richMaxWords: function (value, param, $field) {
            var text = getPlainText(value);
            var words = (text.match(/\S+/g) || []).length;
            return words <= param;
        },
        email: function (value) {
            if (!value) return true;
            var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(value);
        },
        number: function (value) {
            if (!value) return true;
            return /^-?\d*(\.\d+)?$/.test(value);
        },
        min: function (value, param) {
            if (!value) return true;
            var n = parseFloat(value);
            return !isNaN(n) && n >= param;
        },
        max: function (value, param) {
            if (!value) return true;
            var n = parseFloat(value);
            return !isNaN(n) && n <= param;
        },
        phone: function (value) {
            if (!value) return true;
            // Accepts digits, spaces, dashes, parentheses, plus
            return /^\+?[\d\s\-()]{7,15}$/.test(value);
        },
        pattern: function (value, param) {
            if (!value) return true;
            var re = new RegExp(param);
            return re.test(value);
        },
        fileTypes: function (file, param) {
            if (!file) return true;
            var allowed = (param || '').toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            if (!allowed.length) return true;
            var ext = (file.name.split('.').pop() || '').toLowerCase();
            return allowed.indexOf(ext) !== -1;
        },
        fileMaxSize: function (file, param) {
            if (!file) return true;
            return file.size <= param; // param in bytes
        },
        // Rich text required (Summernote or similar)
        richRequired: function (value, param, $field) {
            if (isSummernoteField($field)) {
                var tmp = $('<div>').html(value);
                var text = getPlainText(value);
                var hasImage = tmp.find('img').length > 0;
                return text.length > 0 || hasImage;
            }
            if (isEditorField($field)) {
                try {
                    var json = {};
                    try { json = JSON.parse(value || '{}'); } catch (e) { json = {}; }
                    var blocks = Array.isArray(json.blocks) ? json.blocks : [];
                    if (!blocks.length) return false;
                    // Consider paragraph/header text or image blocks as content
                    for (var i = 0; i < blocks.length; i++) {
                        var b = blocks[i] || {}; var t = (b.type || '').toLowerCase(); var d = b.data || {};
                        if (t === 'paragraph' || t === 'header') {
                            var txt = (d.text || '').replace(/<[^>]+>/g, '').trim();
                            if (txt.length) return true;
                        }
                        if (t === 'image') {
                            if (d.fileId || d.file_path || d.url) return true;
                        }
                    }
                    return false;
                } catch (e) { return false; }
            }
            return validators.required(value, param, $field);
        },
        // Select-specific
        minSelected: function (value, param, $field) {
            if (Array.isArray(value)) return value.length >= param;
            return true; // not a multi-select
        },
        maxSelected: function (value, param, $field) {
            if (Array.isArray(value)) return value.length <= param;
            return true; // not a multi-select
        },
        // File picker specific
        filePickerRequired: function (value, param, $field) {
            if ($field.attr('data-file-picker') === 'true') {
                return !!value && value.trim().length > 0;
            }
            return true; // not a file picker input
        }
    };

    function showError($field, message, classes) {
        var $container = getErrorContainer($field);
        // mark field as error (for styling) when possible
        $field.removeClass(classes.success).addClass(classes.error);
        // Also mark enhanced widgets
        if ($field.is('select')) {
            var $ui = $field.next('.psr-multiselect');
            if ($ui.length) $ui.addClass(classes.error).removeClass(classes.success);
        }
        if (isSummernoteField($field)) {
            var $editor = $field.next('.note-editor');
            if ($editor.length) $editor.addClass(classes.error).removeClass(classes.success);
        }
        var name = $field.attr('name') || '';
        var selector = '.' + classes.errorText + (name ? ('[data-for="' + name + '"]') : '');
        var $err = $container.find(selector);
        if (!$err.length) {
            $err = $('<div/>', { 'class': classes.errorText, 'data-for': name });
            $container.append($err);
        }
        $err.text(message || 'Invalid value');
    }

    function clearError($field, classes) {
        var $container = getErrorContainer($field);
        $field.removeClass(classes.error).addClass(classes.success);
        if ($field.is('select')) {
            var $ui = $field.next('.psr-multiselect');
            if ($ui.length) $ui.removeClass(classes.error).addClass(classes.success);
        }
        if (isSummernoteField($field)) {
            var $editor = $field.next('.note-editor');
            if ($editor.length) $editor.removeClass(classes.error).addClass(classes.success);
        }
        var name = $field.attr('name') || '';
        var selector = '.' + classes.errorText + (name ? ('[data-for="' + name + '"]') : '');
        $container.find(selector).remove();
    }

    function validateField($field, rules, messages, classes) {
        var name = $field.attr('name');
        var fieldRules = (rules && rules[name]) || {};
        if (!name || !fieldRules) return { valid: true };

        var value = getFieldValue($field);
        var file = $field.is(':file') ? value : null;

        for (var key in fieldRules) {
            if (!fieldRules.hasOwnProperty(key)) continue;
            var param = fieldRules[key];
            var fn = validators[key];
            if (!fn) continue;

            // ✅ Skip validation if "required" is false
            if (key === 'required' && (param === false || param === 'false')) continue;

            // ✅ Skip other rules if field is empty AND not required
            if (!value && (!fieldRules.required || fieldRules.required === false)) continue;

            var ok = key === 'fileTypes' || key === 'fileMaxSize'
                ? fn(file, param)
                : fn(value, param, $field);

            if (!ok) {
                var msg = messages && messages[name] && messages[name][key] ? messages[name][key] : null;
                showError($field, msg, classes);
                return { valid: false, rule: key };
            }
        }


        clearError($field, classes);
        return { valid: true };
    }

    $.fn.psrValidate = function (options) {
        var settings = $.extend(true, {}, DEFAULTS, options || {});
        var classes = settings.classes;

        return this.each(function () {
            var $form = $(this);

            function validateAll() {
                var isValid = true;
                $form.find('.' + classes.field + ', input, textarea, select').each(function () {
                    var $field = $(this);
                    var res = validateField($field, settings.rules, settings.messages, classes);
                    if (!res.valid) isValid = false;
                });
                return isValid;
            }

            // Real-time validation
            $form.on('input change blur', 'input, textarea, select', function () {
                validateField($(this), settings.rules, settings.messages, classes);
            });

            // File picker validation
            $form.on('filepicker:change', 'input[data-file-picker="true"]', function () {
                validateField($(this), settings.rules, settings.messages, classes);
            });

            // Submit handling
            $form.on('submit', function (e) {
                var ok = validateAll();
                if (!ok) {
                    e.preventDefault();
                    // Re-apply errors to enhanced widgets (in case button state cleared DOM)
                    $form.find('select, textarea').each(function () {
                        var $f = $(this);
                        var name = $f.attr('name');
                        var hasErr = !!$form.find('.' + classes.errorText + '[data-for="' + name + '"]').length;
                        if (hasErr) {
                            if ($f.is('select')) {
                                var $ui = $f.next('.psr-multiselect');
                                if ($ui.length) $ui.addClass(classes.error).removeClass(classes.success);
                            }
                            if (isSummernoteField($f)) {
                                var $editor = $f.next('.note-editor');
                                if ($editor.length) $editor.addClass(classes.error).removeClass(classes.success);
                            }
                        }
                    });
                    // mark and focus first error
                    $form.addClass('psr-has-errors');
                    var $firstErr = $form.find('.' + classes.errorText).first();
                    if ($firstErr.length) {
                        $('html,body').animate({ scrollTop: Math.max(0, $firstErr.offset().top - 120) }, 200);
                    }
                    if (typeof settings.onInvalid === 'function') settings.onInvalid.call($form[0]);
                } else {
                    // allow disabling button/spinner before async submit
                    if (typeof settings.beforeSubmit === 'function') {
                        settings.beforeSubmit.call($form[0]);
                    }
                    if (typeof settings.onValid === 'function') {
                        var result = settings.onValid.call($form[0]);
                        if (result === false) e.preventDefault();
                    }
                }
            });

            // Ensure clicking submit button also triggers validation immediately
            $form.on('click', 'button[type="submit"], input[type="submit"]', function (ev) {
                var ok = validateAll();
                if (!ok) {
                    ev.preventDefault();
                    $form.triggerHandler('submit');
                }
            });
        });
    };

    // ===== Summernote Helper =====
    // Initialize Summernote editors with sensible defaults and custom features
    // Usage: $.psrSummernote('#description', { placeholder: 'Description is required' })
    $.psrSummernote = function (selector, userOptions) {
        if (typeof $.fn.summernote !== 'function') {
            console.warn('Summernote not loaded. Include Summernote CSS/JS before calling $.psrSummernote');
            return;
        }

        var defaults = {
            airMode: false,
            placeholder: 'Start typing...',
            tabsize: 2,
            height: 250,
            toolbar: [
                ['style', ['bold', 'underline', 'italic', 'style']],
                ['file', ['link', 'filePicker', 'table', 'video']],
                ['list', ['ul', 'ol', 'paragraph', 'redo', 'undo', 'clear']],
                ['color', ['forecolor', 'backcolor']],
                ['font', ['fontsize', 'fullscreen', 'codeview']]
            ],
            popover: {
                image: [
                    ['custom', ['editAltLink']],
                    ['remove', ['removeMedia']]
                ]
            },
            buttons: {},
            callbacks: {}
        };

        // Custom button: editAltLink
        var makeEditAltLinkBtn = function (context) {
            var ui = $.summernote.ui;
            return ui.button({
                contents: '<i class="note-icon-pencil"/> Alt/Link',
                tooltip: 'Edit alt/link',
                click: function () {
                    var $img = $(context.invoke('restoreTarget'));
                    var $link = $img.closest('a');
                    var currentAlt = $img.attr('alt') || '';
                    var currentHref = $link.length ? $link.attr('href') : '';
                    var newAlt = window.prompt('Enter alt text for the image:', currentAlt);
                    if (newAlt === null) return;
                    var newHref = window.prompt('Enter link URL (optional):', currentHref);
                    var $newImg = $img.clone().attr('alt', (newAlt || '').trim());
                    var $newElement;
                    if (newHref && newHref.trim()) {
                        $newElement = $('<a>', { href: newHref.trim(), target: '_blank' }).append($newImg);
                    } else {
                        $newElement = $newImg;
                    }
                    $link.length ? $link.replaceWith($newElement) : $img.replaceWith($newElement);
                }
            }).render();
        };

        // Custom button: File Picker
        var makeFilePickerBtn = function (context) {
            var ui = $.summernote.ui;
            return ui.button({
                contents: '<i class="fa fa-image"/>',
                tooltip: 'Insert image from file picker',
                click: function () {

                    // Use context directly for image insertion
                    openFilePickerForSummernote(null, context);
                }
            }).render();
        };



        // File picker integration for Summernote
        function openFilePickerForSummernote(editor, context) {

            if (typeof window.FilePicker === 'undefined') {
                console.warn('FilePicker not available');
                return;
            }

            // Create trigger element similar to editor-cdn.js
            const trigger = document.createElement('div');
            const pickerId = `summernote-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            trigger.dataset.filePicker = 'true';
            trigger.setAttribute('accept', 'image/*');
            trigger.dataset.folder = 'uploads';
            trigger.dataset.access = 'full';
            trigger.dataset.maxFiles = 10; // Allow multiple for flexibility
            trigger.dataset.triggerId = pickerId;
            trigger.dataset.scope = 'editor'; // Set to 'editor' so file picker calls the callback
            document.body.appendChild(trigger);

            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.id = pickerId;
            document.body.appendChild(hidden);

            const pickerInstance = new window.FilePicker.constructor(trigger);
            // Store the Summernote context for use in callbacks
            pickerInstance._summernoteContext = context;

            pickerInstance._editorCallback = (file) => {
                if (!file) return;
                console.log('Summernote file picker selected file:', file);

                // Normalize to get file URL
                const imageUrl = file.file || file.file_url || file.fileUrl || file.url || file.path || '';
                console.log('Normalized file URL:', imageUrl);

                if (imageUrl) {
                    // Insert the selected image into Summernote
                    const altText = window.prompt('Enter Alt Text for the Image', '') || '';

                    // Use stored context to insert image properly
                    const summernoteContext = pickerInstance._summernoteContext;
                    if (summernoteContext && summernoteContext.invoke) {
                        summernoteContext.invoke('insertImage', imageUrl, altText);
                    } else if (summernoteContext && summernoteContext.$note) {
                        // Try using the note element directly
                        summernoteContext.$note.summernote('insertImage', imageUrl, altText);
                    } else {
                        // Fallback: find the summernote editor and insert
                        const $summernoteEditor = $('.note-editable');
                        if ($summernoteEditor.length) {
                            $summernoteEditor.summernote('insertImage', imageUrl, altText);
                        } else {
                            console.error('Could not find Summernote editor to insert image');
                        }
                    }
                    console.log('Image inserted into Summernote');
                }
            };

            pickerInstance._editorMultipleCallback = (files) => {
                console.log('Summernote multiple files selected:', files);
                if (!files || files.length === 0) return;

                // Insert each file as image
                files.forEach((file) => {
                    pickerInstance._editorCallback(file);
                });
            };

            pickerInstance.init();
            pickerInstance.open();
        }

        function deepMergeOptions(defaults, user) {
            const merged = $.extend(true, {}, defaults, user);
            ['toolbar', 'popover', 'buttons'].forEach(key => {
                if (user && user[key] !== undefined) {
                    merged[key] = user[key];
                }
            });
            return merged;
        }

        var opts = deepMergeOptions(defaults, userOptions || {});
        // Inject custom buttons
        opts.buttons = opts.buttons || {};
        opts.buttons.editAltLink = opts.buttons.editAltLink || makeEditAltLinkBtn;
        opts.buttons.filePicker = opts.buttons.filePicker || makeFilePickerBtn;

        // Merge callbacks with defaults
        var userCbs = opts.callbacks || {};
        opts.callbacks = $.extend({}, {
            onImageUpload: function (files) {
                // Completely disable default file upload
                console.log('Default image upload disabled - use file picker button instead');
                return false;
            },
            onImageLinkInsert: function (url) {
                var altText = window.prompt('Enter Alt Text for the Image', '') || '';
                var $img = $('<img>').attr({ src: url, alt: altText });
                $(this).summernote('insertNode', $img[0]);
            },
            onMediaDelete: function (target) {
                var src = $(target[0]).attr('src');
                if (src) {
                    var encoded = encodeURIComponent(src);
                    $.ajax({ type: 'DELETE', url: '/api/upload-editor-file/' + encoded });
                }
            },
            onPaste: function (e) {
                e.preventDefault();
                var text = ((e.originalEvent || e).clipboardData || window.clipboardData).getData('text/plain');
                var cleanText = text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
                document.execCommand('insertText', false, cleanText);
            }
        }, userCbs);

        // Initialize
        $(selector).each(function () {
            var $el = $(this);
            // mark for validator
            $el.addClass('psr-summernote');
            $el.summernote(opts);
            // trigger validation on change to show/hide error promptly
            try {
                $el.on('summernote.change summernote.blur', function () {
                    $el.trigger('change');
                });
            } catch (e) { }
        });
    };

})(jQuery);
