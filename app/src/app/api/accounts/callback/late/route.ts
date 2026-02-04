/**
 * Late.dev OAuth Callback Handler
 *
 * Why: Handles the redirect from Late.dev OAuth flow. For headless mode,
 * we receive tokens and user data to build our own location selector UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/crypto';

const LATE_API_BASE = 'https://getlate.dev/api/v1';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;

    // Extract callback parameters
    const workspaceId = searchParams.get('workspaceId');
    const profileId = searchParams.get('profileId');
    const pendingDataToken = searchParams.get('pendingDataToken');
    const connectToken = searchParams.get('connect_token');
    const platform = searchParams.get('platform');
    const step = searchParams.get('step');
    const error = searchParams.get('error');

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const settingsUrl = `${baseUrl}/settings?tab=accounts`;

    // Handle errors
    if (error) {
        logger.error({ error, workspaceId }, 'Late.dev OAuth error');
        return NextResponse.redirect(
            `${settingsUrl}&error=${encodeURIComponent(error)}`
        );
    }

    if (!workspaceId) {
        return NextResponse.redirect(
            `${settingsUrl}&error=${encodeURIComponent('Missing workspace ID')}`
        );
    }

    try {
        // Get Late.dev API key
        const settings = await db.integrationSettings.findUnique({
            where: { workspaceId },
        });

        if (!settings?.lateApiKey) {
            return NextResponse.redirect(
                `${settingsUrl}&error=${encodeURIComponent('Late.dev not configured')}`
            );
        }

        const lateApiKey = decrypt(settings.lateApiKey);

        // For headless mode with Google Business, we need to fetch pending data and locations
        if (platform === 'googlebusiness' && step === 'select_location' && pendingDataToken) {
            // Fetch the OAuth data from Late
            const pendingDataRes = await fetch(
                `${LATE_API_BASE}/connect/pending-data?token=${pendingDataToken}`,
                {
                    headers: {
                        'Authorization': `Bearer ${lateApiKey}`,
                        ...(connectToken && { 'X-Connect-Token': connectToken }),
                    },
                }
            );

            if (!pendingDataRes.ok) {
                logger.error({ status: pendingDataRes.status }, 'Failed to fetch pending data');
                return NextResponse.redirect(
                    `${settingsUrl}&error=${encodeURIComponent('Failed to fetch account data')}`
                );
            }

            const pendingData = await pendingDataRes.json() as {
                tempToken: string;
                userProfile: { id: string; displayName: string; email?: string };
                lateAccountId?: string;
            };

            // If Late provides a direct account ID, use that
            if (pendingData.lateAccountId) {
                await saveGoogleBusinessAccount(
                    workspaceId,
                    pendingData.lateAccountId,
                    pendingData.userProfile.displayName,
                    pendingData.userProfile.id
                );

                return NextResponse.redirect(
                    `${settingsUrl}&success=true&message=${encodeURIComponent('Google Business connected!')}`
                );
            }

            // Otherwise, redirect to a location selection page (future enhancement)
            // For now, we'll use the first available location or prompt error
            return NextResponse.redirect(
                `${settingsUrl}&error=${encodeURIComponent('Location selection not yet implemented. Please use manual entry.')}`
            );
        }

        // Handle standard (non-headless) callback with Late account ID
        if (profileId) {
            // List accounts to find the newly connected one
            const accountsRes = await fetch(`${LATE_API_BASE}/accounts`, {
                headers: { 'Authorization': `Bearer ${lateApiKey}` },
            });

            if (accountsRes.ok) {
                const accountsData = await accountsRes.json() as {
                    accounts: Array<{
                        _id: string;
                        platform: string;
                        displayName: string;
                        username: string;
                    }>;
                };

                // Find the Google Business account
                const gbpAccount = accountsData.accounts.find(
                    (a) => a.platform === 'googlebusiness'
                );

                if (gbpAccount) {
                    await saveGoogleBusinessAccount(
                        workspaceId,
                        gbpAccount._id,
                        gbpAccount.displayName,
                        gbpAccount.username
                    );

                    return NextResponse.redirect(
                        `${settingsUrl}&success=true&message=${encodeURIComponent('Google Business connected!')}`
                    );
                }

                // Find Pinterest account
                const pinterestAccount = accountsData.accounts.find(
                    (a) => a.platform === 'pinterest'
                );

                if (pinterestAccount) {
                    await savePinterestAccount(
                        workspaceId,
                        pinterestAccount._id,
                        pinterestAccount.displayName,
                        pinterestAccount.username
                    );

                    return NextResponse.redirect(
                        `${settingsUrl}&success=true&message=${encodeURIComponent('Pinterest connected!')}`
                    );
                }
            }
        }

        // Fallback - something unexpected
        logger.warn({ searchParams: Object.fromEntries(searchParams) }, 'Unexpected Late callback params');
        return NextResponse.redirect(
            `${settingsUrl}&error=${encodeURIComponent('Connection completed but account not found')}`
        );

    } catch (err) {
        logger.error({ error: err }, 'Late.dev callback error');
        return NextResponse.redirect(
            `${settingsUrl}&error=${encodeURIComponent('Failed to complete connection')}`
        );
    }
}

/**
 * Save a Google Business account connected via Late.dev
 */
async function saveGoogleBusinessAccount(
    workspaceId: string,
    lateAccountId: string,
    displayName: string,
    username: string
) {
    // Check if account already exists
    const existing = await db.socialAccount.findFirst({
        where: {
            workspaceId,
            platform: 'GOOGLE_BUSINESS',
            platformId: lateAccountId,
        },
    });

    if (existing) {
        // Update existing account
        await db.socialAccount.update({
            where: { id: existing.id },
            data: {
                name: displayName,
                username: username,
                accessToken: `late:${lateAccountId}`,
                tokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                isActive: true,
            },
        });
    } else {
        // Create new account
        await db.socialAccount.create({
            data: {
                workspaceId,
                platform: 'GOOGLE_BUSINESS',
                platformId: lateAccountId,
                name: displayName,
                username: username,
                accessToken: `late:${lateAccountId}`,
                tokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                isActive: true,
            },
        });
    }

    logger.info({ workspaceId, lateAccountId }, 'Saved Google Business account via Late.dev');
}

/**
 * Save a Pinterest account connected via Late.dev
 */
async function savePinterestAccount(
    workspaceId: string,
    lateAccountId: string,
    displayName: string,
    username: string
) {
    // Check if account already exists
    const existing = await db.socialAccount.findFirst({
        where: {
            workspaceId,
            platform: 'PINTEREST',
            platformId: lateAccountId,
        },
    });

    if (existing) {
        // Update existing account
        await db.socialAccount.update({
            where: { id: existing.id },
            data: {
                name: displayName,
                username: username,
                accessToken: `late:${lateAccountId}`,
                tokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                isActive: true,
            },
        });
    } else {
        // Create new account
        await db.socialAccount.create({
            data: {
                workspaceId,
                platform: 'PINTEREST',
                platformId: lateAccountId,
                name: displayName,
                username: username,
                accessToken: `late:${lateAccountId}`,
                tokenExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                isActive: true,
            },
        });
    }

    logger.info({ workspaceId, lateAccountId }, 'Saved Pinterest account via Late.dev');
}
