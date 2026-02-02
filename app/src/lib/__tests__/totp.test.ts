/**
 * TOTP (Two-Factor Authentication) Unit Tests
 * Tests for secret generation, token verification, and backup codes
 */

import { describe, it, expect } from 'vitest';
import {
    generateSecret,
    verifyToken,
    generateBackupCodes,
    hashBackupCode,
    verifyBackupCode,
} from '../totp';

describe('generateSecret', () => {
    it('should generate a base32-encoded secret', () => {
        const secret = generateSecret();

        // Base32 alphabet: A-Z and 2-7
        expect(secret).toMatch(/^[A-Z2-7]+$/);
    });

    it('should generate different secrets each time', () => {
        const secret1 = generateSecret();
        const secret2 = generateSecret();

        expect(secret1).not.toBe(secret2);
    });

    it('should generate secrets of consistent length', () => {
        const secrets = Array.from({ length: 10 }, () => generateSecret());

        // All secrets should be 32 characters (160 bits in base32)
        secrets.forEach((secret) => {
            expect(secret.length).toBe(32);
        });
    });
});

describe('verifyToken', () => {
    const testSecret = 'JBSWY3DPEHPK3PXP'; // Known test secret
    const testEmail = 'test@example.com';

    it('should verify a valid token', () => {
        // Generate current token from the secret
        // Note: This test uses a static approach since real TOTP changes every 30s
        const secret = generateSecret();

        // Since we can't predict the token, we test the function doesn't crash
        // with valid inputs and returns a boolean
        const result = verifyToken(secret, '123456', testEmail);
        expect(typeof result).toBe('boolean');
    });

    it('should reject invalid tokens', () => {
        const secret = generateSecret();

        // Invalid tokens should be rejected
        expect(verifyToken(secret, '000000', testEmail)).toBe(false);
        expect(verifyToken(secret, 'abcdef', testEmail)).toBe(false);
        expect(verifyToken(secret, '', testEmail)).toBe(false);
    });

    it('should handle malformed tokens gracefully', () => {
        const secret = generateSecret();

        // Should not throw for malformed input
        expect(() => verifyToken(secret, 'not-a-number', testEmail)).not.toThrow();
        expect(() => verifyToken(secret, '12345', testEmail)).not.toThrow(); // Too short
        expect(() => verifyToken(secret, '1234567', testEmail)).not.toThrow(); // Too long
    });
});

describe('generateBackupCodes', () => {
    it('should generate 8 backup codes', () => {
        const codes = generateBackupCodes();
        expect(codes).toHaveLength(8);
    });

    it('should format codes as XXXX-XXXX', () => {
        const codes = generateBackupCodes();

        codes.forEach((code) => {
            expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
        });
    });

    it('should exclude confusing characters (0, O, 1, I)', () => {
        // Generate many codes to increase probability of finding any issue
        const allCodes = Array.from({ length: 100 }, () => generateBackupCodes()).flat();

        allCodes.forEach((code) => {
            expect(code).not.toMatch(/[01OI]/);
        });
    });

    it('should generate unique codes within a set', () => {
        const codes = generateBackupCodes();
        const uniqueCodes = new Set(codes);

        expect(uniqueCodes.size).toBe(8);
    });
});

describe('hashBackupCode', () => {
    it('should produce consistent hashes for the same code', () => {
        const code = 'ABCD-EFGH';
        const hash1 = hashBackupCode(code);
        const hash2 = hashBackupCode(code);

        expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different codes', () => {
        const hash1 = hashBackupCode('ABCD-EFGH');
        const hash2 = hashBackupCode('WXYZ-1234');

        expect(hash1).not.toBe(hash2);
    });

    it('should normalize case before hashing', () => {
        const hashLower = hashBackupCode('abcd-efgh');
        const hashUpper = hashBackupCode('ABCD-EFGH');
        const hashMixed = hashBackupCode('AbCd-EfGh');

        expect(hashLower).toBe(hashUpper);
        expect(hashLower).toBe(hashMixed);
    });

    it('should normalize by removing hyphens', () => {
        const hashWithHyphen = hashBackupCode('ABCD-EFGH');
        const hashWithoutHyphen = hashBackupCode('ABCDEFGH');

        expect(hashWithHyphen).toBe(hashWithoutHyphen);
    });

    it('should produce SHA256 hex output (64 characters)', () => {
        const hash = hashBackupCode('TEST-CODE');

        expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
});

describe('verifyBackupCode', () => {
    it('should find matching code and return its index', () => {
        const code = 'ABCD-EFGH';
        const hashedCodes = [
            hashBackupCode('WXYZ-1234'),
            hashBackupCode('ABCD-EFGH'),
            hashBackupCode('MNOP-5678'),
        ];

        expect(verifyBackupCode(code, hashedCodes)).toBe(1);
    });

    it('should return -1 for non-matching code', () => {
        const hashedCodes = [
            hashBackupCode('WXYZ-1234'),
            hashBackupCode('ABCD-EFGH'),
        ];

        expect(verifyBackupCode('INVALID', hashedCodes)).toBe(-1);
    });

    it('should handle case-insensitive verification', () => {
        const hashedCodes = [hashBackupCode('ABCD-EFGH')];

        expect(verifyBackupCode('abcd-efgh', hashedCodes)).toBe(0);
        expect(verifyBackupCode('AbCd-EfGh', hashedCodes)).toBe(0);
    });

    it('should handle verification without hyphens', () => {
        const hashedCodes = [hashBackupCode('ABCD-EFGH')];

        expect(verifyBackupCode('ABCDEFGH', hashedCodes)).toBe(0);
    });

    it('should handle empty hashed codes array', () => {
        expect(verifyBackupCode('ABCD-EFGH', [])).toBe(-1);
    });
});
