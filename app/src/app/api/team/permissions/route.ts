/**
 * Team Permissions API
 * Returns the current user's permissions for a workspace.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getMemberPermissions } from '@/lib/auth/with-permission';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const workspaceId = searchParams.get('workspaceId');

        if (!workspaceId) {
            return NextResponse.json(
                { error: 'Workspace ID required' },
                { status: 400 }
            );
        }

        const permissions = await getMemberPermissions(workspaceId, session.user.id);

        return NextResponse.json({ permissions });
    } catch (error) {
        logger.error({ error }, 'Error fetching user permissions');
        return NextResponse.json(
            { error: 'Failed to fetch permissions' },
            { status: 500 }
        );
    }
}
