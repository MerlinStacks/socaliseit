/**
 * Security Headers Utility
 * Generates comprehensive HTTP security headers following OWASP recommendations.
 * 
 * Why: These headers protect against common web vulnerabilities:
 * - CSP prevents XSS and data injection attacks
 * - HSTS enforces HTTPS connections
 * - X-Frame-Options prevents clickjacking
 * - X-Content-Type-Options prevents MIME sniffing
 */

/** Security header configuration */
interface SecurityHeadersConfig {
    /** Enable strict CSP (may break inline scripts) */
    strictCSP?: boolean;
    /** Allow framing from specific origins (empty = deny all) */
    frameAncestors?: string[];
    /** Additional CSP directives to merge */
    additionalCSP?: Record<string, string>;
}

/**
 * Generates Content-Security-Policy header value.
 * Balances security with functionality for a modern Next.js app.
 */
function generateCSP(config: SecurityHeadersConfig): string {
    const directives: Record<string, string> = {
        'default-src': "'self'",
        'script-src': config.strictCSP
            ? "'self'"
            : "'self' 'unsafe-inline' 'unsafe-eval'", // Required for Next.js dev
        'style-src': "'self' 'unsafe-inline' https://fonts.googleapis.com",
        'font-src': "'self' https://fonts.gstatic.com",
        'img-src': "'self' data: blob: https:",
        'media-src': "'self' blob: https:",
        'connect-src': "'self' https:",
        'frame-ancestors': config.frameAncestors?.length
            ? config.frameAncestors.join(' ')
            : "'none'",
        'base-uri': "'self'",
        'form-action': "'self'",
        'upgrade-insecure-requests': '',
        ...config.additionalCSP,
    };

    return Object.entries(directives)
        .map(([key, value]) => (value ? `${key} ${value}` : key))
        .join('; ');
}

/**
 * Generates all security headers for use in Next.js config or middleware.
 * 
 * @param config - Optional configuration to customize header behavior
 * @returns Array of header objects for Next.js headers() config
 */
export function getSecurityHeaders(config: SecurityHeadersConfig = {}): Array<{
    key: string;
    value: string;
}> {
    const isProduction = process.env.NODE_ENV === 'production';

    return [
        // Prevent XSS attacks via Content-Security-Policy
        {
            key: 'Content-Security-Policy',
            value: generateCSP({ ...config, strictCSP: isProduction && config.strictCSP }),
        },
        // Force HTTPS for 1 year (only in production)
        ...(isProduction
            ? [
                {
                    key: 'Strict-Transport-Security',
                    value: 'max-age=31536000; includeSubDomains; preload',
                },
            ]
            : []),
        // Prevent clickjacking
        {
            key: 'X-Frame-Options',
            value: 'DENY',
        },
        // Prevent MIME type sniffing
        {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
        },
        // Control referrer information
        {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
        },
        // Restrict browser features
        {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
        },
        // Prevent loading in Adobe products
        {
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none',
        },
    ];
}

/**
 * Formats security headers for middleware Response.
 * 
 * @param config - Optional configuration
 * @returns Record suitable for new Headers() or Response headers
 */
export function getSecurityHeadersRecord(
    config: SecurityHeadersConfig = {}
): Record<string, string> {
    const headers = getSecurityHeaders(config);
    return Object.fromEntries(headers.map((h) => [h.key, h.value]));
}
