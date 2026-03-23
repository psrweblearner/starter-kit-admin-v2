const API_BASE_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:5000/v1' : 'https://api.aeonianit.in/v1';

const API_URLS = {
    ADMIN_SLUG: (slug) => `${API_BASE_URL}/admin/${slug}`,
    ROLES: `${API_BASE_URL}/roles`,
    ROLES_SLUG: (slug) => `${API_BASE_URL}/roles/${slug}`,
    SUB_MENU: `${API_BASE_URL}/menu`,
    CACHE_CONFIG: `${API_BASE_URL}/cache-config`,
    CACHE_SCOPE_STATUS: `${API_BASE_URL}/cache-config/scope-status`,
    API_CLIENT: `${API_BASE_URL}/api-client`,
    API_CLIENT_SLUG: (slug) => `${API_BASE_URL}/api-client/${slug}`,
    FEATURE_SLUG: (slug) => `${API_BASE_URL}/sub-menu/${slug}`,
    MENU_SLUG: (slug) => `${API_BASE_URL}/menu/${slug}`,
    SETTINGS_SLUG: (slug) => `${API_BASE_URL}/settings/${slug}`,
    CATEGORIES_SLUG: (slug) => `${API_BASE_URL}/categories/${slug}`,
    TAGS_SLUG: (slug) => `${API_BASE_URL}/tags/${slug}`,
    BLOGS_SLUG: (slug) => `${API_BASE_URL}/blogs/${slug}`,
    GALLERY_SLUG: (slug) => `${API_BASE_URL}/gallery/${slug}`,
    FAQ_SLUG: (slug) => `${API_BASE_URL}/faq/${slug}`,
    CITY_SLUG: (slug) => `${API_BASE_URL}/city/${slug}`,
    DEVELOPER_SLUG: (slug) => `${API_BASE_URL}/developer/${slug}`,
    PROPERTY_TYPE_SLUG: (slug) => `${API_BASE_URL}/property-type/${slug}`,
    AMENITIES_SLUG: (slug) => `${API_BASE_URL}/amenities/${slug}`,
    EMAIL_TEMPLATE: `${API_BASE_URL}/email-template`,
    EMAIL_TEMPLATE_SLUG: (slug) => `${API_BASE_URL}/email-template/${slug}`,
};

module.exports = API_URLS;
