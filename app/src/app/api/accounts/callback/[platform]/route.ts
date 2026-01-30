/**
 * OAuth Callback Handler
 * Handles OAuth redirects from social platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { exchangeCodeForToken, type Platform } from '@/lib/platforms';

interface CallbackParams {
    params: Promise<{ platform: string }>;
}

/**
 * GET /api/accounts/callback/[platform]
 * OAuth callback endpoint that exchanges code for tokens
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
            console.error('OAuth error:', error);
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

        // Exchange code for tokens
        const redirectUri = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/accounts/callback/${platform}`;
        const tokens = await exchangeCodeForToken(platform as Platform, code, redirectUri);

        // For now, create a mock account (in production, would fetch profile from platform API)
        const accountId = `${platform}_${Date.now()}`;

        await db.socialAccount.create({
            data: {
                id: accountId,
                workspaceId: stateData.workspaceId,
                platform: platform.toUpperCase() as 'INSTAGRAM' | 'FACEBOOK' | 'TIKTOK' | 'YOUTUBE' | 'PINTEREST' | 'GOOGLE_BUSINESS',
                platformId: accountId,
                name: `${platform.charAt(0).toUpperCase() + platform.slice(1)} Account`,
                username: `@connected_${platform}`,
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                tokenExpiry: new Date(Date.now() + tokens.expiresIn * 1000),
                isActive: true,
            },
        });

        return NextResponse.redirect(new URL('/settings?tab=accounts&success=connected', request.url));
    } catch (error) {
        console.error('OAuth callback error:', error);
        return NextResponse.redirect(new URL('/settings?tab=accounts&error=callback_failed', request.url));
    }
}
