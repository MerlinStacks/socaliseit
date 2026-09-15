'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import type { Platform } from '@/lib/platform-config';

interface ShopConnection {
    platform: string;
    isActive: boolean;
    catalogId: string;
}

/** Why: Product tagging is unusable without a configured shop for this platform. */
export function useConnectedShop(platform: Platform) {
    const { data: session } = useSession();
    const organizationId = session?.user?.currentOrganizationId;
    const { data, isError } = useQuery<{ shops: ShopConnection[] }>({
        queryKey: ['commerce-shops', organizationId],
        enabled: Boolean(organizationId),
        queryFn: async ({ signal }) => {
            const response = await fetch('/api/commerce/shops', { signal });
            if (!response.ok) throw new Error('Failed to fetch shop connections');
            return response.json();
        },
    });

    // Fail closed while loading, on errors, and when switching workspaces.
    return Boolean(organizationId && !isError && data?.shops?.some(shop =>
        shop.platform === platform.toUpperCase() && shop.isActive && shop.catalogId?.trim()
    ));
}
