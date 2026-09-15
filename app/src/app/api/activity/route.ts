/**
 * Activity Log API Route
 * Audit trail of workspace actions
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { Prisma } from '@/generated/prisma/client';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

const querySchema = z.object({
    limit: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(100)).default(20),
    offset: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0)).default(0),
    type: z.string().max(100).optional(),
    search: z.string().max(200).optional(),
});

/**
 * GET /api/activity - List activity log for workspace
 * Query params: limit, offset, type (all or a recorded resource type), search
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;
        const { searchParams } = new URL(request.url);
        const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid query parameters', details: parsed.error.issues }, { status: 400 });
        }
        const { limit, offset, type, search } = parsed.data;

        const where: Prisma.ActivityWhereInput = { organizationId };
        if (type && type !== 'all') {
            where.resourceType = type;
        }
        if (search) {
            where.OR = ['userName', 'action', 'resourceName', 'details'].map(field => ({
                [field]: { contains: search, mode: 'insensitive' },
            }));
        }

        const [activities, total, categoryCounts] = await Promise.all([
            db.activity.findMany({
                where,
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: limit,
                skip: offset
            }),
            db.activity.count({ where }),
            db.activity.groupBy({
                by: ['resourceType'],
                where: { organizationId },
                _count: { _all: true },
                orderBy: { resourceType: 'asc' },
            }),
        ]);
        const categories = categoryCounts.map(category => ({
            type: category.resourceType,
            count: category._count._all,
        }));

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
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
            hasMore: offset + activities.length < total,
            categories,
            workspaceTotal: categories.reduce((sum, category) => sum + category.count, 0),
        });
    } catch (error) {
        logger.error({ error }, 'Failed to fetch activity');
        return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
    }
}
