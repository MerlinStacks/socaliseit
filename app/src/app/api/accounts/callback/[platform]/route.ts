/**
 * OAuth Callback Handler
 * Handles OAuth redirects from social platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
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
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

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

        // Decode and validate state
        let stateData: { organizationId: string; platform: string; timestamp: number };
        try {
            stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        } catch {
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=invalid_state', baseUrl));
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

            // Encode tokens and account info for the location picker
            const gbpData = {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                expiresIn: tokens.expiresIn,
                accountId: account.name,
                accountName: account.accountName || 'Business Account',
            };
            const encodedData = Buffer.from(JSON.stringify(gbpData)).toString('base64');

            logger.info({ accountId: account.name }, 'Redirecting to Google Business location picker');
            return NextResponse.redirect(new URL(`/settings?tab=accounts&gbp_pending=${encodedData}`, baseUrl));
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

            // Use refresh token expiry for health display (more meaningful than access token expiry)
            const effectiveExpiresIn = tokens.refreshTokenExpiresIn ?? tokens.expiresIn;

            await db.socialAccount.update({
                where: { id: existingAccount.id },
                data: {
                    accessToken: effectiveToken,
                    refreshToken: tokens.refreshToken,
                    tokenExpiry: new Date(Date.now() + effectiveExpiresIn * 1000),
                    name: profile.name,
                    username: profile.username,
                    avatar: profile.profilePicture,
                    isActive: true,
                },
            });

            logger.info({ platform, accountId: existingAccount.id }, 'Updated existing social account');
            return NextResponse.redirect(new URL('/settings?tab=accounts&success=reconnected', baseUrl));
        }

        // Create new social account
        // For Meta platforms (Facebook/Instagram), use Page Access Token (required for publishing)
        const effectiveToken = ((platform === 'facebook' || platform === 'instagram') && profile.metadata?.pageAccessToken)
            ? profile.metadata.pageAccessToken as string
            : tokens.accessToken;

        // Use refresh token expiry for health display (more meaningful than access token expiry)
        const effectiveExpiresIn = tokens.refreshTokenExpiresIn ?? tokens.expiresIn;

        await db.socialAccount.create({
            data: {
                organizationId: stateData.organizationId,
                platform: platform.toUpperCase() as 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'LINKEDIN' | 'GOOGLE_BUSINESS' | 'BLUESKY' | 'THREADS',
                platformId: profile.platformId,
                name: profile.name,
                username: profile.username,
                avatar: profile.profilePicture,
                accessToken: effectiveToken,
                refreshToken: tokens.refreshToken,
                tokenExpiry: new Date(Date.now() + effectiveExpiresIn * 1000),
                isActive: true,
            },
        });

        logger.info({ platform, platformId: profile.platformId }, 'Created new social account');
        return NextResponse.redirect(new URL('/settings?tab=accounts&success=connected', baseUrl));
    } catch (error) {
        logger.error({ error }, 'OAuth callback error');
        const errorMessage = error instanceof Error ? error.message : 'callback_failed';
        return NextResponse.redirect(new URL(`/settings?tab=accounts&error=${encodeURIComponent(errorMessage)}`, baseUrl));
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
