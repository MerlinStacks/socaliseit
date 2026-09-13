/** Public-network URL policy. Validation alone does NOT secure a later fetch.
 * Use fetchExternalUrl to pin the validated address at connection time.
 */
import dns from 'node:dns/promises';
import net from 'node:net';

function inRange(value: bigint, base: bigint, bits: number, width: number): boolean {
    return value >> BigInt(width - bits) === base >> BigInt(width - bits);
}

function ipv6Number(ip: string): bigint {
    const [left, right = ''] = ip.split('::');
    const a = left ? left.split(':') : [];
    const b = right ? right.split(':') : [];
    return [...a, ...Array(8 - a.length - b.length).fill('0'), ...b]
        .reduce((n, part) => (n << BigInt(16)) + BigInt(`0x${part}`), BigInt(0));
}

/** Conservative global-unicast policy; special-use/transition networks fail closed. */
export function isPublicIp(address: string): boolean {
    const family = net.isIP(address);
    if (family === 4) {
        const n = address.split('.').reduce((v, octet) => (v << BigInt(8)) + BigInt(octet), BigInt(0));
        const blocked: [string, number][] = [
            ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
            ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
            ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
            ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
            ['224.0.0.0', 4], ['240.0.0.0', 4],
        ];
        return !blocked.some(([base, bits]) => inRange(n,
            base.split('.').reduce((v, octet) => (v << BigInt(8)) + BigInt(octet), BigInt(0)), bits, 32));
    }
    // Reject scoped and embedded IPv4 addresses as well as non-global IPv6.
    if (family !== 6 || address.includes('%') || address.includes('.')) return false;
    const n = ipv6Number(address.toLowerCase());
    if (!inRange(n, ipv6Number('2000::'), 3, 128)) return false;
    return !([
        ['2001::', 23], // protocol assignments: Teredo, benchmarking, ORCHID, etc.
        ['2001:db8::', 32], ['2002::', 16], // documentation and 6to4
        ['3fff::', 20], // documentation
    ] as [string, number][]).some(([base, bits]) => inRange(n, ipv6Number(base), bits, 128));
}

export function parseExternalUrl(value: string): URL {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed');
    if (url.username || url.password) throw new Error('URLs with credentials are not allowed');
    const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    if (host === 'localhost' || /\.(localhost|local|internal)$/.test(host) || !host.includes('.') && !net.isIP(host)) {
        throw new Error('Internal service hostnames are not allowed');
    }
    if (net.isIP(host) && !isPublicIp(host)) throw new Error('Nonpublic IP addresses are not allowed');
    url.hash = '';
    return url;
}

/** Returns only vetted addresses, used directly by the transport (never re-resolved). */
export async function resolveExternalUrl(value: string): Promise<{ url: URL; address: string; family: number }> {
    const url = parseExternalUrl(value);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const family = net.isIP(hostname);
    const addresses = family ? [{ address: hostname, family }] : await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => !isPublicIp(address))) {
        throw new Error('URL resolves to a nonpublic IP address or has no addresses');
    }
    return { url, ...addresses[0] };
}

/** Compatibility/preflight API only. Does not prevent DNS rebinding in a subsequent ordinary fetch. */
export async function validateExternalUrl(value: string): Promise<{ valid: true; url: URL } | { valid: false; reason: string }> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const result = await Promise.race([
            resolveExternalUrl(value),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('DNS validation timed out')), 5000); }),
        ]);
        return { valid: true, url: result.url };
    } catch (error) {
        return { valid: false, reason: error instanceof Error ? error.message : 'URL validation failed' };
    } finally {
        clearTimeout(timer);
    }
}
