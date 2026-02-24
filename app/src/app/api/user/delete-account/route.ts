/**
 * Delete Account API
 * Permanently deletes user account and all associated data
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getStripeInstance, isStripeConfigured } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

/**
 * POST /api/user/delete-account
 * Permanently deletes the user's account
 * Requires password confirmation for credentials users
 */
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { password, confirmation } = body;

    // Require explicit "DELETE" confirmation
    if (confirmation !== 'DELETE') {
        return NextResponse.json(
            { error: 'Please type DELETE to confirm' },
            { status: 400 }
        );
    }

    const user = await db.user.findUnique({
        where: { id: session.user.id },
        select: {
            password: true,
            organizationMemberships: {
                where: { role: 'OWNER' },
                include: { organization: { include: { members: true } } },
            },
        },
    });

    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // For credentials users, verify password
    if (user.password) {
        if (!password) {
            return NextResponse.json(
                { error: 'Password is required' },
                { status: 400 }
            );
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return NextResponse.json(
                { error: 'Incorrect password' },
                { status: 400 }
            );
        }
    }

    // Check if user is sole owner of any workspace
    for (const membership of user.organizationMemberships) {
        const ownerCount = membership.organization.members.filter(
            (m) => m.role === 'OWNER'
        ).length;

        if (ownerCount === 1) {
            // User is sole owner — cancel Stripe subscription, then delete the org
            if ((await isStripeConfigured()) && membership.organization.stripeSubscriptionId) {
                try {
                    const stripe = await getStripeInstance();
                    await stripe.subscriptions.cancel(membership.organization.stripeSubscriptionId);
                } catch (err) {
                    logger.warn({ orgId: membership.organization.id, err }, '[delete-account] Failed to cancel Stripe subscription');
                }
            }
            await db.organization.delete({
                where: { id: membership.organization.id },
            });
        }
    }

    // Delete the user (cascades through relations)
    await db.user.delete({
        where: { id: session.user.id },
    });

    return NextResponse.json({
        success: true,
        message: 'Account deleted successfully',
    });
}
