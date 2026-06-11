/**
 * Listening Data API Route
 * Why: The SPA shell fetches this endpoint for client-side listening page rendering.
 * Mirrors the data shape produced by listening-data.tsx (server component).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getListeningDashboard } from '@/lib/services/social-listening';

/** GET /api/listening/data */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;

    try {
        const dashboard = await getListeningDashboard(organizationId);

        return NextResponse.json({
            ...dashboard,
            hasInstagram: dashboard.platforms.includes('INSTAGRAM'),
        }, {
            headers: {
                'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
            },
        });
    } catch (error) {
        logger.error({ error, organizationId }, 'Failed to fetch listening data');
        return NextResponse.json({ error: 'Failed to fetch listening data' }, { status: 500 });
    }
}
