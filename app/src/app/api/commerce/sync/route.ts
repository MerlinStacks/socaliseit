/**
 * Commerce Catalog Manual Sync API
 * Trigger manual sync for shop connections
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncCatalogToPlatform, syncAllCatalogs } from '@/lib/catalog-sync';
import type { Platform } from '@/generated/prisma/client';
import { createRouteLogger } from '@/lib/logger';
import { z } from 'zod';

const syncSchema = z.object({
    platform: z.enum(['INSTAGRAM', 'FACEBOOK', 'PINTEREST', 'TIKTOK', 'YOUTUBE']).optional(),
});

/**
 * POST /api/commerce/sync
 * Trigger sync for a specific platform or all platforms
 * Body: { platform?: Platform }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;
        const parsed = syncSchema.safeParse(await request.json());
        if (!parsed.success) return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
        const { platform } = parsed.data;

        if (platform) {
            // Sync specific platform
            const result = await syncCatalogToPlatform(organizationId, platform as Platform);
            return NextResponse.json({ success: result.success, result }, { status: result.success ? 200 : 502 });
        } else {
            // Sync all platforms
            const results = await syncAllCatalogs(organizationId);

            const success = Object.values(results).every(result => result.success);
            return NextResponse.json({ success, results }, { status: success ? 200 : 502 });
        }
    } catch (error) {
        createRouteLogger('API', '/api/commerce/sync').error({ err: error }, 'Failed to sync catalog');
        return NextResponse.json({ error: 'Failed to sync catalog' }, { status: 500 });
    }
}
