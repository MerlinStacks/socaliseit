/**
 * UGC page
 * Why: Thin shell that renders instantly with session only.
 * DB queries are deferred to <UGCData> inside <Suspense>,
 * so the loading skeleton appears immediately during navigation.
 */

import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import UGCLoading from './loading';
import { UGCData } from './ugc-data';

export default async function UGCPage() {
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const organizationId = session.user.currentOrganizationId;

    return (
        <Suspense fallback={<UGCLoading />}>
            <UGCData organizationId={organizationId} />
        </Suspense>
    );
}
