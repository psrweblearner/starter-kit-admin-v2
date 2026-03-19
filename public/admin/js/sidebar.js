const toggle_icons = document.querySelector('.psr-icons');
const toggle = document.querySelector('.psr-page-container');
const sidebar = document.querySelector('.psr-side-bar');

if (toggle_icons && toggle) {
    toggle_icons.addEventListener('click', (e) => {
        e.stopPropagation();
        if (toggle.classList.contains('psr-sidebar-expanded')) {
            toggle.classList.remove('psr-sidebar-expanded');
            toggle.classList.add('psr-sidebar-collapsed');
        }
        else {
            toggle.classList.add('psr-sidebar-expanded');
            toggle.classList.remove('psr-sidebar-collapsed');
        }
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 &&
            toggle.classList.contains('psr-sidebar-expanded') &&
            sidebar && !sidebar.contains(e.target) &&
            !toggle_icons.contains(e.target)) {
            toggle.classList.remove('psr-sidebar-expanded');
            toggle.classList.add('psr-sidebar-collapsed');
        }
    });

    const checkScreenSize = () => {
        const width = window.innerWidth;
        if (sidebar && toggle) {
            if (width <= 768) {
                toggle.classList.add('psr-sidebar-collapsed');
                toggle.classList.remove('psr-sidebar-expanded');
            } else {
                toggle.classList.add('psr-sidebar-expanded');
                toggle.classList.remove('psr-sidebar-collapsed');
            }
        }
    }
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
}