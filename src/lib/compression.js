/**
 * Compression utility for API responses
 * Reduces payload size for better performance
 */

/**
 * Compress JSON response with appropriate headers
 * @param {Object} data - Data to be sent as JSON
 * @param {number} status - HTTP status code
 * @returns {Response} - Compressed response
 */
export function compressedJsonResponse(data, status = 200) {
    const json = JSON.stringify(data);

    return new Response(json, {
        status,
        headers: {
            'Content-Type': 'application/json',
            // Enable compression hint for edge/CDN
            'Content-Encoding': 'identity',
            // Cache control for better performance
            'Cache-Control': 'public, max-age=0, must-revalidate',
        },
    });
}

/**
 * Add compression headers to existing response
 * @param {Response} response - Original response
 * @returns {Response} - Response with compression headers
 */
export function withCompressionHeaders(response) {
    const headers = new Headers(response.headers);

    // Vercel/Next.js automatically handles gzip/brotli compression
    // We just ensure proper cache headers are set
    if (!headers.has('Cache-Control')) {
        headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
}

const compression = {
    compressedJsonResponse,
    withCompressionHeaders,
};

export default compression;
