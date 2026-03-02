/**
 * Dashboard Client Wrapper
 * Handles responsive rendering between desktop and mobile layouts
 * 
 * Why: Dashboard page is a server component; this enables client-side
 * mobile detection and conditional rendering
 */

'use client';

import { useIsMobile } from '@/hooks/use-mobile';
import { DashboardMobile } from './dashboard-mobile';
import type { PlatformActivity } from '@/components/dashboard/platform-activity-banner';

/** Serialised todo post shape passed from server to mobile client */
export interface TodoPost {
    id: string;
    caption: string;
    postType: string;
    createdAt: Date;
    scheduledAt: Date | null;
    platform: string | null;
    accountName: string | null;
    pillarName: string | null;
    pillarColor: string | null;
}

interface DashboardClientProps {
    userName: string;
    stats: {
        connectedAccounts: number;
        platformList: string[];
        scheduledCount: number;
        totalPosts: number;
        publishedCount: number;
        draftCount: number;
    };
    upcomingPosts: Array<{
        id: string;
        caption: string;
        scheduledAt: Date | null;
    }>;
    scheduledDates: string[];
    hasAccounts: boolean;
    hasPosts: boolean;
    /** Desktop content rendered by server */
    desktopContent: React.ReactNode;
    /** Per-platform activity data for the activity banner */
    platformActivity: PlatformActivity[];
    /** Draft posts for the Content To Do list */
    todoPosts: TodoPost[];
}

export function DashboardClient({
    userName,
    stats,
    upcomingPosts,
    scheduledDates,
    hasAccounts,
    hasPosts,
    desktopContent,
    platformActivity,
    todoPosts,
}: DashboardClientProps) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <DashboardMobile
                userName={userName}
                stats={stats}
                upcomingPosts={upcomingPosts}
                scheduledDates={scheduledDates}
                hasAccounts={hasAccounts}
                hasPosts={hasPosts}
                platformActivity={platformActivity}
                todoPosts={todoPosts}
            />
        );
    }

    // Desktop: render server-provided content
    return <>{desktopContent}</>;
}
