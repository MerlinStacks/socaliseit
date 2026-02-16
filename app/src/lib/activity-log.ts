/**
 * Activity Log Service
 * Audit trail for all workspace actions
 */

import { logger } from './logger';
import { db } from './db';
import { sanitizeForDb } from './sanitize-string';

export type ActivityAction =
    | 'post.created'
    | 'post.updated'
    | 'post.scheduled'
    | 'post.published'
    | 'post.failed'
    | 'post.deleted'
    | 'media.uploaded'
    | 'media.deleted'
    | 'account.connected'
    | 'account.disconnected'
    | 'account.refreshed'
    | 'team.invited'
    | 'team.removed'
    | 'team.role_changed'
    | 'settings.updated'
    | 'organization.created'
    | 'automation.created'
    | 'automation.triggered'
    | 'export.generated'
    | 'import.completed'
    | 'comment.replied'
    | 'dm.sent';

export interface ActivityLog {
    id: string;
    organizationId: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    action: ActivityAction;
    resourceType: string;
    resourceId: string;
    resourceName?: string;
    details: Record<string, unknown>;
    metadata: {
        ip?: string;
        userAgent?: string;
        location?: string;
    };
    createdAt: Date;
}

export interface ActivityFilter {
    actions?: ActivityAction[];
    userId?: string;
    resourceType?: string;
    dateRange?: { start: Date; end: Date };
    search?: string;
}

// Action descriptions for UI
export const ACTION_DESCRIPTIONS: Record<ActivityAction, string> = {
    'post.created': 'created a post',
    'post.updated': 'updated a post',
    'post.scheduled': 'scheduled a post',
    'post.published': 'published a post',
    'post.failed': 'post failed to publish',
    'post.deleted': 'deleted a post',
    'media.uploaded': 'uploaded media',
    'media.deleted': 'deleted media',
    'account.connected': 'connected an account',
    'account.disconnected': 'disconnected an account',
    'account.refreshed': 'refreshed account token',
    'team.invited': 'invited a team member',
    'team.removed': 'removed a team member',
    'team.role_changed': 'changed team member role',
    'settings.updated': 'updated settings',
    'organization.created': 'created a workspace',
    'automation.created': 'created an automation',
    'automation.triggered': 'automation was triggered',
    'export.generated': 'generated an export',
    'import.completed': 'completed a bulk import',
    'comment.replied': 'replied to a comment',
    'dm.sent': 'sent a direct message',
};

// Action icons for UI
export const ACTION_ICONS: Record<string, string> = {
    post: '📝',
    media: '🖼️',
    account: '🔗',
    team: '👥',
    settings: '⚙️',
    organization: '🏢',
    automation: '⚡',
    export: '📊',
    import: '📥',
    comment: '💬',
    dm: '✉️',
};

/**
 * Log an activity
 */
export async function logActivity(
    organizationId: string,
    userId: string,
    userName: string,
    action: ActivityAction,
    resource: {
        type: string;
        id: string;
        name?: string;
    },
    details: Record<string, unknown> = {},
    metadata: ActivityLog['metadata'] = {}
): Promise<ActivityLog> {
    try {
        const record = await db.activity.create({
            data: {
                organizationId,
                userId,
                userName,
                action,
                resourceType: resource.type,
                resourceId: resource.id,
                resourceName: sanitizeForDb(resource.name, 100),
                details: Object.keys(details).length > 0 ? sanitizeForDb(JSON.stringify(details)) : null,
            },
        });

        logger.debug({ organizationId, action, resourceId: resource.id }, 'Activity logged');

        return {
            id: record.id,
            organizationId: record.organizationId,
            userId: record.userId || '',
            userName: record.userName || '',
            action: record.action as ActivityAction,
            resourceType: record.resourceType,
            resourceId: record.resourceId || '',
            resourceName: record.resourceName,
            details: record.details ? JSON.parse(record.details as string) : {},
            metadata,
            createdAt: record.createdAt,
        };
    } catch (error) {
        logger.error({ error, organizationId, action }, 'Failed to persist activity log');
        // Return an in-memory record as fallback so callers don't break
        return {
            id: `activity_${Date.now()}`,
            organizationId,
            userId,
            userName,
            action,
            resourceType: resource.type,
            resourceId: resource.id,
            resourceName: resource.name,
            details,
            metadata,
            createdAt: new Date(),
        };
    }
}

