/** Live, organization-scoped YouTube reports and a bounded published-video selector. */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { ensureValidToken } from '@/lib/services/token-service';
import { emptyYouTubeAnalytics, fetchYouTubeAnalytics, youTubeAnalyticsErrorAvailability } from '@/lib/platform-api/youtube-analytics';

const videoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
const querySchema = z.object({
    accountId: z.string().min(1).max(128).optional(),
    range: z.enum(['7d', '30d', '90d']).default('30d'),
    videoId: videoIdSchema.optional(),
});
const ownedVideosSchema = z.object({ items: z.array(z.object({
    id: z.string(), snippet: z.object({ channelId: z.string(), title: z.string() }),
})) });

function json(body: unknown, status = 200) {
    return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) return json({ error: 'Unauthorized' }, 401);
    const organizationId = session.user.currentOrganizationId;
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return json({ error: 'Invalid analytics query' }, 400);
    const { accountId, range, videoId } = parsed.data;

    try {
        const connected = await db.socialAccount.findMany({
            where: { organizationId, platform: 'YOUTUBE', isActive: true },
            select: { id: true, name: true, platformId: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        const account = accountId ? connected.find(item => item.id === accountId) : connected[0];
        if (accountId && !account) return json({ error: 'Account not found' }, 404);
        if (!account) return json({ analytics: null, accounts: [], accountId: null, videos: [] });
        const accounts = connected.map(({ id, name }) => ({ id, name }));

        const posts = await db.post.findMany({
            where: { organizationId, socialAccountId: account.id, platform: 'YOUTUBE', status: 'PUBLISHED' },
            select: { platformPostId: true, externalId: true, videoTitle: true, caption: true },
            orderBy: [{ publishedAt: 'desc' }, { id: 'asc' }], take: 50,
        });
        const videos = Array.from(new Map(posts.flatMap(post => {
            const id = [post.platformPostId, post.externalId].find(value => videoIdSchema.safeParse(value).success);
            return id ? [[id, { id, title: post.videoTitle || post.caption.slice(0, 100) || id }] as const] : [];
        })).values());

        // YouTube report dates use Pacific time; request an inclusive N-day window ending yesterday.
        const today = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
        const end = new Date(`${today}T00:00:00Z`);
        end.setUTCDate(end.getUTCDate() - 1);
        const start = new Date(end);
        start.setUTCDate(start.getUTCDate() - (parseInt(range, 10) - 1));
        const startDate = start.toISOString().slice(0, 10);
        const endDate = end.toISOString().slice(0, 10);
        const token = await ensureValidToken(account.id);
        if (!token.success || !token.accessToken) {
            return json({
                analytics: emptyYouTubeAnalytics(startDate, endDate, token.needsReconnect ? 'reconnect_required' : 'unavailable', videoId),
                accounts, accountId: account.id, videos,
            });
        }

        if (videoId) {
            // Local post IDs are selector hints, never proof of channel ownership.
            const query = new URLSearchParams({ part: 'snippet', id: videoId, fields: 'items(id,snippet(channelId,title))' });
            const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${query}`, {
                headers: { Authorization: `Bearer ${token.accessToken}` }, cache: 'no-store',
                signal: AbortSignal.timeout(15_000),
            }).catch(() => null);
            if (!response) return json({ error: 'Unable to verify video ownership' }, 502);
            const body: unknown = await response.json().catch(() => null);
            if (!response.ok) return json({ error: 'Unable to verify video ownership', availability: youTubeAnalyticsErrorAvailability(response.status, body) }, 502);
            const owned = ownedVideosSchema.safeParse(body);
            if (!owned.success) return json({ error: 'Unable to verify video ownership' }, 502);
            const video = owned.data.items.find(item => item.id === videoId && item.snippet.channelId === account.platformId);
            if (!video) return json({ error: 'Video not found on this channel' }, 404);
            if (!videos.some(item => item.id === videoId)) {
                videos.unshift({ id: video.id, title: video.snippet.title });
                videos.splice(50);
            }
        }

        const analytics = await fetchYouTubeAnalytics(token.accessToken, account.platformId, startDate, endDate, videoId);
        return json({ analytics, accounts, accountId: account.id, videos });
    } catch {
        return json({ error: 'Unable to load YouTube analytics' }, 500);
    }
}
