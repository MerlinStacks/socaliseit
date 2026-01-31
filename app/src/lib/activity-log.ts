/**
 * Activity Log Service
 * Audit trail for all workspace actions
 */

import { logger } from './logger';

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
    | 'workspace.created'
    | 'automation.created'
    | 'automation.triggered'
    | 'export.generated'
    | 'import.completed'
    | 'comment.replied'
    | 'dm.sent';

export interface ActivityLog {
    id: string;
    workspaceId: string;
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
    'workspace.created': 'created a workspace',
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
    workspace: '🏢',
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
    workspaceId: string,
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
    const log: ActivityLog = {
        id: `activity_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        workspaceId,
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

    // TODO: In production, save to database
    logger.debug({ workspaceId, action, resourceId: resource.id }, 'Activity logged');

    return log;
}

/**
 * Get activity logs with filtering
 */
export async function getActivityLogs(
    workspaceId: string,
    filter: ActivityFilter = {},
    pagination: { page: number; limit: number } = { page: 1, limit: 50 }
): Promise<{
    logs: ActivityLog[];
    total: number;
    hasMore: boolean;
}> {
    // Mock data - in production, query database with filters
    const mockLogs: ActivityLog[] = [
        {
            id: 'act_1',
            workspaceId,
            userId: 'user_1',
            userName: 'John Doe',
            action: 'post.published',
            resourceType: 'post',
            resourceId: 'post_123',
            resourceName: 'New summer collection...',
            details: { platform: 'instagram', scheduledAt: '2024-01-20T10:00:00Z' },
            metadata: {},
            createdAt: new Date(Date.now() - 1000 * 60 * 30), // 30 min ago
        },
        {
            id: 'act_2',
            workspaceId,
            userId: 'user_1',
            userName: 'John Doe',
            action: 'post.scheduled',
            resourceType: 'post',
            resourceId: 'post_124',
            resourceName: 'Behind the scenes...',
            details: { platforms: ['instagram', 'tiktok'], scheduledFor: '2024-01-25T14:00:00Z' },
            metadata: {},
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
        },
        {
            id: 'act_3',
            workspaceId,
            userId: 'user_2',
            userName: 'Jane Smith',
            action: 'account.connected',
            resourceType: 'account',
            resourceId: 'acc_tiktok',
            resourceName: 'TikTok - @brandname',
            details: { platform: 'tiktok' },
            metadata: {},
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
        },
        {
            id: 'act_4',
            workspaceId,
            userId: 'user_1',
            userName: 'John Doe',
            action: 'automation.triggered',
            resourceType: 'automation',
            resourceId: 'auto_1',
            resourceName: 'Welcome New Followers',
            details: { trigger: 'new_follower', recipient: '@happy_customer' },
            metadata: {},
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8), // 8 hours ago
        },
        {
            id: 'act_5',
            workspaceId,
            userId: 'user_1',
            userName: 'John Doe',
            action: 'media.uploaded',
            resourceType: 'media',
            resourceId: 'media_567',
            resourceName: 'product-shot.jpg',
            details: { fileSize: '2.4 MB', type: 'image/jpeg' },
            metadata: {},
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
        },
    ];

    // Apply filters
    let filtered = mockLogs;

    if (filter.actions && filter.actions.length > 0) {
        filtered = filtered.filter(l => filter.actions!.includes(l.action));
    }

    if (filter.userId) {
        filtered = filtered.filter(l => l.userId === filter.userId);
    }

    if (filter.resourceType) {
        filtered = filtered.filter(l => l.resourceType === filter.resourceType);
    }

    if (filter.search) {
        const search = filter.search.toLowerCase();
        filtered = filtered.filter(l =>
            l.resourceName?.toLowerCase().includes(search) ||
            l.userName.toLowerCase().includes(search)
        );
    }

    const start = (pagination.page - 1) * pagination.limit;
    const paginated = filtered.slice(start, start + pagination.limit);

    return {
        logs: paginated,
        total: filtered.length,
        hasMore: start + pagination.limit < filtered.length,
    };
}

/**
 * Get activity summary for dashboard
 */
export async function getActivitySummary(
    workspaceId: string,
    days: number = 7
): Promise<{
    totalActions: number;
    byAction: Record<string, number>;
    byUser: Array<{ userId: string; userName: string; count: number }>;
    recentHighlights: ActivityLog[];
}> {
    const { logs } = await getActivityLogs(workspaceId, {}, { page: 1, limit: 100 });

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
    workspaceId: string,
    filter: ActivityFilter,
    format: 'csv' | 'json'
): Promise<string> {
    const { logs } = await getActivityLogs(workspaceId, filter, { page: 1, limit: 10000 });

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