/**
 * Get activity logs with filtering
 */
export async function getActivityLogs(
    organizationId: string,
    filter: ActivityFilter = {},
    pagination: { page: number; limit: number } = { page: 1, limit: 50 }
): Promise<{
    logs: ActivityLog[];
    total: number;
    hasMore: boolean;
}> {
    // Build Prisma where clause from filters
    const where: Record<string, unknown> = { organizationId };

    if (filter.actions && filter.actions.length > 0) {
        where.action = { in: filter.actions };
    }

    if (filter.userId) {
        where.userId = filter.userId;
    }

    if (filter.resourceType) {
        where.resourceType = filter.resourceType;
    }

    if (filter.dateRange) {
        where.createdAt = {
            gte: filter.dateRange.start,
            lte: filter.dateRange.end,
        };
    }

    if (filter.search) {
        where.OR = [
            { resourceName: { contains: filter.search, mode: 'insensitive' } },
            { userName: { contains: filter.search, mode: 'insensitive' } },
        ];
    }

    const skip = (pagination.page - 1) * pagination.limit;

    const [records, total] = await Promise.all([
        db.activity.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: pagination.limit,
            skip,
        }),
        db.activity.count({ where }),
    ]);

    const logs: ActivityLog[] = records.map((r: { id: string; organizationId: string; userId: string | null; userName: string | null; action: string; resourceType: string; resourceId: string | null; resourceName: string; details: string | null; createdAt: Date }) => ({
        id: r.id,
        organizationId: r.organizationId,
        userId: r.userId || '',
        userName: r.userName || '',
        action: r.action as ActivityAction,
        resourceType: r.resourceType,
        resourceId: r.resourceId || '',
        resourceName: r.resourceName,
        details: r.details ? JSON.parse(r.details as string) : {},
        metadata: {},
        createdAt: r.createdAt,
    }));

    return {
        logs,
        total,
        hasMore: skip + pagination.limit < total,
    };
}

/**
 * Get activity summary for dashboard
 */
export async function getActivitySummary(
    organizationId: string,
    days: number = 7
): Promise<{
    totalActions: number;
    byAction: Record<string, number>;
    byUser: Array<{ userId: string; userName: string; count: number }>;
    recentHighlights: ActivityLog[];
}> {
    const { logs } = await getActivityLogs(organizationId, {}, { page: 1, limit: 100 });

    const byAction: Record<string, number> = {};
    const byUserMap: Record<string, { userName: string; count: number }> = {};

    logs.forEach(log => {
        const actionType = log.action.split('.')[0];
        byAction[actionType] = (byAction[actionType] || 0) + 1;

        if (!byUserMap[log.userId]) {
            byUserMap[log.userId] = { userName: log.userName, count: 0 };
        }
        byUserMap[log.userId].count++;
    });

    const byUser = Object.entries(byUserMap).map(([userId, data]) => ({
        userId,
        userName: data.userName,
        count: data.count,
    }));

    return {
        totalActions: logs.length,
        byAction,
        byUser,
        recentHighlights: logs.slice(0, 5),
    };
}

/**
 * Export activity logs
 */
export async function exportActivityLogs(
    organizationId: string,
    filter: ActivityFilter,
    format: 'csv' | 'json'
): Promise<string> {
    const { logs } = await getActivityLogs(organizationId, filter, { page: 1, limit: 10000 });

    if (format === 'json') {
        return JSON.stringify(logs, null, 2);
    }

    // CSV format
    const headers = ['timestamp', 'user', 'action', 'resource_type', 'resource_name', 'details'];
    const lines = [headers.join(',')];

    logs.forEach(log => {
        const row = [
            log.createdAt.toISOString(),
            `"${log.userName}"`,
            log.action,
            log.resourceType,
            `"${log.resourceName || ''}"`,
            `"${JSON.stringify(log.details).replace(/"/g, '""')}"`,
        ];
        lines.push(row.join(','));
    });

    return lines.join('\n');
}
