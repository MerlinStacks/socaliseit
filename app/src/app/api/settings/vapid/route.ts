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
 * GET /api/settings/vapid
 * Retrieve VAPID public key for current workspace
 * Returns null if not generated yet
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

        const keyPair = await db.vapidKeyPair.findUnique({
            where: { workspaceId: session.user.currentWorkspaceId },
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
        console.error('Failed to fetch VAPID keys:', error);
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
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentWorkspaceId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Generate new VAPID keys
        const vapidKeys = webpush.generateVAPIDKeys();

        // Encrypt private key before storage
        const encryptedPrivateKey = encrypt(vapidKeys.privateKey);

        // Upsert the key pair (replace if exists)
        const keyPair = await db.vapidKeyPair.upsert({
            where: { workspaceId: session.user.currentWorkspaceId },
            update: {
                publicKey: vapidKeys.publicKey,
                privateKey: encryptedPrivateKey,
            },
            create: {
                workspaceId: session.user.currentWorkspaceId,
                publicKey: vapidKeys.publicKey,
                privateKey: encryptedPrivateKey,
            },
        });

        // If regenerating keys, invalidate all existing subscriptions
        // since they were encrypted with the old key
        await db.pushSubscription.deleteMany({
            where: { workspaceId: session.user.currentWorkspaceId },
        });

        return NextResponse.json({
            success: true,
            publicKey: keyPair.publicKey,
            createdAt: keyPair.createdAt,
        });
    } catch (error) {
        console.error('Failed to generate VAPID keys:', error);
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
        if (!session?.user?.id || !session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const hasAccess = await checkAdminAccess(session.user.currentWorkspaceId, session.user.id);
        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        // Delete all push subscriptions first
        await db.pushSubscription.deleteMany({
            where: { workspaceId: session.user.currentWorkspaceId },
        });

        // Delete VAPID keys
        await db.vapidKeyPair.delete({
            where: { workspaceId: session.user.currentWorkspaceId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete VAPID keys:', error);
        return NextResponse.json({ error: 'Failed to delete VAPID keys' }, { status: 500 });
    }
}

/**
 * Helper to get decrypted VAPID keys for a workspace
 * Used internally by push notification service
 */
export async function getVapidKeysForWorkspace(workspaceId: string): Promise<{
    publicKey: string;
    privateKey: string;
} | null> {
    const keyPair = await db.vapidKeyPair.findUnique({
        where: { workspaceId },
    });

    if (!keyPair) return null;

    try {
        const decryptedPrivateKey = decrypt(keyPair.privateKey);
        return {
            publicKey: keyPair.publicKey,
            privateKey: decryptedPrivateKey,
        };
    } catch {
        console.error('Failed to decrypt VAPID private key');
        return null;
    }
}
