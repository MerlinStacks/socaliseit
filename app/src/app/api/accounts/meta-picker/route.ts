/**
 * Meta Account Picker API
 * Why: Facebook/Instagram OAuth grants access to all pages a user manages.
 * This endpoint lets the frontend list available pages and complete the
 * connection with the user's chosen page/account.
 * Follows the same Redis-backed pending pattern as GBP location picker.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';
import { encryptToken } from '@/lib/token-encryption';
import { ensureOrgSyncScheduled } from '@/lib/bullmq/queues';
import { relinkOrphanedPosts } from '@/lib/services/relink-orphaned-posts';
import {
    fetchAllFacebookPages,
    fetchAllInstagramAccounts,
} from '@/lib/platform-api/oauth-profile';

const log = createRouteLogger('API', '/api/accounts/meta-picker');

/**
 * GET /api/accounts/meta-picker?pendingKey=...
 * Retrieves pending token data from Redis and returns available pages/accounts
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
        const raw = await redis.get(`meta-pending:${pendingKey}`);

        if (!raw) {
            return NextResponse.json(
                { error: 'Pending connection expired or not found. Please try connecting again.' },
                { status: 404 }
            );
        }

        const pendingData = JSON.parse(raw);
        const { accessToken, metaType } = pendingData;

        // Why: Fetch the full list of pages/accounts for the picker dialog
        if (metaType === 'facebook') {
            const pages = await fetchAllFacebookPages(accessToken);
            return NextResponse.json({ metaType, accounts: pages });
        }

        if (metaType === 'instagram') {
            const accounts = await fetchAllInstagramAccounts(accessToken);
            return NextResponse.json({ metaType, accounts });
        }

        return NextResponse.json({ error: 'Invalid meta type' }, { status: 400 });
    } catch (error) {
        log.error({ err: error }, 'Failed to fetch Meta accounts for picker');
        return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 });
    }
}

interface CompleteBody {
    pendingKey: string;
    /** For Facebook: the selected page ID */
    selectedPageId?: string;
    /** For Instagram: the selected IG account ID */
    selectedIgId?: string;
}

/**
 * POST /api/accounts/meta-picker
 * Completes the connection with the user's chosen page/account
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: CompleteBody = await request.json();
        const { pendingKey, selectedPageId, selectedIgId } = body;

        if (!pendingKey) {
            return NextResponse.json({ error: 'Missing pendingKey' }, { status: 400 });
        }

        const { getRedisConnection } = await import('@/lib/bullmq/connection');
        const redis = getRedisConnection();
        const raw = await redis.get(`meta-pending:${pendingKey}`);

        if (!raw) {
            return NextResponse.json(
                { error: 'Pending connection expired. Please try connecting again.' },
                { status: 404 }
            );
        }

        const pendingData = JSON.parse(raw);
        const { accessToken, refreshToken, expiresIn, organizationId, metaType } = pendingData;

        // Why: Verify the session user is still in the same org as when they started OAuth
        if (organizationId !== session.user.currentOrganizationId) {
            return NextResponse.json(
                { error: 'Organization mismatch. Please switch back and try again.' },
                { status: 403 }
            );
        }

        if (metaType === 'facebook') {
            if (!selectedPageId) {
                return NextResponse.json({ error: 'No page selected' }, { status: 400 });
            }

            // Why: Re-fetch pages to get the selected page's data (including pageAccessToken)
            const pages = await fetchAllFacebookPages(accessToken);
            const selectedPage = pages.find(p => p.id === selectedPageId);
            if (!selectedPage) {
                return NextResponse.json({ error: 'Selected page not found' }, { status: 404 });
            }

            return await createOrUpdateAccount({
                organizationId,
                platform: 'FACEBOOK',
                platformId: selectedPage.id,
                name: selectedPage.name,
                username: selectedPage.name,
                avatar: selectedPage.picture,
                effectiveToken: selectedPage.pageAccessToken,
                refreshToken,
                expiresIn,
            });
        }

        if (metaType === 'instagram') {
            if (!selectedIgId) {
                return NextResponse.json({ error: 'No Instagram account selected' }, { status: 400 });
            }

            const accounts = await fetchAllInstagramAccounts(accessToken);
            const selected = accounts.find(a => a.igId === selectedIgId);
            if (!selected) {
                return NextResponse.json({ error: 'Selected Instagram account not found' }, { status: 404 });
            }

            return await createOrUpdateAccount({
                organizationId,
                platform: 'INSTAGRAM',
                platformId: selected.igId,
                name: selected.igName,
                username: selected.igUsername,
                avatar: selected.igPicture,
                effectiveToken: selected.pageAccessToken,
                refreshToken,
                expiresIn,
            });
        }

        return NextResponse.json({ error: 'Invalid meta type' }, { status: 400 });
    } catch (error) {
        log.error({ err: error }, 'Failed to complete Meta account connection');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * Creates or updates a SocialAccount record.
 * Why: Shared logic between Facebook and Instagram completion to avoid duplication.
 */
async function createOrUpdateAccount(params: {
    organizationId: string;
    platform: 'FACEBOOK' | 'INSTAGRAM';
    platformId: string;
    name: string;
    username: string;
    avatar?: string;
    effectiveToken: string;
    refreshToken?: string;
    expiresIn: number;
}) {
    const { organizationId, platform, platformId, name, username, avatar, effectiveToken, refreshToken, expiresIn } = params;

    const existing = await db.socialAccount.findFirst({
        where: { organizationId, platform, platformId },
    });

    if (existing) {
        await db.socialAccount.update({
            where: { id: existing.id },
            data: {
                accessToken: encryptToken(effectiveToken),
                refreshToken: refreshToken ? encryptToken(refreshToken) : null,
                tokenExpiry: new Date(Date.now() + expiresIn * 1000),
                name,
                username,
                avatar,
                isActive: true,
            },
        });

        log.info({ platform, accountId: existing.id }, 'Updated existing Meta account via picker');
        await ensureOrgSyncScheduled(organizationId);
        return NextResponse.json({ success: true, action: 'updated' });
    }

    const newAccount = await db.socialAccount.create({
        data: {
            organizationId,
            platform,
            platformId,
            name,
            username,
            avatar,
            accessToken: encryptToken(effectiveToken),
            refreshToken: refreshToken ? encryptToken(refreshToken) : null,
            tokenExpiry: new Date(Date.now() + expiresIn * 1000),
            isActive: true,
        },
    });

    // Why: Reconnect orphaned posts whose socialAccountId was set to NULL when previous account was deleted
    await relinkOrphanedPosts(organizationId, newAccount.id, platform);

    log.info({ platform, platformId, accountId: newAccount.id }, 'Created new Meta account via picker');
    await ensureOrgSyncScheduled(organizationId);
    return NextResponse.json({ success: true, action: 'created' });
}
