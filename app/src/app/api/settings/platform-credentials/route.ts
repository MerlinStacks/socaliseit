/**
 * Platform Credentials API (User-Facing Read-Only)
 * Returns global platform credentials status for the user settings page.
 * Actual configuration is managed by super admins via /api/admin/platform-credentials.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt, maskSecret } from '@/lib/crypto';

type Platform = 'META' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'GOOGLE_BUSINESS' | 'LINKEDIN' | 'BLUESKY';

const VALID_PLATFORMS: Platform[] = ['META', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'LINKEDIN', 'GOOGLE_BUSINESS', 'BLUESKY'];

/**
 * GET /api/settings/platform-credentials
 * List all global platform credentials status.
 * This is read-only for regular users - configuration is super admin only.
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch global platform credentials (super admin configured)
        const credentials = await db.globalPlatformCredential.findMany({
            orderBy: { platform: 'asc' },
        });

        // Mask secrets before returning
        const safeCredentials = credentials.map((cred) => {
            let maskedSecret = '(not set)';
            try {
                const decryptedSecret = decrypt(cred.clientSecret);
                maskedSecret = maskSecret(decryptedSecret);
            } catch {
                maskedSecret = '(configured)';
            }

            return {
                id: cred.id,
                platform: cred.platform,
                clientId: cred.clientId,
                clientSecretMasked: maskedSecret,
                webhookVerifyToken: cred.webhookVerifyToken || null,
                isConfigured: cred.isConfigured,
                updatedAt: cred.updatedAt,
            };
        });

        // Build a complete list including unconfigured platforms
        const allPlatforms = VALID_PLATFORMS.map((platform) => {
            const existing = safeCredentials.find((c) => c.platform === platform);
            return existing || {
                id: null,
                platform,
                clientId: '',
                clientSecretMasked: '(not set)',
                webhookVerifyToken: null,
                isConfigured: false,
                updatedAt: null,
            };
        });

        return NextResponse.json({ credentials: allPlatforms });
    } catch (error) {
        console.error('Failed to fetch platform credentials:', error);
        return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
    }
}

/**
 * PUT /api/settings/platform-credentials
 * This endpoint is now deprecated for regular users.
 * Platform credentials are managed by super admins via /api/admin/platform-credentials.
 */
export async function PUT() {
    return NextResponse.json(
        { error: 'Platform credentials are managed by your administrator. Please contact them to update settings.' },
        { status: 403 }
    );
}

/**
 * DELETE /api/settings/platform-credentials
 * This endpoint is now deprecated for regular users.
 * Platform credentials are managed by super admins via /api/admin/platform-credentials.
 */
export async function DELETE() {
    return NextResponse.json(
        { error: 'Platform credentials are managed by your administrator. Please contact them to update settings.' },
        { status: 403 }
    );
}
