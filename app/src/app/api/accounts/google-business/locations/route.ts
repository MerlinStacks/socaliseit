/**
 * Google Business Locations API
 * Fetches all locations for a Google Business account
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';

interface GoogleBusinessLocation {
    name: string; // Full resource name: locations/{locationId}
    title: string; // Business name
    locationId: string; // Extracted ID
}

/**
 * GET /api/accounts/google-business/locations
 * Fetches all Google Business locations using stored pending tokens
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get tokens from query params (passed from callback)
        const accessToken = request.nextUrl.searchParams.get('token');
        const accountId = request.nextUrl.searchParams.get('accountId');

        if (!accessToken || !accountId) {
            return NextResponse.json({ error: 'Missing token or accountId' }, { status: 400 });
        }

        // Fetch locations for this account
        const locationsUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${accountId}/locations?readMask=name,title`;

        logger.debug({ accountId }, 'Fetching Google Business locations for selection');

        const response = await fetch(locationsUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error({ status: response.status, error: errorText }, 'Failed to fetch locations');
            return NextResponse.json({ error: 'Failed to fetch locations' }, { status: response.status });
        }

        const data = await response.json();

        // Transform locations for the picker
        const locations: GoogleBusinessLocation[] = (data.locations || []).map((loc: { name?: string; title?: string }) => ({
            name: loc.name,
            title: loc.title || 'Unnamed Location',
            locationId: loc.name?.split('/').pop() || loc.name,
        }));

        logger.info({ count: locations.length }, 'Fetched Google Business locations');

        return NextResponse.json({ locations });
    } catch (error) {
        logger.error({ error }, 'Error fetching Google Business locations');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
