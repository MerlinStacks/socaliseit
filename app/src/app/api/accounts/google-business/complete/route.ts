/**
 * Google Business Location Selection Complete
 * Creates the social account after user selects a location
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

interface CompleteRequest {
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    accountId: string; // Full account resource name: accounts/{id}
    accountName: string; // Display name of the account
    locationId: string; // Full location resource name: locations/{id}
    locationTitle: string; // Display name of the location
}

/**
 * POST /api/accounts/google-business/complete
 * Completes the Google Business connection with a selected location
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: CompleteRequest = await request.json();
        const { accessToken, refreshToken, expiresIn, accountId, accountName, locationId, locationTitle } = body;

        if (!accessToken || !accountId || !locationId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Extract IDs from resource names
        const accountIdClean = accountId.startsWith('accounts/')
            ? accountId.split('/').pop()!
            : accountId;
        const locationIdClean = locationId.startsWith('locations/')
            ? locationId.split('/').pop()!
            : locationId;

        // Create combined platformId for publishing: accountId_locationId
        const platformId = `${accountIdClean}_${locationIdClean}`;

        // Check if account already exists
        const existingAccount = await db.socialAccount.findFirst({
            where: {
                workspaceId: session.user.currentWorkspaceId,
                platform: 'GOOGLE_BUSINESS',
                platformId: platformId,
            },
        });

        if (existingAccount) {
            // Update existing account with new tokens
            await db.socialAccount.update({
                where: { id: existingAccount.id },
                data: {
                    accessToken,
                    refreshToken,
                    tokenExpiry: new Date(Date.now() + expiresIn * 1000),
                    name: locationTitle,
                    username: accountName,
                    isActive: true,
                },
            });

            logger.info({ platformId, accountId: existingAccount.id }, 'Updated existing Google Business account');
            return NextResponse.json({ success: true, action: 'updated' });
        }

        // Create new social account
        const newAccount = await db.socialAccount.create({
            data: {
                workspaceId: session.user.currentWorkspaceId,
                platform: 'GOOGLE_BUSINESS',
                platformId: platformId,
                name: locationTitle,
                username: accountName,
                accessToken,
                refreshToken,
                tokenExpiry: new Date(Date.now() + expiresIn * 1000),
                isActive: true,
            },
        });

        logger.info({ platformId, accountId: newAccount.id }, 'Created new Google Business account');
        return NextResponse.json({ success: true, action: 'created' });
    } catch (error) {
        logger.error({ error }, 'Error completing Google Business connection');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
