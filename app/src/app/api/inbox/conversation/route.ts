/**
 * Conversation Messages API
 * GET /api/inbox/conversation
 *
 * Fetches messages for a DM conversation or comment thread.
 * Comment threads are returned as nested trees with depth + parent author context.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

interface ThreadedMessage {
    id: string;
    direction: 'inbound' | 'outbound';
    senderId: string;
    senderUsername: string;
    senderAvatar: string | null;
    text: string | null;
    mediaUrl: string | null;
    mediaType: string | null;
    createdAt: Date;
    /** Nesting depth (0 = root comment, 1 = reply, 2+ = nested reply) */
    depth: number;
    /** Username of the message this is replying to (for "replying to @user" context) */
    parentAuthor: string | null;
    /** Nested replies for threaded display */
    replies: ThreadedMessage[];
}

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
        /** If true, return flat message list (legacy). Default false = threaded. */
        const flat = searchParams.get('flat') === 'true';

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
            // Fetch parent comment with ALL nested replies (recursive via self-relation)
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
                        orderBy: { createdAt: 'asc' as const },
                        include: {
                            replies: {
                                orderBy: { createdAt: 'asc' as const },
                                include: {
                                    replies: {
                                        orderBy: { createdAt: 'asc' as const },
                                    },
                                },
                            },
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
             */
            let postContext: { caption: string | null; thumbnailUrl: string | null; permalink: string | null } | null = null;

            if (parentComment.platformPostId) {
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
                }
            }

            const ourPlatformId = parentComment.socialAccount.platformId;

            if (flat) {
                // Legacy flat format for backward compatibility
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
                    ...flattenReplies(parentComment.replies, ourPlatformId),
                ];

                return NextResponse.json({
                    data: { messages, postContext },
                });
            }

            // Threaded format — build nested tree
            const threadedMessages = buildThreadTree(parentComment, ourPlatformId, 0, null);

            return NextResponse.json({
                data: {
                    messages: threadedMessages,
                    postContext,
                    threadInfo: {
                        totalReplies: countReplies(parentComment.replies),
                        participants: getParticipants(parentComment),
                    },
                },
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

// ============================================================================
// Helpers
// ============================================================================

interface CommentNode {
    id: string;
    authorId: string;
    authorUsername: string;
    authorAvatar: string | null;
    text: string;
    parentId: string | null;
    likeCount: number;
    replyCount: number;
    createdAt: Date;
    replies: CommentNode[];
}

interface RootComment extends CommentNode {
    socialAccount: { platformId: string; name: string };
    platformPostId: string;
}

/**
 * Recursively build a threaded message tree from nested comment data.
 */
function buildThreadTree(
    comment: RootComment | CommentNode,
    ourPlatformId: string,
    depth: number,
    parentAuthor: string | null,
): ThreadedMessage[] {
    const isOutbound = comment.authorId === ourPlatformId;

    const node: ThreadedMessage = {
        id: comment.id,
        direction: isOutbound ? 'outbound' : 'inbound',
        senderId: comment.authorId,
        senderUsername: comment.authorUsername,
        senderAvatar: comment.authorAvatar,
        text: comment.text,
        mediaUrl: null,
        mediaType: null,
        createdAt: comment.createdAt,
        depth,
        parentAuthor,
        replies: [],
    };

    if (comment.replies && comment.replies.length > 0) {
        for (const reply of comment.replies) {
            const childMessages = buildThreadTree(
                reply,
                ourPlatformId,
                depth + 1,
                comment.authorUsername,
            );
            node.replies.push(...childMessages);
        }
    }

    return [node];
}

/**
 * Flatten nested replies into a linear list (legacy format).
 */
function flattenReplies(replies: CommentNode[], ourPlatformId: string): Array<{
    id: string;
    direction: 'inbound' | 'outbound';
    senderId: string;
    senderUsername: string;
    senderAvatar: string | null;
    text: string;
    mediaUrl: null;
    mediaType: null;
    createdAt: Date;
}> {
    const result: Array<{
        id: string;
        direction: 'inbound' | 'outbound';
        senderId: string;
        senderUsername: string;
        senderAvatar: string | null;
        text: string;
        mediaUrl: null;
        mediaType: null;
        createdAt: Date;
    }> = [];

    for (const reply of replies) {
        result.push({
            id: reply.id,
            direction: reply.authorId === ourPlatformId ? 'outbound' : 'inbound',
            senderId: reply.authorId,
            senderUsername: reply.authorUsername,
            senderAvatar: reply.authorAvatar,
            text: reply.text,
            mediaUrl: null,
            mediaType: null,
            createdAt: reply.createdAt,
        });

        if (reply.replies && reply.replies.length > 0) {
            result.push(...flattenReplies(reply.replies, ourPlatformId));
        }
    }

    return result;
}

/**
 * Count total replies recursively.
 */
function countReplies(replies: CommentNode[]): number {
    let count = 0;
    for (const reply of replies) {
        count += 1;
        if (reply.replies) {
            count += countReplies(reply.replies);
        }
    }
    return count;
}

/**
 * Extract unique participants from the thread.
 */
function getParticipants(root: RootComment): Array<{ username: string; avatar: string | null }> {
    const seen = new Map<string, { username: string; avatar: string | null }>();
    seen.set(root.authorId, { username: root.authorUsername, avatar: root.authorAvatar });

    function walk(nodes: CommentNode[]) {
        for (const node of nodes) {
            if (!seen.has(node.authorId)) {
                seen.set(node.authorId, { username: node.authorUsername, avatar: node.authorAvatar });
            }
            if (node.replies) walk(node.replies);
        }
    }

    walk(root.replies);
    return Array.from(seen.values());
}
