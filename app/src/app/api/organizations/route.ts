/**
 * Organizations API
 * List organizations accessible to the current user
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/organizations
 * List all organizations the current user is a member of
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get all organizations the user is a member of
        const memberships = await db.organizationMember.findMany({
            where: { userId: session.user.id },
            include: {
                organization: true,
            },
            orderBy: {
                organization: { name: 'asc' },
            },
        });

        const organizations = memberships.map((m) => ({
            id: m.organization.id,
            name: m.organization.name,
            slug: m.organization.slug,
            logo: m.organization.logo,
            role: m.role,
        }));

        return NextResponse.json({ organizations });
    } catch (error) {
        console.error('Failed to fetch organizations:', error);
        return NextResponse.json({ error: 'Failed to fetch organizations' }, { status: 500 });
    }
}
