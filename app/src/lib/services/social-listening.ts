import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { Platform, Prisma } from '@/generated/prisma/client';
import { listeningQuerySchema, type ListeningQuery } from '@/lib/validation/social-listening';

const POSITIVE_WORDS = ['love', 'great', 'amazing', 'excellent', 'happy', 'best', 'recommend', 'perfect', 'thanks', 'thank you'];
const NEGATIVE_WORDS = ['hate', 'bad', 'awful', 'terrible', 'angry', 'broken', 'issue', 'problem', 'refund', 'disappointed'];

export interface CreateListeningMonitorInput {
    name: string;
    keywords: string[];
    excludedTerms?: string[];
    platforms?: Platform[];
}

interface CandidateItem {
    socialAccountId: string | null;
    platform: Platform;
    sourceType: string;
    sourceId: string;
    externalUrl?: string;
    authorName?: string;
    authorAvatar?: string | null;
    content: string;
    mediaUrl?: string | null;
    occurredAt: Date;
}

function normalizeTerms(terms: string[]): string[] {
    return [...new Set(terms.map((term) => term.trim().toLowerCase()).filter(Boolean))];
}

function matchTerms(content: string, keywords: string[], excludedTerms: string[]): string[] {
    const lower = content.toLowerCase();
    if (excludedTerms.some((term) => lower.includes(term))) return [];
    return keywords.filter((term) => lower.includes(term));
}

export function analyzeListeningSentiment(content: string): 'positive' | 'neutral' | 'negative' | 'question' {
    const lower = content.toLowerCase();
    if (content.includes('?')) return 'question';

    const positive = POSITIVE_WORDS.some((word) => lower.includes(word));
    const negative = NEGATIVE_WORDS.some((word) => lower.includes(word));

    if (negative && !positive) return 'negative';
    if (positive && !negative) return 'positive';
    return 'neutral';
}

export async function createListeningMonitor(organizationId: string, input: CreateListeningMonitorInput) {
    const keywords = normalizeTerms(input.keywords);
    if (keywords.length === 0) {
        throw new Error('At least one keyword is required');
    }

    return db.socialListeningMonitor.create({
        data: {
            organizationId,
            name: input.name.trim() || keywords[0],
            keywords,
            excludedTerms: normalizeTerms(input.excludedTerms || []),
            platforms: input.platforms || [],
        },
    });
}

export async function getListeningDashboard(organizationId: string, query: ListeningQuery = listeningQuerySchema.parse({})) {
    const { page, pageSize } = query;
    const baseWhere: Prisma.SocialListeningItemWhereInput = {
        organizationId,
        ...(query.monitorId && { monitorId: query.monitorId }),
        ...(query.platform && { platform: query.platform }),
        ...(query.sentiment && { sentiment: query.sentiment }),
        ...(query.sourceType && { sourceType: query.sourceType }),
        ...(query.q && { OR: [
            { content: { contains: query.q, mode: 'insensitive' } },
            { authorName: { contains: query.q, mode: 'insensitive' } },
        ] }),
        ...((query.from || query.to) && { occurredAt: {
            ...(query.from && { gte: new Date(query.from) }),
            ...(query.to && { lte: new Date(query.to) }),
        } }),
    };
    const where = { ...baseWhere, ...(query.unread === 'true' && { isRead: false }) };
    const [monitors, items, unreadCount, socialAccounts, crawlerSources, totalCount, groups] = await Promise.all([
        db.socialListeningMonitor.findMany({
            where: { organizationId },
            orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
            include: { _count: { select: { items: true } } },
        }),
        db.socialListeningItem.findMany({
            where,
            take: pageSize,
            skip: (page - 1) * pageSize,
            orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
            include: {
                monitor: { select: { name: true } },
                socialAccount: { select: { platform: true, username: true, name: true } },
            },
        }),
        db.socialListeningItem.count({ where: { ...baseWhere, isRead: false } }),
        db.socialAccount.findMany({ where: { organizationId, isActive: true }, select: { platform: true } }),
        db.socialListeningSource.findMany({
            where: { organizationId },
            orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
        }),
        db.socialListeningItem.count({ where }),
        db.socialListeningItem.groupBy({ by: ['sentiment'], where, _count: { _all: true } }),
    ]);

    const sentiment = Object.fromEntries(groups.map((group) => [group.sentiment, group._count._all]));

    return {
        monitors,
        items,
        unreadCount,
        sentiment,
        crawlerSources,
        totalCount, page, pageSize, totalPages: Math.ceil(totalCount / pageSize),
        hasAccounts: socialAccounts.length > 0 || crawlerSources.length > 0,
        platforms: [...new Set(socialAccounts.map((account) => account.platform))],
    };
}

