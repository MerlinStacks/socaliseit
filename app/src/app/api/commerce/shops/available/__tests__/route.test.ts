// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), accounts: vi.fn(), catalogs: vi.fn(), decrypt: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ db: { socialAccount: { findMany: mocks.accounts } } }));
vi.mock('@/lib/api/meta-commerce', () => ({ fetchMetaCatalogs: mocks.catalogs }));
vi.mock('@/lib/token-encryption', () => ({ decryptToken: mocks.decrypt }));
vi.mock('@/lib/logger', () => ({ createRouteLogger: () => ({ error: vi.fn() }) }));
import { GET } from '../route';

const request = (platform = 'FACEBOOK') => new NextRequest(`http://localhost/api/commerce/shops/available?platform=${platform}`);
const shop = { id: 'catalog', name: 'Shop' };

beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { currentOrganizationId: 'org' } });
    mocks.accounts.mockResolvedValue([
        { platform: 'FACEBOOK', platformId: 'fb', accessToken: 'enc:fb' },
        { platform: 'INSTAGRAM', platformId: 'ig', accessToken: 'enc:ig' },
    ]);
    mocks.decrypt.mockImplementation(token => token.replace('enc:', ''));
    mocks.catalogs.mockResolvedValue([]);
});

describe('available shops route', () => {
    it('requires authentication before reading accounts', async () => {
        mocks.auth.mockResolvedValue(null);
        expect((await GET(request())).status).toBe(401);
        expect(mocks.accounts).not.toHaveBeenCalled();
    });

    it('checks all active Meta accounts in the current workspace, decrypting tokens', async () => {
        mocks.catalogs.mockImplementation(async token => token === 'ig' ? [shop] : []);
        const response = await GET(request());
        expect(await response.json()).toEqual({ shops: [shop] });
        expect(mocks.accounts).toHaveBeenCalledWith(expect.objectContaining({ where: {
            organizationId: 'org', platform: { in: ['INSTAGRAM', 'FACEBOOK'] }, isActive: true,
        } }));
        expect(mocks.catalogs).toHaveBeenCalledWith('ig', { platform: 'INSTAGRAM', platformId: 'ig' });
    });

    it('preserves discovered catalogs when another account fails and deduplicates them', async () => {
        mocks.catalogs.mockResolvedValue([shop]);
        expect(await (await GET(request('INSTAGRAM'))).json()).toEqual({ shops: [shop] });
        mocks.catalogs.mockRejectedValueOnce(new Error('Permission denied'));
        expect(await (await GET(request())).json()).toEqual({ shops: [shop] });
    });

    it('reports access failures rather than returning a successful empty list', async () => {
        mocks.catalogs.mockRejectedValue(new Error('Permission denied'));
        const response = await GET(request());
        expect(response.status).toBe(502);
        expect((await response.json()).error).toContain('Reconnect');
    });

    it('rejects unsupported platforms', async () => {
        expect((await GET(request('TIKTOK'))).status).toBe(400);
        expect(mocks.accounts).not.toHaveBeenCalled();
    });

    it('only queries Instagram accounts for Instagram tagging catalogs', async () => {
        mocks.accounts.mockResolvedValue([{ platform: 'INSTAGRAM', platformId: 'ig', accessToken: 'enc:ig' }]);
        await GET(request('INSTAGRAM'));
        expect(mocks.accounts).toHaveBeenCalledWith(expect.objectContaining({ where: {
            organizationId: 'org', platform: { in: ['INSTAGRAM'] }, isActive: true,
        } }));
        expect(mocks.catalogs).toHaveBeenCalledTimes(1);
        expect(mocks.catalogs).toHaveBeenCalledWith('ig', { platform: 'INSTAGRAM', platformId: 'ig' });
    });

    it('reports when no Meta accounts are connected', async () => {
        mocks.accounts.mockResolvedValue([]);
        expect((await GET(request())).status).toBe(400);
    });
});
