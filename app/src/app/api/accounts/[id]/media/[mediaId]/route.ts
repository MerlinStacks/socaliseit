/**
 * Platform Media Deletion API
 * Why: Allows users to delete published Instagram or Threads media directly
 * from the dashboard, dispatching to the correct platform-specific API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureValidToken } from '@/lib/services/token-service';

/**
 * DELETE /api/accounts/[id]/media/[mediaId] — Delete a published media item
 */
export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string; mediaId: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, mediaId } = await params;

    const account = await db.socialAccount.findFirst({
        where: { id, organizationId: session.user.currentOrganizationId },
    });

    if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Why: Only Instagram and Threads support media deletion via API
    if (account.platform !== 'INSTAGRAM' && account.platform !== 'THREADS') {
        return NextResponse.json(
            { error: `Media deletion is not supported for ${account.platform}` },
            { status: 400 }
        );
    }

    const tokenResult = await ensureValidToken(account.id);
    if (!tokenResult.success || !tokenResult.accessToken) {
        return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
    }

    if (account.platform === 'INSTAGRAM') {
        const { deleteInstagramMedia } = await import('@/lib/platform-api/instagram-api');
        const result = await deleteInstagramMedia(tokenResult.accessToken, mediaId);

        if (!result.success) {
            logger.error({ error: result.error, mediaId, platform: 'instagram' }, 'Media deletion failed');
            return NextResponse.json({ error: result.error }, { status: 502 });
        }

        return NextResponse.json({ success: true, deleted: true });
    }

    // THREADS
    const { deleteThreadsPost } = await import('@/lib/platform-api/threads-api');
    const result = await deleteThreadsPost(tokenResult.accessToken, mediaId);

    if (!result.success) {
        logger.error({ error: result.error, mediaId, platform: 'threads' }, 'Media deletion failed');
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, deleted: true });
}
