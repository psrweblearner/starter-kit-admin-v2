'use strict';
const jwt = require('jsonwebtoken');
const promisify = require("util").promisify;
const fs = require('fs');
const path = require('path');

/**
 * Middleware to redirect users to dashboard if they are already authenticated.
 * This is used for login, forget password, and other guest-only routes.
 */
const redirectIfAuthenticated = async (req, res, next) => {
    const token = req.cookies.admin_auth_token;
    const refreshToken = req.cookies.admin_refresh_token;

    // If no access token and no refresh token, they are definitely not logged in
    if (!token && !refreshToken) {
        return next();
    }

    try {
        const publicKeyPath = path.join(__dirname, '../', process.env.JWT_PUBLIC_KEY_PATH || 'config/public.pem');
        if (!fs.existsSync(publicKeyPath)) {
            return next();
        }
        const publicKey = fs.readFileSync(publicKeyPath, 'utf8');

        // Check Access Token
        if (token) {
            try {
                await promisify(jwt.verify)(token, publicKey, { algorithms: ['RS256'] });
                // If token is valid, redirect to dashboard
                return res.redirect('/admin/dashboard');
            } catch (err) {
                // If access token is expired but refresh token exists, we could try to refresh,
                // but for a "guest" check, if the access token is invalid and we can't verify it,
                // we'll just fall back to checking if we should stay on the guest page or let auth.js handle it.
                // However, most reliable is to redirect if any valid session exists.
                if (err.name === 'TokenExpiredError' && refreshToken) {
                    // We'll assume they are "logged in" for the purpose of redirecting away from login page
                    // The dashboard route will handle the actual refresh via Auth middleware.
                    return res.redirect('/admin/dashboard');
                }
            }
        }

        next();
    } catch (err) {
        next();
    }
};

module.exports = redirectIfAuthenticated;
