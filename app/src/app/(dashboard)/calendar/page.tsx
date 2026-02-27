/**
 * Calendar server page
 * Why: Previously `'use client'`, which created a data waterfall:
 * Navigate → download JS → hydrate → useQuery fires → fetch /api/calendar → render.
 *
 * Now a server component that prefetches calendar data server-side and passes it
 * to CalendarClient as initialData. Combined with Suspense, the user sees:
 * 1. CalendarLoading skeleton instantly
 * 2. CalendarClient with REAL DATA on the first streamed frame — no API round-trip
 *
 * React Query then takes over for subsequent view/date changes.
 */

import { Suspense } from 'react';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { CalendarClient } from './calendar-client';
import CalendarLoading from './loading';
import { db } from '@/lib/db';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, subDays } from 'date-fns';

/**
 * Server component that prefetches this month's calendar data.
 * Wrapped in Suspense so the loading skeleton appears instantly.
 */
async function CalendarData({ organizationId, userId }: { organizationId: string; userId: string }) {
    const now = new Date();

    /**
     * Why: Prefetch the month view by default (most common view).
     * The date range extends from the start of the first visible week to the
     * end of the last visible week to match the client-side month view.
     */
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);
    // Extend to cover visible weeks in the month grid
    const start = subDays(startOfWeek(monthStart, { weekStartsOn: 1 }), 0);
    const end = addDays(endOfWeek(monthEnd, { weekStartsOn: 1 }), 0);
    end.setHours(23, 59, 59, 999);

    const today = new Date();
    const todayStr = today.toLocaleDateString('en-CA');
    const todayIsInRange = today >= start && today <= end;

    const calendarInclude = {
        pillar: { select: { id: true, name: true, color: true } },
        socialAccount: { select: { platform: true, name: true, avatar: true } },
        media: {
            include: { media: { select: { thumbnailUrl: true, url: true } } },
            take: 1 as const
        }
    } as const;

    // Run posts + notes + problem queries in parallel
    const [dateRangePosts, problemPosts, notes] = await Promise.all([
        db.post.findMany({
            where: {
                organizationId,
                OR: [
                    { status: 'DRAFT', scheduledAt: { gte: start, lte: end } },
                    { status: 'SCHEDULED', scheduledAt: { gte: start, lte: end } },
                    { status: 'PUBLISHING', scheduledAt: { gte: start, lte: end } },
                    { status: 'PUBLISHED', publishedAt: { gte: start, lte: end } },
                    { isExternal: true, publishedAt: { gte: start, lte: end } },
                    { status: 'FAILED', scheduledAt: { gte: start, lte: end } },
                    { status: 'FAILED', scheduledAt: null, publishedAt: { gte: start, lte: end } },
                ]
            },
            orderBy: [{ scheduledAt: 'asc' }, { publishedAt: 'asc' }],
            include: calendarInclude,
        }),
        todayIsInRange
            ? db.post.findMany({
                where: {
                    organizationId,
                    OR: [
                        { status: 'DRAFT', scheduledAt: null },
                        { status: 'FAILED', scheduledAt: null, publishedAt: null },
                        { status: 'SCHEDULED', scheduledAt: { lt: new Date() } },
                        { status: 'PUBLISHING', scheduledAt: { lt: new Date(Date.now() - 20 * 60 * 1000) } },
                        { status: 'PUBLISHING', scheduledAt: null },
                        { status: 'SCHEDULED', scheduledAt: null },
                        { scheduledAt: null, publishedAt: null },
                    ]
                },
                orderBy: [{ scheduledAt: 'asc' }, { publishedAt: 'asc' }],
                include: calendarInclude,
            })
            : Promise.resolve([]),
        db.calendarNote.findMany({
            where: {
                organizationId,
                date: { gte: start, lte: end },
                OR: [
                    { isPrivate: false },
                    { isPrivate: true, createdById: userId },
                ],
            },
            orderBy: { date: 'asc' },
        }),
    ]);

    // Merge and deduplicate posts
    const seenIds = new Set(dateRangePosts.map(p => p.id));
    const allPosts = [
        ...dateRangePosts,
        ...problemPosts.filter(p => !seenIds.has(p.id)),
    ];

    // Use server timezone (Australia/Sydney from org settings typically)
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Group posts by date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const postsByDate: Record<string, any[]> = {};
    allPosts.forEach(post => {
        const isUnscheduledDraft = post.status === 'DRAFT' && !post.scheduledAt;
        const isFailedNoTimestamp = post.status === 'FAILED' && !post.scheduledAt && !post.publishedAt;
        const isOverdueScheduled = post.status === 'SCHEDULED' && post.scheduledAt && post.scheduledAt < today;
        const isStuckPublishing = post.status === 'PUBLISHING' && post.scheduledAt &&
            post.scheduledAt < new Date(Date.now() - 20 * 60 * 1000);
        const isPublishNowStuck = (post.status === 'PUBLISHING' || post.status === 'SCHEDULED') && !post.scheduledAt;
        const showOnToday = isUnscheduledDraft || isFailedNoTimestamp || isOverdueScheduled || isStuckPublishing || isPublishNowStuck;

        const dateKey = showOnToday ? today : (post.scheduledAt || post.publishedAt || post.createdAt);
        if (!dateKey) return;

        const dateStr = showOnToday ? todayStr : dateKey.toLocaleDateString('en-CA', { timeZone: userTimezone });
        if (!postsByDate[dateStr]) postsByDate[dateStr] = [];

        const platform = post.platform?.toLowerCase() || 'unknown';
        postsByDate[dateStr].push({
            id: post.id,
            time: dateKey.toISOString(),
            caption: post.caption.slice(0, 60) + (post.caption.length > 60 ? '...' : ''),
            platform,
            status: post.status.toLowerCase(),
            thumbnail: post.isExternal
                ? post.externalThumbnailUrl
                : (post.media[0]?.media.thumbnailUrl || post.media[0]?.media.url || null),
            pillarColor: post.pillar?.color || null,
            isExternal: post.isExternal,
            externalUrl: post.externalUrl,
            postType: post.postType?.toLowerCase() || 'feed',
            accountName: post.socialAccount?.name || 'Unknown Account',
            isAiGenerated: post.isAiGenerated || false,
            dragKey: post.id,
            linkedGroupId: post.linkedGroupId,
        });
    });

    // Sort: AI drafts below scheduled posts
    Object.keys(postsByDate).forEach(dateKey => {
        postsByDate[dateKey].sort((a: { isAiGenerated: boolean; time: string }, b: { isAiGenerated: boolean; time: string }) => {
            if (a.isAiGenerated !== b.isAiGenerated) return a.isAiGenerated ? 1 : -1;
            return new Date(a.time).getTime() - new Date(b.time).getTime();
        });
    });

    // Group notes by date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notesByDate: Record<string, any[]> = {};
    notes.forEach(note => {
        const dateStr = note.date.toLocaleDateString('en-CA', { timeZone: userTimezone });
        if (!notesByDate[dateStr]) notesByDate[dateStr] = [];
        notesByDate[dateStr].push({
            id: note.id,
            title: note.title,
            description: note.description,
            date: note.date.toISOString(),
            color: note.color,
            isPrivate: note.isPrivate,
            createdById: note.createdById,
        });
    });

    return <CalendarClient initialData={{ posts: postsByDate, notes: notesByDate }} />;
}

export default async function CalendarPage() {
    const session = await getSession();

    if (!session?.user?.currentOrganizationId) {
        redirect('/login');
    }

    return (
        <Suspense fallback={<CalendarLoading />}>
            <CalendarData
                organizationId={session.user.currentOrganizationId}
                userId={session.user.id}
            />
        </Suspense>
    );
}
