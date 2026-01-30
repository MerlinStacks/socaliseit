/**
 * Social Accounts API
 * List and manage connected social media accounts for a workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getAuthorizationUrl, getCredentialsForPlatform } from '@/lib/platforms';

/**
 * GET /api/accounts
 * List all connected accounts for the current workspace
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accounts = await db.socialAccount.findMany({
            where: { workspaceId: session.user.currentWorkspaceId },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ accounts });
    } catch (error) {
        console.error('Failed to fetch accounts:', error);
        return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }
}

/**
 * POST /api/accounts
 * Initiate OAuth flow for a platform
 * Body: { platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'pinterest' }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { platform } = await request.json();
        if (!platform) {
            return NextResponse.json({ error: 'Platform is required' }, { status: 400 });
        }

        // Load credentials from database
        const credentials = await getCredentialsForPlatform(session.user.currentWorkspaceId, platform);
        if (!credentials) {
            return NextResponse.json(
                { error: `${platform} is not configured. Please add OAuth credentials in Settings → Integrations.` },
                { status: 400 }
            );
        }

        // Generate state token for CSRF protection
        const state = Buffer.from(JSON.stringify({
            workspaceId: session.user.currentWorkspaceId,
            platform,
            timestamp: Date.now(),
        })).toString('base64');

        // Get the OAuth authorization URL with credentials
        const redirectUri = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/accounts/callback/${platform}`;
        const authUrl = getAuthorizationUrl(platform, redirectUri, state, credentials);

        return NextResponse.json({ authUrl, state });
    } catch (error) {
        console.error('Failed to initiate OAuth:', error);
        return NextResponse.json({ error: 'Failed to initiate OAuth' }, { status: 500 });
    }
}


/**
 * DELETE /api/accounts
 * Disconnect a social account
 * Body: { accountId: string }
 */
export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentWorkspaceId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { accountId } = await request.json();
        if (!accountId) {
            return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
        }

        // Verify ownership before deleting
        const account = await db.socialAccount.findFirst({
            where: {
                id: accountId,
                workspaceId: session.user.currentWorkspaceId,
            },
        });

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        await db.socialAccount.delete({
            where: { id: accountId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to disconnect account:', error);
        return NextResponse.json({ error: 'Failed to disconnect account' }, { status: 500 });
    }
}
