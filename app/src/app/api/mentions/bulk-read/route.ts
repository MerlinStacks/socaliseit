/**
 * Bulk Mentions Operations API
 * Mark multiple mentions as read in one request
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * POST /api/mentions/bulk-read
 * Mark multiple mentions as read (or unread)
 * Body: { ids: string[], isRead: boolean }
 * OR:   { all: true, isRead: boolean } to mark all visible mentions
 */
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const organizationId = session.user.currentOrganizationId;
    const body = await request.json();
    const { ids, all, isRead } = body;

    if (typeof isRead !== 'boolean') {
        return NextResponse.json({ error: 'isRead must be a boolean' }, { status: 400 });
    }

    let updateCount = 0;

    if (all) {
        // Mark all unread mentions in workspace as read
        const result = await db.mention.updateMany({
            where: {
                organizationId,
                isRead: !isRead  // Only update those that need changing
            },
            data: { isRead }
        });
        updateCount = result.count;
    } else if (Array.isArray(ids) && ids.length > 0) {
        // Mark specific mentions
        const result = await db.mention.updateMany({
            where: {
                id: { in: ids },
                organizationId  // Security: ensure ownership
            },
            data: { isRead }
        });
        updateCount = result.count;
    } else {
        return NextResponse.json({ error: 'Must provide ids array or all: true' }, { status: 400 });
    }

    return NextResponse.json({ success: true, updated: updateCount });
}
