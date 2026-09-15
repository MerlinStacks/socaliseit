/**
 * Listening page
 * Authenticated server entry point for the shared SPA listening workspace.
 */

import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import ListeningWorkspace from './listening-workspace';

export default async function ListeningPage() {
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    return <ListeningWorkspace />;
}
