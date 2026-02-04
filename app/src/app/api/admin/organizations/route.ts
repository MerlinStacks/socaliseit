/**
 * Admin Organizations API
 * List all organizations with stats, create new organizations
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';

const CreateOrganizationSchema = z.object({
    name: z.string().min(1).max(100),
    slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
    tier: z.enum(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE']).optional(),
    maxMembers: z.number().min(1).max(1000).optional(),
});

/**
 * GET /api/admin/organizations
 * List all organizations with member counts
 */
export const GET = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const search = searchParams.get('search') || '';
    const tier = searchParams.get('tier');

    const where = {
        ...(search && {
            OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { slug: { contains: search, mode: 'insensitive' as const } },
            ],
        }),
        ...(tier && { tier: tier as 'FREE' | 'PRO' | 'BUSINESS' | 'ENTERPRISE' }),
    };

    const [organizations, total] = await Promise.all([
        db.organization.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
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
            maxMembers: org.maxMembers,
            memberCount: org._count.members,
            postCount: org._count.posts,
            socialAccountCount: org._count.socialAccounts,
            createdAt: org.createdAt,
            updatedAt: org.updatedAt,
        })),
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
});

/**
 * POST /api/admin/organizations
 * Create a new organization
 */
export const POST = withSuperAdmin(async (request: NextRequest, admin: AdminContext) => {
    const body = await request.json();
    const parsed = CreateOrganizationSchema.safeParse(body);

    if (!parsed.success) {
        return NextResponse.json(
            { error: 'Validation Error', details: parsed.error.flatten() },
            { status: 400 }
        );
    }

    // Check if slug is already taken
    const existing = await db.organization.findUnique({
        where: { slug: parsed.data.slug },
    });

    if (existing) {
        return NextResponse.json(
            { error: 'Conflict', message: 'Organization slug already exists' },
            { status: 409 }
        );
    }

    const organization = await db.organization.create({
        data: {
            name: parsed.data.name,
            slug: parsed.data.slug,
            tier: parsed.data.tier || 'FREE',
            maxMembers: parsed.data.maxMembers || 5,
        },
    });

    return NextResponse.json({ organization }, { status: 201 });
});
