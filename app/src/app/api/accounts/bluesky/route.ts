/**
 * Bluesky Session Authentication API
 * Handles Bluesky's AT Protocol session-based auth (not OAuth)
 * 
 * Bluesky uses app passwords instead of OAuth, requiring username/password login
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createBlueskySession, fetchBlueskyProfile } from '@/lib/platform-api/oauth-profile';
import { logger } from '@/lib/logger';
import { Platform } from '@/generated/prisma/enums';
import { ensureOrgSyncScheduled } from '@/lib/bullmq/queues';
import { relinkOrphanedPosts } from '@/lib/services/relink-orphaned-posts';

export const dynamic = 'force-dynamic';

/**
 * POST /api/accounts/bluesky
 * Create Bluesky session and connect account
 * Body: { identifier: string, password: string }
 * 
 * Note: 'password' should be an App Password from Bluesky settings,
 * not the user's main account password.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { identifier, password } = await request.json();

        if (!identifier || !password) {
            return NextResponse.json(
                { error: 'Handle and App Password are required' },
                { status: 400 }
            );
        }

        // Create Bluesky session using AT Protocol
        const blueskySession = await createBlueskySession(identifier, password);

        if (!blueskySession) {
            return NextResponse.json(
                { error: 'Failed to authenticate with Bluesky. Check your handle and app password.' },
                { status: 401 }
            );
        }

        // Fetch full profile
        const profile = await fetchBlueskyProfile(blueskySession.accessJwt, blueskySession.did);

        if (!profile) {
            return NextResponse.json(
                { error: 'Failed to fetch Bluesky profile' },
                { status: 500 }
            );
        }

        // Check if account already exists
        const existingAccount = await db.socialAccount.findFirst({
            where: {
                organizationId: session.user.currentOrganizationId,
                platform: Platform.BLUESKY,
                platformId: profile.platformId,
            },
        });

        if (existingAccount) {
            // Update existing account with new tokens
            await db.socialAccount.update({
                where: { id: existingAccount.id },
                data: {
                    accessToken: blueskySession.accessJwt,
                    refreshToken: blueskySession.refreshJwt,
                    // Why: accessJwt expires after 2 hours; must match so ensureValidToken triggers proactive refresh
                    tokenExpiry: new Date(Date.now() + 2 * 60 * 60 * 1000),
                    name: profile.name,
                    username: profile.username,
                    avatar: profile.profilePicture,
                    isActive: true,
                },
            });

            logger.info({ platform: 'bluesky', accountId: existingAccount.id }, 'Updated existing Bluesky account');
            await ensureOrgSyncScheduled(session.user.currentOrganizationId);
            return NextResponse.json({ success: true, reconnected: true });
        }

        // Create new social account
        const newAccount = await db.socialAccount.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                platform: Platform.BLUESKY,
                platformId: profile.platformId,
                name: profile.name,
                username: profile.username,
                avatar: profile.profilePicture,
                accessToken: blueskySession.accessJwt,
                refreshToken: blueskySession.refreshJwt,
                // Why: accessJwt expires after 2 hours; must match so ensureValidToken triggers proactive refresh
                tokenExpiry: new Date(Date.now() + 2 * 60 * 60 * 1000),
                isActive: true,
            },
        });

        // Why: Reconnect orphaned posts whose socialAccountId was set to NULL when the previous account was deleted
        await relinkOrphanedPosts(session.user.currentOrganizationId, newAccount.id, Platform.BLUESKY);

        logger.info({ platform: 'bluesky', did: profile.platformId }, 'Created new Bluesky account');
        await ensureOrgSyncScheduled(session.user.currentOrganizationId);
        return NextResponse.json({ success: true, connected: true });
    } catch (error) {
        logger.error({ error }, 'Bluesky session creation error');
        return NextResponse.json({ error: 'Failed to connect Bluesky account' }, { status: 500 });
    }
}
