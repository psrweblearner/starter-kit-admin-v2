// 🌍 Environment Configuration
const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
window.API_URL = isLocal ? 'http://localhost:5000/v1/' : '/api/v1/';

// 🚀 Global jQuery AJAX Setup
if (typeof $ !== 'undefined') {
    $.ajaxSetup({
        xhrFields: {
            withCredentials: true
        }
    });
}

// 🚀 Global Fetch Setup (Monkey-patching fetch to include credentials by default)
const originalFetch = window.fetch;
window.fetch = async (...args) => {
    let [resource, config] = args;
    if (typeof resource === 'string' || resource instanceof URL) {
        if (!config) config = {};
        if (!config.credentials) config.credentials = 'include';
    }
    return originalFetch(resource, config);
};

window.api = function (path = '') {
    if (!path) return window.API_URL;
    if (path.startsWith('http') || path.startsWith(window.API_URL)) return path;
    
    // ensure no double slashes
    return window.API_URL.replace(/\/+$/, '') + '/' + path.replace(/^\/+/, '');
}

/**
 * Central API Helper for ADMIN Project
 * Handles GET, POST, PUT, DELETE requests with unified error handling and configuration.
 * (Attached to window for global access without modules)
 */
window.fetchData = async (url, { method = 'GET', body = null, params = {}, headers = {}, ...restOptions } = {}) => {
    try {
        // 1. Construct URL with Query Params
        const fullUrl = window.api(url);
        const urlObj = new URL(fullUrl, window.location.origin);

        // Append params to URL
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                urlObj.searchParams.append(key, value);
            }
        });

        // 2. Prepare Config
        const finalHeaders = {
            'Content-Type': 'application/json',
            ...headers
        };

        const config = {
            method: method.toUpperCase(),
            headers: finalHeaders,
            credentials: 'include', // Ensure cookies are sent with cross-origin requests
            ...restOptions // Spread other options like mode, cache
        };

        if (body && method.toUpperCase() !== 'GET') {
            config.body = JSON.stringify(body);
        }

        // 3. Execute Request
        let response = await fetch(urlObj.toString(), config);

        // 4. Background Refresh Interceptor (401 Handling)
        if (response.status === 401 && !url.includes('admin-auth/login')) {
            console.warn('[Auth] Access Expired. Attempting Background Refresh...');
            try {
                // Direct call to refresh-token via the same Nginx proxy
                const refreshRes = await originalFetch(window.api('admin-auth/refresh-token'), {
                    method: 'POST',
                    credentials: 'include'
                });
                const refreshData = await refreshRes.json();

                if (refreshData.success) {
                    console.log('[Auth] Session Refreshed. Retrying original request...');
                    // Retry the original request with the exact same config
                    response = await fetch(urlObj.toString(), config);
                } else {
                    console.error('[Auth] Refresh Failed. Redirecting to login.');
                    window.location.href = '/';
                    return refreshData;
                }
            } catch (err) {
                console.error('[Auth] Silent Refresh Error:', err);
                window.location.href = '/';
            }
        }

        // 5. Handle Response
        if (restOptions.rawResponse) {
            return response;
        }

        const data = await response.json();

        if (!response.ok) {
            console.error('API Error:', data.message || response.statusText);
            return data;
        }

        return data;

    } catch (error) {
        console.error('Fetch Helper Error:', error);
        return { success: false, message: error.message };
    }
};

/**
 * Formats a date string to dd/mm/yyyy hh:mm AM/PM.
 * Returns "N/A" if input is invalid or missing.
 */
window.formatDate = (dateString) => {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'N/A';

    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    hours = hours ? hours : 12; // conversion of 0 to 12
    const strHours = String(hours).padStart(2, '0');

    return `${day}/${month}/${year} ${strHours}:${minutes} ${ampm}`;
};

/**
 * ============================================
 * Advanced Permission Resolver
 * ============================================
 *
 * The `canAccess` function provides an advanced mechanism for checking if the current user
 * can perform a specific action within a module. It mirrors server-side `canAccess` logic
 * and automatically resolves the module name from the URL if not explicitly provided.
 *
 * Features:
 * - Auto-detects module from URL path segments.
 * - Fallback to substring matching for modules not in a standard location.
 * - Handles permissions stored as arrays or objects.
 * - Returns `true` if the user is allowed to perform the action, `false` otherwise.
 *
 * Usage Example:
 *   if (window.canAccess('edit', 'leads')) { ... }
 */
