/**
 * Settings data component (server-side, streamed via Suspense)
 * Why: DB queries run here while the page shell shows a loading skeleton instantly.
 */

import { db } from '@/lib/db';
import { SettingsClient } from './settings-client';
import type { Session } from 'next-auth';

export async function SettingsData({ session }: { session: Session }) {
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
                logo: organization?.logo || null,
                timezone: organization?.timezone || 'Australia/Sydney',
                aiDraftsEnabled: organization?.aiDraftsEnabled ?? true,
            }}
        />
    );
}
