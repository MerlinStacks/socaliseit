/**
 * Sidebar Badges API
 * Fetch notification counts for sidebar navigation badges
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export interface SidebarBadges {
    /** Unread mentions + unreplied comments count */
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

    // Fetch counts in parallel for performance
    const [unreadMentions, unrepliedComments] = await Promise.all([
        // Count unread mentions
        db.mention.count({
            where: {
                organizationId,
                isRead: false,
            },
        }),
        // Count unreplied comments (comments that need attention)
        db.comment.count({
            where: {
                organizationId,
                isReplied: false,
                isHidden: false,
                // Only count root-level comments, not replies
                parentId: null,
            },
        }),
    ]);

    const badges: SidebarBadges = {
        engagement: unreadMentions + unrepliedComments,
        analytics: 0, // Future: count of unviewed reports
    };

    return NextResponse.json(badges, {
        headers: {
            'Cache-Control': 'private, max-age=60, stale-while-revalidate=120',
        },
    });
}
