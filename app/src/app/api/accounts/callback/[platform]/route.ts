/**
 * OAuth Callback Handler
 * Handles OAuth redirects from social platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/lib/auth';
import { exchangeCodeForToken, getCredentialsForPlatform, type Platform } from '@/lib/platforms';
import {
    fetchInstagramProfile,
    fetchFacebookPageProfile,
    fetchTikTokProfile,
    fetchYouTubeChannel,
    fetchPinterestProfile,
    fetchLinkedInProfile,
    fetchGoogleBusinessProfile,
    fetchBlueskyProfile,
    fetchThreadsProfile,
} from '@/lib/platform-api/oauth-profile';
import { logger } from '@/lib/logger';
import { encryptToken } from '@/lib/token-encryption';
import { ensureOrgSyncScheduled } from '@/lib/bullmq/queues';
import { relinkOrphanedPosts } from '@/lib/services/relink-orphaned-posts';
import crypto from 'crypto';

interface CallbackParams {
    params: Promise<{ platform: string }>;
}

/**
 * GET /api/accounts/callback/[platform]
 * OAuth callback endpoint that exchanges code for tokens and creates social account
 */
export async function GET(
    request: NextRequest,
    { params }: CallbackParams
) {
    // Use NEXTAUTH_URL for redirects to avoid Docker internal URLs (0.0.0.0:3000)
    // Trim trailing slash to ensure redirect_uri matches authorization request exactly
    const baseUrl = (process.env.NEXTAUTH_URL || 'http://localhost:3000').replace(/\/$/, '');

    try {
        const { platform } = await params;
        const searchParams = request.nextUrl.searchParams;
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        // Handle OAuth errors
        if (error) {
            logger.error({ platform, error }, 'OAuth error from platform');
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=oauth_denied', baseUrl));
        }

        if (!code || !state) {
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=missing_params', baseUrl));
        }

        // Decode and validate state (HMAC-signed format)
        let stateData: { organizationId: string; platform: string; timestamp: number };
        try {
            const decoded = JSON.parse(Buffer.from(state, 'base64').toString());

            // Verify HMAC signature to prevent forged state attacks
            const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';

            // Why (BUG-58): Removed legacy unsigned fallback. All state
            // params must now be HMAC-signed to prevent forged state attacks.
            if (!decoded.payload || !decoded.sig) {
                logger.warn({ platform }, 'OAuth state missing signature (unsigned format rejected)');
                return NextResponse.redirect(new URL('/settings?tab=accounts&error=invalid_state', baseUrl));
            }

            const expectedSig = crypto.createHmac('sha256', secret).update(decoded.payload).digest('hex');
            const sigBuffer = Buffer.from(decoded.sig, 'hex');
            const expectedBuffer = Buffer.from(expectedSig, 'hex');

            // Why (BUG-59): timingSafeEqual throws if buffers differ in length.
            // Check length first to return a clean error instead of crashing.
            if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
                logger.warn({ platform }, 'OAuth state HMAC verification failed');
                return NextResponse.redirect(new URL('/settings?tab=accounts&error=invalid_state', baseUrl));
            }
            stateData = JSON.parse(decoded.payload);
        } catch {
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=invalid_state', baseUrl));
        }

        // Verify the user is authenticated
        const session = await auth();
        if (!session?.user?.id) {
            logger.warn({ platform }, 'OAuth callback without authenticated session');
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=not_authenticated', baseUrl));
        }

        // Verify user is a member of the organization in the state
        const membership = await db.organizationMember.findFirst({
            where: {
                userId: session.user.id,
                organizationId: stateData.organizationId,
            },
            select: { id: true },
        });
        if (!membership) {
            logger.warn({ platform, userId: session.user.id, orgId: stateData.organizationId }, 'OAuth callback org mismatch');
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=org_mismatch', baseUrl));
        }

        // Check state freshness (15 min expiry)
        if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=expired_state', baseUrl));
        }

        // Get global platform credentials (super admin configured)
        const credentials = await getCredentialsForPlatform(platform as Platform);
        if (!credentials) {
            logger.error({ platform }, 'No global credentials configured for platform');
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=no_credentials', baseUrl));
        }

        // Exchange code for tokens using real API
        const redirectUri = `${baseUrl}/api/accounts/callback/${platform}`;
        const tokens = await exchangeCodeForToken(platform as Platform, code, redirectUri, credentials);

        // Special handling for Google Business - redirect to location picker
        if (platform === 'google_business') {
            // Fetch accounts to get account info for the picker
            const accountsUrl = 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts';
            const accountsResponse = await fetch(accountsUrl, {
                headers: { 'Authorization': `Bearer ${tokens.accessToken}` },
            });

            if (!accountsResponse.ok) {
                logger.error({ status: accountsResponse.status }, 'Failed to fetch Google Business accounts');
                return NextResponse.redirect(new URL('/settings?tab=accounts&error=gbp_accounts_failed', baseUrl));
            }

            const accountsData = await accountsResponse.json();
            const account = accountsData.accounts?.[0];

            if (!account) {
                logger.warn('No Google Business accounts found');
                return NextResponse.redirect(new URL('/settings?tab=accounts&error=no_gbp_accounts', baseUrl));
            }

            // Why (BUG-01): Store token data server-side in Redis instead of URL params.
            // Previously encoded tokens into the URL query string, which leaked them to
            // browser history, server access logs, proxy logs, and analytics tools.
            const gbpData = {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresIn: tokens.expiresIn,
                accountId: account.name,
                accountName: account.accountName || 'Business Account',
                organizationId: stateData.organizationId,
            };

            const { getRedisConnection } = await import('@/lib/bullmq/connection');
            const redis = getRedisConnection();
            const pendingKey = crypto.randomUUID();
            await redis.set(
                `gbp-pending:${pendingKey}`,
                JSON.stringify(gbpData),
                'EX',
                600, // 10-minute TTL
            );

            logger.info({ accountId: account.name }, 'Redirecting to Google Business location picker');
            return NextResponse.redirect(new URL(`/settings?tab=accounts&gbp_pending=${pendingKey}`, baseUrl));
        }

        // Why: Facebook/Instagram OAuth grants access to ALL pages the user manages.
        // Instead of auto-selecting the first page, redirect to a picker dialog
        // so the user can choose which page/account to link to this organisation.
        if (platform === 'facebook' || platform === 'instagram') {
            const expiresIn = tokens.refreshTokenExpiresIn ?? tokens.expiresIn;
            logger.info({ platform, expiresIn, hasRefreshToken: !!tokens.refreshToken }, 'Storing Meta OAuth tokens in Redis for picker');

            const metaData = {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresIn,
                organizationId: stateData.organizationId,
                metaType: platform, // 'facebook' or 'instagram'
            };

            const { getRedisConnection } = await import('@/lib/bullmq/connection');
            const redis = getRedisConnection();
            const pendingKey = crypto.randomUUID();
            await redis.set(
                `meta-pending:${pendingKey}`,
                JSON.stringify(metaData),
                'EX',
                600, // 10-minute TTL
            );

            logger.info({ platform, pendingKey }, 'Redirecting to Meta account picker');
            return NextResponse.redirect(
                new URL(`/settings?tab=accounts&meta_pending=${pendingKey}&meta_type=${platform}`, baseUrl)
            );
        }

        // Fetch user profile from platform
        const profile = await fetchPlatformProfile(platform as Platform, tokens.accessToken);

        if (!profile) {
            logger.error({ platform }, 'Failed to fetch profile from platform');
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=profile_fetch_failed', baseUrl));
        }

        // Check if account already exists
        const existingAccount = await db.socialAccount.findFirst({
            where: {
                organizationId: stateData.organizationId,
                platform: platform.toUpperCase() as 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'LINKEDIN' | 'GOOGLE_BUSINESS' | 'BLUESKY' | 'THREADS',
                platformId: profile.platformId,
            },
        });

        if (existingAccount) {
            // Update existing account with new tokens
            // For Meta platforms (Facebook/Instagram), use Page Access Token (required for publishing)
            const effectiveToken = ((platform === 'facebook' || platform === 'instagram') && profile.metadata?.pageAccessToken)
                ? profile.metadata.pageAccessToken as string
                : tokens.accessToken;

            // Why: tokenExpiry must reflect the *access* token lifetime so the
            // token-refresh-worker can proactively refresh before it expires.
            const effectiveExpiresIn = tokens.expiresIn;

            await db.socialAccount.update({
                where: { id: existingAccount.id },
                data: {
                    accessToken: encryptToken(effectiveToken),
                    refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
                    tokenExpiry: new Date(Date.now() + effectiveExpiresIn * 1000),
                    name: profile.name,
                    username: profile.username,
                    avatar: profile.profilePicture,
                    isActive: true,
                    lastRefreshError: null,
                    lastRefreshAt: null,
                },
            });

            logger.info({ platform, accountId: existingAccount.id }, 'Updated existing social account');
            // Why: Sync jobs are only created at worker boot — ensure this org is scheduled
            await ensureOrgSyncScheduled(stateData.organizationId);
            return NextResponse.redirect(new URL('/settings?tab=accounts&success=reconnected', baseUrl));
        }

        // Create new social account
        // For Meta platforms (Facebook/Instagram), use Page Access Token (required for publishing)
        const effectiveToken = ((platform === 'facebook' || platform === 'instagram') && profile.metadata?.pageAccessToken)
            ? profile.metadata.pageAccessToken as string
            : tokens.accessToken;

        // Why: tokenExpiry must reflect the *access* token lifetime so the
        // token-refresh-worker can proactively refresh before it expires.
        const effectiveExpiresIn = tokens.expiresIn;

        const platformEnum = platform.toUpperCase() as 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'LINKEDIN' | 'GOOGLE_BUSINESS' | 'BLUESKY' | 'THREADS';
        const newAccount = await db.socialAccount.create({
            data: {
                organizationId: stateData.organizationId,
                platform: platformEnum,
                platformId: profile.platformId,
                name: profile.name,
                username: profile.username,
                avatar: profile.profilePicture,
                accessToken: encryptToken(effectiveToken),
                refreshToken: tokens.refreshToken ? encryptToken(tokens.refreshToken) : null,
                tokenExpiry: new Date(Date.now() + effectiveExpiresIn * 1000),
                isActive: true,
            },
        });

        // Why: Reconnect orphaned posts whose socialAccountId was set to NULL when the previous account was deleted
        await relinkOrphanedPosts(stateData.organizationId, newAccount.id, platformEnum);

        logger.info({ platform, platformId: profile.platformId }, 'Created new social account');
        // Why: Sync jobs are only created at worker boot — ensure this org is scheduled
        await ensureOrgSyncScheduled(stateData.organizationId);
        return NextResponse.redirect(new URL('/settings?tab=accounts&success=connected', baseUrl));
    } catch (error) {
        logger.error({ error }, 'OAuth callback error');
        return NextResponse.redirect(new URL('/settings?tab=accounts&error=callback_failed', baseUrl));
    }
}

/**
 * Fetch user profile based on platform
 */
async function fetchPlatformProfile(platform: Platform, accessToken: string) {
    switch (platform) {
        case 'instagram':
            return fetchInstagramProfile(accessToken);
        case 'facebook':
            return fetchFacebookPageProfile(accessToken);
        case 'tiktok':
            return fetchTikTokProfile(accessToken);
        case 'youtube':
            return fetchYouTubeChannel(accessToken);
        case 'google_business':
            return fetchGoogleBusinessProfile(accessToken);
        case 'pinterest':
            return fetchPinterestProfile(accessToken);
        case 'linkedin':
            return fetchLinkedInProfile(accessToken);
        case 'bluesky':
            // Bluesky profile is fetched differently (via session auth)
            // This case handles if somehow we get here with a token
            return fetchBlueskyProfile(accessToken);
        case 'threads':
            return fetchThreadsProfile(accessToken);
        default:
            return null;
    }
}
