/**
 * Sidebar Badges API
 * Returns notification counts for sidebar nav items
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

export async function GET() {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = session.user.currentOrganizationId;

    try {
        const [drafts, scheduled, failed] = await Promise.all([
            db.post.count({ where: { organizationId: orgId, status: 'DRAFT' } }),
            db.post.count({ where: { organizationId: orgId, status: 'SCHEDULED' } }),
            db.post.count({ where: { organizationId: orgId, status: 'FAILED' } }),
        ]);

        const badges = {
            drafts,
            scheduled,
            failed,
            engagement: 0,
            analytics: 0,
        };

        return NextResponse.json({ badges });
    } catch (error) {
        createRouteLogger('API', '/api/badges').error({ err: error }, 'Failed to fetch badges');
        return NextResponse.json(
            { error: 'Failed to fetch badges' },
            { status: 500 }
        );
    }
}
