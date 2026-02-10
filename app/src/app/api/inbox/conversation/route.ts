/**
 * Conversation Messages API
 * GET /api/inbox/conversation
 *
 * Fetches messages for a DM conversation or comment thread.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;

        const { searchParams } = new URL(request.url);
        const conversationId = searchParams.get('conversationId');
        const type = searchParams.get('type');

        if (!conversationId) {
            return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
        }

        if (type === 'dm') {
            // Fetch DM conversation messages
            const messages = await db.directMessage.findMany({
                where: {
                    organizationId,
                    conversationId,
                },
                orderBy: { createdAt: 'asc' },
                select: {
                    id: true,
                    direction: true,
                    senderId: true,
                    senderUsername: true,
                    senderAvatar: true,
                    text: true,
                    mediaUrl: true,
                    mediaType: true,
                    createdAt: true,
                },
            });

            return NextResponse.json({
                data: { messages },
            });
        }

        if (type === 'comment') {
            // Fetch comment thread - parent comment and all replies
            const parentComment = await db.comment.findFirst({
                where: {
                    organizationId,
                    OR: [
                        { id: conversationId },
                        { platformCommentId: conversationId },
                    ],
                },
                include: {
                    replies: {
                        orderBy: { createdAt: 'asc' },
                        select: {
                            id: true,
                            authorId: true,
                            authorUsername: true,
                            authorAvatar: true,
                            text: true,
                            createdAt: true,
                        },
                    },
                    socialAccount: {
                        select: {
                            platformId: true,
                            name: true,
                        },
                    },
                },
            });

            if (!parentComment) {
                return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
            }

            /**
             * Why: Look up the original post this comment belongs to so the
             * conversation thread can show "Commented on your post: ..." context.
             * Tries PostPlatform first (legacy), then Post directly (new arch).
             */
            let postContext: { caption: string | null; thumbnailUrl: string | null; permalink: string | null } | null = null;

            if (parentComment.platformPostId) {
                // Try the new Post model (independent posts architecture)
                const post = await db.post.findFirst({
                    where: {
                        organizationId,
                        platformPostId: parentComment.platformPostId,
                    },
                    select: {
                        caption: true,
                        externalThumbnailUrl: true,
                        externalUrl: true,
                        media: {
                            take: 1,
                            select: { media: { select: { thumbnailUrl: true, url: true } } },
                        },
                    },
                });

                if (post) {
                    postContext = {
                        caption: post.caption,
                        thumbnailUrl: post.externalThumbnailUrl || post.media[0]?.media?.thumbnailUrl || post.media[0]?.media?.url || null,
                        permalink: post.externalUrl || null,
                    };
                } else {
                    // Fallback: try PostPlatform (legacy multi-platform architecture)
                    const postPlatform = await db.postPlatform.findFirst({
                        where: { platformPostId: parentComment.platformPostId },
                        select: {
                            caption: true,
                            post: {
                                select: {
                                    caption: true,
                                    externalThumbnailUrl: true,
                                    externalUrl: true,
                                    media: {
                                        take: 1,
                                        select: { media: { select: { thumbnailUrl: true, url: true } } },
                                    },
                                },
                            },
                        },
                    });

                    if (postPlatform) {
                        postContext = {
                            caption: postPlatform.caption || postPlatform.post.caption,
                            thumbnailUrl: postPlatform.post.externalThumbnailUrl || postPlatform.post.media[0]?.media?.thumbnailUrl || postPlatform.post.media[0]?.media?.url || null,
                            permalink: postPlatform.post.externalUrl || null,
                        };
                    }
                }
            }

            // Transform to message format
            const messages = [
                {
                    id: parentComment.id,
                    direction: 'inbound' as const,
                    senderId: parentComment.authorId,
                    senderUsername: parentComment.authorUsername,
                    senderAvatar: parentComment.authorAvatar,
                    text: parentComment.text,
                    mediaUrl: null,
                    mediaType: null,
                    createdAt: parentComment.createdAt,
                },
                ...parentComment.replies.map((reply) => ({
                    id: reply.id,
                    // If reply author matches our account, it's outbound
                    direction: (reply.authorId === parentComment.socialAccount.platformId
                        ? 'outbound'
                        : 'inbound') as 'inbound' | 'outbound',
                    senderId: reply.authorId,
                    senderUsername: reply.authorUsername,
                    senderAvatar: reply.authorAvatar,
                    text: reply.text,
                    mediaUrl: null,
                    mediaType: null,
                    createdAt: reply.createdAt,
                })),
            ];

            return NextResponse.json({
                data: { messages, postContext },
            });
        }

        return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    } catch (error) {
        logger.error({ error }, 'Conversation fetch error');
        return NextResponse.json(
            { error: 'Failed to fetch conversation' },
            { status: 500 }
        );
    }
}
