/**
 * Stale Drafts API
 * 
 * Returns drafts linked to disconnected social accounts.
 * These need user attention to either reconnect the account or delete the draft.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { findStaleDrafts } from '@/lib/services/media-cleanup';
import { createRouteLogger } from '@/lib/logger';

export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;

    try {
        const staleDrafts = await findStaleDrafts(organizationId);

        return NextResponse.json({
            staleDrafts,
            count: staleDrafts.length,
            message: staleDrafts.length > 0
                ? `${staleDrafts.length} draft(s) need attention - linked accounts are disconnected`
                : 'No stale drafts found',
        });
    } catch (error) {
        createRouteLogger('API', '/api/posts/stale-drafts').error({ err: error }, '[stale-drafts] Error fetching stale drafts');
        return NextResponse.json({ error: 'Failed to fetch stale drafts' }, { status: 500 });
    }
}
