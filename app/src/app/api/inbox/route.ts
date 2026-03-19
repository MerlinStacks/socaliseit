/**
 * Unified Social Inbox API
 *
 * GET /api/inbox - List all inbox items (comments, mentions, DMs) in a unified stream
 *
 * Why conversation grouping: Each DM conversation and comment thread appears as a
 * single row in the inbox list, showing the latest message. New replies update the
 * existing entry and sort it to the top — no duplicate rows.
 *
 * Query params:
 * - type: 'all' | 'comment' | 'mention' | 'dm'
 * - platform: Platform enum (INSTAGRAM, FACEBOOK, etc.)
 * - isRead: 'true' | 'false'
 * - assignedTo: user ID filter
 * - label: label ID filter
 * - sentiment: 'positive' | 'negative' | 'neutral' | 'question'
 * - search: text search query
 * - page: page number (1-indexed)
 * - startDate, endDate: date range filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sanitizeError } from '@/lib/sanitize-error';

/**
 * Common shape for unified inbox items.
 * Why: Normalize different entity types into a single stream format.
 */
interface InboxItem {
    id: string;
    type: 'comment' | 'mention' | 'dm';
    organizationId: string;
    platform: string;
    authorId: string;
    authorUsername: string;
    authorAvatar: string | null;
    text: string | null;
    mediaUrl?: string | null;
    isRead: boolean;
    assignedToId: string | null;
    labelIds: string[];
    sentiment?: string | null;
    createdAt: Date;
    /** Why: Sort by latest activity, not original message time */
    lastActivityAt: Date;
    /** Why: Show "5 messages" in conversation entries */
    messageCount?: number;
    /** Why: Show unread badge count on grouped conversations */
    unreadCount?: number;
    /** Type-specific metadata */
    meta: {
        platformPostId?: string;
        platformCommentId?: string;
        platformMessageId?: string;
        conversationId?: string;
        direction?: string;
        mentionType?: string;
        isReplied?: boolean;
        parentId?: string | null;
    };
    socialAccount: {
        platform: string;
        name: string;
        avatar: string | null;
    };
}

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const organizationId = session.user.currentOrganizationId;
        const { searchParams } = new URL(request.url);

        // Parse query params
        const type = searchParams.get('type') || 'all';
        const platform = searchParams.get('platform');
        const isRead = searchParams.get('isRead');
        const assignedTo = searchParams.get('assignedTo');
        const labelId = searchParams.get('label');
        const sentiment = searchParams.get('sentiment');
        const search = searchParams.get('q');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const page = parseInt(searchParams.get('page') || '1', 10);
        const limit = 30;

        const fetchComments = type === 'all' || type === 'comment';
        const fetchMentions = type === 'all' || type === 'mention';
        const fetchDMs = type === 'all' || type === 'dm';

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const buildWhere = (extras: any = {}) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const where: any = { organizationId, ...extras };

            if (platform) {
                where.socialAccount = { platform: platform.toUpperCase() };
            }
            if (isRead !== null && isRead !== undefined && isRead !== 'all') {
                where.isRead = isRead === 'true';
            }
            if (assignedTo) {
                where.assignedToId = assignedTo;
            }
            if (labelId) {
                where.labelIds = { has: labelId };
            }
            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate) where.createdAt.gte = new Date(startDate);
                if (endDate) where.createdAt.lte = new Date(endDate);
            }

            return where;
        };

        const results: InboxItem[] = [];

        // -------------------------------------------------------------------
        // Fetch Comments — root comments only (parentId IS NULL).
        // Why: Replies are shown in the right-panel thread, not as separate rows.
        // -------------------------------------------------------------------
        if (fetchComments) {
            const commentWhere = buildWhere({ parentId: null });
            if (sentiment) commentWhere.sentiment = sentiment;
            if (search) {
                commentWhere.OR = [
                    { text: { contains: search, mode: 'insensitive' } },
                    { authorUsername: { contains: search, mode: 'insensitive' } },
                ];
            }

            const comments = await db.comment.findMany({
                where: commentWhere,
                orderBy: { createdAt: 'desc' },
                take: limit,
                include: {
                    socialAccount: { select: { platform: true, name: true, avatar: true } },
                    replies: {
                        orderBy: { createdAt: 'desc' },
                        take: 1,
                        select: { createdAt: true },
                    },
                },
            });

            results.push(
                ...comments.map((c) => {
                    /**
                     * Why: Sort by latest activity — either the newest reply or
                     * the comment itself if no replies exist yet.
                     */
                    const latestReplyAt = c.replies[0]?.createdAt;
                    const lastActivityAt = latestReplyAt && latestReplyAt > c.createdAt
                        ? latestReplyAt
                        : c.createdAt;

                    return {
                        id: c.id,
                        type: 'comment' as const,
                        organizationId: c.organizationId,
                        platform: c.socialAccount.platform,
                        authorId: c.authorId,
                        authorUsername: c.authorUsername,
                        authorAvatar: c.authorAvatar,
                        text: c.text,
                        isRead: c.isRead,
                        assignedToId: c.assignedToId,
                        labelIds: c.labelIds,
                        sentiment: c.sentiment,
                        createdAt: c.createdAt,
                        lastActivityAt,
                        messageCount: 1 + c.replyCount,
                        unreadCount: c.isRead ? 0 : 1,
                        meta: {
                            platformPostId: c.platformPostId,
                            platformCommentId: c.platformCommentId,
                            isReplied: c.isReplied,
                            parentId: c.parentId,
                        },
                        socialAccount: c.socialAccount,
                    };
                })
            );
        }

        // -------------------------------------------------------------------
        // Fetch Mentions — no grouping needed (standalone events).
        // -------------------------------------------------------------------
        if (fetchMentions) {
            const mentionWhere = buildWhere();
            if (search) {
                mentionWhere.OR = [
                    { text: { contains: search, mode: 'insensitive' } },
                    { authorUsername: { contains: search, mode: 'insensitive' } },
                ];
            }

            const mentions = await db.mention.findMany({
                where: mentionWhere,
                orderBy: { createdAt: 'desc' },
                take: limit,
                include: {
                    socialAccount: { select: { platform: true, name: true, avatar: true } },
                },
            });

            results.push(
                ...mentions.map((m) => ({
                    id: m.id,
                    type: 'mention' as const,
                    organizationId: m.organizationId,
                    platform: m.socialAccount.platform,
                    authorId: m.authorId,
                    authorUsername: m.authorUsername,
                    authorAvatar: m.authorAvatar,
                    text: m.text,
                    mediaUrl: m.mediaUrl,
                    isRead: m.isRead,
                    assignedToId: m.assignedToId,
                    labelIds: m.labelIds,
                    createdAt: m.createdAt,
                    lastActivityAt: m.createdAt,
                    meta: {
                        platformPostId: m.platformPostId,
                        mentionType: m.type,
                    },
                    socialAccount: m.socialAccount,
                }))
            );
        }

        // -------------------------------------------------------------------
        // Fetch DMs — grouped by conversationId.
        // Why: Multiple messages in the same DM thread appear as ONE row,
        // showing the latest message text and sorting by latest activity.
        // -------------------------------------------------------------------
        if (fetchDMs) {
            const dmWhere = buildWhere();
            if (search) {
                dmWhere.OR = [
                    { text: { contains: search, mode: 'insensitive' } },
                    { senderUsername: { contains: search, mode: 'insensitive' } },
                ];
            }

            /**
             * Step 1: Find distinct conversationIds with their latest message.
             * Why: Prisma doesn't support DISTINCT ON, so we fetch the latest
             * message per conversation by grouping then fetching.
             */
            const conversationGroups = await db.directMessage.groupBy({
                by: ['conversationId', 'socialAccountId'],
                where: dmWhere,
                _max: { createdAt: true },
                _count: { id: true },
                orderBy: { _max: { createdAt: 'desc' } },
                take: limit,
            });

            if (conversationGroups.length > 0) {
                /**
                 * Step 2: For each conversation, fetch the latest message details
                 * and the unread count in parallel.
                 */
                const conversationData = await Promise.all(
                    conversationGroups.map(async (group) => {
                        const [latestMessage, unreadCount] = await Promise.all([
                            db.directMessage.findFirst({
                                where: {
                                    organizationId,
                                    conversationId: group.conversationId,
                                    socialAccountId: group.socialAccountId,
                                },
                                orderBy: { createdAt: 'desc' },
                                include: {
                                    socialAccount: { select: { platform: true, name: true, avatar: true } },
                                },
                            }),
                            db.directMessage.count({
                                where: {
                                    organizationId,
                                    conversationId: group.conversationId,
                                    socialAccountId: group.socialAccountId,
                                    isRead: false,
                                    direction: 'inbound',
                                },
                            }),
                        ]);

                        return { latestMessage, messageCount: group._count.id, unreadCount };
                    })
                );

                for (const { latestMessage, messageCount, unreadCount } of conversationData) {
                    if (!latestMessage) continue;

                    /**
                     * Why: Find the original inbound sender for this conversation
                     * so the left panel always shows the customer's name/avatar,
                     * even if the latest message is an outbound reply from us.
                     */
                    let displaySenderId = latestMessage.senderId;
                    let displaySenderUsername = latestMessage.senderUsername;
                    let displaySenderAvatar = latestMessage.senderAvatar;

                    if (latestMessage.direction === 'outbound') {
                        const firstInbound = await db.directMessage.findFirst({
                            where: {
                                organizationId,
                                conversationId: latestMessage.conversationId,
                                socialAccountId: latestMessage.socialAccountId,
                                direction: 'inbound',
                            },
                            orderBy: { createdAt: 'asc' },
                            select: { senderId: true, senderUsername: true, senderAvatar: true },
                        });

                        if (firstInbound) {
                            displaySenderId = firstInbound.senderId;
                            displaySenderUsername = firstInbound.senderUsername;
                            displaySenderAvatar = firstInbound.senderAvatar;
                        }
                    }

                    /** Why: Prefix outbound messages so user knows the latest is their own reply */
                    const displayText = latestMessage.direction === 'outbound'
                        ? `You: ${latestMessage.text || ''}`
                        : latestMessage.text;

                    results.push({
                        id: latestMessage.id,
                        type: 'dm' as const,
                        organizationId: latestMessage.organizationId,
                        platform: latestMessage.socialAccount.platform,
                        authorId: displaySenderId,
                        authorUsername: displaySenderUsername,
                        authorAvatar: displaySenderAvatar,
                        text: displayText,
                        mediaUrl: latestMessage.mediaUrl,
                        isRead: unreadCount === 0,
                        assignedToId: latestMessage.assignedToId,
                        labelIds: latestMessage.labelIds,
                        createdAt: latestMessage.createdAt,
                        lastActivityAt: latestMessage.createdAt,
                        messageCount,
                        unreadCount,
                        meta: {
                            platformMessageId: latestMessage.platformMessageId,
                            conversationId: latestMessage.conversationId,
                            direction: latestMessage.direction,
                        },
                        socialAccount: latestMessage.socialAccount,
                    });
                }
            }
        }

        // Sort merged results by lastActivityAt descending (newest activity first)
        results.sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());

        // Apply pagination
        const skip = (page - 1) * limit;
        const paginatedResults = results.slice(skip, skip + limit);

        // -------------------------------------------------------------------
        // Counts — reflect grouped totals, not individual message counts.
        // -------------------------------------------------------------------
        const [commentCount, mentionCount, dmConversationCount] = await Promise.all([
            fetchComments
                ? db.comment.count({ where: buildWhere({ parentId: null }) })
                : 0,
            fetchMentions
                ? db.mention.count({ where: buildWhere() })
                : 0,
            fetchDMs
                ? db.directMessage.groupBy({
                    by: ['conversationId'],
                    where: buildWhere(),
                }).then((groups) => groups.length)
                : 0,
        ]);
        const total = commentCount + mentionCount + dmConversationCount;

        return NextResponse.json({
            data: paginatedResults,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
            counts: {
                comments: commentCount,
                mentions: mentionCount,
                dms: dmConversationCount,
            },
        });
    } catch (error) {
        logger.error({ error }, 'Unified inbox fetch failed');
        return NextResponse.json(
            { error: sanitizeError(error, 'Failed to fetch inbox') },
            { status: 500 }
        );
    }
}
