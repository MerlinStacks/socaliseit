/**
 * Settings page
 * Manage organization and user preferences
 */

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { redirect } from 'next/navigation';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    // Fetch real user and organization data
    const [organization, user] = await Promise.all([
        session.user.currentOrganizationId
            ? db.organization.findUnique({
                where: { id: session.user.currentOrganizationId },
            })
            : null,
        db.user.findUnique({
            where: { id: session.user.id },
        }),
    ]);

    return (
        <SettingsClient
            user={{
                id: session.user.id,
                name: user?.name || session.user.name || '',
                email: user?.email || session.user.email || '',
                image: user?.image || session.user.image || null,
            }}
            organization={{
                id: organization?.id || '',
                name: organization?.name || 'My Organization',
                slug: organization?.slug || '',
            }}
        />
    );
}
