/**
 * Analytics Client Component
 * Handles responsive rendering between desktop and mobile layouts
 */

'use client';

import { useIsMobile } from '@/hooks/use-mobile';
import { AnalyticsMobile } from './analytics-mobile';
import { Suspense } from 'react';

interface EngagementMetrics {
    totalLikes: number;
    totalComments: number;
    totalShares: number;
    totalSaves: number;
    totalReach: number;
    totalImpressions: number;
    totalClicks: number;
    totalVideoViews: number;
    avgEngagementRate: number;
    likesChange: number;
    commentsChange: number;
    sharesChange: number;
    reachChange: number;
    impressionsChange: number;
    savesChange: number;
    clicksChange: number;
    videoViewsChange: number;
}

interface TopPost {
    id: string;
    caption: string;
    thumbnail: string | null;
    platforms: string[];
    publishedAt: Date | null;
    metrics: { likes: number; comments: number; shares: number };
}

interface AnalyticsClientProps {
    accountsCount: number;
    totalPosts: number;
    publishedPosts: number;
    scheduledPosts: number;
    postsChange: number;
    engagement: EngagementMetrics;
    hasEngagementData: boolean;
    timelineData: { day: string; count: number }[];
    topPosts: TopPost[];
    availablePlatforms: string[];
    currentPlatform: string | undefined;
    currentRange: string;
    heatmapData: any[]; // Using any[] temporarily to avoid circular dep or import issues, or import type
    desktopContent: React.ReactNode;
}

export function AnalyticsClient({
    accountsCount,
    totalPosts,
    publishedPosts,
    scheduledPosts,
    postsChange,
    engagement,
    hasEngagementData,
    timelineData,
    topPosts,
    availablePlatforms,
    currentPlatform,
    currentRange,
    heatmapData,
    desktopContent,
}: AnalyticsClientProps) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <Suspense fallback={<div className="p-4">Loading...</div>}>
                <AnalyticsMobile
                    accountsCount={accountsCount}
                    totalPosts={totalPosts}
                    publishedPosts={publishedPosts}
                    scheduledPosts={scheduledPosts}
                    postsChange={postsChange}
                    engagement={engagement}
                    hasEngagementData={hasEngagementData}
                    timelineData={timelineData}
                    topPosts={topPosts}
                    availablePlatforms={availablePlatforms}
                    currentPlatform={currentPlatform}
                    currentRange={currentRange}
                />
            </Suspense>
        );
    }

    return <>{desktopContent}</>;
}
