/**
 * Account Health Hook
 * Polls account health status and exposes UI-friendly state.
 *
 * Why: Centralize health monitoring logic with React Query for caching and background refetch.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export type AccountHealthStatus = 'healthy' | 'expiring' | 'expired' | 'error';

export interface AccountHealth {
    id: string;
    platform: string;
    name: string;
    status: AccountHealthStatus;
    expiresIn: number | null;
    lastChecked: string;
    message?: string;
}

interface HealthSummary {
    total: number;
    healthy: number;
    expiring: number;
    expired: number;
    error: number;
}

interface HealthResponse {
    accounts: AccountHealth[];
    summary: HealthSummary;
}

interface TestResult {
    success: boolean;
    platform: string;
    accountName: string;
    message: string;
    responseTime?: number;
}

/**
 * Hook to monitor account health status.
 * Polls every 5 minutes for token expiry and connection issues.
 */
export function useAccountHealth() {
    const query = useQuery<HealthResponse>({
        queryKey: ['account-health'],
        queryFn: async () => {
            const response = await fetch('/api/accounts/health');
            if (!response.ok) {
                throw new Error('Failed to fetch account health');
            }
            return response.json();
        },
        refetchInterval: 5 * 60 * 1000, // 5 minutes
        refetchIntervalInBackground: false,
        staleTime: 2 * 60 * 1000, // Consider fresh for 2 minutes
    });

    return {
        accounts: query.data?.accounts ?? [],
        summary: query.data?.summary ?? { total: 0, healthy: 0, expiring: 0, expired: 0, error: 0 },
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,

        // Convenience getters
        expiringAccounts: query.data?.accounts.filter((a) => a.status === 'expiring') ?? [],
        // Why: 'error' status means isActive=false (deactivated after token refresh failure).
        // Include them alongside 'expired' so the banner warns users to reconnect.
        expiredAccounts: query.data?.accounts.filter((a) => a.status === 'expired' || a.status === 'error') ?? [],
        hasIssues:
            (query.data?.summary?.expiring ?? 0) > 0 ||
            (query.data?.summary?.expired ?? 0) > 0 ||
            (query.data?.summary?.error ?? 0) > 0,
    };
}

/**
 * Hook to test a single account's connection.
 */
export function useTestConnection() {
    const queryClient = useQueryClient();

    return useMutation<TestResult, Error, string>({
        mutationFn: async (accountId: string) => {
            const response = await fetch(`/api/accounts/${accountId}/test`, {
                method: 'POST',
            });
            if (!response.ok) {
                throw new Error('Failed to test connection');
            }
            return response.json();
        },
        onSuccess: () => {
            // Refresh health status after test
            queryClient.invalidateQueries({ queryKey: ['account-health'] });
        },
    });
}
