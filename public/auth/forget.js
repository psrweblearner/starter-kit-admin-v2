/*
* Forgot Password Logic
* Handles identification, OTP verification, and password reset steps.
*/

document.addEventListener('DOMContentLoaded', () => {
    // State
    let currentState = 'IDENTIFY'; // IDENTIFY, VERIFY, RESET
    let identifiedUser = null; // Stores email/mobile for subsequent calls

    // Elements
    const pageTitle = document.getElementById('pageTitle');
    const pageDesc = document.getElementById('pageDesc');
    const successBanner = document.getElementById('successBanner');
    const errorMsg = document.getElementById('errorMsg');

    const formIdentify = document.getElementById('stepIdentify');
    const formVerify = document.getElementById('stepVerify');
    const formReset = document.getElementById('stepReset');

    const usernameInput = document.getElementById('username');
    const otpInput = document.getElementById('otp');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const resetBtn = document.getElementById('resetBtn');

    // Password Requirements Elements
    const reqs = {
        length: document.getElementById('reqLength'),
        upper: document.getElementById('reqUpper'),
        number: document.getElementById('reqNumber'),
        special: document.getElementById('reqSpecial'),
        bars: document.getElementById('pwStrength').children
    };

    // UTILITIES
    const showError = (message) => {
        if (!errorMsg) return;
        errorMsg.textContent = message;
        errorMsg.classList.remove('hidden');
        setTimeout(() => errorMsg.classList.add('hidden'), 5000);
    };

    const toggleLoading = (form, isLoading) => {
        const btn = form.querySelector('button[type="submit"]');
        if (isLoading) {
            btn.disabled = true;
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = `<span class="animate-pulse">Processing...</span>`;
        } else {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        }
    };

    const setStep = (step) => {
        currentState = step;
        formIdentify.classList.add('hidden');
        formVerify.classList.add('hidden');
        formReset.classList.add('hidden');
        successBanner.classList.add('hidden');

        if (step === 'IDENTIFY') {
            formIdentify.classList.remove('hidden');
            pageTitle.innerText = 'Forgot Password';
            pageDesc.innerText = 'Follow the steps to reset your password';
        } else if (step === 'VERIFY') {
            formVerify.classList.remove('hidden');
            successBanner.classList.remove('hidden');
            pageTitle.innerText = 'Verify OTP';
            pageDesc.innerText = `We've sent a code to ${identifiedUser}`;
        } else if (step === 'RESET') {
            formReset.classList.remove('hidden');
            pageTitle.innerText = 'New Password';
            pageDesc.innerText = 'Create a strong password for your account';
        }
    };

    // STEP 1: Request OTP
    formIdentify.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        if (!username) return;

        try {
            toggleLoading(formIdentify, true);
            const res = await fetchData('admin-auth/forgot-password', {
                method: 'POST',
                body: { username }
            });

            if (res.success) {
                identifiedUser = username;
                setStep('VERIFY');
            } else {
                showError(res.message || 'Identity verification failed');
            }
        } catch (err) {
            showError('Network error. Please try again.');
        } finally {
            toggleLoading(formIdentify, false);
        }
    });

    // STEP 2: Verify OTP
    formVerify.addEventListener('submit', async (e) => {
        e.preventDefault();
        const otp = otpInput.value.trim();
        if (otp.length < 6) return showError('Please enter 6-digit OTP');

        try {
            toggleLoading(formVerify, true);
            const res = await fetchData('admin-auth/verify-otp', {
                method: 'POST',
                body: { username: identifiedUser, otp }
            });

            if (res.success) {
                setStep('RESET');
            } else {
                showError(res.message || 'Invalid OTP');
            }
        } catch (err) {
            showError('Verification failed. Try again.');
        } finally {
            toggleLoading(formVerify, false);
        }
    });

    // STEP 3: Reset Password
    formReset.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = newPasswordInput.value;
        const confirm = confirmPasswordInput.value;

        if (password !== confirm) return showError('Passwords do not match');

        try {
            toggleLoading(formReset, true);
            const res = await fetchData('admin-auth/reset-password', {
                method: 'POST',
                body: {
                    username: identifiedUser,
                    otp: otpInput.value.trim(),
                    password
                }
            });

            if (res.success) {
                pageTitle.innerText = 'Success!';
                pageDesc.innerText = 'Your password has been reset.';
                formReset.innerHTML = `
                    <div class="text-center py-4">
                        <p class="text-gray-400 mb-6 text-sm">You can now login with your new password.</p>
                        <a href="/" class="w-full block bg-blue-600 text-white font-bold py-3 rounded-xl">Go to Login</a>
                    </div>
                `;
            } else {
                showError(res.message || 'Reset failed');
            }
        } catch (err) {
            showError('Reset failed. Please try again.');
        } finally {
            toggleLoading(formReset, false);
        }
    });

    // PASSWORD VALIDATION LOGIC
    const validatePassword = () => {
        const val = newPasswordInput.value;
        const checks = {
            length: val.length >= 8,
            upper: /[A-Z]/.test(val),
            number: /[0-9]/.test(val),
            special: /[^A-Za-z0-9]/.test(val)
        };

        // Update UI requirements
        const updateReq = (el, passed) => {
            const dot = el.querySelector('div');
            if (passed) {
                el.classList.remove('text-gray-500');
                el.classList.add('text-green-500');
                dot.classList.remove('bg-gray-500');
                dot.classList.add('bg-green-500');
            } else {
                el.classList.add('text-gray-500');
                el.classList.remove('text-green-500');
                dot.classList.add('bg-gray-500');
                dot.classList.remove('bg-green-500');
            }
        };

        updateReq(reqs.length, checks.length);
        updateReq(reqs.upper, checks.upper);
        updateReq(reqs.number, checks.number);
        updateReq(reqs.special, checks.special);

        // Strength Bar
        const passedCount = Object.values(checks).filter(Boolean).length;
        Array.from(reqs.bars).forEach((bar, i) => {
            bar.classList.remove('bg-red-500', 'bg-yellow-500', 'bg-green-500', 'bg-gray-700');
            if (i < passedCount) {
                if (passedCount <= 2) bar.classList.add('bg-red-500');
                else if (passedCount === 3) bar.classList.add('bg-yellow-500');
                else bar.classList.add('bg-green-500');
            } else {
                bar.classList.add('bg-gray-700');
            }
        });

        // Enable/Disable button
        const passwordsMatch = val === confirmPasswordInput.value && val !== '';
        resetBtn.disabled = !(passedCount === 4 && passwordsMatch);
    };

    newPasswordInput.addEventListener('input', validatePassword);
    confirmPasswordInput.addEventListener('input', validatePassword);

    // Resend OTP handler
    document.getElementById('resendOtp').addEventListener('click', async () => {
        showError('Requesting new OTP...');
        try {
            const res = await fetchData('admin-auth/forgot-password', {
                method: 'POST',
                body: { username: identifiedUser }
            });
            if (res.success) showError('New OTP sent!');
        } catch (e) { }
    });
});
