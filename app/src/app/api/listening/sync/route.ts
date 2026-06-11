import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { syncListeningItems } from '@/lib/services/social-listening';
import { crawlListeningSources } from '@/lib/services/social-listening-crawler';
import { syncWorkspaceEngagement } from '@/lib/services/engagement-sync-service';
import { logger } from '@/lib/logger';

export async function POST() {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;

    try {
        const engagement = await syncWorkspaceEngagement(organizationId, 30);
        const crawler = await crawlListeningSources(organizationId);
        const listening = await syncListeningItems(organizationId);

        return NextResponse.json({ success: true, engagement, crawler, listening });
    } catch (error) {
        logger.error({ error, organizationId }, 'Failed to sync social listening');
        return NextResponse.json({ error: 'Failed to sync social listening' }, { status: 500 });
    }
}