export async function syncListeningItems(organizationId: string) {
    const monitors = await db.socialListeningMonitor.findMany({
        where: { organizationId, isActive: true },
    });

    if (monitors.length === 0) {
        return { synced: 0, monitors: 0 };
    }

    const candidates = await collectCandidates(organizationId);
    let synced = 0;

    for (const monitor of monitors) {
        const keywords = normalizeTerms(monitor.keywords);
        const excludedTerms = normalizeTerms(monitor.excludedTerms);
        const platformFilter = new Set<Platform>(monitor.platforms);

        for (const candidate of candidates) {
            if (platformFilter.size > 0 && !platformFilter.has(candidate.platform)) continue;

            const matchedKeywords = matchTerms(candidate.content, keywords, excludedTerms);
            if (matchedKeywords.length === 0) continue;

            await db.socialListeningItem.upsert({
                where: {
                    organizationId,
                    monitorId_sourceType_sourceId: {
                        monitorId: monitor.id,
                        sourceType: candidate.sourceType,
                        sourceId: candidate.sourceId,
                    },
                },
                update: {
                    content: candidate.content,
                    mediaUrl: candidate.mediaUrl,
                    sentiment: analyzeListeningSentiment(candidate.content),
                    matchedKeywords,
                    occurredAt: candidate.occurredAt,
                    externalUrl: candidate.externalUrl,
                    authorName: candidate.authorName,
                    authorAvatar: candidate.authorAvatar,
                },
                create: {
                    organizationId,
                    monitorId: monitor.id,
                    socialAccountId: candidate.socialAccountId,
                    platform: candidate.platform,
                    sourceType: candidate.sourceType,
                    sourceId: candidate.sourceId,
                    externalUrl: candidate.externalUrl,
                    authorName: candidate.authorName,
                    authorAvatar: candidate.authorAvatar,
                    content: candidate.content,
                    mediaUrl: candidate.mediaUrl,
                    sentiment: analyzeListeningSentiment(candidate.content),
                    matchedKeywords,
                    occurredAt: candidate.occurredAt,
                },
            });
            synced++;
        }

        await db.socialListeningMonitor.update({
            where: { id: monitor.id, organizationId },
            data: { lastSyncedAt: new Date() },
        });
    }

    logger.info({ organizationId, synced, monitorCount: monitors.length }, 'Social listening sync complete');
    return { synced, monitors: monitors.length };
}

async function collectCandidates(organizationId: string): Promise<CandidateItem[]> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [mentions, comments, reviews, directMessages] = await Promise.all([
        db.mention.findMany({
            where: { organizationId, createdAt: { gte: since } },
            take: 500,
            orderBy: { createdAt: 'desc' },
            include: { socialAccount: { select: { platform: true } } },
        }),
        db.comment.findMany({
            where: { organizationId, createdAt: { gte: since } },
            take: 500,
            orderBy: { createdAt: 'desc' },
            include: { socialAccount: { select: { platform: true } } },
        }),
        db.review.findMany({
            where: { organizationId, createdAt: { gte: since }, text: { not: null } },
            take: 250,
            orderBy: { createdAt: 'desc' },
            include: { socialAccount: { select: { platform: true } } },
        }),
        db.directMessage.findMany({
            where: { organizationId, createdAt: { gte: since }, direction: 'inbound', text: { not: null } },
            take: 250,
            orderBy: { createdAt: 'desc' },
            include: { socialAccount: { select: { platform: true } } },
        }),
    ]);

    return [
        ...mentions.map((mention) => ({
            socialAccountId: mention.socialAccountId,
            platform: mention.socialAccount.platform,
            sourceType: 'mention',
            sourceId: mention.id,
            externalUrl: mention.socialAccount.platform === 'INSTAGRAM' ? `https://instagram.com/p/${mention.platformPostId}` : undefined,
            authorName: mention.authorUsername,
            authorAvatar: mention.authorAvatar,
            content: mention.text || `${mention.type} from ${mention.authorUsername}`,
            mediaUrl: mention.mediaUrl,
            occurredAt: mention.createdAt,
        })),
        ...comments.map((comment) => ({
            socialAccountId: comment.socialAccountId,
            platform: comment.socialAccount.platform,
            sourceType: 'comment',
            sourceId: comment.id,
            authorName: comment.authorUsername,
            authorAvatar: comment.authorAvatar,
            content: comment.text,
            mediaUrl: null,
            occurredAt: comment.createdAt,
        })),
        ...reviews.map((review) => ({
            socialAccountId: review.socialAccountId,
            platform: review.platform,
            sourceType: 'review',
            sourceId: review.id,
            externalUrl: review.reviewUrl || undefined,
            authorName: review.authorName,
            authorAvatar: review.authorAvatar,
            content: review.text || '',
            mediaUrl: null,
            occurredAt: review.createdAt,
        })),
        ...directMessages.map((message) => ({
            socialAccountId: message.socialAccountId,
            platform: message.socialAccount.platform,
            sourceType: 'dm',
            sourceId: message.id,
            authorName: message.senderUsername,
            authorAvatar: message.senderAvatar,
            content: message.text || '',
            mediaUrl: message.mediaUrl,
            occurredAt: message.createdAt,
        })),
    ].filter((item) => item.content.trim().length > 0);
}
