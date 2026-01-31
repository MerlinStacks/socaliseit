/**
 * Publish Story API
 * Handles publishing Stories to Instagram (and Facebook in future)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { publishInstagramStory } from '@/lib/platform-api/instagram-api';
import { PostStatus, PostType } from '@/generated/prisma/client';

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { accountId, mediaUrl, mediaType } = body;

        if (!accountId || !mediaUrl || !mediaType) {
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
            result = await publishInstagramStory(account.accessToken, account.platformId, {
                url: mediaUrl,
                type: mediaType
            });
        } else if (account.platform === 'FACEBOOK') {
            return NextResponse.json({ error: 'Facebook Story publishing not yet implemented' }, { status: 501 });
        } else {
            return NextResponse.json({ error: 'Platform does not support Stories' }, { status: 400 });
        }

        if (!result.success || !result.data) {
            return NextResponse.json({ error: result.error || 'Unknown error' }, { status: 500 });
        }

        // Create post first
        const post = await db.post.create({
            data: {
                workspaceId: session.user.currentWorkspaceId,
                caption: '', // Stories typically have no caption
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
                postType: PostType.STORY,
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
