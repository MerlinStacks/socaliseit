/**
 * Super Admin VAPID Key Management API
 * Generate, view, and delete the system-wide VAPID key pair for Web Push.
 *
 * Why: VAPID keys are a platform-level concern, not per-org.
 * One key pair serves all organizations.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';
import webpush from 'web-push';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { createRouteLogger } from '@/lib/logger';

const logger = createRouteLogger('API', '/api/admin/vapid');
const VAPID_SINGLETON_ID = 'vapid_keys';

/**
 * GET /api/admin/vapid
 * Retrieve the system-wide VAPID public key. Super admin only.
 */
export const GET = withSuperAdmin(async (_request: NextRequest, _admin: AdminContext) => {
    const keyPair = await db.vapidKeyPair.findUnique({
        where: { id: VAPID_SINGLETON_ID },
    });

    if (!keyPair) {
        return NextResponse.json({ publicKey: null, isConfigured: false });
    }

    return NextResponse.json({
        publicKey: keyPair.publicKey,
        isConfigured: true,
        createdAt: keyPair.createdAt,
    });
});

/**
 * POST /api/admin/vapid
 * Generate a new system-wide VAPID key pair.
 * Replaces existing keys and invalidates ALL push subscriptions globally.
 */
export const POST = withSuperAdmin(async (_request: NextRequest, admin: AdminContext) => {
    const vapidKeys = webpush.generateVAPIDKeys();
    const encryptedPrivateKey = encrypt(vapidKeys.privateKey);

    const keyPair = await db.vapidKeyPair.upsert({
        where: { id: VAPID_SINGLETON_ID },
        update: {
            publicKey: vapidKeys.publicKey,
            privateKey: encryptedPrivateKey,
        },
        create: {
            id: VAPID_SINGLETON_ID,
            publicKey: vapidKeys.publicKey,
            privateKey: encryptedPrivateKey,
        },
    });

    // Why: Old subscriptions were signed with a different key pair — they're now invalid
    const deleted = await db.pushSubscription.deleteMany({});

    // Why: Subscription wipe sets NotificationDevice.pushSubscriptionId to null
    // via onDelete: SetNull. These orphaned entries are unusable, so clean them up.
    const orphanedDevices = await db.notificationDevice.deleteMany({
        where: { pushSubscriptionId: null },
    });

    logger.info(
        { adminId: admin.userId, subscriptionsCleared: deleted.count, devicesCleared: orphanedDevices.count },
        'System VAPID keys regenerated'
    );

    return NextResponse.json({
        success: true,
        publicKey: keyPair.publicKey,
        createdAt: keyPair.createdAt,
        subscriptionsCleared: deleted.count,
    });
});

/**
 * DELETE /api/admin/vapid
 * Delete system-wide VAPID keys and all push subscriptions.
 */
export const DELETE = withSuperAdmin(async (_request: NextRequest, admin: AdminContext) => {
    await db.pushSubscription.deleteMany({});

    // Why: Clean up orphaned devices left behind by subscription wipe
    await db.notificationDevice.deleteMany({
        where: { pushSubscriptionId: null },
    });

    try {
        await db.vapidKeyPair.delete({ where: { id: VAPID_SINGLETON_ID } });
    } catch {
        // Already deleted or never created — not an error
    }

    logger.info({ adminId: admin.userId }, 'System VAPID keys deleted');

    return NextResponse.json({ success: true });
});
