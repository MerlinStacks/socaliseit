/**
 * Unread Counts API
 * Returns unread counts for comments, mentions, DMs, and reviews in one call.
 * Used by the Engagement Hub tabs to show live badge counts.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = session.user.currentOrganizationId;

    // Run all four counts in parallel for speed
    const [comments, mentions, dms, reviews] = await Promise.all([
        db.comment.count({ where: { organizationId: orgId, isRead: false } }),
        db.mention.count({ where: { organizationId: orgId, isRead: false } }),
        db.directMessage.count({ where: { organizationId: orgId, isRead: false, direction: 'inbound' } }),
        db.review.count({ where: { organizationId: orgId, isRead: false } }),
    ]);

    return NextResponse.json({ data: { comments, mentions, dms, reviews } });
}
