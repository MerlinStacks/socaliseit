/**
 * PDF Report Generator
 * Creates branded monthly performance reports using jsPDF.
 *
 * Why: Enables automated report generation and scheduled email delivery
 * for workspace analytics.
 */

// Note: jsPDF is a client-side library. For server-side PDF generation,
// consider using Puppeteer or @react-pdf/renderer with Node.js.
// This implementation provides the data structure and client-side generation.

import { db } from '@/lib/db';
import { formatDate, formatNumber, formatPercent } from '@/lib/formatters';
import { logger } from '@/lib/logger';

// ============================================================================
// TYPES
// ============================================================================

export interface ReportConfig {
    organizationId: string;
    dateRange: {
        start: Date;
        end: Date;
    };
    metrics: ReportMetric[];
    includeCompetitors: boolean;
    includePredictions: boolean;
    platforms?: string[];
    groupBy: 'day' | 'week' | 'month';
}

export type ReportMetric =
    | 'impressions'
    | 'reach'
    | 'engagement'
    | 'followers'
    | 'posts'
    | 'clicks'
    | 'saves'
    | 'shares';

export interface ReportData {
    title: string;
    generatedAt: Date;
    dateRange: { start: Date; end: Date };
    organization: {
        name: string;
        logo?: string;
    };
    summary: ReportSummary;
    metrics: MetricData[];
    topPosts: TopPost[];
    competitors?: CompetitorData[];
    predictions?: PredictionData;
}

export interface ReportSummary {
    totalImpressions: number;
    totalReach: number;
    avgEngagementRate: number;
    totalFollowersGained: number;
    totalPostsPublished: number;
    bestPerformingPlatform: string;
}

export interface MetricData {
    date: string;
    impressions: number;
    reach: number;
    engagement: number;
    followers: number;
}

export interface TopPost {
    id: string;
    caption: string;
    platform: string;
    publishedAt: Date;
    impressions: number;
    engagement: number;
    thumbnailUrl?: string;
}

export interface CompetitorData {
    username: string;
    platform: string;
    followers: number;
    avgEngagement: number;
    shareOfVoice: number;
}

export interface PredictionData {
    nextWeekEstimate: {
        impressions: number;
        reach: number;
        engagement: number;
    };
    recommendations: string[];
}

// ============================================================================
// DATA FETCHING
// ============================================================================

/**
 * Fetch all data needed for a report.
 */
export async function fetchReportData(config: ReportConfig): Promise<ReportData> {
    const { organizationId, dateRange, includeCompetitors } = config;

    // Fetch organization info
    const organization = await db.organization.findUnique({
        where: { id: organizationId },
        select: { name: true, logo: true },
    });

    if (!organization) {
        throw new Error('Organization not found');
    }

    // Fetch platform analytics within date range
    const analytics = await db.platformAnalytics.findMany({
        where: {
            organizationId,
            date: {
                gte: dateRange.start,
                lte: dateRange.end,
            },
        },
        orderBy: { date: 'asc' },
        include: {
            socialAccount: true,
        },
    });

    // Fetch published posts with analytics
    const posts = await db.post.findMany({
        where: {
            organizationId,
            status: 'PUBLISHED',
            publishedAt: {
                gte: dateRange.start,
                lte: dateRange.end,
            },
        },
        include: {
            analytics: true,
            socialAccount: true,
            media: {
                include: {
                    media: true,
                },
                take: 1,
            },
        },
        orderBy: { publishedAt: 'desc' },
    });

    // Calculate summary
    const summary = calculateSummary(analytics, posts);

    // Aggregate metrics by date
    const metrics = aggregateMetrics(analytics, config.groupBy);

    // Get top performing posts
    const topPosts = getTopPosts(posts, 5);

    // Fetch competitor data if requested
    let competitors: CompetitorData[] | undefined;
    if (includeCompetitors) {
        const competitorRecords = await db.competitor.findMany({
            where: { organizationId },
            orderBy: { avgEngagement: 'desc' },
            take: 5,
        });

        competitors = competitorRecords.map((c) => ({
            username: c.username,
            platform: c.platform,
            followers: c.followers,
            avgEngagement: c.avgEngagement,
            shareOfVoice: c.shareOfVoice,
        }));
    }

    // Generate predictions if requested
    let predictions: PredictionData | undefined;
    if (config.includePredictions) {
        predictions = generatePredictions(analytics, posts);
    }

    return {
        title: `${organization.name} Performance Report`,
        generatedAt: new Date(),
        dateRange,
        organization: {
            name: organization.name,
            logo: organization.logo ?? undefined,
        },
        summary,
        metrics,
        topPosts,
        competitors,
        predictions,
    };
}

