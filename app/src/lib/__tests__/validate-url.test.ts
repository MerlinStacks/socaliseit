// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import dns from 'node:dns/promises';
import { isPublicIp, parseExternalUrl, resolveExternalUrl, validateExternalUrl } from '../validate-url';

afterEach(() => vi.restoreAllMocks());

describe('public IP policy', () => {
    it.each([
        '0.1.2.3', '10.0.0.1', '127.255.255.255', '169.254.169.254', '172.31.0.1',
        '192.168.1.1', '100.100.100.200', '192.0.0.9', '192.0.2.1', '192.88.99.1',
        '198.18.0.1', '198.19.255.255', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
        '::', '0:0:0:0:0:0:0:1', '::ffff:7f00:1', '::ffff:8.8.8.8', '::127.0.0.1',
        'fc00::1', 'fdff::1', 'fe80::1', 'febf::1', 'fec0::1', 'ff02::1', '100::1',
        '64:ff9b::a00:1', '64:ff9b:1::1', '2001::1', '2001:2::1', '2001:20::1',
        '2001:db8::1', '2002:7f00:1::1', '3fff::1', 'fe80::1%eth0', 'not-an-ip',
    ])('rejects %s', (ip) => expect(isPublicIp(ip)).toBe(false));
    it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '2001:4860:4860::8888'])
        ('allows %s', (ip) => expect(isPublicIp(ip)).toBe(true));
});

describe('URL validation', () => {
    it.each(['http://2130706433', 'http://0x7f000001', 'http://0177.0.0.1', 'http://127.1',
        'http://[::ffff:127.0.0.1]', 'http://localhost.', 'http://foo.localhost', 'http://redis',
        'file:///etc/passwd', 'ftp://example.com', 'https://user:pass@example.com'])
        ('rejects encoded/internal URL %s', (url) => expect(() => parseExternalUrl(url)).toThrow());
    it('fails closed on empty DNS results and resolver failure', async () => {
        const lookup = vi.spyOn(dns, 'lookup').mockResolvedValue([] as never);
        expect((await validateExternalUrl('https://example.com')).valid).toBe(false);
        lookup.mockRejectedValue(new Error('ENOTFOUND'));
        expect((await validateExternalUrl('https://example.com')).valid).toBe(false);
    });
    it('rejects mixed public/private answers of either family', async () => {
        vi.spyOn(dns, 'lookup').mockResolvedValue([
            { address: '8.8.8.8', family: 4 }, { address: '::1', family: 6 },
        ] as never);
        await expect(resolveExternalUrl('https://example.com')).rejects.toThrow('nonpublic');
    });
    it('does not resolve public IP literals', async () => {
        const lookup = vi.spyOn(dns, 'lookup');
        expect((await resolveExternalUrl('https://[2606:4700::1111]')).family).toBe(6);
        expect(lookup).not.toHaveBeenCalled();
    });
});
