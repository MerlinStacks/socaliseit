/**
 * Admin Organization Members API
 * Add users to an organization
 * Why: Super admin needs to assign users to organizations
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

const AddMemberSchema = z.object({
    userId: z.string().cuid(),
    role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).optional().default('MEMBER'),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/organizations/[id]/members
 * List all members of an organization
 */
export const GET = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;

        const organization = await db.organization.findUnique({
            where: { id },
            include: {
                members: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, image: true },
                        },
                    },
                    orderBy: { joinedAt: 'asc' },
                },
            },
        });

        if (!organization) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Organization not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            members: organization.members.map((m) => ({
                id: m.id,
                role: m.role,
                joinedAt: m.joinedAt,
                user: m.user,
            })),
        });
    });

    return handler(request);
};

/**
 * POST /api/admin/organizations/[id]/members
 * Add a user to an organization
 */
export const POST = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;
        const body = await req.json();
        const parsed = AddMemberSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation Error', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        // Verify organization exists
        const organization = await db.organization.findUnique({
            where: { id },
            include: { _count: { select: { members: true } } },
        });

        if (!organization) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Organization not found' },
                { status: 404 }
            );
        }

        // Check member limit
        if (organization._count.members >= organization.maxMembers) {
            return NextResponse.json(
                { error: 'Limit Reached', message: `Organization has reached its member limit of ${organization.maxMembers}` },
                { status: 400 }
            );
        }

        // Verify user exists
        const user = await db.user.findUnique({
            where: { id: parsed.data.userId },
            select: { id: true, name: true, email: true, image: true },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Not Found', message: 'User not found' },
                { status: 404 }
            );
        }

        // Check if already a member
        const existingMember = await db.organizationMember.findUnique({
            where: {
                organizationId_userId: {
                    organizationId: id,
                    userId: parsed.data.userId,
                },
            },
        });

        if (existingMember) {
            return NextResponse.json(
                { error: 'Conflict', message: 'User is already a member of this organization' },
                { status: 409 }
            );
        }

        // Create membership
        const member = await db.organizationMember.create({
            data: {
                organizationId: id,
                userId: parsed.data.userId,
                role: parsed.data.role,
            },
            include: {
                user: {
                    select: { id: true, name: true, email: true, image: true },
                },
            },
        });

        return NextResponse.json({
            member: {
                id: member.id,
                role: member.role,
                joinedAt: member.joinedAt,
                user: member.user,
            },
        }, { status: 201 });
    });

    return handler(request);
};
