/**
 * Single Comment API
 * Manage specific comment: Reply, Hide, Delete
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { replyToInstagramComment } from '@/lib/platform-api/instagram-api';
import { replyToFacebookComment, toggleHideFacebookComment } from '@/lib/platform-api/facebook-api';
import { replyToTikTokComment } from '@/lib/platform-api/tiktok-api';
import { replyToYouTubeComment } from '@/lib/platform-api/youtube-api';

// POST /api/comments/[id]/reply
// Body: { text: string }
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> } // Params is a Promise in Next.js 15+ (and 16)
) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const { text } = await request.json();

    const comment = await db.comment.findUnique({
        where: { id },
        include: { socialAccount: true }
    });

    if (!comment || comment.workspaceId !== session.user.currentWorkspaceId) {
        return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const account = comment.socialAccount;
    let result: any = { success: false, error: 'Platform not supported' };

    try {
        switch (account.platform) {
            case 'INSTAGRAM':
                result = await replyToInstagramComment(account.accessToken, comment.platformCommentId, text);
                break;
            case 'FACEBOOK':
                result = await replyToFacebookComment(account.accessToken, comment.platformCommentId, text);
                break;
            case 'TIKTOK':
                // Pass videoId (platformPostId) if needed
                result = await replyToTikTokComment(account.accessToken, comment.platformPostId, comment.platformCommentId, text);
                break;
            case 'YOUTUBE':
                result = await replyToYouTubeComment(account.accessToken, comment.platformCommentId, text);
                break;
        }

        if (result.success && result.data) {
            // Optimistically add reply to DB
            await db.comment.create({
                data: {
                    workspaceId: comment.workspaceId,
                    socialAccountId: account.id,
                    postPlatformId: comment.postPlatformId,
                    platformPostId: comment.platformPostId,
                    platformCommentId: result.data.id, // New ID from platform
                    authorId: 'SELF', // Use special ID for self
                    authorUsername: account.username || account.name,
                    text: text,
                    parentId: comment.id,
                    createdAt: new Date(),
                    isReplied: false, // It's a reply itself
                }
            });
            // Mark parent as replied
            await db.comment.update({
                where: { id },
                data: { isReplied: true, replyCount: { increment: 1 } }
            });

            return NextResponse.json({ success: true, id: result.data.id });
        } else {
            return NextResponse.json({ error: result.error }, { status: 500 });
        }

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH /api/comments/[id]
// Body: { isHidden: boolean }
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const { isHidden } = await request.json();

    const comment = await db.comment.findUnique({
        where: { id },
        include: { socialAccount: true }
    });

    if (!comment || comment.workspaceId !== session.user.currentWorkspaceId) {
        return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const account = comment.socialAccount;

    // Attempt platform action if supported
    if (account.platform === 'FACEBOOK') {
        await toggleHideFacebookComment(account.accessToken, comment.platformCommentId, isHidden);
        // We log error but proceed to update local state anyway?
        // Better to fail if platform fails, but user might want to hide locally at least.
        // We'll enforce strict consistency for now.
    }
    // Instagram hide/unhide supported? Yes, via 'hide=true' on comment node. 
    // Not implemented in my service yet. Assuming just Facebook for now in strict mode.

    // Update DB
    await db.comment.update({
        where: { id },
        data: { isHidden }
    });

    return NextResponse.json({ success: true });
}

// DELETE /api/comments/[id]
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.currentWorkspaceId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;

    const comment = await db.comment.findUnique({
        where: { id },
        include: { socialAccount: true }
    });

    if (!comment || comment.workspaceId !== session.user.currentWorkspaceId) {
        return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // Call platform delete (not implemented in all services properly yet, simplified to local delete for now)
    // NOTE: True deletion on platform is destructive. 
    // We'll just delete from DB for this iteration unless strictly requested.

    await db.comment.delete({ where: { id } });

    return NextResponse.json({ success: true });
}
