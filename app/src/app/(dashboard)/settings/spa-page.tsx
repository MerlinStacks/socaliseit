'use client';

/**
 * Settings SPA page — client-side wrapper for SPA shell navigation.
 * Why: When navigating via the SPA shell, this component fetches settings 
 * data via API and renders the same SettingsClient component.
 * The original SSR page.tsx still works for direct URL / hard refresh.
 */

import { useQuery } from '@tanstack/react-query';
import { SettingsClient } from './settings-client';
import SettingsLoading from './loading';

export default function SettingsSPAPage() {
    const { data, isLoading } = useQuery({
        queryKey: ['settings-data'],
        queryFn: async () => {
            const res = await fetch('/api/settings/data');
            if (!res.ok) throw new Error('Failed to fetch settings');
            return res.json();
        },
        staleTime: 2 * 60_000,
    });

    if (isLoading || !data) return <SettingsLoading />;

    return <SettingsClient user={data.user} organization={data.organization} />;
}
