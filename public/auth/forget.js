/*
* Forgot Password Logic
* Handles identify, verify OTP, and reset password steps.
*/

document.addEventListener('DOMContentLoaded', () => {
    const formIdentify = document.getElementById('stepIdentify');
    const formVerify = document.getElementById('stepVerify');
    const formReset = document.getElementById('stepReset');

    const pageTitle = document.getElementById('pageTitle');
    const pageDesc = document.getElementById('pageDesc');
    const successBanner = document.getElementById('successBanner');
    const errorMsg = document.getElementById('errorMsg');

    const usernameInput = document.getElementById('username');
    const otpInput = document.getElementById('otp');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const resetBtn = document.getElementById('resetBtn');
    const resendOtpBtn = document.getElementById('resendOtp');

    const pwStrength = document.getElementById('pwStrength');
    const reqs = {
        length: document.getElementById('reqLength'),
        upper: document.getElementById('reqUpper'),
        number: document.getElementById('reqNumber'),
        special: document.getElementById('reqSpecial'),
        bars: pwStrength ? pwStrength.children : []
    };

    if (!formIdentify || !formVerify || !formReset || !pageTitle || !pageDesc || !successBanner || !errorMsg) {
        return;
    }

    let identifiedUser = '';
    let verifiedOtp = '';

    const apiHeaders = {
        'x-api-key': '777d1ac7721d06dccc754bb01bb46fc0'
    };

    const showError = (message) => {
        errorMsg.textContent = message;
        errorMsg.classList.remove('hidden');
        errorMsg.classList.add('animate-pulse');
        successBanner.classList.add('hidden');

        setTimeout(() => {
            errorMsg.classList.add('hidden');
        }, 5000);
    };

    const showSuccess = (message) => {
        successBanner.textContent = message;
        successBanner.classList.remove('hidden');
        errorMsg.classList.add('hidden');
    };

    const toggleLoading = (form, isLoading) => {
        const btn = form?.querySelector('button[type="submit"]');
        if (!btn) return;

        if (isLoading) {
            btn.disabled = true;
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = '<span class="animate-pulse">Processing...</span>';
        } else {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalText || btn.innerHTML;
        }
    };

    const updateReq = (el, passed) => {
        if (!el) return;
        const dot = el.querySelector('div');
        if (!dot) return;

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

    const setStep = (step, message = '') => {
        formIdentify.classList.add('hidden');
        formVerify.classList.add('hidden');
        formReset.classList.add('hidden');
        errorMsg.classList.add('hidden');

        if (step === 'IDENTIFY') {
            formIdentify.classList.remove('hidden');
            pageTitle.innerText = 'Forgot Password';
            pageDesc.innerText = 'Enter your email or mobile to receive an OTP';
            successBanner.classList.add('hidden');
            usernameInput.focus();
            return;
        }

        if (step === 'VERIFY') {
            formVerify.classList.remove('hidden');
            pageTitle.innerText = 'Verify OTP';
            pageDesc.innerText = identifiedUser
                ? `Enter the OTP sent to ${identifiedUser}.`
                : 'Enter the OTP sent to your registered contact.';
            if (message) {
                showSuccess(message);
            } else {
                successBanner.classList.add('hidden');
            }
            otpInput.value = '';
            otpInput.focus();
            return;
        }

        if (step === 'RESET') {
            formReset.classList.remove('hidden');
            pageTitle.innerText = 'New Password';
            pageDesc.innerText = 'Create a strong password for your account';
            successBanner.classList.add('hidden');
            newPasswordInput.value = '';
            confirmPasswordInput.value = '';
            validatePassword();
            newPasswordInput.focus();
        }
    };

    const requestOtp = async (username) => {
        return fetchData('admin-auth/forget-password', {
            method: 'POST',
            headers: apiHeaders,
            body: { username }
        });
    };

    const validatePassword = () => {
        if (!newPasswordInput || !confirmPasswordInput || !resetBtn) return;

        const val = newPasswordInput.value;
        const checks = {
            length: val.length >= 8,
            upper: /[A-Z]/.test(val),
            number: /[0-9]/.test(val),
            special: /[^A-Za-z0-9]/.test(val)
        };

        updateReq(reqs.length, checks.length);
        updateReq(reqs.upper, checks.upper);
        updateReq(reqs.number, checks.number);
        updateReq(reqs.special, checks.special);

        const passedCount = Object.values(checks).filter(Boolean).length;
        Array.from(reqs.bars || []).forEach((bar, i) => {
            bar.classList.remove('bg-red-500', 'bg-yellow-500', 'bg-green-500', 'bg-gray-700');
            if (i < passedCount) {
                if (passedCount <= 2) {
                    bar.classList.add('bg-red-500');
                } else if (passedCount === 3) {
                    bar.classList.add('bg-yellow-500');
                } else {
                    bar.classList.add('bg-green-500');
                }
            } else {
                bar.classList.add('bg-gray-700');
            }
        });

        const passwordsMatch = val !== '' && val === confirmPasswordInput.value;
        resetBtn.disabled = !(Object.values(checks).every(Boolean) && passwordsMatch);
    };

    formIdentify.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        if (!username) {
            showError('Please enter your email or mobile.');
            usernameInput.focus();
            return;
        }

        try {
            toggleLoading(formIdentify, true);
            const res = await requestOtp(username);

            if (res.success) {
                identifiedUser = username;
                verifiedOtp = '';
                setStep('VERIFY', res.message || 'OTP has been sent to your registered email or mobile number.');
            } else {
                showError(res.message || 'Unable to send OTP. Please try again.');
            }
        } catch (err) {
            showError('Network error. Please try again.');
        } finally {
            toggleLoading(formIdentify, false);
        }
    });

    formVerify.addEventListener('submit', async (e) => {
        e.preventDefault();

        const otp = otpInput.value.trim();
        if (!identifiedUser) {
            showError('Please request an OTP first.');
            setStep('IDENTIFY');
            return;
        }

        if (!/^[0-9]{6}$/.test(otp)) {
            showError('Please enter a valid 6-digit OTP.');
            otpInput.focus();
            return;
        }

        try {
            toggleLoading(formVerify, true);
            const res = await fetchData('admin-auth/verify-otp', {
                method: 'POST',
                headers: apiHeaders,
                body: { username: identifiedUser, otp }
            });

            if (res.success) {
                verifiedOtp = otp;
                setStep('RESET');
            } else {
                showError(res.message || 'Invalid OTP. Please try again.');
            }
        } catch (err) {
            showError('Verification failed. Please try again.');
        } finally {
            toggleLoading(formVerify, false);
        }
    });

    formReset.addEventListener('submit', async (e) => {
        e.preventDefault();

        const password = newPasswordInput.value;
        const confirm = confirmPasswordInput.value;

        if (!identifiedUser || !verifiedOtp) {
            showError('Please verify your OTP first.');
            setStep('IDENTIFY');
            return;
        }

        if (password !== confirm) {
            showError('Passwords do not match.');
            confirmPasswordInput.focus();
            return;
        }

        if (password.length < 8) {
            showError('Password must be at least 8 characters long.');
            return;
        }

        try {
            toggleLoading(formReset, true);
            const res = await fetchData('admin-auth/reset-password', {
                method: 'POST',
                headers: apiHeaders,
                body: {
                    username: identifiedUser,
                    otp: verifiedOtp,
                    password
                }
            });

            if (res.success) {
                pageTitle.innerText = 'Success!';
                pageDesc.innerText = 'Your password has been reset.';
                successBanner.textContent = res.message || 'You can now log in with your new password.';
                successBanner.classList.remove('hidden');
                formReset.innerHTML = `
                    <div class="text-center py-4">
                        <p class="text-gray-400 mb-6 text-sm">You can now login with your new password.</p>
                        <a href="/" class="w-full block bg-blue-600 text-white font-bold py-3 rounded-xl">Go to Login</a>
                    </div>
                `;
            } else {
                showError(res.message || 'Reset failed. Please try again.');
            }
        } catch (err) {
            showError('Reset failed. Please try again.');
        } finally {
            toggleLoading(formReset, false);
        }
    });

    resendOtpBtn?.addEventListener('click', async () => {
        if (!identifiedUser) {
            showError('Please enter your email or mobile first.');
            setStep('IDENTIFY');
            return;
        }

        try {
            toggleLoading(formVerify, true);
            const res = await requestOtp(identifiedUser);
            if (res.success) {
                verifiedOtp = '';
                setStep('VERIFY', res.message || 'A new OTP has been sent.');
            } else {
                showError(res.message || 'Unable to resend OTP.');
            }
        } catch (err) {
            showError('Unable to resend OTP right now.');
        } finally {
            toggleLoading(formVerify, false);
        }
    });

    newPasswordInput?.addEventListener('input', validatePassword);
    confirmPasswordInput?.addEventListener('input', validatePassword);

    setStep('IDENTIFY');
});
