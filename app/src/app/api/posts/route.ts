/**
 * Posts API Routes
 * CRUD operations for posts with real database integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { schedulePost, publishNow, schedulePublishReminder } from '@/lib/queue';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { sanitizeForDb } from '@/lib/sanitize-string';
import { type PlatformSettingsInput } from '@/types/platform-settings';

type IdempotencyResult = {
    status: number;
    payload: {
        posts?: unknown;
        linkedGroupId?: string | null;
        count?: number;
        error?: string;
    };
};

const IDEMPOTENCY_TTL_MS = 5 * 60_000;
const idempotencyInFlight = new Map<string, Promise<IdempotencyResult>>();
const idempotencyCache = new Map<string, { expiresAt: number; result: IdempotencyResult }>();

function cleanIdempotencyCache(now: number) {
    for (const [key, entry] of idempotencyCache.entries()) {
        if (entry.expiresAt <= now) {
            idempotencyCache.delete(key);
        }
    }
}


/**
 * GET /api/posts - List posts for current workspace
 * Query params: status, platform, limit, offset
 */
export async function GET(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    // Why (BUG-FIX): Cap limit to prevent DB dump and guard against NaN from invalid input.
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const rawOffset = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Math.min(Math.max(isNaN(rawLimit) ? 20 : rawLimit, 1), 100);
    const offset = Math.max(isNaN(rawOffset) ? 0 : rawOffset, 0);

    // Build where clause based on filters
    const where: Record<string, unknown> = { organizationId };
    if (status && status !== 'all') {
        where.status = status.toUpperCase();
    }

    const [posts, total] = await Promise.all([
        db.post.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            include: {
                pillar: { select: { id: true, name: true, color: true } },
                socialAccount: {
                    select: { id: true, platform: true, name: true, avatar: true }
                },
                media: {
                    include: {
                        media: { select: { id: true, url: true, thumbnailUrl: true, mimeType: true } }
                    },
                    orderBy: { order: 'asc' }
                },
                hashtags: {
                    include: {
                        hashtag: { select: { id: true, tag: true } }
                    }
                }
            }
        }),
        db.post.count({ where })
    ]);

    // Transform posts for frontend consumption
    const transformedPosts = posts.map(post => ({
        id: post.id,
        caption: post.caption,
        status: post.status.toLowerCase(),
        scheduledAt: post.scheduledAt?.toISOString() || null,
        publishedAt: post.publishedAt?.toISOString() || null,
        createdAt: post.createdAt.toISOString(),
        pillar: post.pillar ? { id: post.pillar.id, name: post.pillar.name, color: post.pillar.color } : null,
        platform: post.platform?.toLowerCase() ?? null,
        account: post.socialAccount ? {
            // Why (BUG-FIX): Previously used platform name as ID, breaking multi-account setups
            id: post.socialAccount.id,
            platform: post.socialAccount.platform.toLowerCase(),
            name: post.socialAccount.name,
            avatar: post.socialAccount.avatar
        } : null,
        media: post.media.map(pm => ({
            id: pm.media.id,
            url: pm.media.url,
            thumbnailUrl: pm.media.thumbnailUrl,
            type: pm.media.mimeType.startsWith('video/') ? 'video' : 'image'
        })),
        hashtags: post.hashtags.map(ph => ph.hashtag.tag)
    }));

    return NextResponse.json({
        posts: transformedPosts,
        total,
        limit,
        offset,
    });
}

/**
 * POST /api/posts - Create new posts
 * 
 * NEW ARCHITECTURE: Creates one Post record per platform.
 * Multi-platform posts share a linkedGroupId but each post is independent.
 * Why: Enables editing/rescheduling individual platform posts independently.
 */
export async function POST(request: NextRequest) {
    const session = await auth();

    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const organizationId = session.user.currentOrganizationId;
    const userId = session.user.id;
    const userName = session.user.name || 'Unknown';

    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const idempotencyKey = request.headers.get('x-idempotency-key')?.trim();
    if (idempotencyKey) {
        const now = Date.now();
        cleanIdempotencyCache(now);

        const cached = idempotencyCache.get(idempotencyKey);
        if (cached && cached.expiresAt > now) {
            return NextResponse.json(cached.result.payload, { status: cached.result.status });
        }

        const inFlight = idempotencyInFlight.get(idempotencyKey);
        if (inFlight) {
            const result = await inFlight;
            return NextResponse.json(result.payload, { status: result.status });
        }
    }

    const createOperation = (async (): Promise<IdempotencyResult> => {
        // Why (BUG-FIX): Explicitly pick allowed client fields instead of spreading
        // raw body, which would let clients inject organizationId/userId overrides.
        const { createPosts } = await import('@/lib/posts-service');
        const result = await createPosts({
            organizationId,
            userId,
            userName,
            caption: body.caption,
            platformAccountIds: body.platformAccountIds,
            mediaIds: body.mediaIds,
            scheduledAt: body.scheduledAt,
            pillarId: body.pillarId,
            hashtags: body.hashtags,
            autoPublish: body.autoPublish,
            firstComment: body.firstComment,
            platformSettings: body.platformSettings,
        });

        if (result.error) {
            return {
                status: result.status,
                payload: { error: result.error },
            };
        }

        return {
            status: result.status,
            payload: {
                posts: result.posts,
                linkedGroupId: result.linkedGroupId,
                count: result.count,
            },
        };
    })();

    if (idempotencyKey) {
        idempotencyInFlight.set(idempotencyKey, createOperation);
    }

    try {
        const operationResult = await createOperation;
        if (idempotencyKey) {
            idempotencyCache.set(idempotencyKey, {
                expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
                result: operationResult,
            });
        }
        return NextResponse.json(operationResult.payload, { status: operationResult.status });
    } finally {
        if (idempotencyKey) {
            idempotencyInFlight.delete(idempotencyKey);
        }
    }
}
