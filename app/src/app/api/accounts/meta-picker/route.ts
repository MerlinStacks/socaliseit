/**
 * Meta Account Picker API
 * Why: Facebook/Instagram OAuth grants access to all pages a user manages.
 * This endpoint lets the frontend list available pages and complete the
 * connection with the user's chosen page/account.
 *
 * Supports two modes:
 * 1. Redis-pending (original): Uses a short-lived Redis key from the OAuth callback.
 * 2. fromStored (new): Reuses an existing connected account's token so the
 *    user can add another page/account without re-doing the OAuth redirect.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';
import { encryptToken, decryptToken } from '@/lib/token-encryption';
import { ensureOrgSyncScheduled } from '@/lib/bullmq/queues';
import { relinkOrphanedPosts } from '@/lib/services/relink-orphaned-posts';
import { registerMetaPageSubscription } from '@/lib/platform-api/meta-webhooks';
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

        const fromStored = request.nextUrl.searchParams.get('fromStored') === 'true';
        const metaTypeParam = request.nextUrl.searchParams.get('metaType');

        // Why: Two modes — (1) fromStored reuses an existing account's token so the
        // user can add another page/account without re-doing OAuth. (2) pendingKey
        // looks up token data stashed in Redis by the OAuth callback.
        let accessToken: string;
        let metaType: string;

        if (fromStored) {
            if (!metaTypeParam || !['facebook', 'instagram'].includes(metaTypeParam)) {
                return NextResponse.json({ error: 'Invalid metaType' }, { status: 400 });
            }
            metaType = metaTypeParam;

            const resolved = await resolveStoredMetaToken(session.user.currentOrganizationId);
            if (!resolved) {
                return NextResponse.json(
                    { error: 'No valid Meta account found. Please connect via OAuth first.' },
                    { status: 404 }
                );
            }
            accessToken = resolved;
        } else {
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
            accessToken = pendingData.accessToken;
            metaType = pendingData.metaType;
        }

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
    /** Redis key from OAuth callback — omit when using fromStored */
    pendingKey?: string;
    /** When true, reuses existing account token instead of a Redis pending key */
    fromStored?: boolean;
    /** Platform type — required when fromStored is true */
    metaType?: 'facebook' | 'instagram';
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
        const { pendingKey, fromStored, selectedPageId, selectedIgId } = body;

        let accessToken: string;
        let refreshToken: string | undefined;
        let expiresIn: number;
        let organizationId: string;
        let metaType: string;

        if (fromStored) {
            // Why: Reuse an existing account's stored token to connect another page/account
            // without forcing the user through a full OAuth redirect.
            if (!body.metaType || !['facebook', 'instagram'].includes(body.metaType)) {
                return NextResponse.json({ error: 'Missing or invalid metaType' }, { status: 400 });
            }
            metaType = body.metaType;
            organizationId = session.user.currentOrganizationId;

            const sourceAccount = await findValidMetaAccount(organizationId);
            if (!sourceAccount) {
                return NextResponse.json(
                    { error: 'No valid Meta account found. Please connect via OAuth first.' },
                    { status: 404 }
                );
            }
            accessToken = decryptToken(sourceAccount.accessToken);
            refreshToken = sourceAccount.refreshToken ? decryptToken(sourceAccount.refreshToken) : undefined;
            expiresIn = sourceAccount.tokenExpiry
                ? Math.max(0, Math.floor((new Date(sourceAccount.tokenExpiry).getTime() - Date.now()) / 1000))
                : 5184000; // 60 days fallback
        } else {
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
            accessToken = pendingData.accessToken;
            refreshToken = pendingData.refreshToken;
            expiresIn = pendingData.expiresIn;
            organizationId = pendingData.organizationId;
            metaType = pendingData.metaType;

            // Why: Verify the session user is still in the same org as when they started OAuth
            if (organizationId !== session.user.currentOrganizationId) {
                return NextResponse.json(
                    { error: 'Organization mismatch. Please switch back and try again.' },
                    { status: 403 }
                );
            }
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

            log.info({ expiresIn, refreshTokenExists: !!refreshToken }, 'Creating/updating Facebook account');

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

            log.info({ expiresIn, refreshTokenExists: !!refreshToken }, 'Creating/updating Instagram account');

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

    log.info({ platform, platformId, existingId: existing?.id, existingIsActive: existing?.isActive, existingTokenExpiry: existing?.tokenExpiry }, 'Meta picker account lookup');

    if (existing) {
        const newTokenExpiry = new Date(Date.now() + expiresIn * 1000);
        await db.socialAccount.update({
            where: { id: existing.id },
            data: {
                accessToken: encryptToken(effectiveToken),
                refreshToken: refreshToken ? encryptToken(refreshToken) : null,
                tokenExpiry: newTokenExpiry,
                name,
                username,
                avatar,
                isActive: true,
            },
        });

        log.info({ platform, accountId: existing.id, newTokenExpiry }, 'Updated existing Meta account via picker');
        await ensureOrgSyncScheduled(organizationId);

        // Re-register page subscription in case the token changed or subscription lapsed
        registerMetaPageSubscription(platformId, effectiveToken, platform).catch((err) => {
            log.warn({ err, platformId, platform, organizationId }, 'Meta page webhook re-subscription failed (non-blocking)');
        });

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

    // Register page-level webhook subscription so this account receives real-time events
    registerMetaPageSubscription(platformId, effectiveToken, platform).catch((err) => {
        log.warn({ err, platformId, platform, organizationId }, 'Meta page webhook subscription failed (non-blocking)');
    });

    return NextResponse.json({ success: true, action: 'created' });
}

/**
 * Finds a valid (non-expired) FACEBOOK or INSTAGRAM account in the org.
 * Why: Used by the fromStored flow to locate a reusable Meta User Access Token
 * so the user can add another page/account without re-doing OAuth.
 */
async function findValidMetaAccount(organizationId: string) {
    return db.socialAccount.findFirst({
        where: {
            organizationId,
            platform: { in: ['FACEBOOK', 'INSTAGRAM'] },
            isActive: true,
            tokenExpiry: { gt: new Date() },
        },
        select: {
            accessToken: true,
            refreshToken: true,
            tokenExpiry: true,
        },
        orderBy: { tokenExpiry: 'desc' },
    });
}

/**
 * Resolves a decrypted Meta access token from the org's stored accounts.
 * Why: Shared between GET (fromStored) so we don't duplicate the lookup logic.
 */
async function resolveStoredMetaToken(organizationId: string): Promise<string | null> {
    const account = await findValidMetaAccount(organizationId);
    if (!account) return null;
    return decryptToken(account.accessToken);
}
