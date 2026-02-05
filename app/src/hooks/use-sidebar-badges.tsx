'use client';

/**
 * useSidebarBadges Hook
 * Fetches notification counts for sidebar navigation items
 * Why: Shows unread counts for pending actions (drafts, failed posts, engagement)
 */

import { useQuery } from '@tanstack/react-query';

interface SidebarBadges {
    drafts: number;
    scheduled: number;
    failed: number;
    engagement: number;
    analytics: number;
}

interface SidebarBadgesResponse {
    badges: SidebarBadges;
}

/**
 * Fetch badge counts from API
 */
async function fetchBadges(): Promise<SidebarBadges> {
    try {
        const response = await fetch('/api/badges');
        if (!response.ok) {
            throw new Error('Failed to fetch badges');
        }
        const data: SidebarBadgesResponse = await response.json();
        return data.badges;
    } catch {
        // Return zeros on error to avoid breaking UI
        return {
            drafts: 0,
            scheduled: 0,
            failed: 0,
            engagement: 0,
            analytics: 0,
        };
    }
}

/**
 * Hook to get sidebar badge counts with caching
 */
export function useSidebarBadges() {
    return useQuery({
        queryKey: ['sidebar-badges'],
        queryFn: fetchBadges,
        staleTime: 60 * 1000, // Refresh every minute
        refetchInterval: 60 * 1000,
        refetchOnWindowFocus: true,
    });
}

/**
 * Badge count display component
 */
interface BadgeCountProps {
    count: number;
    variant?: 'default' | 'warning' | 'error';
    className?: string;
}

export function BadgeCount({ count, variant = 'default', className }: BadgeCountProps): React.ReactElement | null {
    if (count <= 0) return null;

    const variants = {
        default: 'bg-[var(--accent-gold)] text-white',
        warning: 'bg-amber-500 text-white',
        error: 'bg-red-500 text-white',
    };

    const displayCount = count > 99 ? '99+' : count.toString();

    return (
        <span
            className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-bold rounded-full ${variants[variant]} ${className || ''}`}
        >
            {displayCount}
        </span>
    );
}
