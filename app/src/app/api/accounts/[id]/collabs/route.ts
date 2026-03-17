/**
 * Instagram Collab Invites API
 * Why: Exposes the new Instagram Collabs API to the frontend so users
 * can view and respond to collaboration invites from the dashboard.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { ensureValidToken } from '@/lib/services/token-service';

/**
 * GET /api/accounts/[id]/collabs — List pending collab invites
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const account = await db.socialAccount.findFirst({
        where: { id, organizationId: session.user.currentOrganizationId },
    });

    if (!account) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    if (account.platform !== 'INSTAGRAM') {
        return NextResponse.json({ error: 'Collab invites are only available for Instagram' }, { status: 400 });
    }

    const tokenResult = await ensureValidToken(account.id);
    if (!tokenResult.success || !tokenResult.accessToken) {
        return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
    }

    const { getInstagramCollabInvites } = await import('@/lib/platform-api/instagram-api');

    const result = await getInstagramCollabInvites(tokenResult.accessToken, account.platformId);

    if (!result.success) {
        logger.error({ error: result.error, accountId: id }, 'Failed to fetch collab invites');
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ invites: result.data });
}

/**
 * POST /api/accounts/[id]/collabs — Accept or decline a collab invite
 * Body: { mediaId: string, action: 'accept' | 'decline' }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    let body;
    try { body = await request.json(); }
    catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const { mediaId, action } = body;
    if (!mediaId || !action) {
        return NextResponse.json({ error: 'mediaId and action are required' }, { status: 400 });
    }
    if (action !== 'accept' && action !== 'decline') {
        return NextResponse.json({ error: 'action must be "accept" or "decline"' }, { status: 400 });
    }

    const account = await db.socialAccount.findFirst({
        where: { id, organizationId: session.user.currentOrganizationId },
    });

    if (!account || account.platform !== 'INSTAGRAM') {
        return NextResponse.json({ error: 'Instagram account not found' }, { status: 404 });
    }

    const tokenResult = await ensureValidToken(account.id);
    if (!tokenResult.success || !tokenResult.accessToken) {
        return NextResponse.json({ error: 'Token refresh failed' }, { status: 401 });
    }

    const { respondToInstagramCollab } = await import('@/lib/platform-api/instagram-api');

    const result = await respondToInstagramCollab(tokenResult.accessToken, mediaId, action);

    if (!result.success) {
        logger.error({ error: result.error, mediaId, action }, 'Failed to respond to collab');
        return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ success: true, action });
}
