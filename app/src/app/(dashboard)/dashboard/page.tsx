/**
 * Dashboard home page
 * Why: Thin shell that renders instantly with session data only.
 * Heavy DB queries are deferred to <DashboardData> inside <Suspense>,
 * so the loading skeleton appears immediately during navigation.
 */

import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { DashboardData } from './dashboard-data';
import DashboardLoading from './loading';

export default async function DashboardPage() {
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const organizationId = session.user.currentOrganizationId;
    const userName = session.user.name?.split(' ')[0] || 'there';

    return (
        <Suspense fallback={<DashboardLoading />}>
            <DashboardData
                organizationId={organizationId}
                userName={userName}
            />
        </Suspense>
    );
}
