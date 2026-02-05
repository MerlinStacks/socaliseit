'use client';

import { useSession } from 'next-auth/react';

/**
 * Hook to access the current organization context.
 * 
 * Why: Provides organization data from the session for components that need
 * to scope their data fetching or display to the current organization.
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
