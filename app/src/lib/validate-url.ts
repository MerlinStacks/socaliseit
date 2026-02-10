/**
 * URL Validator for SSRF Protection
 * Prevents server-side requests to internal/private networks.
 *
 * Why: Several API routes fetch user-supplied URLs server-side (video transcribe,
 * scene-detect, media import). Without validation, attackers can probe internal
 * services (Redis, DB), cloud metadata endpoints (169.254.169.254), or localhost.
 */

/**
 * Validate that a URL is safe for server-side fetching.
 * Rejects private IPs, loopback, link-local, and non-HTTP(S) schemes.
 */
export function validateExternalUrl(url: string): { valid: true; url: URL } | { valid: false; reason: string } {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return { valid: false, reason: 'Invalid URL format' };
    }

    // Only allow HTTP(S)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { valid: false, reason: `Unsupported protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants
    if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '0.0.0.0' ||
        hostname.endsWith('.localhost')
    ) {
        return { valid: false, reason: 'Localhost URLs are not allowed' };
    }

    // Block cloud metadata endpoints
    if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
        return { valid: false, reason: 'Cloud metadata endpoints are not allowed' };
    }

    // Block private/internal IP ranges
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
        const [, a, b] = ipv4Match.map(Number);
        if (
            a === 10 ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            a === 0 ||
            a === 127 ||
            (a === 169 && b === 254) // Link-local
        ) {
            return { valid: false, reason: 'Private/internal IP addresses are not allowed' };
        }
    }

    // Block common internal hostnames
    const blockedPatterns = [
        /^redis/i,
        /^postgres/i,
        /^mysql/i,
        /^mongo/i,
        /^elasticsearch/i,
        /^internal\./i,
        /\.internal$/i,
        /\.local$/i,
    ];

    for (const pattern of blockedPatterns) {
        if (pattern.test(hostname)) {
            return { valid: false, reason: 'Internal service hostnames are not allowed' };
        }
    }

    return { valid: true, url: parsed };
}
