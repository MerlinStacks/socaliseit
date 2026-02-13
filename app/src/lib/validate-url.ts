/**
 * URL Validator for SSRF Protection
 * Prevents server-side requests to internal/private networks.
 *
 * Why: Several API routes fetch user-supplied URLs server-side (video transcribe,
 * scene-detect, media import). Without validation, attackers can probe internal
 * services (Redis, DB), cloud metadata endpoints (169.254.169.254), or localhost.
 */

import { logger } from '@/lib/logger';
import dns from 'dns/promises';
import net from 'net';

/**
 * Validate that a URL is safe for server-side fetching.
 * Rejects private IPs, loopback, link-local, non-HTTP(S) schemes,
 * IPv6 private ranges, hex/octal-encoded IPs, and DNS rebinding.
 */
export async function validateExternalUrl(url: string): Promise<{ valid: true; url: URL } | { valid: false; reason: string }> {
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

    // Block credentials in URLs (potential SSRF amplifier)
    if (parsed.username || parsed.password) {
        return { valid: false, reason: 'URLs with credentials are not allowed' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost variants (including bracketed IPv6)
    if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '[::1]' ||
        hostname === '::1' ||
        hostname === '0.0.0.0' ||
        hostname === '[::ffff:127.0.0.1]' ||
        hostname.endsWith('.localhost')
    ) {
        return { valid: false, reason: 'Localhost URLs are not allowed' };
    }

    // Block cloud metadata endpoints (AWS, GCP, Azure, DigitalOcean)
    const blockedMetadataHosts = [
        '169.254.169.254',       // AWS/GCP/DigitalOcean
        '[fd00:ec2::254]',       // AWS IMDSv2 IPv6
        'metadata.google.internal',
        'metadata.internal',
        '100.100.100.200',       // Alibaba Cloud
    ];
    if (blockedMetadataHosts.includes(hostname)) {
        return { valid: false, reason: 'Cloud metadata endpoints are not allowed' };
    }

    // Check if hostname is an IP address — block private/internal ranges
    const ipCheck = checkIpAddress(hostname);
    if (ipCheck) {
        return { valid: false, reason: ipCheck };
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
        /\.svc\.cluster\.local$/i, // Kubernetes service discovery
    ];

    for (const pattern of blockedPatterns) {
        if (pattern.test(hostname)) {
            return { valid: false, reason: 'Internal service hostnames are not allowed' };
        }
    }

    // DNS resolution check — catches DNS rebinding attacks
    // Why: An attacker can register a domain that alternates between a public
    // IP (passes validation) and a private IP (actual fetch targets internal).
    // Resolving the hostname and checking the resolved IP closes this gap.
    try {
        const resolved = await dns.resolve4(hostname).catch(() => []);
        const resolved6 = await dns.resolve6(hostname).catch(() => []);
        const allIps = [...resolved, ...resolved6];

        for (const ip of allIps) {
            if (isPrivateIp(ip)) {
                logger.warn({ hostname, ip }, 'DNS rebinding attempt detected — resolved to private IP');
                return { valid: false, reason: 'URL resolves to a private/internal IP address' };
            }
        }
    } catch {
        // DNS resolution failures for non-IP hostnames are acceptable
        // (the actual fetch will fail later with a meaningful error)
    }

    return { valid: true, url: parsed };
}

/**
 * Check if a hostname is a private/internal IP address.
 * Handles IPv4 in standard, hex, octal, and decimal notation.
 *
 * Why: Attackers bypass naive regex checks using encoded IP forms:
 *   - Hex: 0x7f000001 = 127.0.0.1
 *   - Octal: 0177.0.0.1 = 127.0.0.1
 *   - Decimal: 2130706433 = 127.0.0.1
 *
 * @returns Error reason string if blocked, null if OK
 */
function checkIpAddress(hostname: string): string | null {
    // Strip brackets for IPv6
    const cleanHost = hostname.startsWith('[') && hostname.endsWith(']')
        ? hostname.slice(1, -1)
        : hostname;

    // Check if it's a valid IP address (handles IPv4 and IPv6)
    if (net.isIP(cleanHost)) {
        if (isPrivateIp(cleanHost)) {
            return 'Private/internal IP addresses are not allowed';
        }
        return null;
    }

    // Check for encoded IPv4 variants (hex, octal, decimal integer)
    // Why: `net.isIP` doesn't recognize these, but HTTP clients resolve them
    const hexIpMatch = hostname.match(/^0x([0-9a-f]+)$/i);
    if (hexIpMatch) {
        const num = parseInt(hexIpMatch[1], 16);
        if (isPrivateIpNumeric(num)) {
            return 'Encoded IP addresses are not allowed';
        }
    }

    const decimalMatch = hostname.match(/^(\d+)$/);
    if (decimalMatch) {
        const num = parseInt(decimalMatch[1], 10);
        if (isPrivateIpNumeric(num)) {
            return 'Encoded IP addresses are not allowed';
        }
    }

    // Check for octal-notation IPv4 (e.g., 0177.0.0.01)
    const octalMatch = hostname.match(/^(0\d+)\.(0?\d+)\.(0?\d+)\.(0?\d+)$/);
    if (octalMatch) {
        const parts = octalMatch.slice(1).map(p => parseInt(p, 8));
        const num = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
        if (isPrivateIpNumeric(num >>> 0)) {
            return 'Encoded IP addresses are not allowed';
        }
    }

    return null;
}

/**
 * Check if an IP (v4 or v6) resolves to a private/internal range.
 */
function isPrivateIp(ip: string): boolean {
    // IPv4 check
    const ipv4Match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
        const [, a, b] = ipv4Match.map(Number);
        return (
            a === 10 ||                        // 10.0.0.0/8
            (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
            (a === 192 && b === 168) ||        // 192.168.0.0/16
            a === 0 ||                         // 0.0.0.0/8
            a === 127 ||                       // 127.0.0.0/8 (loopback)
            (a === 169 && b === 254) ||        // 169.254.0.0/16 (link-local)
            (a === 100 && b >= 64 && b <= 127) // 100.64.0.0/10 (CGNAT)
        );
    }

    // IPv6 check
    const lowerIp = ip.toLowerCase();
    return (
        lowerIp === '::1' ||                   // Loopback
        lowerIp.startsWith('fc') ||            // Unique local (fc00::/7)
        lowerIp.startsWith('fd') ||            // Unique local (fd00::/8)
        lowerIp.startsWith('fe80') ||          // Link-local (fe80::/10)
        lowerIp.startsWith('::ffff:') ||       // IPv4-mapped IPv6
        lowerIp === '::' ||                    // Unspecified
        lowerIp.startsWith('100::')            // Discard prefix (100::/64)
    );
}

/**
 * Check if a 32-bit numeric IP value falls in a private range.
 */
function isPrivateIpNumeric(num: number): boolean {
    const a = (num >>> 24) & 0xff;
    const b = (num >>> 16) & 0xff;
    return (
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a === 0 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 100 && b >= 64 && b <= 127)
    );
}
