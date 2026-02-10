/**
 * Token Encryption Helpers
 *
 * Why: Social account OAuth tokens (accessToken, refreshToken) were stored as
 * plaintext in the database. If the DB is compromised, all connected accounts
 * are at risk. This module provides transparent encrypt/decrypt with backward
 * compatibility — `decryptToken()` gracefully handles both encrypted and
 * legacy plaintext tokens during the migration period.
 *
 * Usage:
 *   On write: `accessToken: encryptToken(token)`
 *   On read:  `decryptToken(account.accessToken)`
 */

import { encrypt, decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';

/** Prefix to identify encrypted tokens vs plaintext legacy tokens */
const ENCRYPTED_PREFIX = 'enc:';

/**
 * Encrypts a token for storage.
 * Returns a prefixed string so decryptToken() can distinguish it from plaintext.
 */
export function encryptToken(plaintext: string): string {
    if (!plaintext) return plaintext;

    // Don't double-encrypt
    if (plaintext.startsWith(ENCRYPTED_PREFIX)) return plaintext;

    try {
        return ENCRYPTED_PREFIX + encrypt(plaintext);
    } catch (error) {
        // If ENCRYPTION_KEY is not set, store plaintext (allows opt-in encryption)
        logger.warn({ err: error }, 'Token encryption failed — storing plaintext. Set ENCRYPTION_KEY to enable.');
        return plaintext;
    }
}

/**
 * Decrypts a token from storage.
 * Handles both encrypted (prefixed) and legacy plaintext tokens gracefully.
 */
export function decryptToken(stored: string): string {
    if (!stored) return stored;

    // Plaintext legacy token — no prefix
    if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored;

    try {
        return decrypt(stored.slice(ENCRYPTED_PREFIX.length));
    } catch (error) {
        logger.error({ err: error }, 'Token decryption failed — token may be corrupted');
        // Return empty string to force re-authentication rather than using garbage
        return '';
    }
}
