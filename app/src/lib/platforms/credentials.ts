/**
 * Platform Credentials Service
 * Fetches and decrypts OAuth credentials from database.
 * 
 * Why: Isolates credential management from OAuth flow logic,
 * enabling easier testing and credential source switching.
 * 
 * Note: As of Feb 2026, credentials are now global (super admin managed)
 * rather than per-organization. All orgs share the same OAuth app credentials.
 */

import { logger } from '../logger';
import type { Platform } from '../platform-config';

/**
 * Fetch global platform credentials from database.
 * Returns decrypted credentials or null if not configured.
 * 
 * Note: Instagram and Facebook both use META credentials (same Meta App).
 */
export async function getCredentialsForPlatform(
    platform: Platform
): Promise<{ clientId: string; clientSecret: string } | null> {
    // Dynamic import to avoid circular dependencies and keep this file usable on client
    const { db } = await import('@/lib/db');
    const { decrypt } = await import('@/lib/crypto');

    // Instagram and Facebook use META credentials (same Meta App)
    // Threads has its own App ID and uses THREADS credentials
    let platformEnum: 'META' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'LINKEDIN' | 'BLUESKY' | 'GOOGLE_BUSINESS' | 'THREADS';

    if (platform === 'instagram' || platform === 'facebook') {
        platformEnum = 'META';
    } else {
        platformEnum = platform.toUpperCase() as typeof platformEnum;
    }

    const credential = await db.globalPlatformCredential.findUnique({
        where: {
            platform: platformEnum,
        },
    });

    if (!credential || !credential.isConfigured) {
        return null;
    }

    try {
        const clientSecret = decrypt(credential.clientSecret);
        return {
            clientId: credential.clientId,
            clientSecret,
        };
    } catch (error) {
        logger.error({ platform, err: error }, 'Failed to decrypt credentials');
        return null;
    }
}

