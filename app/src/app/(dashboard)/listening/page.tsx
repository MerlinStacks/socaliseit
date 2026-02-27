/**
 * Listening page
 * Why: Thin shell that renders instantly with session only.
 * Heavy DB queries are deferred to <ListeningData> inside <Suspense>,
 * so the loading skeleton appears immediately during navigation.
 */

import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ListeningLoading from './loading';
import { ListeningData } from './listening-data';

export default async function ListeningPage() {
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    const organizationId = session.user.currentOrganizationId;

    return (
        <Suspense fallback={<ListeningLoading />}>
            <ListeningData organizationId={organizationId} />
        </Suspense>
    );
}
