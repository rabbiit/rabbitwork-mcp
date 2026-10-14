// Small HTTP helpers shared by the MCP handler and the OAuth routes.

export function normalizeHeaders(headers) {
    const normalized = {};
    for (const [name, value] of Object.entries(headers || {})) {
        normalized[name.toLowerCase()] = Array.isArray(value) ? value[0] : value;
    }
    return normalized;
}

export function jsonResponse(statusCode, body, headers = {}) {
    return {
        statusCode,
        headers: {'content-type': 'application/json', ...headers},
        body: typeof body === 'string' ? body : JSON.stringify(body),
    };
}

export function isLoopbackHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1';
}
