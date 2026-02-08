/**
 * Export Reports Service
 * Generate PDF and CSV reports for analytics
 */

import { toast } from '@/components/ui/toast';
import { db } from '@/lib/db';

export interface ReportConfig {
    type: 'analytics' | 'revenue' | 'posts' | 'engagement';
    format: 'pdf' | 'csv' | 'xlsx';
    dateRange: {
        start: Date;
        end: Date;
    };
    platforms?: string[];
    includeCharts?: boolean;
    groupBy?: 'day' | 'week' | 'month';
}

export interface ReportData {
    title: string;
    generatedAt: Date;
    dateRange: { start: Date; end: Date };
    summary: Record<string, string | number>;
    tables: ReportTable[];
    charts?: ReportChart[];
}

export interface ReportTable {
    name: string;
    headers: string[];
    rows: (string | number)[][];
}

export interface ReportChart {
    type: 'line' | 'bar' | 'pie';
    title: string;
    data: { label: string; value: number }[];
}

/**
 * Generate report data based on config
 */
export async function generateReportData(config: ReportConfig): Promise<ReportData> {
    switch (config.type) {
        case 'analytics':
            return generateAnalyticsReport(config);
        case 'revenue':
            return generateRevenueReport(config);
        case 'posts':
            return generatePostsReport(config);
        case 'engagement':
            return generateEngagementReport(config);
        default:
            throw new Error(`Unknown report type: ${config.type}`);
    }
}

async function generateAnalyticsReport(config: ReportConfig): Promise<ReportData> {
    // Query real post counts by status
    const [totalPublished, totalScheduled, totalFailed] = await Promise.all([
        db.post.count({ where: { status: 'PUBLISHED', publishedAt: { gte: config.dateRange.start, lte: config.dateRange.end } } }),
        db.post.count({ where: { status: 'SCHEDULED', scheduledAt: { gte: config.dateRange.start, lte: config.dateRange.end } } }),
        db.post.count({ where: { status: 'FAILED', updatedAt: { gte: config.dateRange.start, lte: config.dateRange.end } } }),
    ]);

    return {
        title: 'Analytics Report',
        generatedAt: new Date(),
        dateRange: config.dateRange,
        summary: {
            'Published Posts': totalPublished,
            'Scheduled Posts': totalScheduled,
            'Failed Posts': totalFailed,
            'Total Posts': totalPublished + totalScheduled + totalFailed,
        },
        tables: [
            {
                name: 'Post Summary',
                headers: ['Metric', 'Count'],
                rows: [
                    ['Published', totalPublished],
                    ['Scheduled', totalScheduled],
                    ['Failed', totalFailed],
                ],
            },
        ],
    };
}

async function generateRevenueReport(config: ReportConfig): Promise<ReportData> {
    // Revenue attribution requires UTM/conversion tracking integration
    return {
        title: 'Revenue Attribution Report',
        generatedAt: new Date(),
        dateRange: config.dateRange,
        summary: {
            'Note': 'Revenue tracking not yet integrated',
        },
        tables: [],
    };
}

async function generatePostsReport(config: ReportConfig): Promise<ReportData> {
    const posts = await db.post.findMany({
        where: {
            OR: [
                { publishedAt: { gte: config.dateRange.start, lte: config.dateRange.end } },
                { scheduledAt: { gte: config.dateRange.start, lte: config.dateRange.end } },
            ],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
            caption: true,
            status: true,
            platform: true,
            publishedAt: true,
            scheduledAt: true,
        },
    });

    const rows = posts.map(p => [
        (p.publishedAt || p.scheduledAt || new Date()).toLocaleDateString(),
        p.platform || 'N/A',
        (p.caption || '').slice(0, 60) + ((p.caption?.length || 0) > 60 ? '...' : ''),
        p.status,
    ]);

    return {
        title: 'Posts Performance Report',
        generatedAt: new Date(),
        dateRange: config.dateRange,
        summary: {
            'Total Posts': posts.length,
            'Published': posts.filter(p => p.status === 'PUBLISHED').length,
            'Scheduled': posts.filter(p => p.status === 'SCHEDULED').length,
            'Failed': posts.filter(p => p.status === 'FAILED').length,
        },
        tables: [
            {
                name: 'All Posts',
                headers: ['Date', 'Platform', 'Caption', 'Status'],
                rows,
            },
        ],
    };
}

async function generateEngagementReport(config: ReportConfig): Promise<ReportData> {
    // Engagement metrics require platform API integration for comments/DMs
    return {
        title: 'Engagement Report',
        generatedAt: new Date(),
        dateRange: config.dateRange,
        summary: {
            'Note': 'Engagement tracking requires platform API integration',
        },
        tables: [],
    };
}

/**
 * Export to CSV format
 */
export function exportToCSV(data: ReportData): string {
    const lines: string[] = [];

    // Title and metadata
    lines.push(`"${data.title}"`);
    lines.push(`"Generated: ${data.generatedAt.toISOString()}"`);
    lines.push(`"Date Range: ${data.dateRange.start.toLocaleDateString()} - ${data.dateRange.end.toLocaleDateString()}"`);
    lines.push('');

    // Summary
    lines.push('"Summary"');
    Object.entries(data.summary).forEach(([key, value]) => {
        lines.push(`"${key}","${value}"`);
    });
    lines.push('');

    // Tables
    data.tables.forEach(table => {
        lines.push(`"${table.name}"`);
        lines.push(table.headers.map(h => `"${h}"`).join(','));
        table.rows.forEach(row => {
            lines.push(row.map(cell => `"${cell}"`).join(','));
        });
        lines.push('');
    });

    return lines.join('\n');
}

/**
 * Trigger download of report
 */
export function downloadReport(
    data: ReportData,
    format: 'csv' | 'pdf'
): void {
    if (format === 'csv') {
        const csv = exportToCSV(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `${data.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.csv`;
        link.click();

        URL.revokeObjectURL(url);
    } else if (format === 'pdf') {
        // PDF generation not yet implemented — needs jsPDF or server-side rendering
        toast('info', 'PDF export coming soon', 'CSV export is available now.');
    }
}

/**
 * Schedule recurring report
 */
export interface ScheduledReport {
    id: string;
    config: ReportConfig;
    schedule: 'daily' | 'weekly' | 'monthly';
    recipients: string[];
    isActive: boolean;
    lastSentAt?: Date;
    nextSendAt: Date;
}

export async function scheduleReport(
    organizationId: string,
    config: ReportConfig,
    schedule: 'daily' | 'weekly' | 'monthly',
    recipients: string[]
): Promise<ScheduledReport> {
    // In production, save to database and set up cron job

    const now = new Date();
    const nextSendAt = new Date(now);

    switch (schedule) {
        case 'daily':
            nextSendAt.setDate(nextSendAt.getDate() + 1);
            nextSendAt.setHours(9, 0, 0, 0);
            break;
        case 'weekly':
            nextSendAt.setDate(nextSendAt.getDate() + (7 - nextSendAt.getDay()));
            nextSendAt.setHours(9, 0, 0, 0);
            break;
        case 'monthly':
            nextSendAt.setMonth(nextSendAt.getMonth() + 1);
            nextSendAt.setDate(1);
            nextSendAt.setHours(9, 0, 0, 0);
            break;
    }

    return {
        id: `report_${Date.now()}`,
        config,
        schedule,
        recipients,
        isActive: true,
        nextSendAt,
    };
}
