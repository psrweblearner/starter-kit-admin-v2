'use strict';
const jwt = require('jsonwebtoken');
const catchAsync = require('../utils/catchAsync');
const promisify = require("util").promisify;
const API_URL = process.env.API_URL || 'http://localhost:5000/v1/';
const ENFORCE_FINGERPRINT = String(process.env.ENFORCE_FINGERPRINT || '').trim() === '1';

const fingerprintFromReq = (req) => {
    const crypto = require('crypto');
    // Mirror the API logic: Use User-Agent for fingerprint stability across networks
    const userAgent = req.headers['user-agent'] || 'STABLE_ADMIN_FINGERPRINT';
    return crypto.createHash('sha256').update(userAgent).digest('hex');
};
const Auth = catchAsync(async (req, res, next) => {
    let token = req.cookies.admin_auth_token;
    const refreshToken = req.cookies.admin_refresh_token;

    // 1. Initial Check: If both tokens are missing, redirect to login
    if (!token && !refreshToken) {
        return res.redirect('/');
    }

    try {
        const fs = require('fs');
        const path = require('path');
        const publicKey = fs.readFileSync(path.join(__dirname, '../', process.env.JWT_PUBLIC_KEY_PATH), 'utf8');

        const currentFinger = fingerprintFromReq(req);
        let decoded;

        // 2. Try to verify Access Token if it exists
        if (token) {
            try {
                decoded = await promisify(jwt.verify)(token, publicKey, { algorithms: ['RS256'] });

                // Sync expiry cookie with JWT expiry
                const expiry = decoded.exp * 1000;
                res.cookie("admin_auth_expiry", expiry.toString(), {
                    httpOnly: false,
                    sameSite: 'Lax',
                    path: '/',
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 20 * 60 * 1000
                });

                // Set server time for clock sync
                res.cookie("admin_auth_server_time", Date.now().toString(), {
                    httpOnly: false,
                    sameSite: 'Lax',
                    path: '/',
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 20 * 60 * 1000
                });
            } catch (err) {
                if (err.name !== 'TokenExpiredError') {
                    console.log('JWT Error:', err.name, err.message);
                    throw err;
                }
                token = null;
            }
        }

        // 3. Refresh Flow: If Access Token is missing or expired, try Refresh Token
        if (!decoded && refreshToken) {
            const refreshResponse = await fetch(`${API_URL}admin-auth/refresh-token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${refreshToken}`,
                    'Cookie': `admin_refresh_token=${refreshToken}`,
                    'User-Agent': req.headers['user-agent'],
                    'X-Forwarded-For': req.headers['x-forwarded-for'] || req.ip,
                    'X-Internal-Secret': process.env.INTERNAL_SECRET
                }
            });

            const refreshData = await refreshResponse.json();

            if (refreshData.success && refreshData.data.token) {
                token = refreshData.data.token;

                const decodedToken = await promisify(jwt.verify)(token, publicKey, { algorithms: ['RS256'] });
                const expiry = decodedToken.exp * 1000;

                res.cookie("admin_auth_token", token, {
                    httpOnly: true,
                    sameSite: 'Lax',
                    path: '/',
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });

                res.cookie("admin_auth_expiry", expiry.toString(), {
                    httpOnly: false,
                    sameSite: 'Lax',
                    path: '/',
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });

                res.cookie("admin_auth_server_time", Date.now().toString(), {
                    httpOnly: false,
                    sameSite: 'Lax',
                    path: '/',
                    secure: process.env.NODE_ENV === 'production',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });

                req.cookies.admin_auth_token = token;

                if (refreshData.data.refreshToken) {
                    // Update refresh token exactly like login: 30 days
                    res.cookie("admin_refresh_token", refreshData.data.refreshToken, {
                        httpOnly: false,
                        sameSite: 'Lax',
                        path: '/',
                        secure: process.env.NODE_ENV === 'production',
                        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
                    });
                    req.cookies.admin_refresh_token = refreshData.data.refreshToken;
                    
                    // Decode refresh token to find its exact hard expiry
                    try {
                        const decodedRefresh = await promisify(jwt.verify)(refreshData.data.refreshToken, publicKey, { algorithms: ['RS256'], ignoreExpiration: true });
                        if (decodedRefresh && decodedRefresh.exp) {
                            res.cookie("admin_session_expiry", (decodedRefresh.exp * 1000).toString(), {
                                httpOnly: false,
                                sameSite: 'Lax',
                                path: '/',
                                secure: process.env.NODE_ENV === 'production',
                                maxAge: 30 * 24 * 60 * 60 * 1000
                            });
                        }
                    } catch (e) {
                         console.error("Failed to decode refresh token for expiry marker", e);
                    }
                }

                decoded = decodedToken;
            } else {
                throw new Error('Refresh failed or session expired');
            }
        }

        // 4. Initial session marker on normal load if it's missing but we have a refresh token
        if (decoded && refreshToken && !req.cookies.admin_session_expiry) {
             try {
                const decodedRefresh = await promisify(jwt.verify)(refreshToken, publicKey, { algorithms: ['RS256'], ignoreExpiration: true });
                if (decodedRefresh && decodedRefresh.exp) {
                     res.cookie("admin_session_expiry", (decodedRefresh.exp * 1000).toString(), {
                        httpOnly: false,
                        sameSite: 'Lax',
                        path: '/',
                        secure: process.env.NODE_ENV === 'production',
                        maxAge: 30 * 24 * 60 * 60 * 1000
                    });
                }
             } catch(e) {}
        }

        // 4. Final Security Check
        if (!decoded) {
            throw new Error('Unauthorized');
        }

        // Fingerprint Validation
        if (decoded.finger && decoded.finger !== currentFinger) {
            console.warn(`[Auth] Fingerprint Mismatch!`);
            if (ENFORCE_FINGERPRINT) {
                throw new Error('Fingerprint mismatch');
            }
        }

        // 5. Fetch Full Auth Info using the valid token
        const authInfoResponse = await fetch(`${API_URL}admin-auth/auth-info?adminUserId=${decoded.id}&roleId=${decoded.role?.id}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cookie': `admin_auth_token=${token}`,
                'User-Agent': req.headers['user-agent'],
                'X-Internal-Secret': process.env.INTERNAL_SECRET
            }
        });

        const authInfoData = await authInfoResponse.json();
        if (!authInfoData.success) {
            throw new Error(authInfoData.message || 'Failed to fetch auth info');
        }

        // 6. Merge JWT payload with detailed user data
        req.user = { ...decoded, ...authInfoData.data };
        res.locals.user = req.user;
        res.locals.req = req;
        next();
    } catch (err) {
        console.error('ADMIN Auth Middleware Error:', err.message);

        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(401).json({ success: false, message: err.message });
        }

        res.clearCookie('admin_auth_token');
        res.clearCookie('admin_auth_expiry');
        res.clearCookie('admin_refresh_token');
        return res.redirect('/');
    }
});
module.exports = Auth;
