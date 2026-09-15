import { db } from '@/lib/db';

export const SEB_WRITING_POST_LIMIT = 8;
export const SEB_WRITING_CAPTION_LIMIT = 1200;

/** Read-only core shared by writing and the advisor. Never include unapproved insights. */
export async function loadSebWritingContext(organizationId: string) {
    if (!organizationId) throw new Error('Organization is required');
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [organization, brandVoice, sebBrandKnowledge, recentPosts] = await Promise.all([
        db.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, timezone: true, tier: true } }),
        db.brandVoice.findUnique({ where: { organizationId }, select: { guidelines: true, toneProfile: true, samples: true } }),
        db.sebBrandKnowledge.findUnique({
            where: { organizationId },
            select: {
                websiteUrl: true, audience: true, positioning: true, products: true,
                offers: true, voiceRules: true, bannedTopics: true, learnedInsights: true,
            },
        }),
        db.post.findMany({
            where: { organizationId, status: 'PUBLISHED', caption: { not: '' }, publishedAt: { gte: since } },
            orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
            take: SEB_WRITING_POST_LIMIT,
            select: { id: true, caption: true, platform: true, publishedAt: true },
        }),
    ]);
    if (!organization) throw new Error('Organization not found');
    return {
        organization, brandVoice, sebBrandKnowledge,
        recentPosts: recentPosts.map(post => ({ ...post, caption: post.caption.slice(0, SEB_WRITING_CAPTION_LIMIT) })),
    };
}

/** Bound freeform brand fields as well as captions before including them in a prompt. */
export function formatSebWritingContext(context: Awaited<ReturnType<typeof loadSebWritingContext>>) {
    const excerpt = (data: unknown, limit: number) => JSON.stringify(data, (key, value) => {
        if (typeof value === 'string') return value.slice(0, key === 'caption' ? SEB_WRITING_CAPTION_LIMIT : 4000);
        if (Array.isArray(value)) return value.slice(0, key === 'samples' ? 3 : 8);
        return value;
    }).slice(0, limit);
    // Reserve space for every source: a large knowledge document must not crowd out past posts.
    return [
        `Identity: ${excerpt(context.organization, 500)}`,
        `Brand voice excerpt: ${excerpt(context.brandVoice, 5000)}`,
        `Approved Seb knowledge excerpt: ${excerpt(context.sebBrandKnowledge, 6500)}`,
        `Recent published posts: ${excerpt(context.recentPosts, 11000)}`,
    ].join('\n');
}
