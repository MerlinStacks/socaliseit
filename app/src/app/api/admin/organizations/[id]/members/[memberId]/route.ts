/**
 * Admin Organization Member Detail API
 * Update role, remove member from organization
 * Why: Super admin needs to manage individual organization memberships
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

const UpdateMemberSchema = z.object({
    role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

type RouteContext = { params: Promise<{ id: string; memberId: string }> };

/**
 * PATCH /api/admin/organizations/[id]/members/[memberId]
 * Update member role
 */
export const PATCH = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id, memberId } = await context.params;
        const body = await req.json();
        const parsed = UpdateMemberSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation Error', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        // Verify membership exists and belongs to this organization
        const member = await db.organizationMember.findUnique({
            where: { id: memberId },
        });

        if (!member || member.organizationId !== id) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Member not found in this organization' },
                { status: 404 }
            );
        }

        // Update role
        const updated = await db.organizationMember.update({
            where: { id: memberId },
            data: { role: parsed.data.role },
            include: {
                user: {
                    select: { id: true, name: true, email: true, image: true },
                },
            },
        });

        return NextResponse.json({
            member: {
                id: updated.id,
                role: updated.role,
                joinedAt: updated.joinedAt,
                user: updated.user,
            },
        });
    });

    return handler(request);
};

/**
 * DELETE /api/admin/organizations/[id]/members/[memberId]
 * Remove member from organization
 */
export const DELETE = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id, memberId } = await context.params;

        // Verify membership exists and belongs to this organization
        const member = await db.organizationMember.findUnique({
            where: { id: memberId },
            include: {
                user: { select: { id: true, email: true } },
            },
        });

        if (!member || member.organizationId !== id) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Member not found in this organization' },
                { status: 404 }
            );
        }

        // Delete membership
        await db.organizationMember.delete({
            where: { id: memberId },
        });

        return NextResponse.json({
            success: true,
            message: `Removed ${member.user.email} from organization`,
        });
    });

    return handler(request);
};
