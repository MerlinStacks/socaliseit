/**
 * Late.dev OAuth Connection Initiation
 *
 * Why: Initiates OAuth flow through Late.dev for platforms like Google Business.
 * Late.dev handles OAuth complexity and provides a unified API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/crypto';

const LATE_API_BASE = 'https://getlate.dev/api/v1';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const membership = await db.workspaceMember.findFirst({
            where: { userId: session.user.id },
            include: { workspace: true },
        });

        if (!membership) {
            return NextResponse.json({ error: 'No workspace found' }, { status: 400 });
        }

        const body = await request.json();
        const { platform } = body;

        if (!platform) {
            return NextResponse.json({ error: 'Platform is required' }, { status: 400 });
        }

        // Get Late.dev API key from integration settings
        const settings = await db.integrationSettings.findUnique({
            where: { workspaceId: membership.workspaceId },
        });

        if (!settings?.lateApiKey) {
            return NextResponse.json(
                { error: 'Late.dev is not configured. Go to Settings → API Integrations.' },
                { status: 400 }
            );
        }

        if (!settings?.lateProfileId) {
            return NextResponse.json(
                { error: 'Late.dev Profile ID is required. Go to Settings → API Integrations to add it.' },
                { status: 400 }
            );
        }

        const lateApiKey = decrypt(settings.lateApiKey);

        // Build redirect URL back to our callback handler
        const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
        const redirectUrl = `${baseUrl}/api/accounts/callback/late?workspaceId=${membership.workspaceId}`;

        // Get the OAuth URL from Late.dev with headless mode and profileId
        const lateUrl = `${LATE_API_BASE}/connect/${platform}?` +
            `profileId=${encodeURIComponent(settings.lateProfileId)}&` +
            `redirect_url=${encodeURIComponent(redirectUrl)}&headless=true`;

        const response = await fetch(lateUrl, {
            headers: {
                'Authorization': `Bearer ${lateApiKey}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            logger.error({ status: response.status, error: errorData }, 'Late.dev OAuth initiation failed');
            return NextResponse.json(
                { error: errorData.error || 'Failed to initiate connection' },
                { status: response.status }
            );
        }

        const data = await response.json() as { authUrl: string };

        logger.info(
            { workspaceId: membership.workspaceId, platform },
            'Initiated Late.dev OAuth flow'
        );

        return NextResponse.json({ authUrl: data.authUrl });
    } catch (error) {
        logger.error({ error }, 'Failed to initiate Late.dev connection');
        return NextResponse.json(
            { error: 'Failed to initiate connection' },
            { status: 500 }
        );
    }
}
