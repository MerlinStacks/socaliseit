/**
 * Admin Organization Detail API
 * View detailed organization info
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/admin/audit';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/workspaces/[id]
 * Get organization details with all members and recent activity
 */
export const GET = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;

        const org = await db.organization.findUnique({
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
                socialAccounts: {
                    select: {
                        id: true,
                        platform: true,
                        name: true,
                        username: true,
                        isActive: true,
                    },
                },
                _count: {
                    select: {
                        posts: true,
                        media: true,
                    },
                },
            },
        });

        if (!org) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Organization not found' },
                { status: 404 }
            );
        }

        // Record the access in audit log
        await recordAuditLog({
            action: AUDIT_ACTIONS.WORKSPACE_VIEW,
            actorId: admin.userId,
            targetId: id,
            targetType: 'organization',
            request: req,
        });

        return NextResponse.json({
            organization: {
                id: org.id,
                name: org.name,
                slug: org.slug,
                logo: org.logo,
                tier: org.tier,
                timezone: org.timezone,
                createdAt: org.createdAt,
                updatedAt: org.updatedAt,
                members: org.members.map((m) => ({
                    id: m.id,
                    role: m.role,
                    joinedAt: m.joinedAt,
                    user: m.user,
                })),
                socialAccounts: org.socialAccounts,
                stats: {
                    postCount: org._count.posts,
                    mediaCount: org._count.media,
                    memberCount: org.members.length,
                    socialAccountCount: org.socialAccounts.length,
                },
            },
        });
    });

    return handler(request);
};

/**
 * DELETE /api/admin/workspaces/[id]
 * Delete an organization
 */
export const DELETE = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;

        const org = await db.organization.findUnique({
            where: { id },
            select: { id: true, name: true, slug: true }
        });

        if (!org) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Organization not found' },
                { status: 404 }
            );
        }

        // Record audit log before deletion
        await recordAuditLog({
            action: 'organization.delete',
            actorId: admin.userId,
            targetId: id,
            targetType: 'organization',
            metadata: { organizationName: org.name, organizationSlug: org.slug },
            request: req,
        });

        await db.organization.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'Organization deleted' });
    });

    return handler(request);
};