window.canAccess = function (action, moduleKey = null) {
    try {
        if (!window.authUser || !window.authUser.permissions || !action) return false;
        const permissionsMap = window.authUser.permissions;
        const path = (window.location.pathname || "").toLowerCase();

        let moduleName = moduleKey;
        if (!moduleName) {
            const segments = path.split("/").filter(Boolean);
            const keys = Object.keys(permissionsMap);
            const lowerKeys = keys.map(k => k.toLowerCase());

            for (let i = segments.length - 1; i >= 0; i--) {
                const seg = segments[i].toLowerCase();
                const idx = lowerKeys.indexOf(seg);
                if (idx !== -1) {
                    moduleName = keys[idx];
                    break;
                }
            }

            if (!moduleName) {
                let best = null;
                for (let i = 0; i < lowerKeys.length; i++) {
                    const keyLc = lowerKeys[i];
                    if (path.includes(keyLc)) {
                        if (!best || keyLc.length > best.key.length) {
                            best = { key: keyLc, orig: keys[i] };
                        }
                    }
                }
                if (best) moduleName = best.orig;
            }
        }

        if (!moduleName) return false;

        let allowed = permissionsMap[moduleName];
        if (typeof allowed === "string") {
            try { allowed = JSON.parse(allowed); } catch { allowed = []; }
        }

        const actionLc = String(action).toLowerCase();
        if (Array.isArray(allowed)) {
            return allowed.map(a => String(a).toLowerCase()).includes(actionLc);
        }
        if (allowed && typeof allowed === "object") {
            return !!(allowed[actionLc] || allowed[action] || allowed[action.toUpperCase()]);
        }

        return false;
    } catch (err) {
        console.error("canAccess error:", err);
        return false;
    }
};

/* ============================================
 *   Global Token Refresh & jQuery Interceptor
 * ============================================ */
let isRefreshingToken = false;
let refreshSubscribers = [];

function onRefreshed(success) {
    refreshSubscribers.forEach(cb => cb(success));
    refreshSubscribers = [];
}

// Global jQuery AJAX Setup to handle 401s automatically
if (typeof $ !== 'undefined') {
    $.ajaxPrefilter(function (options, originalOptions, jqXHR) {
        const originalError = options.error;
        options.error = function (xhr, textStatus, errorThrown) {
            if (xhr.status === 401 && !options.url.includes('login')) {
                console.warn('[jQuery Auth] Access Expired. Queuing Refresh...');
                
                if (!isRefreshingToken) {
                    isRefreshingToken = true;
                    // Trigger the silent refresh
                    originalFetch(window.api('admin-auth/refresh-token'), {
                        method: 'POST',
                        credentials: 'include'
                    }).then(res => res.json()).then(data => {
                        isRefreshingToken = false;
                        if (data.success) {
                            onRefreshed(true);
                        } else {
                            onRefreshed(false);
                            window.location.href = '/';
                        }
                    }).catch(err => {
                        isRefreshingToken = false;
                        onRefreshed(false);
                        window.location.href = '/';
                    });
                }
                
                // Subscribe to wait for the refresh call to finish
                refreshSubscribers.push((success) => {
                    if (success) {
                        console.log('[jQuery Auth] Refresh Successful. Retrying original request.');
                        $.ajax(originalOptions).then(options.success, originalError);
                    } else if (originalError) {
                        originalError(xhr, textStatus, errorThrown);
                    }
                });
                return; // Suppress the immediate failure
            }

            // Normal error pass-through
            if (originalError) originalError(xhr, textStatus, errorThrown);
        };
    });
}

// 30-Day Soft Expiry Warning Tracker
(function() {
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    let warningShown = false;

    function checkSessionExpiry() {
        const expiryCookie = getCookie('admin_session_expiry');
        if (!expiryCookie) return;

        const expiryDate = parseInt(expiryCookie, 10);
        if (isNaN(expiryDate)) return;

        const timeRemaining = expiryDate - Date.now();
        const twoMinutes = 2 * 60 * 1000;

        // Auto-logout when time officially runs out
        if (timeRemaining <= 0) {
            window.location.href = '/';
            return;
        }

        if (!warningShown && timeRemaining > 0 && timeRemaining <= twoMinutes) {
            warningShown = true;
            
            const alertHtml = `
            <div id="session-expiry-alert" class="psr-alert psr-alert-warning" style="margin: 0 1.5rem 1rem; display: flex; align-items: center; justify-content: space-between; border: 1px solid #f5c6cb; background: #fff3cd; color: #856404; padding: 1rem; border-radius: 6px;">
                <div>
                    <i class="fa-solid fa-clock" style="margin-right:0.5rem;"></i> <strong>Session Expiry Warning!</strong> Your master session will permanently expire in less than 2 minutes. Please save any unsaved work entirely, then log in again.
                </div>
                <button type="button" onclick="document.getElementById('session-expiry-alert').remove()" style="background:transparent; border:none; cursor:pointer; font-size:1.2rem; color:#856404;">&times;</button>
            </div>`;
            
            // Wait for DOM to load fully before injecting
            if (document.querySelector('.psr-top-header')) {
                document.querySelector('.psr-top-header').insertAdjacentHTML('afterend', alertHtml);
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                   if (document.querySelector('.psr-top-header')) {
                       document.querySelector('.psr-top-header').insertAdjacentHTML('afterend', alertHtml);
                   }
                });
            }
        }
    }

    // Check periodically
    setInterval(checkSessionExpiry, 15000); // check every 15s
    // Check right away on load
    checkSessionExpiry();
})();
