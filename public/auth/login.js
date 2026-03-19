/*
* Login Form Logic
* Handles form submission, validation, and API authentication
*/

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMsg = document.getElementById('errorMsg');
    const submitBtn = loginForm.querySelector('button[type="submit"]');

    // Utility to show error
    const showError = (message) => {
        if (!errorMsg) return;
        errorMsg.textContent = message;
        errorMsg.classList.remove('hidden');
        errorMsg.classList.add('animate-pulse');

        // Auto hide after 5 seconds
        setTimeout(() => {
            errorMsg.classList.add('hidden');
        }, 5000);
    };

    const toggleLoading = (isLoading) => {
        if (isLoading) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Signing In...
            `;
        } else {
            submitBtn.disabled = false;
            submitBtn.innerText = 'Sign In';
        }
    };

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Hide previous errors
        if (errorMsg) errorMsg.classList.add('hidden');

        // Get values
        const username = usernameInput?.value?.trim();
        const password = passwordInput?.value?.trim();

        // Validation
        if (!username) {
            showError('Please enter your email or mobile.');
            usernameInput.focus();
            return;
        }

        if (!password) {
            showError('Please enter your password.');
            passwordInput.focus();
            return;
        }

        try {
            toggleLoading(true);

            // Call central API directly using fetchData helper
            const data = await fetchData('admin-auth/login', {
                method: 'POST',
                headers: {
                    'x-api-key': '777d1ac7721d06dccc754bb01bb46fc0' // Default API Key
                },
                body: { username, password }
            });
            if (data.success) {
                // Bridge call removed - Cookies are now set directly by the API response
                // through the Nginx proxy (same domain).

                if (data.data?.multipleRoles) {
                    sessionStorage.setItem('multiRoleUser', JSON.stringify(data.data));
                    window.location.href = '/select-role';
                } else {
                    window.location.href = '/admin/dashboard';
                }
            } else {
                throw new Error(data.message || 'Login failed. Please check your credentials.');
            }

        } catch (error) {
            console.error('Login Error:', error);
            showError(error.message || 'An error occurred. Please try again.');
        } finally {
            toggleLoading(false);
        }
    });

    // Optional: Add floating label effect or other UI interactions here
});
