/**
 * Organizations API
 * List organizations accessible to the current user
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/organizations
 * List all organizations the current user has access to via their workspace
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get the current workspace to find its organization
        const workspace = await db.workspace.findUnique({
            where: { id: session.user.currentWorkspaceId },
            include: {
                organization: true,
            },
        });

        // Also get all organizations the user is a member of
        const userOrganizations = await db.organizationMember.findMany({
            where: { userId: session.user.id },
            include: {
                organization: true,
            },
        });

        // Combine: workspace's org + user's memberships (deduplicated)
        const orgMap = new Map<string, { id: string; name: string; logo: string | null }>();

        if (workspace?.organization) {
            orgMap.set(workspace.organization.id, {
                id: workspace.organization.id,
                name: workspace.organization.name,
                logo: workspace.organization.logo,
            });
        }

        for (const membership of userOrganizations) {
            if (!orgMap.has(membership.organization.id)) {
                orgMap.set(membership.organization.id, {
                    id: membership.organization.id,
                    name: membership.organization.name,
                    logo: membership.organization.logo,
                });
            }
        }

        const organizations = Array.from(orgMap.values()).sort((a, b) =>
            a.name.localeCompare(b.name)
        );

        return NextResponse.json({ organizations });
    } catch (error) {
        console.error('Failed to fetch organizations:', error);
        return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }
}
