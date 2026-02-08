/**
 * Organization Switch API
 * Allows users to switch their current active organization.
 * Stores preference in a cookie for session persistence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

const ORG_PREFERENCE_COOKIE = 'preferred_organization_id';

/**
 * POST /api/organizations/switch
 * Switch to a different organization
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const userId = session.user.id;
        const body = await request.json();
        const { organizationId } = body;

        if (!organizationId || typeof organizationId !== 'string') {
            return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
        }

        // Verify user is a member of the target organization
        const membership = await db.organizationMember.findFirst({
            where: { userId, organizationId },
            include: { organization: true },
        });

        if (!membership) {
            return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
        }

        // Store preference in cookie
        const cookieStore = await cookies();
        cookieStore.set(ORG_PREFERENCE_COOKIE, organizationId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 365, // 1 year
            path: '/',
        });

        return NextResponse.json({
            success: true,
            organization: {
                id: membership.organization.id,
                name: membership.organization.name,
                slug: membership.organization.slug,
            },
        });
    } catch (error) {
        createRouteLogger('API', '/api/organizations/switch').error({ err: error }, 'Failed to switch organization');
        return NextResponse.json({ error: 'Failed to switch organization' }, { status: 500 });
    }
}

/**
 * GET /api/organizations/switch
 * Get current organization preference
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const cookieStore = await cookies();
        const preferredOrgId = cookieStore.get(ORG_PREFERENCE_COOKIE)?.value;

        return NextResponse.json({
            preferredOrganizationId: preferredOrgId || null,
            currentOrganizationId: session.user.currentOrganizationId,
            organizations: session.user.organizations || [],
        });
    } catch (error) {
        createRouteLogger('API', '/api/organizations/switch').error({ err: error }, 'Failed to get organization preference');
        return NextResponse.json({ error: 'Failed to get organization preference' }, { status: 500 });
    }
}
