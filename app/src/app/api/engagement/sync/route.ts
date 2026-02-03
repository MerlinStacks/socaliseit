/**
 * Engagement Sync API Route
 * Triggers full engagement sync (comments + mentions) for all platform content
 *
 * POST: Initiate workspace engagement sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncWorkspaceEngagement } from '@/lib/services/engagement-sync-service';
import { logger } from '@/lib/logger';

/**
 * Trigger engagement sync for the current workspace
 *
 * Why: Fetches comments and mentions from ALL platform content,
 * including posts made directly on platforms (not through SocialiseIT)
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const workspaceId = session.user.currentWorkspaceId;

        // Parse optional daysSince parameter
        const { daysSince = 30 } = await request.json().catch(() => ({}));

        logger.info({ workspaceId, daysSince }, 'Engagement sync requested');

        // Run the sync
        const result = await syncWorkspaceEngagement(workspaceId, daysSince);

        // Return summary
        return NextResponse.json({
            success: true,
            data: {
                commentsAdded: result.commentsAdded,
                commentsUpdated: result.commentsUpdated,
                mentionsAdded: result.mentionsAdded,
                mentionsUpdated: result.mentionsUpdated,
                postsScanned: result.postsScanned,
                accountsProcessed: result.accountsProcessed,
                errorCount: result.errors.length,
                errors: result.errors.slice(0, 5), // Return first 5 errors
            },
        });
    } catch (error) {
        logger.error({ error }, 'Engagement sync failed');

        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Sync failed' },
            { status: 500 }
        );
    }
}
