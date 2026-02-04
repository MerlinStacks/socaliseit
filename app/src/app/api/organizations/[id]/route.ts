/**
 * Organization by ID API
 * GET: Fetch single organization details
 * PATCH: Update organization settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/organizations/[id]
 * Fetch a single organization's details
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;

        // Verify user is a member of this organization
        const membership = await db.organizationMember.findFirst({
            where: { userId: session.user.id, organizationId: id },
        });

        if (!membership) {
            return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
        }

        const organization = await db.organization.findUnique({
            where: { id },
        });

        if (!organization) {
            return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
        }

        return NextResponse.json({ organization });
    } catch (error) {
        console.error('Failed to fetch organization:', error);
        return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 });
    }
}

/**
 * PATCH /api/organizations/[id]
 * Update organization settings
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = await params;
        const body = await request.json();

        // Verify user is a member with appropriate permissions
        const membership = await db.organizationMember.findFirst({
            where: { userId: session.user.id, organizationId: id },
        });

        if (!membership) {
            return NextResponse.json({ error: 'Not a member of this organization' }, { status: 403 });
        }

        // Only OWNER and ADMIN can update settings
        if (!['OWNER', 'ADMIN'].includes(membership.role)) {
            return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
        }

        // Build update object from allowed fields
        const allowedFields = ['name', 'timezone', 'aiDraftsEnabled', 'accentColor', 'accentColorAlt', 'darkMode'];
        const updateData: Record<string, unknown> = {};

        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                updateData[field] = body[field];
            }
        }

        const organization = await db.organization.update({
            where: { id },
            data: updateData,
        });

        return NextResponse.json({ organization });
    } catch (error) {
        console.error('Failed to update organization:', error);
        return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
    }
}
