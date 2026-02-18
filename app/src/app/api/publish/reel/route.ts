/**
 * Publish Reel API
 * Handles publishing Reels to Instagram (and others)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { publishTrialReel } from '@/lib/platform-api/instagram-api';
import { sanitizeError } from '@/lib/sanitize-error';
import { PostStatus, PostType } from '@/generated/prisma/client';

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { accountId, videoUrl, caption, coverUrl, shareToFeed } = body;

        if (!accountId || !videoUrl) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const account = await db.socialAccount.findUnique({
            where: { id: accountId }
        });

        if (!account || account.organizationId !== session.user.currentOrganizationId) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        let result;

        if (account.platform === 'INSTAGRAM') {
            result = await publishTrialReel(account.accessToken, account.platformId, {
                videoUrl,
                caption,
                coverImageUrl: coverUrl,
                shareToFeed,
                isTrialReel: true
            });
        } else {
            return NextResponse.json({ error: 'Platform does not support Reels via this endpoint' }, { status: 400 });
        }

        if (!result.success || !result.data) {
            return NextResponse.json({ error: result.error || 'Unknown error' }, { status: 500 });
        }

        // Create post with direct platform fields (no legacy PostPlatform)
        const post = await db.post.create({
            data: {
                organizationId: session.user.currentOrganizationId,
                caption: caption || '',
                status: PostStatus.PUBLISHED,
                publishedAt: new Date(),
                platform: account.platform,
                socialAccountId: account.id,
                platformPostId: result.data.id,
                postType: PostType.REEL,
            }
        });

        // Invalidate dashboard/analytics caches
        const { invalidatePostCaches } = await import('@/lib/cache');
        invalidatePostCaches(session.user.currentOrganizationId);

        return NextResponse.json({ success: true, id: result.data.id });

    } catch (error: unknown) {
        const message = sanitizeError(error, 'Failed to publish reel');
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
