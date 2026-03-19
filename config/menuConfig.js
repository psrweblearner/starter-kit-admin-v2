const api = require('../routers/API');
const views = require('../routers/VIEW');
module.exports = {
    'admin-users': { api: api.admin, view: views.admin },
    'roles': { api: api.roles, view: views.roles },
    'file-manager': { view: views.fileManager, layout: "v1/layouts/fileManager" },
    'feature': { api: api.feature, view: views.feature },
    'module': { api: api.menu, view: views.menu },
    'leads': { api: api.leads, layout: "v1/layouts/crm" },
    'cache-config': { api: api.cache },
    'ip-whitelisting': { api: api.apiClient },
    'settings': { api: api.settings, view: views.settings },
    'categories': { api: api.categories, view: views.categories },
    'tags': { api: api.tags, view: views.tags },
    'blogs': { api: api.blogs, view: views.blogs },
    'gallery': { api: api.gallery, view: views.gallery },
    'faq': { api: api.faq, view: views.faq },
    'city': { api: api.city, view: views.city },
    'developer': { api: api.developer, view: views.developer },
    'property-type': { api: api.propertyType, view: views.propertyType },
    'amenities': { api: api.amenities, view: views.amenities },
}
