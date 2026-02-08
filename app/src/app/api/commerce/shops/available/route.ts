
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { fetchMetaCatalogs } from '@/lib/api/meta-commerce';
import { createRouteLogger } from '@/lib/logger';

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
        if (!validPlatforms.includes(platform as any)) {
            return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
        }

        // 1. Get Access Token
        const account = await db.socialAccount.findFirst({
            where: {
                organizationId,
                platform: platform as 'INSTAGRAM' | 'FACEBOOK',
            },
        });

        if (!account || !account.accessToken) {
            return NextResponse.json({ error: 'Platform not connected' }, { status: 400 });
        }

        let shops: { id: string; name: string }[] = [];

        // 2. Fetch Shops based on Platform
        if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') {
            shops = await fetchMetaCatalogs(account.accessToken);
        } else {
            // Placeholder for other platforms
            return NextResponse.json({ shops: [] });
        }

        return NextResponse.json({ shops });

    } catch (error) {
        createRouteLogger('API', '/api/commerce/shops/available').error({ err: error }, 'Failed to fetch available shops');
        return NextResponse.json({ error: 'Failed to fetch shops' }, { status: 500 });
    }
}
