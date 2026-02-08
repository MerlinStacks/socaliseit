/**
 * VAPID Key Management API
 * Generate and retrieve VAPID keys for Web Push notifications
 * Only OWNER/ADMIN roles have access
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';
import webpush from 'web-push';
import { createRouteLogger } from '@/lib/logger';

/**
 * Checks if user has OWNER or ADMIN role in the workspace
 */
async function checkAdminAccess(organizationId: string, userId: string): Promise<boolean> {
    const member = await db.organizationMember.findUnique({
        where: {
            organizationId_userId: { organizationId, userId },
        },
    });
    return member?.role === 'OWNER' || member?.role === 'ADMIN';
}

/**
 * GET /api/settings/vapid
 * Retrieve VAPID public key for current workspace
 * Returns null if not generated yet
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentOrganizationId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const keyPair = await db.vapidKeyPair.findUnique({
            where: { organizationId: session.user.currentOrganizationId },
        });

        if (!keyPair) {
            return NextResponse.json({ publicKey: null, isConfigured: false });
        }

        return NextResponse.json({
            publicKey: keyPair.publicKey,
            isConfigured: true,
            createdAt: keyPair.createdAt,
        });
    } catch (error) {
        createRouteLogger('API', '/api/settings/vapid').error({ err: error }, 'Failed to fetch VAPID keys');
        return NextResponse.json({ error: 'Failed to fetch VAPID keys' }, { status: 500 });
    }
}

/**
 * POST /api/settings/vapid
 * Generate new VAPID key pair for current workspace
 * Replaces existing key pair if one exists
 */
export async function POST() {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentOrganizationId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Generate new VAPID keys
        const vapidKeys = webpush.generateVAPIDKeys();

        // Encrypt private key before storage
        const encryptedPrivateKey = encrypt(vapidKeys.privateKey);

        // Upsert the key pair (replace if exists)
        const keyPair = await db.vapidKeyPair.upsert({
            where: { organizationId: session.user.currentOrganizationId },
            update: {
                publicKey: vapidKeys.publicKey,
                privateKey: encryptedPrivateKey,
            },
            create: {
                organizationId: session.user.currentOrganizationId,
                publicKey: vapidKeys.publicKey,
                privateKey: encryptedPrivateKey,
            },
        });

        // If regenerating keys, invalidate all existing subscriptions
        // since they were encrypted with the old key
        await db.pushSubscription.deleteMany({
            where: { organizationId: session.user.currentOrganizationId },
        });

        return NextResponse.json({
            success: true,
            publicKey: keyPair.publicKey,
            createdAt: keyPair.createdAt,
        });
    } catch (error) {
        createRouteLogger('API', '/api/settings/vapid').error({ err: error }, 'Failed to generate VAPID keys');
        return NextResponse.json({ error: 'Failed to generate VAPID keys' }, { status: 500 });
    }
}

/**
 * DELETE /api/settings/vapid
 * Delete VAPID keys and all push subscriptions for workspace
 */
export async function DELETE() {
    try {
        const session = await auth();
        if (!session?.user?.id || !session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentOrganizationId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Delete all push subscriptions first
        await db.pushSubscription.deleteMany({
            where: { organizationId: session.user.currentOrganizationId },
        });

        // Delete VAPID keys
        await db.vapidKeyPair.delete({
            where: { organizationId: session.user.currentOrganizationId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        createRouteLogger('API', '/api/settings/vapid').error({ err: error }, 'Failed to delete VAPID keys');
        return NextResponse.json({ error: 'Failed to delete VAPID keys' }, { status: 500 });
    }
}

/**
 * Helper to get decrypted VAPID keys for a workspace
 * Used internally by push notification service
 */
export async function getVapidKeysForWorkspace(organizationId: string): Promise<{
    publicKey: string;
    privateKey: string;
} | null> {
    const keyPair = await db.vapidKeyPair.findUnique({
        where: { organizationId },
    });

    if (!keyPair) return null;

    try {
        const decryptedPrivateKey = decrypt(keyPair.privateKey);
        return {
            publicKey: keyPair.publicKey,
            privateKey: decryptedPrivateKey,
        };
    } catch {
        createRouteLogger('API', '/api/settings/vapid').error('Failed to decrypt VAPID private key');
        return null;
    }
}