// ============================================================================
// DATA PROCESSING
// ============================================================================

interface AnalyticsRecord {
    impressions: number;
    reach: number;
    engagementRate: number;
    followersChange: number;
    socialAccount: { platform: string };
}

interface PostRecord {
    analytics: { impressions: number; engagementRate: number } | null;
}

function calculateSummary(
    analytics: AnalyticsRecord[],
    posts: PostRecord[]
): ReportSummary {
    const totalImpressions = analytics.reduce((sum, a) => sum + a.impressions, 0);
    const totalReach = analytics.reduce((sum, a) => sum + a.reach, 0);
    const avgEngagementRate =
        analytics.length > 0
            ? analytics.reduce((sum, a) => sum + a.engagementRate, 0) / analytics.length
            : 0;
    const totalFollowersGained = analytics.reduce(
        (sum, a) => sum + a.followersChange,
        0
    );

    // Find best performing platform
    const platformStats: Record<string, { impressions: number; count: number }> = {};
    analytics.forEach((a) => {
        const platform = a.socialAccount.platform;
        if (!platformStats[platform]) {
            platformStats[platform] = { impressions: 0, count: 0 };
        }
        platformStats[platform].impressions += a.impressions;
        platformStats[platform].count += 1;
    });

    const bestPlatform = Object.entries(platformStats).sort(
        (a, b) => b[1].impressions - a[1].impressions
    )[0];

    return {
        totalImpressions,
        totalReach,
        avgEngagementRate,
        totalFollowersGained,
        totalPostsPublished: posts.length,
        bestPerformingPlatform: bestPlatform?.[0] ?? 'N/A',
    };
}

interface AnalyticsWithDate {
    date: Date;
    impressions: number;
    reach: number;
    engagementRate: number;
    followers: number;
}

