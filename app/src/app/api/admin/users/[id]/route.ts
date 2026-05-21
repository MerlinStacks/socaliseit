/**
 * Admin User Detail API
 * Get, update individual users
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { safeParseJson } from '@/lib/utils';

const UpdateUserSchema = z.object({
    isSuperAdmin: z.boolean().optional(),
    name: z.string().min(1).max(100).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/users/[id]
 * Get user details with all memberships
 */
export const GET = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;

        const user = await db.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                isSuperAdmin: true,
                bannedAt: true,
                banReason: true,
                emailVerified: true,
                twoFactorEnabled: true,
                createdAt: true,
                updatedAt: true,
                organizationMemberships: {
                    include: {
                        organization: {
                            select: { id: true, name: true, slug: true, tier: true },
                        },
                    },
                },
                sessions: {
                    select: {
                        id: true,
                        deviceName: true,
                        lastUsedAt: true,
                        createdAt: true,
                    },
                    orderBy: { lastUsedAt: 'desc' },
                    take: 10,
                },
            },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'Not Found', message: 'User not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                image: user.image,
                isSuperAdmin: user.isSuperAdmin,
                bannedAt: user.bannedAt,
                banReason: user.banReason,
                emailVerified: user.emailVerified,
                twoFactorEnabled: user.twoFactorEnabled,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                organizations: user.organizationMemberships.map((m) => ({
                    id: m.organization.id,
                    name: m.organization.name,
                    slug: m.organization.slug,
                    tier: m.organization.tier,
                    role: m.role,
                    joinedAt: m.joinedAt,
                })),
                // Note: Workspaces are deprecated - organizations are the primary tenant now
                workspaces: [],
                recentSessions: user.sessions,
            },
        });
    });

    return handler(request);
};

/**
 * PATCH /api/admin/users/[id]
 * Update user (promote/demote super admin, etc.)
 */
export const PATCH = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;
        const parseResult = await safeParseJson(req);
        if (!parseResult.ok) {
            return NextResponse.json({ error: parseResult.error }, { status: 400 });
        }
        const parsed = UpdateUserSchema.safeParse(parseResult.data);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Validation Error', details: parsed.error.flatten() },
                { status: 400 }
            );
        }

        const user = await db.user.findUnique({ where: { id } });

        if (!user) {
            return NextResponse.json(
                { error: 'Not Found', message: 'User not found' },
                { status: 404 }
            );
        }

        // Prevent demoting yourself
        if (parsed.data.isSuperAdmin === false && id === admin.userId) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'Cannot remove your own super admin access' },
                { status: 403 }
            );
        }

        const updated = await db.user.update({
            where: { id },
            data: parsed.data,
            select: {
                id: true,
                name: true,
                email: true,
                isSuperAdmin: true,
                updatedAt: true,
            },
        });

        return NextResponse.json({ user: updated });
    });

    return handler(request);
};

/**
 * DELETE /api/admin/users/[id]
 * Delete user (cascades to sessions, memberships, etc.)
 */
export const DELETE = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;

        // Prevent self-deletion
        if (id === admin.userId) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'Cannot delete yourself' },
                { status: 403 }
            );
        }

        const user = await db.user.findUnique({ where: { id } });

        if (!user) {
            return NextResponse.json(
                { error: 'Not Found', message: 'User not found' },
                { status: 404 }
            );
        }

        // Prevent deleting other super admins
        if (user.isSuperAdmin) {
            return NextResponse.json(
                { error: 'Forbidden', message: 'Cannot delete super admin users' },
                { status: 403 }
            );
        }

        await db.user.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'User deleted' });
    });

    return handler(request);
};
