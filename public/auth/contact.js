/*
* Contact / Request Access Logic
* Handles the submission of access requests from employees
*/

document.addEventListener('DOMContentLoaded', () => {
    const contactForm = document.getElementById('contactForm');
    const statusMsg = document.getElementById('statusMsg');
    const submitBtn = document.getElementById('submitBtn');

    if (!contactForm) return;

    const showStatus = (message, isError = false) => {
        statusMsg.textContent = message;
        statusMsg.className = `p-3 rounded-xl text-center text-sm mb-4 ${isError
                ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                : 'bg-green-500/10 border border-green-500/20 text-green-400'
            }`;
        statusMsg.classList.remove('hidden');
    };

    const toggleLoading = (isLoading) => {
        if (isLoading) {
            submitBtn.disabled = true;
            submitBtn.dataset.originalText = submitBtn.innerHTML;
            submitBtn.innerHTML = `<span class="animate-pulse">Sending Request...</span>`;
        } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = submitBtn.dataset.originalText || 'Send Request';
        }
    };

    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        statusMsg.classList.add('hidden');

        // Collect Form Data
        const formData = {
            fullName: document.getElementById('fullName').value.trim(),
            workEmail: document.getElementById('workEmail').value.trim(),
            mobile: document.getElementById('mobile').value.trim(),
            department: document.getElementById('department').value,
            reason: document.getElementById('reason').value.trim()
        };

        if (!formData.department) {
            return showStatus('Please select your department', true);
        }

        try {
            toggleLoading(true);

            // Assuming there is an endpoint for access requests
            const response = await fetchData('admin-auth/request-access', {
                method: 'POST',
                body: formData
            });

            if (response.success) {
                showStatus('Request sent successfully! Admin will review your request.');
                contactForm.reset();
                // Optionally redirect after a delay
                setTimeout(() => {
                    window.location.href = '/';
                }, 3000);
            } else {
                showStatus(response.message || 'Failed to send request. Please try again later.', true);
            }

        } catch (error) {
            console.error('Request Error:', error);
            showStatus('An error occurred. Please check your connection and try again.', true);
        } finally {
            toggleLoading(false);
        }
    });
});
