/**
 * Crypto Utility Unit Tests
 * Tests for AES-256-GCM encryption/decryption and secret masking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encrypt, decrypt, maskSecret } from '../crypto';

describe('encrypt/decrypt', () => {
    // Test setup provides ENCRYPTION_KEY in vitest setup

    it('should encrypt and decrypt a string correctly', () => {
        const plaintext = 'my-secret-api-key';
        const encrypted = encrypt(plaintext);
        const decrypted = decrypt(encrypted);

        expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
        const plaintext = 'same-value';
        const encrypted1 = encrypt(plaintext);
        const encrypted2 = encrypt(plaintext);

        expect(encrypted1).not.toBe(encrypted2);

        // Both should decrypt to the same value
        expect(decrypt(encrypted1)).toBe(plaintext);
        expect(decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle empty strings', () => {
        const encrypted = encrypt('');
        const decrypted = decrypt(encrypted);

        expect(decrypted).toBe('');
    });

    it('should handle unicode characters', () => {
        const plaintext = '日本語テスト 🔐 emoji test';
        const encrypted = encrypt(plaintext);
        const decrypted = decrypt(encrypted);

        expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
        const plaintext = 'a'.repeat(10000);
        const encrypted = encrypt(plaintext);
        const decrypted = decrypt(encrypted);

        expect(decrypted).toBe(plaintext);
    });

    it('should throw error for tampered ciphertext', () => {
        const encrypted = encrypt('test');
        // Tamper with the ciphertext (flip a bit in the middle)
        const buffer = Buffer.from(encrypted, 'base64');
        buffer[buffer.length / 2] ^= 0xff;
        const tampered = buffer.toString('base64');

        expect(() => decrypt(tampered)).toThrow();
    });

    it('should throw error for invalid base64 ciphertext', () => {
        expect(() => decrypt('not-valid-base64!!!')).toThrow();
    });
});

describe('encrypt/decrypt with missing key', () => {
    const originalKey = process.env.ENCRYPTION_KEY;

    beforeEach(() => {
        delete process.env.ENCRYPTION_KEY;
    });

    afterEach(() => {
        process.env.ENCRYPTION_KEY = originalKey;
    });

    it('should throw error when ENCRYPTION_KEY is missing', () => {
        expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY environment variable is not set');
    });
});

describe('maskSecret', () => {
    it('should mask long secrets showing last 4 characters', () => {
        expect(maskSecret('my-super-secret-key')).toBe('****-key');
    });

    it('should mask medium secrets correctly', () => {
        expect(maskSecret('12345678')).toBe('****5678');
    });

    it('should fully mask very short secrets', () => {
        expect(maskSecret('abc')).toBe('****');
        expect(maskSecret('a')).toBe('****');
    });

    it('should handle exactly 4 character secrets', () => {
        expect(maskSecret('1234')).toBe('****');
    });

    it('should handle 5 character secrets', () => {
        expect(maskSecret('12345')).toBe('****2345');
    });
});
