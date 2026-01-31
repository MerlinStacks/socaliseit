/**
 * Publish Reel API
 * Handles publishing Reels to Instagram (and others)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { publishTrialReel } from '@/lib/platform-api/instagram-api';
import { PostStatus, PostType } from '@/generated/prisma/client';

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
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

        if (!account || account.workspaceId !== session.user.currentWorkspaceId) {
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

        // Create post first, then link to platform
        const post = await db.post.create({
            data: {
                workspaceId: session.user.currentWorkspaceId,
                caption: caption || '',
                status: PostStatus.PUBLISHED,
                publishedAt: new Date(),
            }
        });

        // Create the platform link
        await db.postPlatform.create({
            data: {
                postId: post.id,
                socialAccountId: account.id,
                platformPostId: result.data.id,
                postType: PostType.REEL,
                status: PostStatus.PUBLISHED,
                publishedAt: new Date(),
            }
        });

        return NextResponse.json({ success: true, id: result.data.id });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
