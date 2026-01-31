/**
 * Commerce Catalog Manual Sync API
 * Trigger manual sync for shop connections
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { syncCatalogToPlatform, type CatalogSyncResult } from '@/lib/catalog-sync';
import type { Platform } from '@/generated/prisma/client';

/**
 * POST /api/commerce/sync
 * Trigger sync for a specific platform or all platforms
 * Body: { platform?: Platform }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = session.user.currentWorkspaceId;
        const body = await request.json();
        const { platform } = body;

        if (platform) {
            // Sync specific platform
            const result = await syncCatalogToPlatform(workspaceId, platform as Platform);
            return NextResponse.json({ success: true, result });
        } else {
            // Sync all platforms
            const shops = await db.shopConnection.findMany({
                where: { workspaceId, isActive: true },
            });

            const results: Record<string, CatalogSyncResult> = {};
            for (const shop of shops) {
                results[shop.platform] = await syncCatalogToPlatform(workspaceId, shop.platform);
            }

            return NextResponse.json({ success: true, results });
        }
    } catch (error) {
        console.error('Failed to sync catalog:', error);
        return NextResponse.json({ error: 'Failed to sync catalog' }, { status: 500 });
    }
}
