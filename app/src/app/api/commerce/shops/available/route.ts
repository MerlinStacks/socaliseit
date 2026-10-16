
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { fetchMetaCatalogs } from '@/lib/api/meta-commerce';
import { createRouteLogger } from '@/lib/logger';
import { decryptToken } from '@/lib/token-encryption';

/**
 * GET /api/commerce/shops/available
 * Fetch available shops/catalogs from the platform API
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const platform = searchParams.get('platform');
        const organizationId = session.user.currentOrganizationId;

        if (!platform) {
            return NextResponse.json({ error: 'Platform required' }, { status: 400 });
        }

        // Validate platform
        const validPlatforms = ['INSTAGRAM', 'FACEBOOK'] as const;
        if (!validPlatforms.some(value => value === platform)) {
            return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
        }

        // 1. Get Access Token
        const accounts = await db.socialAccount.findMany({
            where: {
                organizationId,
                platform: { in: platform === 'INSTAGRAM' ? ['INSTAGRAM'] : ['INSTAGRAM', 'FACEBOOK'] },
                isActive: true,
            },
            select: { platform: true, platformId: true, accessToken: true },
        });

        if (!accounts.length) {
            return NextResponse.json({ error: 'Platform not connected' }, { status: 400 });
        }

        // Instagram must use available_catalogs, not arbitrary business assets.
        // Facebook can also reuse the retail catalogs exposed by Instagram.
        const results = await Promise.allSettled(accounts.map(account =>
            fetchMetaCatalogs(decryptToken(account.accessToken), {
                platform: account.platform as 'INSTAGRAM' | 'FACEBOOK',
                platformId: account.platformId,
            })
        ));
        const shops = Array.from(new Map(results.flatMap(result =>
            result.status === 'fulfilled' ? result.value.map(shop => [shop.id, shop] as const) : []
        )).values());

        if (!shops.length && results.some(result => result.status === 'rejected')) {
            return NextResponse.json({
                error: 'Unable to access your Meta catalogs. Reconnect Facebook and Instagram with catalog and business permissions, and check your catalog access in Meta Commerce Manager.',
            }, { status: 502 });
        }

        return NextResponse.json({ shops });

    } catch (error) {
        createRouteLogger('API', '/api/commerce/shops/available').error({ err: error }, 'Failed to fetch available shops');
        return NextResponse.json({ error: 'Failed to fetch shops' }, { status: 500 });
    }
}
