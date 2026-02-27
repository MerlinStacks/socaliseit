/**
 * Google Business Manual Account Creation API
 * 
 * Why: The Google Business Profile APIs require approval to use.
 * This endpoint allows users to manually enter their account/location IDs
 * to connect their Google Business Profile without needing API approval.
 * 
 * The user finds their Account ID and Location ID from the Google Business
 * Profile Manager URL or by using Google's API Explorer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureOrgSyncScheduled } from '@/lib/bullmq/queues';

/**
 * GET /api/accounts/google-business?pendingKey=...
 * Why (BUG-01): Retrieves GBP pending token data stored in Redis during OAuth callback.
 * Tokens are stored server-side instead of in URL params to prevent leakage.
 * The Redis key is consumed (deleted) after retrieval to prevent replay.
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const pendingKey = request.nextUrl.searchParams.get('pendingKey');
        if (!pendingKey) {
            return NextResponse.json({ error: 'Missing pendingKey' }, { status: 400 });
        }

        const { getRedisConnection } = await import('@/lib/bullmq/connection');
        const redis = getRedisConnection();
        const raw = await redis.get(`gbp-pending:${pendingKey}`);

        if (!raw) {
            return NextResponse.json(
                { error: 'Pending data expired or not found. Please restart the connection flow.' },
                { status: 404 },
            );
        }

        // Delete the key after retrieval to prevent replay
        await redis.del(`gbp-pending:${pendingKey}`);

        const data = JSON.parse(raw);

        // Verify the pending data belongs to this org
        if (data.organizationId && data.organizationId !== session.user.currentOrganizationId) {
            return NextResponse.json({ error: 'Organization mismatch' }, { status: 403 });
        }

        return NextResponse.json(data);
    } catch (error) {
        logger.error({ error }, 'Failed to retrieve GBP pending data');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { accountId, locationId, businessName } = body;

        // Validate required fields
        if (!accountId || !locationId || !businessName) {
            return NextResponse.json(
                { error: 'Account ID, Location ID, and Business Name are required' },
                { status: 400 }
            );
        }

        // Get user's workspace
        const membership = await db.organizationMember.findFirst({
            where: { userId: session.user.id },
            include: { organization: true },
        });

        if (!membership) {
            return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
        }

        // Clean up the IDs - strip prefixes if user included them
        const cleanAccountId = accountId.replace(/^accounts\//, '');
        const cleanLocationId = locationId.replace(/^locations\//, '');

        // Create the platformId - combining account and location for uniqueness
        const platformId = `${cleanAccountId}_${cleanLocationId}`;

        // Check if account already exists
        const existingAccount = await db.socialAccount.findFirst({
            where: {
                organizationId: membership.organizationId,
                platform: 'GOOGLE_BUSINESS',
                platformId: platformId,
            },
        });

        if (existingAccount) {
            // Update existing account
            await db.socialAccount.update({
                where: { id: existingAccount.id },
                data: {
                    name: businessName,
                    isActive: true,
                    // Store the full IDs in a metadata-friendly format
                    accessToken: `manual:${cleanAccountId}:${cleanLocationId}`,
                    tokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
                },
            });

            logger.info(
                { accountId: existingAccount.id, platform: 'GOOGLE_BUSINESS' },
                'Updated existing Google Business account'
            );

            await ensureOrgSyncScheduled(membership.organizationId);
            return NextResponse.json({ success: true, updated: true });
        }

        // Create new social account
        const newAccount = await db.socialAccount.create({
            data: {
                organizationId: membership.organizationId,
                platform: 'GOOGLE_BUSINESS',
                platformId: platformId,
                name: businessName,
                username: cleanLocationId, // Show location ID as username
                // Store credentials in a special format for manual accounts
                // Format: manual:{accountId}:{locationId}
                accessToken: `manual:${cleanAccountId}:${cleanLocationId}`,
                tokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
                isActive: true,
            },
        });

        logger.info(
            { accountId: newAccount.id, platform: 'GOOGLE_BUSINESS', platformId },
            'Created new Google Business account (manual entry)'
        );

        await ensureOrgSyncScheduled(membership.organizationId);
        return NextResponse.json({ success: true, accountId: newAccount.id });
    } catch (error) {
        logger.error({ error }, 'Failed to create Google Business account');
        return NextResponse.json(
            { error: 'Failed to connect Google Business' },
            { status: 500 }
        );
    }
}
