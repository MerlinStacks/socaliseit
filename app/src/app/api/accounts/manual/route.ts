/**
 * Manual Account Connection API
 * Why: Creates a SocialAccount for "Remind to Post" platforms that don't have APIs.
 * No OAuth flow — just saves the user-defined platform name to the database.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';
import crypto from 'crypto';
import { parseJsonBody } from '@/lib/parse-json-body';
import { relinkOrphanedPosts } from '@/lib/services/relink-orphaned-posts';

export async function POST(request: NextRequest) {
    const log = createRouteLogger('API', '/api/accounts/manual');

    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: body, error } = await parseJsonBody<{ platformName?: string; displayName?: string }>(request);
        if (error) return error;

        const { platformName, displayName } = body;

        if (!platformName || typeof platformName !== 'string' || platformName.trim().length === 0) {
            return NextResponse.json({ error: 'Platform name is required' }, { status: 400 });
        }

        if (platformName.trim().length > 30) {
            return NextResponse.json({ error: 'Platform name must be 30 characters or less' }, { status: 400 });
        }

        const account = await db.socialAccount.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                platform: 'MANUAL',
                platformId: crypto.randomUUID(),
                name: (displayName?.trim() || platformName.trim()),
                customPlatformName: platformName.trim(),
                accessToken: 'manual_no_token',
                tokenExpiry: null,
                isActive: true,
            },
        });

        // Why: Reconnect orphaned posts whose socialAccountId was set to NULL when the previous account was deleted
        await relinkOrphanedPosts(session.user.currentOrganizationId, account.id, 'MANUAL');

        log.info(
            { accountId: account.id, platformName: platformName.trim() },
            'Manual platform account created',
        );

        return NextResponse.json({ success: true, account });
    } catch (err) {
        log.error({ err }, 'Failed to create manual account');
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }
}
