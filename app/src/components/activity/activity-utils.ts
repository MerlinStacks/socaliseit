export interface ActivityItem {
    id: string;
    user: { name: string };
    action: string;
    resourceType: string;
    resourceId: string | null;
    resourceName: string;
    timestamp: string;
    createdAt: string;
    details?: string | null;
}

export interface ActivityResponse {
    activities: ActivityItem[];
    categories: { type: string; count: number }[];
    workspaceTotal: number;
    total: number;
    offset: number;
    hasMore: boolean;
}

export function activityLabel(type: string): string {
    const labels: Record<string, string> = { all: 'All activity', post: 'Posts', media: 'Media', account: 'Accounts', team: 'Team', automation: 'Automations', pillar: 'Content pillars', competitor: 'Competitors', template: 'Templates', hashtag: 'Hashtags', hashtag_collection: 'Hashtag collections' };
    return labels[type] ?? type.replace(/[_-]/g, ' ').replace(/^./, char => char.toUpperCase());
}

/** Quote CSV fields and neutralize spreadsheet formulas in user-controlled content. */
export function activityCsv(activities: ActivityItem[]): string {
    const cell = (value: string) => `"${(/^[\s]*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
    const rows = activities.map(item => [item.createdAt, item.user.name, item.action, item.resourceType, item.resourceName, item.details ?? '']);
    return [['Timestamp', 'User', 'Action', 'Resource Type', 'Resource Name', 'Details'], ...rows].map(row => row.map(cell).join(',')).join('\r\n');
}

export function exportActivityCsv(activities: ActivityItem[]) {
    const url = URL.createObjectURL(new Blob(['\uFEFF', activityCsv(activities)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `activity-log-loaded-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
