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
    try {
        const { platform } = await params;
        const searchParams = request.nextUrl.searchParams;
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');

        // Handle OAuth errors
        if (error) {
            logger.error({ platform, error }, 'OAuth error from platform');
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=oauth_denied', request.url));
        }

        if (!code || !state) {
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=missing_params', request.url));
        }

        // Decode and validate state
        let stateData: { workspaceId: string; platform: string; timestamp: number };
        try {
            stateData = JSON.parse(Buffer.from(state, 'base64').toString());
        } catch {
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=invalid_state', request.url));
        }

        // Check state freshness (15 min expiry)
        if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=expired_state', request.url));
        }

        // Get platform credentials from database
        const credentials = await getCredentialsForPlatform(stateData.workspaceId, platform as Platform);
        if (!credentials) {
            logger.error({ platform }, 'No credentials configured for platform');
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=no_credentials', request.url));
        }

        // Exchange code for tokens using real API
        const redirectUri = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/accounts/callback/${platform}`;
        const tokens = await exchangeCodeForToken(platform as Platform, code, redirectUri, credentials);

        // Fetch user profile from platform
        const profile = await fetchPlatformProfile(platform as Platform, tokens.accessToken);

        if (!profile) {
            logger.error({ platform }, 'Failed to fetch profile from platform');
            return NextResponse.redirect(new URL('/settings?tab=accounts&error=profile_fetch_failed', request.url));
        }

        // Check if account already exists
        const existingAccount = await db.socialAccount.findFirst({
            where: {
                workspaceId: stateData.workspaceId,
                platform: platform.toUpperCase() as 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'LINKEDIN' | 'GOOGLE_BUSINESS',
                platformId: profile.platformId,
            },
        });

        if (existingAccount) {
            // Update existing account with new tokens
            await db.socialAccount.update({
                where: { id: existingAccount.id },
                data: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
                    name: profile.name,
                    username: profile.username,
                    avatar: profile.profilePicture,
                    isActive: true,
                },
            });

            logger.info({ platform, accountId: existingAccount.id }, 'Updated existing social account');
            return NextResponse.redirect(new URL('/settings?tab=accounts&success=reconnected', request.url));
        }

        // Create new social account
        await db.socialAccount.create({
            data: {
                workspaceId: stateData.workspaceId,
                platform: platform.toUpperCase() as 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'LINKEDIN' | 'GOOGLE_BUSINESS',
                platformId: profile.platformId,
                name: profile.name,
                username: profile.username,
                avatar: profile.profilePicture,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
                isActive: true,
            },
        });

        logger.info({ platform, platformId: profile.platformId }, 'Created new social account');
        return NextResponse.redirect(new URL('/settings?tab=accounts&success=connected', request.url));
    } catch (error) {
        logger.error({ error }, 'OAuth callback error');
        const errorMessage = error instanceof Error ? error.message : 'callback_failed';
        return NextResponse.redirect(new URL(`/settings?tab=accounts&error=${encodeURIComponent(errorMessage)}`, request.url));
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
        case 'google_business':
            return fetchYouTubeChannel(accessToken);
        case 'pinterest':
            return fetchPinterestProfile(accessToken);
        case 'linkedin':
            return fetchLinkedInProfile(accessToken);
        default:
            return null;
    }
}