function aggregateMetrics(
    analytics: AnalyticsWithDate[],
    groupBy: 'day' | 'week' | 'month'
): MetricData[] {
    const grouped: Record<
        string,
        { impressions: number; reach: number; engagement: number; followers: number; count: number }
    > = {};

    analytics.forEach((a) => {
        let key: string;
        const date = new Date(a.date);

        switch (groupBy) {
            case 'week':
                const weekStart = new Date(date);
                weekStart.setDate(date.getDate() - date.getDay());
                key = weekStart.toISOString().split('T')[0];
                break;
            case 'month':
                key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                break;
            default:
                key = date.toISOString().split('T')[0];
        }

        if (!grouped[key]) {
            grouped[key] = { impressions: 0, reach: 0, engagement: 0, followers: 0, count: 0 };
        }

        grouped[key].impressions += a.impressions;
        grouped[key].reach += a.reach;
        grouped[key].engagement += a.engagementRate;
        grouped[key].followers += a.followers;
        grouped[key].count += 1;
    });

    return Object.entries(grouped)
        .map(([date, data]) => ({
            date,
            impressions: data.impressions,
            reach: data.reach,
            engagement: data.count > 0 ? data.engagement / data.count : 0,
            followers: data.followers,
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

interface PostWithAnalytics {
    id: string;
    caption: string;
    platform: string | null;
    publishedAt: Date | null;
    analytics: { impressions: number; engagementRate: number } | null;
    media: Array<{ media: { thumbnailUrl: string | null } }>;
}

function getTopPosts(posts: PostWithAnalytics[], limit: number): TopPost[] {
    return posts
        .map((post) => {
            return {
                id: post.id,
                caption: post.caption.substring(0, 100) + (post.caption.length > 100 ? '...' : ''),
                platform: post.platform ?? 'unknown',
                publishedAt: post.publishedAt ?? new Date(),
                impressions: post.analytics?.impressions ?? 0,
                engagement: post.analytics?.engagementRate ?? 0,
                thumbnailUrl: post.media[0]?.media.thumbnailUrl ?? undefined,
            };
        })
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, limit);
}

function generatePredictions(
    analytics: AnalyticsWithDate[],
    posts: PostWithAnalytics[]
): PredictionData {
    // Simple linear projection based on recent trends
    const recentAnalytics = analytics.slice(-7);
    const avgImpressions =
        recentAnalytics.reduce((sum, a) => sum + a.impressions, 0) / Math.max(recentAnalytics.length, 1);
    const avgReach =
        recentAnalytics.reduce((sum, a) => sum + a.reach, 0) / Math.max(recentAnalytics.length, 1);
    const avgEngagement =
        recentAnalytics.reduce((sum, a) => sum + a.engagementRate, 0) /
        Math.max(recentAnalytics.length, 1);

    // Generate recommendations based on patterns
    const recommendations: string[] = [];

    if (avgEngagement < 2) {
        recommendations.push('Consider posting more engaging content with calls-to-action');
    }

    if (posts.length < 7) {
        recommendations.push('Increase posting frequency to maintain audience engagement');
    }

    const hasVideoContent = posts.some((p) =>
        p.media.some((m) => m.media.thumbnailUrl?.includes('video'))
    );
    if (!hasVideoContent) {
        recommendations.push('Try incorporating video content for higher engagement');
    }

    if (recommendations.length === 0) {
        recommendations.push('Your performance is strong! Keep up the consistent posting');
    }

    return {
        nextWeekEstimate: {
            impressions: Math.round(avgImpressions * 7 * 1.05), // 5% growth projection
            reach: Math.round(avgReach * 7 * 1.03),
            engagement: avgEngagement,
        },
        recommendations,
    };
}

// ============================================================================
// PDF GENERATION (Client-side)
// ============================================================================

/**
 * Generate a PDF report from report data.
 * Must be called from client-side code with jsPDF loaded.
 */
export async function generatePdfReport(data: ReportData): Promise<Blob> {
    // Dynamic import for client-side only
    const { default: jsPDF } = await import('jspdf');

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let yPos = margin;

    // Header
    doc.setFontSize(24);
    doc.setTextColor(33, 33, 33);
    doc.text(data.title, margin, yPos);
    yPos += 12;

    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(
        `${formatDate(data.dateRange.start)} - ${formatDate(data.dateRange.end)}`,
        margin,
        yPos
    );
    yPos += 8;
    doc.text(`Generated: ${formatDate(data.generatedAt)}`, margin, yPos);
    yPos += 15;

    // Summary Section
    doc.setFontSize(16);
    doc.setTextColor(33, 33, 33);
    doc.text('Performance Summary', margin, yPos);
    yPos += 10;

    doc.setFontSize(11);
    doc.setTextColor(66, 66, 66);

    const summaryItems = [
        ['Total Impressions', formatNumber(data.summary.totalImpressions)],
        ['Total Reach', formatNumber(data.summary.totalReach)],
        ['Avg. Engagement Rate', formatPercent(data.summary.avgEngagementRate)],
        ['Followers Gained', `+${formatNumber(data.summary.totalFollowersGained)}`],
        ['Posts Published', data.summary.totalPostsPublished.toString()],
        ['Best Platform', data.summary.bestPerformingPlatform],
    ];

    summaryItems.forEach(([label, value]) => {
        doc.text(`${label}: ${value}`, margin, yPos);
        yPos += 6;
    });

    yPos += 10;

    // Top Posts Section
    if (data.topPosts.length > 0) {
        doc.setFontSize(16);
        doc.setTextColor(33, 33, 33);
        doc.text('Top Performing Posts', margin, yPos);
        yPos += 10;

        doc.setFontSize(10);
        data.topPosts.forEach((post, index) => {
            if (yPos > 260) {
                doc.addPage();
                yPos = margin;
            }

            doc.setTextColor(33, 33, 33);
            doc.text(`${index + 1}. ${post.caption}`, margin, yPos);
            yPos += 5;

            doc.setTextColor(100, 100, 100);
            doc.text(
                `${post.platform} | ${formatNumber(post.impressions)} impressions | ${formatPercent(post.engagement)} engagement`,
                margin + 5,
                yPos
            );
            yPos += 8;
        });
    }

    // Competitors Section
    if (data.competitors && data.competitors.length > 0) {
        yPos += 5;
        doc.setFontSize(16);
        doc.setTextColor(33, 33, 33);
        doc.text('Competitor Analysis', margin, yPos);
        yPos += 10;

        doc.setFontSize(10);
        data.competitors.forEach((comp) => {
            if (yPos > 260) {
                doc.addPage();
                yPos = margin;
            }

            doc.setTextColor(33, 33, 33);
            doc.text(`@${comp.username} (${comp.platform})`, margin, yPos);
            yPos += 5;

            doc.setTextColor(100, 100, 100);
            doc.text(
                `${formatNumber(comp.followers)} followers | ${formatPercent(comp.avgEngagement)} avg. engagement | ${formatPercent(comp.shareOfVoice)} share of voice`,
                margin + 5,
                yPos
            );
            yPos += 8;
        });
    }

    // Predictions Section
    if (data.predictions) {
        yPos += 5;
        doc.setFontSize(16);
        doc.setTextColor(33, 33, 33);
        doc.text('Next Week Predictions', margin, yPos);
        yPos += 10;

        doc.setFontSize(11);
        doc.setTextColor(66, 66, 66);
        doc.text(
            `Est. Impressions: ${formatNumber(data.predictions.nextWeekEstimate.impressions)}`,
            margin,
            yPos
        );
        yPos += 6;
        doc.text(
            `Est. Reach: ${formatNumber(data.predictions.nextWeekEstimate.reach)}`,
            margin,
            yPos
        );
        yPos += 10;

        doc.setFontSize(12);
        doc.text('Recommendations:', margin, yPos);
        yPos += 6;

        doc.setFontSize(10);
        data.predictions.recommendations.forEach((rec) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = margin;
            }
            doc.text(`• ${rec}`, margin + 5, yPos);
            yPos += 5;
        });
    }

    // Footer
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
            `Page ${i} of ${totalPages} | Generated by Overseek Socials`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    return doc.output('blob');
}

// ============================================================================
// REPORT SCHEDULING
// ============================================================================

/**
 * Schedule a recurring report.
 */
export async function scheduleReport(
    organizationId: string,
    name: string,
    schedule: string,
    recipients: string[],
    config: Omit<ReportConfig, 'organizationId'>
): Promise<{ id: string }> {
    const nextRunAt = calculateNextRun(schedule);

    const report = await db.scheduledReport.create({
        data: {
            organizationId,
            name,
            schedule,
            recipients,
            config: {
                ...config,
                dateRange: {
                    start: config.dateRange.start.toISOString(),
                    end: config.dateRange.end.toISOString(),
                },
            },
            nextRunAt,
            isActive: true,
        },
    });

    logger.info({ reportId: report.id, organizationId }, 'Scheduled report created');

    return { id: report.id };
}

/**
 * Calculate the next run time from a cron expression.
 * Simplified implementation - use a proper cron parser for production.
 */
function calculateNextRun(cronExpression: string): Date {
    // Simple weekly calculation for common patterns
    // Format: "0 9 * * 1" = Monday 9am
    const parts = cronExpression.split(' ');
    const hour = parseInt(parts[1]) || 9;
    const dayOfWeek = parseInt(parts[4]) || 1; // 1 = Monday

    const now = new Date();
    const next = new Date(now);

    // Find next occurrence of dayOfWeek
    const daysUntil = (dayOfWeek - now.getDay() + 7) % 7 || 7;
    next.setDate(now.getDate() + daysUntil);
    next.setHours(hour, 0, 0, 0);

    return next;
}
