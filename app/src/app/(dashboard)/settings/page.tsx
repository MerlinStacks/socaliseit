/**
 * Settings page
 * Why: Thin shell that renders instantly with session only.
 * DB queries are deferred to <SettingsData> inside <Suspense>,
 * so the loading skeleton appears immediately during navigation.
 */

import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import SettingsLoading from './loading';
import { SettingsData } from './settings-data';

export default async function SettingsPage() {
    const session = await getSession();

    if (!session?.user) {
        redirect('/login');
    }

    return (
        <Suspense fallback={<SettingsLoading />}>
            <SettingsData session={session} />
        </Suspense>
    );
}
