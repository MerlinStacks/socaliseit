import { InboxOptions, InboxType } from './inbox-model';

export interface InboxReport {
    data: {
        generatedAt: string;
        summary: { open: number; resolved: number; snoozed: number; unassignedOpen: number; openOlderThan24h: number; openOlderThan72h: number };
        byType: { type: InboxType; open: number; resolved: number; snoozed: number }[];
        byAssignee: { userId: string | null; name: string; open: number; olderThan24h: number }[];
        ageBuckets: { key: 'under24h' | '24to72h' | 'over72h'; label: string; count: number }[];
    };
    definitions: { aging: string; resolutions: string };
}
export interface ReportingFilters { socialAccountId: string; platform: string }
/** Remove unavailable selections, including accounts incompatible with the selected platform. */
export function validReportingFilters(filters: ReportingFilters, accounts: InboxOptions['accounts']): ReportingFilters {
    const platform = accounts.some(account => account.platform === filters.platform) ? filters.platform : '';
    const socialAccountId = accounts.some(account => account.id === filters.socialAccountId && (!platform || account.platform === platform)) ? filters.socialAccountId : '';
    return { socialAccountId, platform };
}
export function reportingParams(filters: ReportingFilters) {
    const params = new URLSearchParams();
    if (filters.socialAccountId) params.set('socialAccountId', filters.socialAccountId);
    if (filters.platform) params.set('platform', filters.platform);
    return params.toString();
}
export function workloadPercent(count: number, total: number) {
    return total > 0 ? Math.min(100, Math.max(0, count / total * 100)) : 0;
}
