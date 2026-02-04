/**
 * Admin Organizations API
 * View all organizations across the platform
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

/**
 * GET /api/admin/workspaces (legacy route, now returns organizations)
 * List all organizations with owner/member/post counts
 */
export const GET = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || '';

    const where = {
        ...(search && {
            OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { slug: { contains: search, mode: 'insensitive' as const } },
            ],
        }),
    };

    const [organizations, total] = await Promise.all([
        db.organization.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
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
        db.organization.count({ where }),
    ]);

    return NextResponse.json({
        organizations: organizations.map((org) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            logo: org.logo,
            tier: org.tier,
            createdAt: org.createdAt,
            owner: org.members[0]?.user || null,
            memberCount: org._count.members,
            postCount: org._count.posts,
            socialAccountCount: org._count.socialAccounts,
        })),
        // Keep workspaces key for backwards compatibility
        workspaces: organizations.map((org) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
            logo: org.logo,
            tier: org.tier,
            createdAt: org.createdAt,
            owner: org.members[0]?.user || null,
            memberCount: org._count.members,
            postCount: org._count.posts,
            socialAccountCount: org._count.socialAccounts,
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
});
