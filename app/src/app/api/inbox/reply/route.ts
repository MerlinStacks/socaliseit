/**
 * Reply to Inbox Item API
 * POST /api/inbox/reply
 *
 * Sends a reply to a DM conversation or comment thread.
 * Routes to appropriate platform API based on account platform.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendDMReply } from '@/lib/platform-api/dm-sync';
import { replyToFacebookComment } from '@/lib/platform-api/facebook-api';
import { replyToInstagramComment } from '@/lib/platform-api/instagram/comments';
import { replyToTikTokComment } from '@/lib/platform-api/tiktok-api';
import { replyToYouTubeComment } from '@/lib/platform-api/youtube-api';
import { ensureValidToken } from '@/lib/services/token-service';
import { parseJsonBody } from '@/lib/parse-json-body';

const RequestSchema = z.object({
    type: z.enum(['dm', 'comment']),
    conversationId: z.string(),
    socialAccountId: z.string(),
    recipientId: z.string().optional(),
    text: z.string().min(1).max(5000),
});

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;

        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;
        const data = RequestSchema.parse(body);

        // Verify social account belongs to organization
        const account = await db.socialAccount.findFirst({
            where: {
                id: data.socialAccountId,
                organizationId,
            },
        });

        if (!account) {
            return NextResponse.json({ error: 'Account not found' }, { status: 404 });
        }

        if (data.type === 'dm') {
            if (!data.recipientId) {
                return NextResponse.json({ error: 'recipientId required for DM reply' }, { status: 400 });
            }

            const result = await sendDMReply(data.socialAccountId, data.recipientId, data.text);

            if (!result.success) {
                return NextResponse.json(
                    { error: result.error || 'Failed to send DM' },
                    { status: 500 }
                );
            }

            logger.info(
                { messageId: result.messageId, recipientId: data.recipientId },
                'DM reply sent'
            );

            return NextResponse.json({
                success: true,
                data: { messageId: result.messageId },
            });
        }

        if (data.type === 'comment') {
            // Find the parent comment (root of the thread being replied to)
            const parentComment = await db.comment.findFirst({
                where: {
                    organizationId,
                    socialAccountId: data.socialAccountId,
                    OR: [
                        { id: data.conversationId },
                        { platformCommentId: data.conversationId },
                    ],
                },
                include: { socialAccount: true },
            });

            if (!parentComment) {
                return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
            }

            // Get a fresh, decrypted access token
            const tokenResult = await ensureValidToken(account.id);
            if (!tokenResult.success || !tokenResult.accessToken) {
                return NextResponse.json(
                    { error: tokenResult.error || 'Account token is invalid — please reconnect' },
                    { status: 401 }
                );
            }
            const accessToken = tokenResult.accessToken;

            // Route to the correct platform API
            let replyResult: { success: boolean; error?: string; data?: { id: string } };

            switch (account.platform) {
                case 'INSTAGRAM':
                    replyResult = await replyToInstagramComment(
                        accessToken,
                        parentComment.platformCommentId,
                        data.text
                    );
                    break;

                case 'FACEBOOK':
                    replyResult = await replyToFacebookComment(
                        accessToken,
                        parentComment.platformCommentId,
                        data.text
                    );
                    break;

                case 'TIKTOK':
                    // TikTok requires both the video ID and the comment ID
                    replyResult = await replyToTikTokComment(
                        accessToken,
                        parentComment.platformPostId,
                        parentComment.platformCommentId,
                        data.text
                    );
                    break;

                case 'YOUTUBE':
                    replyResult = await replyToYouTubeComment(
                        accessToken,
                        parentComment.platformCommentId,
                        data.text
                    );
                    break;

                default:
                    return NextResponse.json(
                        {
                            success: false,
                            error: `Comment replies are not yet supported for ${account.platform}`,
                            data: { status: 'not_implemented' },
                        },
                        { status: 501 }
                    );
            }

            if (!replyResult.success) {
                logger.warn(
                    { platform: account.platform, parentCommentId: parentComment.platformCommentId, error: replyResult.error },
                    'Comment reply failed'
                );
                return NextResponse.json(
                    { error: replyResult.error || 'Failed to send reply' },
                    { status: 500 }
                );
            }

            const newCommentId = replyResult.data?.id;

            // Store the reply locally and mark the parent as replied
            await Promise.all([
                // Mark parent comment as replied
                db.comment.update({
                    where: { id: parentComment.id },
                    data: { isReplied: true },
                }),

                // Store our reply as a Comment record so it shows in the thread
                newCommentId
                    ? db.comment.create({
                        data: {
                            organizationId,
                            socialAccountId: account.id,
                            platformPostId: parentComment.platformPostId,
                            platformCommentId: newCommentId,
                            parentId: parentComment.id,
                            authorId: account.platformId,
                            authorUsername: account.name ?? account.platform,
                            text: data.text,
                            likeCount: 0,
                            replyCount: 0,
                            isRead: true,
                            isReplied: false,
                            createdAt: new Date(),
                        },
                    }).catch((err) => {
                        // Non-critical — next sync will pick it up
                        logger.warn({ err }, 'Failed to store comment reply locally');
                    })
                    : Promise.resolve(),
            ]);

            logger.info(
                { platform: account.platform, parentCommentId: parentComment.platformCommentId, newCommentId },
                'Comment reply sent'
            );

            return NextResponse.json({
                success: true,
                data: { commentId: newCommentId },
            });
        }

        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid request', details: error.issues },
                { status: 400 }
            );
        }

        logger.error({ error }, 'Reply send error');
        return NextResponse.json(
            { error: 'Failed to send reply' },
            { status: 500 }
        );
    }
}
