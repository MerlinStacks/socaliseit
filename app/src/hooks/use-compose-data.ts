/**
 * useComposeData — React Query data hooks for the post composer
 * Why: Extracted from use-compose.ts to keep data-fetching queries
 * in a dedicated module under the 200-line cap.
 */

import { useQuery } from '@tanstack/react-query';
import { type SocialAccount } from '@/components/compose/profile-selector';
import { getPlatformSortIndex, type Platform } from '@/lib/platform-config';
import { type MediaFolder } from '@/types/media';

/** Optimal times response from analytics API */
export interface OptimalTimesResponse {
    suggestions: Array<{ time: string; label: string; lift: number }>;
    dataPoints: number;
    confidence: 'high' | 'medium' | 'low';
}

/**
 * Fetch and cache connected social accounts
 * Why: Cached for 2 min so reopening the composer is instant from cache.
 * Removes fetchWithRetry from the critical path (React Query retries internally).
 */
export function useComposeAccounts() {
    const { data: accounts = [], isLoading: isLoadingAccounts, error: rawAccountsError } = useQuery<SocialAccount[]>({
        queryKey: ['accounts'],
        queryFn: async () => {
            const response = await fetch('/api/accounts');
            if (!response.ok) throw new Error('Failed to fetch accounts');
            const data = await response.json();

            const transformed: SocialAccount[] = data.accounts.map((account: {
                id: string;
                platform: string;
                name: string;
                username?: string;
                avatar?: string;
                isActive?: boolean;
                organizationId?: string | null;
                organization?: { id: string; name: string; logo: string | null } | null;
            }) => ({
                id: account.id,
                platform: account.platform.toLowerCase() as Platform,
                name: account.name,
                username: account.username,
                avatar: account.avatar,
                isActive: account.isActive !== false,
                organizationId: account.organizationId,
                organization: account.organization,
            }));

            transformed.sort((a, b) => {
                const diff = getPlatformSortIndex(a.platform) - getPlatformSortIndex(b.platform);
                if (diff !== 0) return diff;
                return a.name.localeCompare(b.name);
            });

            return transformed;
        },
        staleTime: 2 * 60_000, // 2 min — accounts rarely change mid-session
        refetchOnWindowFocus: false,
    });

    const accountsError = rawAccountsError
        ? (rawAccountsError instanceof Error ? rawAccountsError.message : 'Failed to load accounts')
        : null;

    return { accounts, isLoadingAccounts, accountsError };
}

/**
 * Fetch and cache media folders
 * Why: Cached alongside accounts for instant composer reopens
 */
export function useComposeFolders() {
    const { data: mediaFolders = [] } = useQuery<MediaFolder[]>({
        queryKey: ['media-folders'],
        queryFn: async () => {
            const response = await fetch('/api/media/folders');
            if (!response.ok) return [];
            const data = await response.json();
            return data.folders || [];
        },
        staleTime: 2 * 60_000,
        refetchOnWindowFocus: false,
    });

    return { mediaFolders };
}

/**
 * Fetch optimal posting times based on analytics
 * Why: Uses React Query instead of SWR to unify cache management
 */
export function useOptimalTimes() {
    const { data: optimalTimes } = useQuery<OptimalTimesResponse>({
        queryKey: ['optimal-times'],
        queryFn: async () => {
            const res = await fetch('/api/analytics/optimal-times');
            if (!res.ok) return { suggestions: [], dataPoints: 0, confidence: 'low' as const };
            return res.json();
        },
        staleTime: 5 * 60_000, // 5 min — optimal times are computed from historical data
        refetchOnWindowFocus: false,
    });

    return { optimalTimes };
}
