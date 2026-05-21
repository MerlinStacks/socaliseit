/**
 * Admin Organization Detail API
 * Get, update, delete individual organizations
 */

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { withSuperAdmin, type AdminContext } from '@/lib/admin/middleware';
import { getStripeInstance, isStripeConfigured } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import { safeParseJson } from '@/lib/utils';

const UpdateOrganizationSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    logo: z.string().url().nullable().optional(),
    tier: z.enum(['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE', 'ADMIN']).optional(),
    maxMembers: z.number().min(1).max(1000).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/organizations/[id]
 * Get organization details with members
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
                _count: {
                    select: {
                        posts: true,
                        media: true,
                        socialAccounts: true,
                    },
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
                maxMembers: organization.maxMembers,
                maxWorkspaces: 0, // Field removed - organizations are now the primary tenant
                memberCount: organization.members.length,
                workspaceCount: 0, // Workspaces deprecated - organizations are the primary tenant
                timezone: organization.timezone,
                createdAt: organization.createdAt,
                updatedAt: organization.updatedAt,
                members: organization.members.map((m) => ({
                    id: m.id,
                    role: m.role,
                    joinedAt: m.joinedAt,
                    user: m.user,
                })),
                // Note: Workspaces deprecated - organizations are the primary tenant now
                workspaces: [],
                stats: {
                    memberCount: organization.members.length,
                    postCount: organization._count.posts,
                    mediaCount: organization._count.media,
                    socialAccountCount: organization._count.socialAccounts,
                },
                billing: {
                    stripeCustomerId: organization.stripeCustomerId,
                    stripeSubscriptionId: organization.stripeSubscriptionId,
                    stripePriceId: organization.stripePriceId,
                    subscriptionStatus: organization.subscriptionStatus,
                    currentPeriodEnd: organization.currentPeriodEnd,
                    cancelAtPeriodEnd: organization.cancelAtPeriodEnd,
                },
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
        const parseResult = await safeParseJson(req);
        if (!parseResult.ok) {
            return NextResponse.json({ error: parseResult.error }, { status: 400 });
        }
        const parsed = UpdateOrganizationSchema.safeParse(parseResult.data);

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
 * Delete organization (cascades to members, posts, etc.)
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

        // Why: Cancel Stripe subscription before deletion to prevent orphaned billing
        if ((await isStripeConfigured()) && organization.stripeSubscriptionId) {
            try {
                const stripe = await getStripeInstance();
                await stripe.subscriptions.cancel(organization.stripeSubscriptionId);
                logger.info(
                    { orgId: id, subId: organization.stripeSubscriptionId },
                    '[admin] Cancelled Stripe subscription before org deletion'
                );
            } catch (err) {
                logger.warn({ orgId: id, err }, '[admin] Failed to cancel Stripe subscription — proceeding with deletion');
            }
        }

        await db.organization.delete({ where: { id } });

        return NextResponse.json({ success: true, message: 'Organization deleted' });
    });

    return handler(request);
};
