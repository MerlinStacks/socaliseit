/**
 * Sidebar Badges API
 * Fetch notification counts for sidebar navigation badges
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { buildInboxAttentionCountQuery } from '@/app/api/inbox/query';

export interface SidebarBadges {
    /** Open conversations in the Needs attention queue */
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

    // Share queue semantics: root comments, grouped DMs and effective workflow status.
    const [attention] = await db.$queryRaw<{ total: number }[]>(buildInboxAttentionCountQuery(organizationId));

    const badges: SidebarBadges = {
        engagement: attention.total,
        analytics: 0, // Future: count of unviewed reports
    };

    return NextResponse.json(badges, {
        headers: {
            'Cache-Control': 'private, no-store',
        },
    });
}
