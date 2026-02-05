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
    const organizationId = searchParams.get('organizationId');
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
        logger.error({ error, organizationId }, 'Late.dev OAuth error');
        return NextResponse.redirect(
            `${settingsUrl}&error=${encodeURIComponent(error)}`
        );
    }

    if (!organizationId) {
        return NextResponse.redirect(
            `${settingsUrl}&error=${encodeURIComponent('Missing workspace ID')}`
        );
    }

    try {
        // Get Late.dev API key from global integration settings (super admin configured)
        const settings = await db.globalIntegrationSettings.findUnique({
            where: { id: 'global_integration_settings' },
        });

        if (!settings?.lateApiKey) {
            return NextResponse.redirect(
                `${settingsUrl}&error=${encodeURIComponent('Late.dev not configured. Contact your administrator.')}`
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
                    organizationId,
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
                        createdAt?: string;
                    }>;
                };

                logger.info({
                    accountCount: accountsData.accounts.length,
                    platforms: accountsData.accounts.map(a => a.platform),
                    callbackPlatform: platform,
                }, 'Late.dev callback - fetched accounts');

                // Find accounts matching the platform we were connecting
                // Use the platform from callback params, or try to detect
                const targetPlatform = platform || searchParams.get('connect_platform');

                let connectedAccount = null;

                if (targetPlatform === 'pinterest') {
                    // Find Pinterest accounts and get the most recent one
                    const pinterestAccounts = accountsData.accounts.filter(
                        (a) => a.platform === 'pinterest'
                    );
                    connectedAccount = pinterestAccounts[pinterestAccounts.length - 1] || pinterestAccounts[0];

                    if (connectedAccount) {
                        await savePinterestAccount(
                            organizationId,
                            connectedAccount._id,
                            connectedAccount.displayName,
                            connectedAccount.username
                        );

                        return NextResponse.redirect(
                            `${settingsUrl}&success=true&message=${encodeURIComponent('Pinterest connected!')}`
                        );
                    }
                } else if (targetPlatform === 'googlebusiness') {
                    // Find Google Business accounts
                    const gbpAccounts = accountsData.accounts.filter(
                        (a) => a.platform === 'googlebusiness'
                    );
                    connectedAccount = gbpAccounts[gbpAccounts.length - 1] || gbpAccounts[0];

                    if (connectedAccount) {
                        await saveGoogleBusinessAccount(
                            organizationId,
                            connectedAccount._id,
                            connectedAccount.displayName,
                            connectedAccount.username
                        );

                        return NextResponse.redirect(
                            `${settingsUrl}&success=true&message=${encodeURIComponent('Google Business connected!')}`
                        );
                    }
                } else {
                    // Fallback: try to find any new account (Pinterest or Google Business)
                    const pinterestAccount = accountsData.accounts.find(
                        (a) => a.platform === 'pinterest'
                    );

                    if (pinterestAccount) {
                        await savePinterestAccount(
                            organizationId,
                            pinterestAccount._id,
                            pinterestAccount.displayName,
                            pinterestAccount.username
                        );

                        return NextResponse.redirect(
                            `${settingsUrl}&success=true&message=${encodeURIComponent('Pinterest connected!')}`
                        );
                    }

                    const gbpAccount = accountsData.accounts.find(
                        (a) => a.platform === 'googlebusiness'
                    );

                    if (gbpAccount) {
                        await saveGoogleBusinessAccount(
                            organizationId,
                            gbpAccount._id,
                            gbpAccount.displayName,
                            gbpAccount.username
                        );

                        return NextResponse.redirect(
                            `${settingsUrl}&success=true&message=${encodeURIComponent('Google Business connected!')}`
                        );
                    }
                }

                // No matching account found
                logger.warn({
                    targetPlatform,
                    availablePlatforms: accountsData.accounts.map(a => a.platform),
                }, 'No matching account found in Late.dev response');
            } else {
                const errorText = await accountsRes.text();
                logger.error({ status: accountsRes.status, error: errorText }, 'Failed to fetch Late.dev accounts');
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
    organizationId: string,
    lateAccountId: string,
    displayName: string,
    username: string
) {
    // Check if account already exists
    const existing = await db.socialAccount.findFirst({
        where: {
            organizationId,
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
                organizationId,
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

    logger.info({ organizationId, lateAccountId }, 'Saved Google Business account via Late.dev');
}

/**
 * Save a Pinterest account connected via Late.dev
 */
async function savePinterestAccount(
    organizationId: string,
    lateAccountId: string,
    displayName: string,
    username: string
) {
    // Check if account already exists
    const existing = await db.socialAccount.findFirst({
        where: {
            organizationId,
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
                organizationId,
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

    logger.info({ organizationId, lateAccountId }, 'Saved Pinterest account via Late.dev');
}
