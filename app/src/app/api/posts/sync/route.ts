/**
 * Posts Sync API Route
 * Triggers sync of external posts from connected platforms
 * 
 * Why: Users want to see posts published directly on platforms
 * in their calendar for a complete content overview
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncWorkspacePosts } from '@/lib/services/posts-sync-service';
import { logger } from '@/lib/logger';

/**
 * POST /api/posts/sync
 * Trigger posts sync for current workspace
 * 
 * Query params:
 * - days: Number of days back to sync (default 30)
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get('days') || '30', 10);

    try {
        logger.info({ workspaceId, days }, 'Starting manual posts sync');

        const summary = await syncWorkspacePosts(workspaceId, days);

        return NextResponse.json({
            success: true,
            summary,
        });
    } catch (error) {
        logger.error({ error, workspaceId }, 'Posts sync failed');
        const message = error instanceof Error ? error.message : 'Sync failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

/**
 * GET /api/posts/sync
 * Get sync status (last sync time per account)
 */
export async function GET() {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For now, return a simple status
    // Could be extended to check last sync times from database
    return NextResponse.json({
        message: 'Use POST to trigger sync',
        supportedPlatforms: ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'PINTEREST'],
    });
}
