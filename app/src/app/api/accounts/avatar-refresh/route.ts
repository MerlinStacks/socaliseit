/**
 * POST /api/accounts/avatar-refresh
 * On-demand avatar URL refresh for Meta-platform accounts.
 *
 * Why: Meta (Instagram/Facebook/Threads) CDN avatar URLs are signed with
 * temporary tokens. When they expire the browser gets HTTP 403. The frontend
 * calls this endpoint when it detects a broken avatar so the fresh URL is
 * persisted and picked up on the next React Query revalidation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { refreshAccountAvatar } from '@/lib/services/avatar-refresh';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { accountId } = body;

        if (!accountId || typeof accountId !== 'string') {
            return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
        }

        // Why: Verify the caller's org owns this account
        const account = await db.socialAccount.findFirst({
            where: {
                id: accountId,
                organizationId: session.user.currentOrganizationId,
            },
            select: { id: true, platform: true },
        });

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        const result = await refreshAccountAvatar(accountId);

        return NextResponse.json({
            updated: result.updated,
            newUrl: result.newUrl ?? null,
        });
    } catch (err) {
        logger.error({ err }, 'Avatar refresh API error');
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
