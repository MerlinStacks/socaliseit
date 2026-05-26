/**
 * Sidebar Badges API
 * Fetch notification counts for sidebar navigation badges
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export interface SidebarBadges {
    /** Unread engagement items across the Engagement Hub */
    engagement: number;
    /** Reports ready for viewing (future feature) */
    analytics: number;
}

/**
 * GET /api/sidebar/badges
 * Returns badge counts for sidebar navigation items
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;

    // Keep the sidebar badge aligned with Engagement Hub tab badges.
    const [comments, mentions, dms, reviews] = await Promise.all([
        db.comment.count({ where: { organizationId, isRead: false } }),
        db.mention.count({ where: { organizationId, isRead: false } }),
        db.directMessage.count({ where: { organizationId, isRead: false, direction: 'inbound' } }),
        db.review.count({ where: { organizationId, isRead: false } }),
    ]);

    const badges: SidebarBadges = {
        engagement: comments + mentions + dms + reviews,
        analytics: 0, // Future: count of unviewed reports
    };

    return NextResponse.json(badges, {
        headers: {
            'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
        },
    });
}
