/**
 * Activity Log API Route
 * Audit trail of workspace actions
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/activity - List activity log for workspace
 * Query params: limit, offset, type (all|post|media|account|team|automation)
 */
export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = session.user.currentWorkspaceId;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    const type = searchParams.get('type');

    const where: Record<string, unknown> = { workspaceId };
    if (type && type !== 'all') {
        where.resourceType = type;
    }

    const [activities, total] = await Promise.all([
        db.activity.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset
        }),
        db.activity.count({ where })
    ]);

    // Format timestamps as relative time strings
    const now = new Date();
    const formatRelativeTime = (date: Date): string => {
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        return date.toLocaleDateString();
    };

    const formattedActivities = activities.map(activity => ({
        id: activity.id,
        user: { name: activity.userName || 'System' },
        action: activity.action,
        resourceType: activity.resourceType,
        resourceId: activity.resourceId,
        resourceName: activity.resourceName,
        details: activity.details,
        timestamp: formatRelativeTime(activity.createdAt),
        createdAt: activity.createdAt.toISOString()
    }));

    return NextResponse.json({
        activities: formattedActivities,
        total,
        limit,
        offset,
        hasMore: offset + activities.length < total
    });
}
