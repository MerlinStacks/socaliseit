'use client';

import { useSession } from 'next-auth/react';

/**
 * Hook to access the current organization context.
 * Replaces the former useWorkspace hook.
 */
export function useOrganization() {
    const { data: session, status } = useSession();

    const currentOrganizationId = session?.user?.currentOrganizationId;
    const organizations = session?.user?.organizations || [];

    const organization = organizations.find((o) => o.id === currentOrganizationId) || organizations[0];

    return {
        organization,
        organizations,
        isLoading: status === 'loading',
        isAuthenticated: status === 'authenticated',
    };
}

// Re-export with old name for backwards compatibility during migration
export const useWorkspace = useOrganization;
