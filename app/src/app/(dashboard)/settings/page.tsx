/**
 * Settings page
 * Manage workspace, accounts, and preferences
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

    // Fetch real user and workspace data
    const [workspace, user] = await Promise.all([
        session.user.currentWorkspaceId
            ? db.workspace.findUnique({
                where: { id: session.user.currentWorkspaceId },
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
            workspace={{
                id: workspace?.id || '',
                name: workspace?.name || 'My Workspace',
                slug: workspace?.slug || '',
            }}
        />
    );
}
