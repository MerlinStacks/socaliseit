/**
 * Admin Organization Detail API
 * Get, update, delete individual organizations
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

const UpdateOrganizationSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    logo: z.string().url().nullable().optional(),
    tier: z.enum(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']).optional(),
    maxWorkspaces: z.number().min(1).max(100).optional(),
    maxMembers: z.number().min(1).max(1000).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/organizations/[id]
 * Get organization details with members and workspaces
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
                workspaces: {
                    select: {
                        id: true,
                        name: true,
                        slug: true,
                        createdAt: true,
                        _count: { select: { members: true, posts: true } },
                    },
                    orderBy: { createdAt: 'desc' },
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
            organization: {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
                logo: organization.logo,
                tier: organization.tier,
                maxWorkspaces: organization.maxWorkspaces,
                maxMembers: organization.maxMembers,
                createdAt: organization.createdAt,
                updatedAt: organization.updatedAt,
                members: organization.members.map((m) => ({
                    id: m.id,
                    role: m.role,
                    joinedAt: m.joinedAt,
                    user: m.user,
                })),
                workspaces: organization.workspaces.map((w) => ({
                    id: w.id,
                    name: w.name,
                    slug: w.slug,
                    createdAt: w.createdAt,
                    memberCount: w._count.members,
                    postCount: w._count.posts,
                })),
            },
        });
    });

    return handler(request);
};

/**
 * PATCH /api/admin/organizations/[id]
 * Update organization settings
 */
export const PATCH = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;
        const body = await req.json();
        const parsed = UpdateOrganizationSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation Error', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const organization = await db.organization.findUnique({ where: { id } });

        if (!organization) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Organization not found' },
                { status: 404 }
            );
        }

        const updated = await db.organization.update({
            where: { id },
            data: parsed.data,
        });

        return NextResponse.json({ organization: updated });
    });

    return handler(request);
};

/**
 * DELETE /api/admin/organizations/[id]
 * Delete organization (cascades to members, workspaces set to null)
 */
export const DELETE = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;

        const organization = await db.organization.findUnique({ where: { id } });

        if (!organization) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Organization not found' },
                { status: 404 }
            );
        }

        // Workspace relation is set to SetNull, so workspaces become standalone
        await db.organization.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'Organization deleted' });
    });

    return handler(request);
};
