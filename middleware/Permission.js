function permissions(requiredAction) {
  return function (req, res, next) {

    let segments = req.path.split('/').filter(Boolean);
    const menuSlug = segments[2]; // always segment 1
    const actions = req.user?.permissions?.[menuSlug] || [];

    const allowed = actions.includes(requiredAction);
    if (!allowed) {
      return res.status(403).render('v1/errors/403', {
        message: 'Page not found or access denied.',
        layout: false
      });
    }

    next();
  };
}

module.exports = permissions;
