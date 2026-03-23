const API_URLS = require("../config/apiConfig");
module.exports = {
    admin: { edit: [{ name: '', url: (id) => `${API_URLS.ADMIN_SLUG(id)}` }] },
    roles: { edit: [{ name: '', url: (id) => `${API_URLS.ROLES_SLUG(id)}` }] },
    feature: { edit: [{ name: '', url: (id) => `${API_URLS.FEATURE_SLUG(id)}` }] },
    menu: { edit: [{ name: '', url: (id) => `${API_URLS.MENU_SLUG(id)}` }] },
    settings: { edit: [{ name: '', url: (id) => `${API_URLS.SETTINGS_SLUG(id)}` }] },
    cache: {
        list: [{ name: 'scopeStatus', url: API_URLS.CACHE_CONFIG }],
        edit: [{ name: '', url: (id) => `${API_URLS.CACHE_CONFIG}/${id}` }]
    },
    apiClient: {
        list: [{ name: '', url: API_URLS.API_CLIENT }],
        edit: [{ name: '', url: (id) => `${API_URLS.API_CLIENT_SLUG(id)}` }]
    },
    categories: {
        edit: [{ name: '', url: (id) => `${API_URLS.CATEGORIES_SLUG(id)}` }]
    },
    tags: {
        edit: [{ name: '', url: (id) => `${API_URLS.TAGS_SLUG(id)}` }]
    },
    blogs: {
        edit: [{ name: '', url: (id) => `${API_URLS.BLOGS_SLUG(id)}` }]
    },
    gallery: {
        edit: [{ name: '', url: (id) => `${API_URLS.GALLERY_SLUG(id)}` }]
    },
    faq: {
        edit: [{ name: '', url: (id) => `${API_URLS.FAQ_SLUG(id)}` }]
    },
    city: {
        edit: [{ name: '', url: (id) => `${API_URLS.CITY_SLUG(id)}` }]
    },
    developer: {
        edit: [{ name: '', url: (id) => `${API_URLS.DEVELOPER_SLUG(id)}` }]
    },
    propertyType: {
        edit: [{ name: '', url: (id) => `${API_URLS.PROPERTY_TYPE_SLUG(id)}` }]
    },
    amenities: {
        edit: [{ name: '', url: (id) => `${API_URLS.AMENITIES_SLUG(id)}` }]
    },
    emailTemplate: {
        edit: [{ name: '', url: (id) => `${API_URLS.EMAIL_TEMPLATE_SLUG(id)}` }]
    },
};
