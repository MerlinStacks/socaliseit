import { afterEach, describe, expect, it, vi } from 'vitest';
import { exchangeCodeForToken, getAuthorizationUrl } from '@/lib/platforms/oauth';

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());

describe('getAuthorizationUrl', () => {
    it('uses only core Pinterest scopes for account connection', () => {
        const url = getAuthorizationUrl(
            'pinterest',
            'https://social.overseek.com.au/api/accounts/callback/pinterest',
            'state-token',
            { clientId: 'client-id', clientSecret: 'client-secret' }
        );

        const params = new URL(url).searchParams;
        const scopes = params.get('scope')?.split(' ');

        expect(scopes).toEqual([
            'user_accounts:read',
            'boards:read',
            'boards:write',
            'pins:read',
            'pins:write',
        ]);
        expect(scopes).not.toContain('catalogs:read');
    });
});

describe('Threads long-lived connection', () => {
    const credentials = { clientId: 'client-id', clientSecret: 'secret+&' };
    const connect = () => exchangeCodeForToken('threads', 'code', 'https://example.com/callback', credentials);

    it('uses GET with encoded exchange parameters, returning the long-lived token', async () => {
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(Response.json({ access_token: 'short+&' }))
            .mockResolvedValueOnce(Response.json({ access_token: 'long', expires_in: 5184000 }));
        vi.stubGlobal('fetch', fetchMock);
        expect(await connect()).toEqual({ accessToken: 'long', expiresIn: 5184000 });
        const [url, options] = fetchMock.mock.calls[1];
        expect(url.origin + url.pathname).toBe('https://graph.threads.net/access_token');
        expect(Object.fromEntries(url.searchParams)).toEqual({ grant_type: 'th_exchange_token', client_secret: 'secret+&', access_token: 'short+&' });
        expect(options).toEqual({ method: 'GET' });
        expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    });

    it.each([
        Response.json({ error: { code: 100 } }, { status: 400 }),
        Response.json({}),
        Response.json({ access_token: 'bad' }, { status: 503 }),
    ])('does not silently connect with a one-hour token on exchange failure', async response => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce(Response.json({ access_token: 'short' }))
            .mockResolvedValueOnce(response));
        await expect(connect()).rejects.toThrow('long-lived Threads connection');
    });
});
