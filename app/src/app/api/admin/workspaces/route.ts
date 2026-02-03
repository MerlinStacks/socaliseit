/**
 * Admin Workspaces API
 * View all workspaces across the platform
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

/**
 * GET /api/admin/workspaces
 * List all workspaces with owner/member/post counts
 */
export const GET = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || '';
    const organizationId = searchParams.get('organizationId');

    const where = {
        ...(search && {
            OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { slug: { contains: search, mode: 'insensitive' as const } },
            ],
        }),
        ...(organizationId && { organizationId }),
    };

    const [workspaces, total] = await Promise.all([
        db.workspace.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
                organization: {
                    select: { id: true, name: true, slug: true },
                },
                members: {
                    include: {
                        user: {
                            select: { id: true, name: true, email: true, image: true },
                        },
                    },
                    where: { role: 'OWNER' },
                    take: 1,
                },
                _count: {
                    select: {
                        members: true,
                        posts: true,
                        socialAccounts: true,
                    },
                },
            },
        }),
        db.workspace.count({ where }),
    ]);

    return NextResponse.json({
        workspaces: workspaces.map((w) => ({
            id: w.id,
            name: w.name,
            slug: w.slug,
            logo: w.logo,
            createdAt: w.createdAt,
            organization: w.organization,
            owner: w.members[0]?.user || null,
            memberCount: w._count.members,
            postCount: w._count.posts,
            socialAccountCount: w._count.socialAccounts,
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
});
