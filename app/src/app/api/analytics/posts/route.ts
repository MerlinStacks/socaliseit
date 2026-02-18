/**
 * Post Analytics API
 * Fetch engagement metrics for specific posts
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';

// GET /api/analytics/posts?postId=... OR list recent top posts
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = new URL(request.url);
    const postId = searchParams.get('postId');

    // If specific post requested
    if (postId) {
        const analytics = await db.postAnalytics.findMany({
            where: {
                post: {
                    id: postId,
                    organizationId: session.user.currentOrganizationId,
                },
            },
            include: {
                post: {
                    select: {
                        platform: true,
                        socialAccount: { select: { platform: true, name: true } },
                    },
                },
            },
        });
        return NextResponse.json(analytics);
    }

    // Otherwise return top performing posts for workspace
    const topPosts = await db.postAnalytics.findMany({
        where: {
            post: {
                organizationId: session.user.currentOrganizationId,
            },
        },
        orderBy: { impressions: 'desc' }, // Default sort
        take: 20,
        include: {
            post: {
                select: {
                    caption: true,
                    publishedAt: true,
                    platform: true,
                    socialAccount: { select: { platform: true, name: true, avatar: true } },
                },
            },
        },
    });

    return NextResponse.json(topPosts);
}
