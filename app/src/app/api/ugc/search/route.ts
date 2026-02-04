/**
 * UGC Search API Route
 * Searches for user-generated content using Instagram hashtag search
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { searchUGC } from '@/lib/ugc';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const organizationId = session.user.currentOrganizationId;
        const body = await request.json();
        const { hashtags } = body;

        if (!hashtags || !Array.isArray(hashtags) || hashtags.length === 0) {
            return NextResponse.json(
                { error: 'At least one hashtag is required' },
                { status: 400 }
            );
        }

        // Limit to 5 hashtags per request
        const limitedHashtags = hashtags.slice(0, 5);

        logger.info({ organizationId, hashtags: limitedHashtags }, 'Searching for UGC');

        const posts = await searchUGC(organizationId, {
            hashtags: limitedHashtags,
        });

        // Convert dates to strings for JSON serialization
        const serializedPosts = posts.map(post => ({
            ...post,
            publishedAt: post.publishedAt.toISOString(),
            discoveredAt: post.discoveredAt.toISOString(),
        }));

        return NextResponse.json({ posts: serializedPosts });

    } catch (error) {
        logger.error({ error }, 'Error in UGC search API');
        return NextResponse.json(
            { error: 'Failed to search for UGC' },
            { status: 500 }
        );
    }
}
