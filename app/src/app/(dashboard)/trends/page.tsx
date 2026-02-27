/**
 * Trends page
 * Why: Thin shell that renders instantly with session only.
 * Heavy API calls (Google Trends, DB) are deferred to <TrendsData>
 * inside <Suspense>, so the loading skeleton appears immediately.
 */

import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import TrendsLoading from './loading';
import { TrendsData } from './trends-data';

export default async function TrendsPage() {
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const organizationId = session.user.currentOrganizationId;

    return (
        <Suspense fallback={<TrendsLoading />}>
            <TrendsData organizationId={organizationId} />
        </Suspense>
    );
}
