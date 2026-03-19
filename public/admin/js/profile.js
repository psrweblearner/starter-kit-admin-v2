class PSRProfile {
    constructor() {
        this.isEdit = false;
        this.cacheEls();
        this.bindEvents();
        this.updateMode(false);
    }

    cacheEls() {
        this.form = document.getElementById('psr-profile-form');
        this.view = document.getElementById('psr-profile-view');
        this.btnEdit = document.getElementById('psr-profile-edit');
        this.btnSave = document.getElementById('psr-save');
        this.btnCancel = document.getElementById('psr-cancel');
        this.previewContainer = document.querySelector('.feature-image-preview');
        this.addBox = this.previewContainer?.querySelector('.add-new-file-box');
        this.hiddenInput = document.getElementById('profile'); // hidden field for ID
    }

    bindEvents() {
        // ✏️ Edit / Cancel
        this.btnEdit.addEventListener('click', () => this.updateMode(!this.isEdit));
        this.btnCancel.addEventListener('click', () => this.updateMode(false));

        // 🖼️ Listen for file-picker changes (global)
        if (this.hiddenInput) {
            this.hiddenInput.addEventListener('filepicker:change', (e) => {
                const files = e.detail?.files || [];
                if (files.length > 0) {
                    const file = files[0];
                    this.updateFeatureImagePreview(file.file || file.fileUrl || file.url);
                }
            });
        }

        // 🧩 Add-box click restricted to edit mode
        if (this.addBox) {
            this.addBox.addEventListener('click', (e) => {
                if (!this.isEdit) {
                    e.preventDefault();
                    alert('Please click "Edit" before changing the feature image.');
                }
            });
        }

        // ❌ Bind remove button for pre-rendered image (static DOM)
        this.bindRemoveButton();
    }

    bindRemoveButton() {
        const removeBtn = this.previewContainer?.querySelector('.remove-preview-btn');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (!this.isEdit) {
                    alert('You must click "Edit" before removing the feature image.');
                    return;
                }

                // Remove preview
                const preview = e.target.closest('.preview-thumb-wrapper');
                if (preview) preview.remove();

                // Reset hidden input value
                if (this.hiddenInput) {
                    this.hiddenInput.value = '';
                    this.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                }

                // Show camera add box again
                if (this.addBox) {
                    this.addBox.style.display = 'inline-flex';
                    this.addBox.dataset.remaining = 1;
                }
            });
        }
    }

    updateFeatureImagePreview(url) {
        if (!this.previewContainer) return;

        // Remove old preview if it exists
        const oldPreview = this.previewContainer.querySelector('.preview-thumb-wrapper');
        if (oldPreview) oldPreview.remove();

        // Create new wrapper
        const wrapper = document.createElement('div');
        wrapper.classList.add('preview-thumb-wrapper', 'round');

        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Profile Image';
        img.classList.add('preview-media', 'round');

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.classList.add('remove-preview-btn');
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';

        removeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (!this.isEdit) {
                alert('You must click "Edit" before removing the feature image.');
                return;
            }
            wrapper.remove();
            this.hiddenInput.value = '';
            this.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));

            if (this.addBox) {
                this.addBox.style.display = 'inline-flex';
                this.addBox.dataset.remaining = 1;
            }
        });

        wrapper.appendChild(img);
        wrapper.appendChild(removeBtn);
        this.previewContainer.insertBefore(wrapper, this.addBox);

        // Hide add box if single image allowed
        if (this.addBox) this.addBox.style.display = 'none';
    }

    updateMode(edit) {
        this.isEdit = edit;

        this.form.style.display = edit ? '' : 'none';
        this.view.style.display = edit ? 'none' : '';
        this.btnSave.style.display = edit ? '' : 'none';
        this.btnCancel.style.display = edit ? '' : 'none';

        // Enable/disable camera icon
        if (this.addBox) {
            this.addBox.style.pointerEvents = edit ? 'auto' : 'none';
            this.addBox.style.opacity = edit ? '1' : '0.5';
        }

        // Toggle remove buttons
        this.previewContainer?.querySelectorAll('.remove-preview-btn').forEach(btn => {
            btn.style.display = edit ? '' : 'none';
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.psrProfile = new PSRProfile();
});
