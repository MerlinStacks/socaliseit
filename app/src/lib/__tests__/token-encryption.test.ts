import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decryptToken, encryptToken } from '../token-encryption';

describe('token encryption', () => {
    const originalKey = process.env.ENCRYPTION_KEY;

    beforeEach(() => {
        process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
    });

    afterEach(() => {
        process.env.ENCRYPTION_KEY = originalKey;
    });

    it('encrypts and decrypts tokens with an encrypted prefix', () => {
        const encrypted = encryptToken('platform-token');

        expect(encrypted).toMatch(/^enc:/);
        expect(decryptToken(encrypted)).toBe('platform-token');
    });

    it('still reads legacy plaintext tokens', () => {
        expect(decryptToken('legacy-token')).toBe('legacy-token');
    });

    it('refuses to store plaintext when encryption is not configured', () => {
        delete process.env.ENCRYPTION_KEY;

        expect(() => encryptToken('platform-token')).toThrow('ENCRYPTION_KEY environment variable is not set');
    });
});
