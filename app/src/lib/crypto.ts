/**
 * Encryption utilities for sensitive data storage
 * Uses AES-256-GCM for authenticated encryption
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Retrieves the encryption key from environment.
 * Key must be 32 bytes (256 bits) for AES-256.
 */
function getEncryptionKey(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
        throw new Error('ENCRYPTION_KEY environment variable is not set');
    }
    // Accept either raw 32-byte key or base64-encoded key
    const keyBuffer = Buffer.from(key, 'base64');
    if (keyBuffer.length !== 32) {
        throw new Error('ENCRYPTION_KEY must be 32 bytes (use: openssl rand -base64 32)');
    }
    return keyBuffer;
}

/**
 * Encrypts plaintext using AES-256-GCM
 * Returns base64-encoded string: IV (16 bytes) + Ciphertext + AuthTag (16 bytes)
 */
export function encrypt(plaintext: string): string {
    const key = getEncryptionKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Combine: IV + ciphertext + tag
    const combined = Buffer.concat([iv, encrypted, tag]);
    return combined.toString('base64');
}

/**
 * Decrypts ciphertext encrypted with encrypt()
 * Expects base64-encoded string: IV + Ciphertext + AuthTag
 */
export function decrypt(ciphertext: string): string {
    const key = getEncryptionKey();
    const combined = Buffer.from(ciphertext, 'base64');

    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(combined.length - TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);

    return decrypted.toString('utf8');
}

/**
 * Masks a secret string for display (shows last 4 chars only)
 * Example: "my-secret-key" -> "********-key"
 */
export function maskSecret(secret: string): string {
    if (secret.length <= 4) {
        return '****';
    }
    return '****' + secret.slice(-4);
}
