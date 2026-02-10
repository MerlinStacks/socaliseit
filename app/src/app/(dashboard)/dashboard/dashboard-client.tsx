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
    weekDays: Array<{ name: string; count: number }>;
    hasAccounts: boolean;
    hasPosts: boolean;
    /** Desktop content rendered by server */
    desktopContent: React.ReactNode;
    /** Per-platform activity data for the activity banner */
    platformActivity: PlatformActivity[];
}

export function DashboardClient({
    userName,
    stats,
    upcomingPosts,
    weekDays,
    hasAccounts,
    hasPosts,
    desktopContent,
    platformActivity,
}: DashboardClientProps) {
    const isMobile = useIsMobile();

    if (isMobile) {
        return (
            <DashboardMobile
                userName={userName}
                stats={stats}
                upcomingPosts={upcomingPosts}
                weekDays={weekDays}
                hasAccounts={hasAccounts}
                hasPosts={hasPosts}
                platformActivity={platformActivity}
            />
        );
    }

    // Desktop: render server-provided content
    return <>{desktopContent}</>;
}
