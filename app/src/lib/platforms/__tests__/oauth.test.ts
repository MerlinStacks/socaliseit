import { describe, expect, it } from 'vitest';
import { getAuthorizationUrl } from '@/lib/platforms/oauth';

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
