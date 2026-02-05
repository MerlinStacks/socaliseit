/**
 * Admin Global Platform Credentials API
 * Super admin management of OAuth app credentials (Client ID/Secret) per platform
 * These credentials are shared across all organizations
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { encrypt, decrypt, maskSecret } from '@/lib/crypto';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/admin/audit';
import { randomBytes } from 'crypto';

type Platform = 'META' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'GOOGLE_BUSINESS' | 'LINKEDIN' | 'BLUESKY';

/** Platforms that support webhook verification */
const PLATFORMS_WITH_WEBHOOKS: Platform[] = ['META'];

const VALID_PLATFORMS: Platform[] = ['META', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'LINKEDIN', 'GOOGLE_BUSINESS', 'BLUESKY'];

/**
 * GET /api/admin/platform-credentials
 * List all global platform credentials
 * Returns masked secrets for security
 */
export const GET = withSuperAdmin(async (_request: NextRequest, _admin: AdminContext) => {
    const credentials = await db.globalPlatformCredential.findMany({
        orderBy: { platform: 'asc' },
    });

    // Mask secrets before returning
    const safeCredentials = credentials.map((cred) => {
        let decryptedSecret = '';
        try {
            decryptedSecret = decrypt(cred.clientSecret);
        } catch {
            // If decryption fails, secret is corrupted
            decryptedSecret = '';
        }

        return {
            id: cred.id,
            platform: cred.platform,
            clientId: cred.clientId, // Client ID is not secret, show full value
            clientSecretMasked: decryptedSecret ? maskSecret(decryptedSecret) : '(not set)',
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
});

/**
 * PUT /api/admin/platform-credentials
 * Create or update credentials for a platform
 * Body: { platform: string, clientId: string, clientSecret: string }
 */
export const PUT = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const body = await request.json();
    const { platform, clientId, clientSecret } = body;

    // Validate platform
    if (!platform || !VALID_PLATFORMS.includes(platform as Platform)) {
        return NextResponse.json(
            { error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` },
            { status: 400 }
        );
    }

    // Validate required fields
    if (!clientId?.trim()) {
        return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    // Encrypt secret if provided (allow update of just clientId)
    let encryptedSecret = '';
    if (clientSecret?.trim()) {
        encryptedSecret = encrypt(clientSecret.trim());
    } else {
        // If no new secret provided, keep the existing one
        const existing = await db.globalPlatformCredential.findUnique({
            where: { platform: platform as Platform },
        });
        if (existing) {
            encryptedSecret = existing.clientSecret;
        } else {
            return NextResponse.json({ error: 'Client Secret is required for new credentials' }, { status: 400 });
        }
    }

    // Auto-generate webhook verify token for platforms that need it
    let webhookVerifyToken: string | null = null;
    if (PLATFORMS_WITH_WEBHOOKS.includes(platform as Platform)) {
        // Check if existing token already exists
        const existingCred = await db.globalPlatformCredential.findUnique({
            where: { platform: platform as Platform },
        });
        // Reuse existing token or generate new one
        webhookVerifyToken = existingCred?.webhookVerifyToken || randomBytes(32).toString('hex');
    }

    // Upsert the credential
    const credential = await db.globalPlatformCredential.upsert({
        where: { platform: platform as Platform },
        update: {
            clientId: clientId.trim(),
            clientSecret: encryptedSecret,
            webhookVerifyToken,
            isConfigured: true,
        },
        create: {
            platform: platform as Platform,
            clientId: clientId.trim(),
            clientSecret: encryptedSecret,
            webhookVerifyToken,
            isConfigured: true,
        },
    });

    // Record audit log
    await recordAuditLog({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        actorId: admin.userId,
        targetType: 'global_platform_credentials',
        targetId: credential.id,
        metadata: { platform, action: 'upsert' },
        request,
    });

    return NextResponse.json({
        success: true,
        credential: {
            id: credential.id,
            platform: credential.platform,
            clientId: credential.clientId,
            isConfigured: credential.isConfigured,
        },
    });
});

/**
 * DELETE /api/admin/platform-credentials
 * Remove credentials for a platform
 * Body: { platform: string }
 */
export const DELETE = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const { platform } = await request.json();

    if (!platform || !VALID_PLATFORMS.includes(platform as Platform)) {
        return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    const existing = await db.globalPlatformCredential.findUnique({
        where: { platform: platform as Platform },
    });

    if (!existing) {
        return NextResponse.json({ error: 'Credential not found' }, { status: 404 });
    }

    await db.globalPlatformCredential.delete({
        where: { platform: platform as Platform },
    });

    // Record audit log
    await recordAuditLog({
        action: AUDIT_ACTIONS.SETTINGS_UPDATE,
        actorId: admin.userId,
        targetType: 'global_platform_credentials',
        targetId: existing.id,
        metadata: { platform, action: 'delete' },
        request,
    });

    return NextResponse.json({ success: true });
});
