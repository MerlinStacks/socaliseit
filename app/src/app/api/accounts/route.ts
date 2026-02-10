/**
 * Social Accounts API
 * List and manage connected social media accounts for a workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { getAuthorizationUrl, getCredentialsForPlatform } from '@/lib/platforms';
import type { Platform } from '@/lib/platform-config';
import { createRouteLogger } from '@/lib/logger';
import crypto from 'crypto';
import { parseJsonBody } from '@/lib/parse-json-body';

/**
 * GET /api/accounts
 * List all connected accounts for the current workspace
 */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const accounts = await db.socialAccount.findMany({
            where: { organizationId: session.user.currentOrganizationId },
            include: {
                organization: true, // Include organization for grouping display
            },
            orderBy: { createdAt: 'desc' },
        });

        return NextResponse.json({ accounts });
    } catch (error) {
        createRouteLogger('API', '/api/accounts').error({ err: error }, 'Failed to fetch accounts');
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
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: body, error } = await parseJsonBody<{ platform?: string }>(request);
        if (error) return error;
        const { platform } = body;
        if (!platform) {
            return NextResponse.json({ error: 'Platform is required' }, { status: 400 });
        }

        // Load global platform credentials (super admin configured)
        const credentials = await getCredentialsForPlatform(platform as Platform);
        if (!credentials) {
            return NextResponse.json(
                { error: `${platform} is not configured. Please contact your administrator to set up OAuth credentials.` },
                { status: 400 }
            );
        }

        // Generate HMAC-signed state token for CSRF protection
        // Why: Plain base64 state can be forged by attackers who know an org ID.
        // The HMAC signature ensures only our server could have created this state.
        const statePayload = JSON.stringify({
            organizationId: session.user.currentOrganizationId,
            platform,
            timestamp: Date.now(),
        });
        const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || '';
        const signature = crypto.createHmac('sha256', secret).update(statePayload).digest('hex');
        const state = Buffer.from(JSON.stringify({
            payload: statePayload,
            sig: signature,
        })).toString('base64');

        // Get the OAuth authorization URL with credentials
        const redirectUri = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/accounts/callback/${platform}`;
        const authUrl = getAuthorizationUrl(platform as Platform, redirectUri, state, credentials);

        return NextResponse.json({ authUrl, state });
    } catch (error) {
        createRouteLogger('API', '/api/accounts').error({ err: error }, 'Failed to initiate OAuth');
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
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: body, error } = await parseJsonBody<{ accountId?: string }>(request);
        if (error) return error;
        const { accountId } = body;
        if (!accountId) {
            return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
        }

        // Verify ownership before deleting
        const account = await db.socialAccount.findFirst({
            where: {
                id: accountId,
                organizationId: session.user.currentOrganizationId,
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
        createRouteLogger('API', '/api/accounts').error({ err: error }, 'Failed to disconnect account');
        return NextResponse.json({ error: 'Failed to disconnect account' }, { status: 500 });
    }
}

/**
 * PATCH /api/accounts
 * Update a social account's organization assignment for grouping
 * Body: { accountId: string, organizationId?: string | null }
 */
export async function PATCH(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: body, error } = await parseJsonBody<{ accountId?: string; organizationId?: string | null }>(request);
        if (error) return error;
        const { accountId, organizationId } = body;
        if (!accountId) {
            return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
        }

        // Verify ownership before updating
        const account = await db.socialAccount.findFirst({
            where: {
                id: accountId,
                organizationId: session.user.currentOrganizationId,
            },
        });

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        const updated = await db.socialAccount.update({
            where: { id: accountId },
            data: {
                organizationId: organizationId || undefined, // Allow clearing the organization
            },
            include: {
                organization: true, // Include the related organization in response
            },
        });

        return NextResponse.json({ account: updated });
    } catch (error) {
        createRouteLogger('API', '/api/accounts').error({ err: error }, 'Failed to update account');
        return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
    }
}

