/**
 * Admin Users API
 * List all users with search and filtering
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

/**
 * GET /api/admin/users
 * List all users with pagination and search
 */
export const GET = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || '';
    const superAdminOnly = searchParams.get('superAdmin') === 'true';

    const where = {
        ...(search && {
            OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
            ],
        }),
        ...(superAdminOnly && { isSuperAdmin: true }),
    };

    const [users, total] = await Promise.all([
        db.user.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                name: true,
                email: true,
                image: true,
                isSuperAdmin: true,
                emailVerified: true,
                createdAt: true,
                updatedAt: true,
                _count: {
                    select: {
                        memberships: true,
                        organizationMemberships: true,
                    },
                },
            },
        }),
        db.user.count({ where }),
    ]);

    return NextResponse.json({
        users: users.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            isSuperAdmin: user.isSuperAdmin,
            emailVerified: user.emailVerified,
            workspaceCount: user._count.memberships,
            organizationCount: user._count.organizationMemberships,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
});
