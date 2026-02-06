/**
 * Platform Publishing Orchestrator
 * Why: Routes publish requests to platform-specific handlers.
 */

import type { PlatformAccount, PublishPayload, PublishResponse } from '../types';
import { publishToInstagram } from './instagram';
import { publishToFacebook } from './facebook';
import { publishToTikTok } from './tiktok';
import { publishToYouTube } from './youtube';
import { publishToPinterest } from './pinterest';
import { publishToLinkedIn } from './linkedin';
import { publishToBluesky } from './bluesky';
import { publishToGoogleBusiness } from './google-business';
import { refreshAccessToken } from '../oauth';
import { db } from '../../db';
import { logger } from '../../logger';
import type { Platform } from '../../platform-config';

/**
 * Publish content to a platform.
 * Routes to platform-specific implementation based on account type.
 * Automatically refreshes expired tokens when possible.
 */
export async function publishToPlatform(
    account: PlatformAccount,
    payload: PublishPayload
): Promise<PublishResponse> {
    // Check if token is expired and attempt refresh
    let currentToken = account.accessToken;
    let accountToUse = account;

    if (new Date() > account.tokenExpiresAt) {
        logger.info({ platform: account.platform, accountId: account.id }, 'Token expired, attempting refresh');

        // Check if we have a refresh token
        if (!account.refreshToken) {
            logger.warn({ platform: account.platform }, 'No refresh token available');
            return {
                success: false,
                error: 'Access token expired and no refresh token available. Please reconnect your account.',
                errorCode: 'TOKEN_EXPIRED',
            };
        }

        try {
            const refreshed = await refreshAccessToken(
                account.platform as Platform,
                account.refreshToken
            );

            // Update the database with new tokens
            await db.socialAccount.update({
                where: { id: account.id },
                data: {
                    accessToken: refreshed.accessToken,
                    refreshToken: refreshed.refreshToken || account.refreshToken,
                    tokenExpiry: new Date(Date.now() + refreshed.expiresIn * 1000),
                },
            });

            logger.info({ platform: account.platform }, 'Token refresh successful');
            currentToken = refreshed.accessToken;

            // Update account object with refreshed token
            accountToUse = { ...account, accessToken: currentToken };
        } catch (refreshError) {
            const errorMessage = refreshError instanceof Error ? refreshError.message : 'Unknown error';
            logger.error({ platform: account.platform, error: errorMessage }, 'Token refresh failed');

            return {
                success: false,
                error: `Token refresh failed: ${errorMessage}. Please reconnect your account.`,
                errorCode: 'TOKEN_REFRESH_FAILED',
            };
        }
    }

    // Platform-specific publishing logic
    switch (accountToUse.platform) {
        case 'instagram':
            return publishToInstagram(accountToUse, payload);
        case 'tiktok':
            return publishToTikTok(accountToUse, payload);
        case 'youtube':
            return publishToYouTube(accountToUse, payload);
        case 'facebook':
            return publishToFacebook(accountToUse, payload);
        case 'pinterest':
            return publishToPinterest(accountToUse, payload);
        case 'linkedin':
            return publishToLinkedIn(accountToUse, payload);
        case 'bluesky':
            return publishToBluesky(accountToUse, payload);
        case 'google_business':
            return publishToGoogleBusiness(accountToUse, payload);
        default:
            return { success: false, error: 'Unsupported platform' };
    }
}

