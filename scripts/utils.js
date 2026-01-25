/**
 * Safely extracts hostname from a URL string.
 * @param {string} urlStr 
 * @returns {string} hostname or 'Unknown'
 */
export function getHostname(urlStr) {
    if (!urlStr) return 'Local Note';
    try {
        const url = new URL(urlStr);
        return url.hostname;
    } catch (e) {
        return 'Link';
    }
}
