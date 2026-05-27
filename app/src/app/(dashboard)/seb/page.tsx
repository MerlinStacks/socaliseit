import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SebClient from './seb-client';

export default async function SebPage() {
    const session = await getSession();
    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    return <SebClient />;
}
