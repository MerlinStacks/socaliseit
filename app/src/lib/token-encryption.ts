/**
 * Token Encryption Helpers
 *
 * Why: Social account OAuth tokens (accessToken, refreshToken) were stored as
 * plaintext in the database. If the DB is compromised, all connected accounts
 * are at risk. This module provides transparent encrypt/decrypt with backward
 * compatibility — `decryptToken()` gracefully handles legacy plaintext tokens
 * during the migration period, but new token writes must encrypt successfully.
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
        logger.error({ err: error }, 'Token encryption failed — refusing to store plaintext token');
        throw error;
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
