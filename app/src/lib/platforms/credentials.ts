/**
 * Platform Credentials Service
 * Fetches and decrypts OAuth credentials from database.
 * 
 * Why: Isolates credential management from OAuth flow logic,
 * enabling easier testing and credential source switching.
 */

import { logger } from '../logger';
import type { Platform } from '../platform-config';

/**
 * Fetch platform credentials from database for a organization.
 * Returns decrypted credentials or null if not configured.
 * 
 * Note: Instagram and Facebook both use META credentials (same Meta App).
 */
export async function getCredentialsForPlatform(
    organizationId: string,
    platform: Platform
): Promise<{ clientId: string; clientSecret: string } | null> {
    // Dynamic import to avoid circular dependencies and keep this file usable on client
    const { db } = await import('@/lib/db');
    const { decrypt } = await import('@/lib/crypto');

    // Map lowercase platform to Prisma enum
    // Instagram and Facebook both use META credentials (same Meta App)
    let platformEnum: 'META' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'LINKEDIN' | 'BLUESKY' | 'GOOGLE_BUSINESS';

    if (platform === 'instagram' || platform === 'facebook') {
        platformEnum = 'META';
    } else {
        platformEnum = platform.toUpperCase() as typeof platformEnum;
    }

    const credential = await db.platformCredential.findUnique({
        where: {
            organizationId_platform: {
                organizationId,
                platform: platformEnum,
            },
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
