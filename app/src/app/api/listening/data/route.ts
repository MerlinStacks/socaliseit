/**
 * Listening Data API Route
 * Why: The SPA shell fetches this endpoint for client-side listening page rendering.
 * Mirrors the data shape produced by listening-data.tsx (server component).
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getMentionsForWorkspace } from '@/lib/services/sync-mentions';

/** GET /api/listening/data */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;

    try {
        const socialAccounts = await db.socialAccount.findMany({
            where: { organizationId, isActive: true },
        });

        const hasAccounts = socialAccounts.length > 0;
        const hasInstagram = socialAccounts.some(a => a.platform === 'INSTAGRAM');

        let mentions: Array<Record<string, unknown>> = [];
        let totalMentions = 0;
        let unreadCount = 0;

        if (hasInstagram) {
            const result = await getMentionsForWorkspace(organizationId, {}, 50, 0);
            mentions = result.mentions;
            totalMentions = result.total;

            unreadCount = await db.mention.count({
                where: { organizationId, isRead: false },
            });
        }

        return NextResponse.json({
            hasAccounts,
            hasInstagram,
            mentions,
            totalMentions,
            unreadCount,
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
