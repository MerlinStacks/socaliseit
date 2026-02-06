/**
 * Unified Social Inbox API
 *
 * GET /api/inbox - List all inbox items (comments, mentions, DMs) in a unified stream
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

/**
 * Common shape for unified inbox items
 * Why: Normalize different entity types into a single stream format
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
        const page = parseInt(searchParams.get('page') || '1');
        const limit = 30;

        // Fetch from all three sources in parallel when type is 'all'
        const fetchComments = type === 'all' || type === 'comment';
        const fetchMentions = type === 'all' || type === 'mention';
        const fetchDMs = type === 'all' || type === 'dm';

        // Build common filters
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

        // Fetch Comments
        if (fetchComments) {
            const commentWhere = buildWhere();
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
                },
            });

            results.push(
                ...comments.map((c) => ({
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
                    meta: {
                        platformPostId: c.platformPostId,
                        platformCommentId: c.platformCommentId,
                        isReplied: c.isReplied,
                        parentId: c.parentId,
                    },
                    socialAccount: c.socialAccount,
                }))
            );
        }

        // Fetch Mentions
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
                    meta: {
                        platformPostId: m.platformPostId,
                        mentionType: m.type,
                    },
                    socialAccount: m.socialAccount,
                }))
            );
        }

        // Fetch DirectMessages
        if (fetchDMs) {
            const dmWhere = buildWhere({ direction: 'inbound' }); // Only show inbound by default
            if (search) {
                dmWhere.OR = [
                    { text: { contains: search, mode: 'insensitive' } },
                    { senderUsername: { contains: search, mode: 'insensitive' } },
                ];
            }

            const dms = await db.directMessage.findMany({
                where: dmWhere,
                orderBy: { createdAt: 'desc' },
                take: limit,
                include: {
                    socialAccount: { select: { platform: true, name: true, avatar: true } },
                },
            });

            results.push(
                ...dms.map((d) => ({
                    id: d.id,
                    type: 'dm' as const,
                    organizationId: d.organizationId,
                    platform: d.socialAccount.platform,
                    authorId: d.senderId,
                    authorUsername: d.senderUsername,
                    authorAvatar: d.senderAvatar,
                    text: d.text,
                    mediaUrl: d.mediaUrl,
                    isRead: d.isRead,
                    assignedToId: d.assignedToId,
                    labelIds: d.labelIds,
                    createdAt: d.createdAt,
                    meta: {
                        platformMessageId: d.platformMessageId,
                        conversationId: d.conversationId,
                        direction: d.direction,
                    },
                    socialAccount: d.socialAccount,
                }))
            );
        }

        // Sort merged results by createdAt descending
        results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        // Apply pagination (simple offset-based for now)
        const skip = (page - 1) * limit;
        const paginatedResults = results.slice(skip, skip + limit);

        // Get totals for pagination
        const [commentCount, mentionCount, dmCount] = await Promise.all([
            fetchComments ? db.comment.count({ where: buildWhere() }) : 0,
            fetchMentions ? db.mention.count({ where: buildWhere() }) : 0,
            fetchDMs ? db.directMessage.count({ where: buildWhere({ direction: 'inbound' }) }) : 0,
        ]);
        const total = commentCount + mentionCount + dmCount;

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
                dms: dmCount,
            },
        });
    } catch (error) {
        logger.error({ error }, 'Unified inbox fetch failed');
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch inbox' },
            { status: 500 }
        );
    }
}
