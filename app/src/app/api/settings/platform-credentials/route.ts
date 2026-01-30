/**
 * Platform Credentials API
 * Manage OAuth app credentials (Client ID/Secret) per workspace/platform
 * Only OWNER/ADMIN roles have access
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { encrypt, decrypt, maskSecret } from '@/lib/crypto';

type Platform = 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'GOOGLE_BUSINESS';

const VALID_PLATFORMS: Platform[] = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'PINTEREST'];

/**
 * Checks if user has OWNER or ADMIN role in the workspace
 */
async function checkAdminAccess(workspaceId: string, userId: string): Promise<boolean> {
    const member = await db.workspaceMember.findUnique({
        where: {
            workspaceId_userId: { workspaceId, userId },
        },
    });
    return member?.role === 'OWNER' || member?.role === 'ADMIN';
}

/**
 * GET /api/settings/platform-credentials
 * List all platform credentials for the current workspace
 * Returns masked secrets for security
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentWorkspaceId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const credentials = await db.platformCredential.findMany({
            where: { workspaceId: session.user.currentWorkspaceId },
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
 * Create or update credentials for a platform
 * Body: { platform: string, clientId: string, clientSecret: string }
 */
export async function PUT(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentWorkspaceId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

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
            const existing = await db.platformCredential.findUnique({
                where: {
                    workspaceId_platform: {
                        workspaceId: session.user.currentWorkspaceId,
                        platform: platform as Platform,
                    },
                },
            });
            if (existing) {
                encryptedSecret = existing.clientSecret;
            } else {
                return NextResponse.json({ error: 'Client Secret is required for new credentials' }, { status: 400 });
            }
        }

        // Upsert the credential
        const credential = await db.platformCredential.upsert({
            where: {
                workspaceId_platform: {
                    workspaceId: session.user.currentWorkspaceId,
                    platform: platform as Platform,
                },
            },
            update: {
                clientId: clientId.trim(),
                clientSecret: encryptedSecret,
                isConfigured: true,
            },
            create: {
                workspaceId: session.user.currentWorkspaceId,
                platform: platform as Platform,
                clientId: clientId.trim(),
                clientSecret: encryptedSecret,
                isConfigured: true,
            },
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
    } catch (error) {
        console.error('Failed to save platform credentials:', error);
        return NextResponse.json({ error: 'Failed to save credentials' }, { status: 500 });
    }
}

/**
 * DELETE /api/settings/platform-credentials
 * Remove credentials for a platform
 * Body: { platform: string }
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentWorkspaceId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const { platform } = await request.json();

        if (!platform || !VALID_PLATFORMS.includes(platform as Platform)) {
            return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
        }

        await db.platformCredential.delete({
            where: {
                workspaceId_platform: {
                    workspaceId: session.user.currentWorkspaceId,
                    platform: platform as Platform,
                },
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete platform credentials:', error);
        return NextResponse.json({ error: 'Failed to delete credentials' }, { status: 500 });
    }
}
