/**
 * Comments Sync API Route
 * Triggers real-time comment synchronization
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncWorkspaceComments, getUnreadMentions, markMentionsAsRead } from '@/lib/services/comments-sync';

/**
 * POST /api/comments/sync
 * Trigger comment sync for current workspace
 */
export async function POST() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const results = await syncWorkspaceComments(session.user.currentOrganizationId);

        const summary = {
            totalPlatforms: results.length,
            commentsAdded: results.reduce((sum, r) => sum + r.commentsAdded, 0),
            mentionsFound: results.reduce((sum, r) => sum + r.mentionsFound, 0),
            errors: results.flatMap((r) => r.errors),
        };

        return NextResponse.json({ success: true, summary });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * GET /api/comments/sync
 * Get unread mentions
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const mentions = getUnreadMentions();

    return NextResponse.json({ mentions });
}

/**
 * PATCH /api/comments/sync
 * Mark mentions as read
 */
export async function PATCH(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commentIds } = await request.json();

    if (!Array.isArray(commentIds) || commentIds.length === 0) {
        return NextResponse.json({ error: 'Invalid comment IDs' }, { status: 400 });
    }

    await markMentionsAsRead(commentIds);

    return NextResponse.json({ success: true });
}
