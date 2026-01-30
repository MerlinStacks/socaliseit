/**
 * Single Mention API
 * Manage specific mention: Mark as Read
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// PATCH /api/mentions/[id]
// Body: { isRead: boolean }
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const { isRead } = await request.json();

    const mention = await db.mention.findUnique({
        where: { id },
    });

    if (!mention || mention.workspaceId !== session.user.currentWorkspaceId) {
        return NextResponse.json({ error: 'Mention not found' }, { status: 404 });
    }

    await db.mention.update({
        where: { id },
        data: { isRead }
    });

    return NextResponse.json({ success: true });
}
