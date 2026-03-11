/**
 * VAPID Public Key API (Read-Only)
 * Returns the system-wide VAPID public key for any authenticated user.
 *
 * Why: Every user needs the public key to subscribe to push notifications.
 * Generation/deletion moved to /api/admin/vapid (super admin only).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

const VAPID_SINGLETON_ID = 'vapid_keys';

/**
 * GET /api/settings/vapid
 * Retrieve the system-wide VAPID public key.
 * Any authenticated user can read (needed by the subscribe flow).
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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
    } catch (error) {
        createRouteLogger('API', '/api/settings/vapid').error({ err: error }, 'Failed to fetch VAPID public key');
        return NextResponse.json({ error: 'Failed to fetch VAPID keys' }, { status: 500 });
    }
}
