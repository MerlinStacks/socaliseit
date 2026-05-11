import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';

const log = createRouteLogger('API', '/api/drafts');

const saveDraftSchema = z.object({
    draftId: z.string().min(1),
    caption: z.string(),
    mediaIds: z.array(z.string()).default([]),
    platformAccountIds: z.array(z.string()).default([]),
    scheduledAt: z.string().optional(),
    contentHash: z.string().min(1),
    idempotencyKey: z.string().min(1),
    clientSavedAt: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const draftId = request.nextUrl.searchParams.get('draftId');
    if (!draftId) {
        return NextResponse.json({ error: 'draftId is required' }, { status: 400 });
    }

    try {
        const draft = await db.syncedDraft.findFirst({
            where: {
                id: draftId,
                organizationId: session.user.currentOrganizationId,
            },
        });

        if (!draft) {
            return NextResponse.json({ draft: null });
        }

        return NextResponse.json({
            draft: {
                draftId: draft.id,
                caption: draft.caption,
                mediaIds: draft.mediaIds,
                platformAccountIds: draft.platformAccountIds,
                scheduledAt: draft.scheduledAt,
                contentHash: draft.contentHash,
                lastSavedAt: draft.lastSavedAt.toISOString(),
                lastClientSavedAt: draft.lastClientSavedAt?.toISOString() || null,
            },
        });
    } catch (error) {
        log.error({ err: error }, 'Failed to fetch synced draft');
        return NextResponse.json({ error: 'Failed to fetch draft' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.currentOrganizationId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = saveDraftSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid draft payload', details: parsed.error.flatten() }, { status: 400 });
    }

    const { draftId, caption, mediaIds, platformAccountIds, scheduledAt, contentHash, idempotencyKey, clientSavedAt } = parsed.data;

    try {
        const existing = await db.syncedDraft.findFirst({
            where: {
                id: draftId,
                organizationId: session.user.currentOrganizationId,
            },
        });

        if (existing && existing.contentHash === contentHash) {
            return NextResponse.json({
                status: 'noop',
                reason: 'unchanged',
                idempotencyKey,
                lastSavedAt: existing.lastSavedAt.toISOString(),
            });
        }

        const saved = await db.syncedDraft.upsert({
            where: { id: draftId },
            create: {
                id: draftId,
                organizationId: session.user.currentOrganizationId,
                userId: session.user.id,
                caption,
                mediaIds,
                platformAccountIds,
                scheduledAt,
                contentHash,
                lastClientSavedAt: clientSavedAt ? new Date(clientSavedAt) : null,
            },
            update: {
                caption,
                mediaIds,
                platformAccountIds,
                scheduledAt,
                contentHash,
                userId: session.user.id,
                lastClientSavedAt: clientSavedAt ? new Date(clientSavedAt) : null,
            },
        });

        return NextResponse.json({
            status: 'saved',
            idempotencyKey,
            lastSavedAt: saved.lastSavedAt.toISOString(),
        });
    } catch (error) {
        log.error({ err: error }, 'Failed to save synced draft');
        return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
    }
}
