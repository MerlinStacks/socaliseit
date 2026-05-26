import { describe, expect, it } from 'vitest';

import { getUserFriendlyError } from '@/lib/error-messages';

describe('getUserFriendlyError', () => {
    it('does not treat generic Meta Authorization Error as expired connection', () => {
        const result = getUserFriendlyError(new Error('Authorization Error'));

        expect(result.category).toBe('platform');
        expect(result.message).toBe('Instagram rejected this publish request');
    });

    it('still treats explicit token errors as auth failures', () => {
        const result = getUserFriendlyError(new Error('Invalid OAuth access token'));

        expect(result.category).toBe('auth');
        expect(result.message).toBe('Your account connection has expired');
    });
});
