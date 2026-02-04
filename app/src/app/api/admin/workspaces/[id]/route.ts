/**
 * Admin Workspace Detail API
 * View detailed workspace info
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { recordAuditLog, AUDIT_ACTIONS } from '@/lib/admin/audit';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/workspaces/[id]
 * Get workspace details with all members and recent activity
 */
export const GET = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;

        const workspace = await db.workspace.findUnique({
            where: { id },
            include: {
                organization: {
                    select: { id: true, name: true, slug: true, tier: true },
                },
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

        if (!workspace) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Workspace not found' },
                { status: 404 }
            );
        }

        // Record the access in audit log
        await recordAuditLog({
            action: AUDIT_ACTIONS.WORKSPACE_VIEW,
            actorId: admin.userId,
            targetId: id,
            targetType: 'workspace',
            request: req,
        });

        return NextResponse.json({
            workspace: {
                id: workspace.id,
                name: workspace.name,
                slug: workspace.slug,
                logo: workspace.logo,
                timezone: workspace.timezone,
                createdAt: workspace.createdAt,
                updatedAt: workspace.updatedAt,
                organization: workspace.organization,
                members: workspace.members.map((m) => ({
                    id: m.id,
                    role: m.role,
                    joinedAt: m.joinedAt,
                    user: m.user,
                })),
                socialAccounts: workspace.socialAccounts,
                stats: {
                    postCount: workspace._count.posts,
                    mediaCount: workspace._count.media,
                    memberCount: workspace.members.length,
                    socialAccountCount: workspace.socialAccounts.length,
                },
            },
        });
    });

    return handler(request);
};

/**
 * DELETE /api/admin/workspaces/[id]
 * Delete a workspace
 */
export const DELETE = async (request: NextRequest, context: RouteContext) => {
    const handler = withSuperAdmin(async (req: NextRequest, admin: AdminContext) => {
        const { id } = await context.params;

        const workspace = await db.workspace.findUnique({
            where: { id },
            select: { id: true, name: true, slug: true }
        });

        if (!workspace) {
            return NextResponse.json(
                { error: 'Not Found', message: 'Workspace not found' },
                { status: 404 }
            );
        }

        // Record audit log before deletion
        await recordAuditLog({
            action: 'workspace.delete',
            actorId: admin.userId,
            targetId: id,
            targetType: 'workspace',
            metadata: { workspaceName: workspace.name, workspaceSlug: workspace.slug },
            request: req,
        });

        await db.workspace.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'Workspace deleted' });
    });

    return handler(request);
};
