/**
 * Analytics page
 * Why: Thin shell that renders instantly with session + searchParams only.
 * Heavy DB queries (8+ parallel) are deferred to <AnalyticsDataComponent>
 * inside <Suspense>, so the loading skeleton appears immediately during navigation.
 */

import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { AnalyticsDataComponent } from './analytics-data-component';
import AnalyticsLoading from './loading';

export default async function AnalyticsPage(props: {
    searchParams?: Promise<{ platform?: string; range?: string }>;
}) {
    const searchParams = await props.searchParams;
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const organizationId = session.user.currentOrganizationId;
    const { platform: platformFilter, range = '7d' } = searchParams || {};

    return (
        <Suspense fallback={<AnalyticsLoading />}>
            <AnalyticsDataComponent
                organizationId={organizationId}
                platformFilter={platformFilter}
                range={range}
            />
        </Suspense>
    );
}
