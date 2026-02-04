/**
 * Mention Sync API Route
 * Triggers sync of mentions/tags from connected platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncMentionsForWorkspace } from '@/lib/services/sync-mentions';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const organizationId = session.user.currentOrganizationId;

        logger.info({ organizationId }, 'Starting mention sync');

        const result = await syncMentionsForWorkspace(organizationId);

        return NextResponse.json({
            success: result.success,
            synced: result.synced,
            errors: result.errors,
        });

    } catch (error) {
        logger.error({ error }, 'Error in mention sync API');
        return NextResponse.json(
            { error: 'Failed to sync mentions' },
            { status: 500 }
        );
    }
}
