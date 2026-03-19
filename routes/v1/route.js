const express = require('express');
const router = express.Router();
const ctr = require('../../controller/v1');
const Auth = require('../../middleware/auth');
const redirectIfAuthenticated = require('../../middleware/redirectIfAuthenticated');
const permissions = require('../../middleware/Permission');


// Public auth pages
router.get('/', redirectIfAuthenticated, (req, res) => {
    res.render('v1/auth/login', { layout: false });
});


router.get('/select-role', redirectIfAuthenticated, (req, res) => {
    res.render('v1/auth/role.hbs', { layout: false });
})
router.get('/forget', redirectIfAuthenticated, (req, res) => {
    res.render('v1/auth/forget.hbs', { layout: false });
})
router.get('/contact', redirectIfAuthenticated, (req, res) => {
    res.render('v1/auth/contact.hbs', { layout: false });
})
// Removed: /set-session (No longer needed with Nginx architecture)

router.use(Auth);
router.get('/logout', (req, res) => {
    res.clearCookie('admin_auth_token', { path: '/' });
    res.clearCookie('admin_auth_expiry', { path: '/' });
    res.clearCookie('admin_auth_server_time', { path: '/' });
    res.clearCookie('admin_refresh_token', { path: '/' });
    res.redirect('/');
});
router.get('/favicon.ico', (req, res) => res.status(204).end());
router.get('/admin/dashboard', ctr.Dashboard.dashboard);
router.get('/admin/:category', ctr.Dashboard.categoryMenu);
router.get('/admin/:category/:menu/create', permissions('create'), ctr.Dashboard.create);
router.get('/admin/:category/:menu', permissions('read'), ctr.Dashboard.menu);
router.get('/admin/:category/:menu/:id', permissions('update'), ctr.Dashboard.edit);
module.exports = router
