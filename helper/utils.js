/**
 * ===================================================
 * Utility Functions for Backend and Frontend
 * ===================================================
 *
 * This module provides commonly used utility functions for API requests, string manipulation,
 * unique identifier generation, and rich-text editor content parsing. These utilities can be
 * used across multiple modules to simplify repetitive tasks and ensure consistency.
 */

/**
 * ===================================================
 * FetchData Function
 * ===================================================
 *
 * This asynchronous function is a wrapper around the Fetch API that simplifies sending HTTP requests
 * to backend endpoints. It handles query parameters, authentication via cookies, and JSON response parsing.
 *
 * Parameters:
 * - url (string): The endpoint URL to request.
 * - options (object): Optional query parameters or additional fetch options.
 * - req (object | null): The server-side request object to access cookies for authentication.
 * - authRequired (boolean): Determines if authentication cookies should be included.
 *
 * Functionality:
 * - Builds a query string from the options object for GET-style requests.
 * - Includes cookies in requests if authentication is required.
 * - Parses the response as JSON and returns the `data` field if `status` is true.
 * - Handles errors gracefully, returning null on failure.
 *
 * Returns:
 * - Parsed JSON data if successful, or null if an error occurs.
 */
const FetchData = async (url, options = {}, req = null, authRequired = false) => {
    try {
        let apiUrl = url;

        let fetchOptions = {
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "credentials": 'include',
            },
        };

        if (authRequired) {
            fetchOptions.credentials = "include";
            const token = req?.cookies?.admin_auth_token;
            if (token) {
                // Important: Ensure we don't overwrite existing Cookie if any
                fetchOptions.headers["Cookie"] = `admin_auth_token=${token}`;
            }

            // Forward client identity headers for consistent fingerprinting at API
            const clientIp = req.headers?.['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || '';
            fetchOptions.headers['X-Forwarded-For'] = clientIp;

            if (req?.headers?.['user-agent']) {
                fetchOptions.headers['User-Agent'] = req.headers['user-agent'];
            }
            if (req?.headers?.['cf-connecting-ip']) {
                fetchOptions.headers['CF-Connecting-IP'] = req.headers['cf-connecting-ip'];
            }

            if (process.env.INTERNAL_SECRET) {
                fetchOptions.headers['X-Internal-Secret'] = process.env.INTERNAL_SECRET.trim();
            }
        }

        const queryParams = Object.entries(options)
            .filter(([key, value]) => value !== undefined && value !== null && value !== "")
            .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
            .join("&");

        apiUrl = queryParams ? `${url}?${queryParams}` : url;

        const response = await fetch(apiUrl, fetchOptions);
        const text = await response.text();

        try {
            const data = JSON.parse(text);
            // Handle both 'success' (new) and 'status' (legacy) flags
            if (data.success === true || data.status === true) {
                return data.data;
            } else {
                console.error("API Error Response:", data);
                return null;
            }
        } catch (err) {
            console.error("Invalid JSON Response from API:", text.substring(0, 100));
            return null;
        }
    } catch (error) {
        console.error("Fetch API Error:", error.message);
        return null;
    }
};

/**
 * ===================================================
 * Slugify Function
 * ===================================================
 *
 * Converts a string (usually a title) into a URL-friendly slug.
 * 
 * Functionality:
 * - Converts all characters to lowercase.
 * - Removes special characters and punctuation.
 * - Replaces spaces with hyphens.
 * - Collapses multiple consecutive hyphens into one.
 *
 * Returns:
 * - A clean, URL-friendly string suitable for slugs or identifiers.
 *
 * Example:
 *   slugify("Hello World! 2025") -> "hello-world-2025"
 */
const slugify = (title) => {
    let slug = title.toLowerCase();
    slug = slug.replace(/\`|\~|\!|\@|\#|\||\$|\%|\^|\&|\*|\(|\)|\+|\=|\,|\.|\/|\?|\>|\<|\'|\"|\:|\;|_/gi, '');
    slug = slug.replace(/ /gi, "-");
    slug = slug.replace(/\-\-+/g, '-');
    return slug;
};

/**
 * ===================================================
 * uniqueId Function
 * ===================================================
 *
 * Generates a random alphanumeric unique identifier string with a default prefix "SK-".
 *
 * Parameters:
 * - length (number): The length of the random portion of the identifier. Default is 6.
 *
 * Returns:
 * - A string in the format "SK-XXXXXX" where X are random alphanumeric characters.
 *
 * Example:
 *   uniqueId(8) -> "SK-A1b2C3d4"
 */
const uniqueId = (length = 6) => {
    let result = '';
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return "SK-" + result;
};

/**
 * ===================================================
 * editorDesc Function
 * ===================================================
 *
 * Converts rich-text editor JSON data into HTML. Supports multiple block types
 * commonly used in editors such as headers, paragraphs, lists, images, videos, tables, links, quotes, checklists, and code blocks.
 *
 * Parameters:
 * - editorData (object): JSON object containing blocks of content from an editor.
 *
 * Functionality:
 * - Iterates through each block and converts it to its corresponding HTML representation.
 * - Handles special cases for embedded media such as YouTube videos.
 * - Generates semantic HTML for headings, paragraphs, lists, and tables.
 * - Returns a concatenated HTML string representing the full editor content.
 *
 * Returns:
 * - A string containing valid HTML representing the editor content.
 *
 * Example:
 *   editorDesc(editorData) -> "<h2>Title</h2><p>Paragraph content</p>"
 */
const editorDesc = (editorData) => {
    if (!editorData || !editorData.blocks) return '';

    return editorData.blocks.map(block => {
        const data = block.data || {};

        switch (block.type) {
            case 'header':
                const level = Math.min(Math.max(data.level || 1, 1), 6);
                return `<h${level}>${data.text}</h${level}>`;

            case 'paragraph':
                return `<p>${data.text || ''}</p>`;

            case 'list':
                const tag = data.style === 'ordered' ? 'ol' : 'ul';
                const items = (data.items || []).map(i => `<li>${i}</li>`).join('');
                return `<${tag}>${items}</${tag}>`;

            case 'image':
                const url = data.file?.file || data.file || '';
                const caption = data.caption || '';
                return `<figure><img width="200" height="auto" src="${url}" alt="${caption}"><figcaption>${caption}</figcaption></figure>`;

            case 'video':
                let embed = '';
                if (data.url?.includes('youtube.com') || data.url?.includes('youtu.be')) {
                    const videoId = data.url.split('v=')[1] || data.url.split('/').pop();
                    embed = `<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>`;
                } else {
                    embed = `<video controls src="${data.url}"></video>`;
                }
                return `<div class="editor-video">${embed}</div>`;

            case 'table':
                const rows = (data.content || []).map(row =>
                    `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('');
                return `<table>${rows}</table>`;

            case 'link':
                return `<a href="${data.link}" target="_blank" rel="noopener">${data.text || data.link}</a>`;

            case 'quote':
                return `<blockquote>${data.text || ''}<cite>${data.caption || ''}</cite></blockquote>`;

            case 'checklist':
                const checklistItems = (data.items || []).map(item =>
                    `<li${item.checked ? ' class="checked"' : ''}>${item.text}</li>`).join('');
                return `<ul class="checklist">${checklistItems}</ul>`;

            case 'code':
                return `<pre><code>${data.code || ''}</code></pre>`;

            default:
                return '';
        }
    }).join('\n');
};

module.exports = { FetchData, slugify, uniqueId, editorDesc };
