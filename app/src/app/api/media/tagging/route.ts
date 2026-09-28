import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSebProviderSettings } from '@/lib/ai/seb-config';
import { getSebModel } from '@/lib/ai/openrouter-models';
import { sebErrorResponse } from '@/lib/ai/seb-provider-error';
import { enqueueMediaTagging } from '@/lib/media/tag-queue';
import { checkRateLimit, createRateLimitHeaders } from '@/lib/rate-limit';

export async function GET() {
    const session = await auth();
    const organizationId = session?.user?.currentOrganizationId;
    if (!session?.user?.id || !organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const [organization, membership, settings] = await Promise.all([
        db.organization.findUnique({ where: { id: organizationId }, select: { mediaAutoTagEnabled: true } }),
        db.organizationMember.findFirst({ where: { organizationId, userId: session.user.id }, select: { role: true } }),
        db.globalAISettings.findUnique({ where: { id: 'global_ai_settings' }, select: { isConfigured: true } }),
    ]);
    return NextResponse.json({
        enabled: organization?.mediaAutoTagEnabled ?? false,
        canManage: !!membership && ['OWNER', 'ADMIN'].includes(membership.role),
        configured: settings?.isConfigured ?? false,
    });
}

export async function PATCH(request: NextRequest) {
    const session = await auth();
    const organizationId = session?.user?.currentOrganizationId;
    if (!session?.user?.id || !organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const membership = await db.organizationMember.findFirst({ where: { organizationId, userId: session.user.id }, select: { role: true } });
    if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) return NextResponse.json({ error: 'Only workspace owners and admins can change auto-tagging.' }, { status: 403 });
    const body = z.object({ enabled: z.boolean() }).safeParse(await request.json().catch(() => null));
    if (!body.success) return NextResponse.json({ error: 'A boolean enabled value is required' }, { status: 400 });
    await db.organization.update({ where: { id: organizationId }, data: { mediaAutoTagEnabled: body.data.enabled } });
    return NextResponse.json({ enabled: body.data.enabled });
}

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const organizationId = session?.user?.currentOrganizationId;
        if (!session?.user?.id || !organizationId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        const rate = await checkRateLimit(organizationId, { prefix: 'media-tagging', max: 20, windowSeconds: 60 });
        if (!rate.allowed) return NextResponse.json({ error: 'Too many analysis requests. Please try again shortly.' }, { status: 429, headers: createRateLimitHeaders(rate) });
        const body = z.object({ ids: z.array(z.string().min(1).max(100)).min(1).max(100) }).safeParse(await request.json().catch(() => null));
        if (!body.success) return NextResponse.json({ error: 'Provide between 1 and 100 media IDs' }, { status: 400 });
        const ids = [...new Set(body.data.ids)];
        const items = await db.media.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, mimeType: true } });
        if (items.length !== ids.length) return NextResponse.json({ error: 'Media not found' }, { status: 404 });
        if (items.some(item => !/^(image|video)\//.test(item.mimeType))) return NextResponse.json({ error: 'Only images and videos support visual tagging' }, { status: 400 });
        const settings = await getSebProviderSettings();
        const model = await getSebModel(settings.model);
        if (!model.supportsImageInput) return NextResponse.json({ error: 'Choose a Seb model with image input support in AI settings to analyze media.' }, { status: 400 });
        let queued = 0;
        let failed = 0;
        for (const item of items) {
            try {
                if (await enqueueMediaTagging(organizationId, item.id)) queued++;
            } catch (error) {
                failed++;
                logger.warn({ err: error, mediaId: item.id }, 'Manual media tagging enqueue failed');
            }
        }
        return NextResponse.json({ queued, failed, skipped: items.length - queued - failed }, { status: 202 });
    } catch (error) {
        const providerResponse = sebErrorResponse(error);
        if (providerResponse) return providerResponse;
        logger.error({ err: error }, 'Could not queue media analysis');
        return NextResponse.json({ error: 'Could not queue media analysis. Please try again.' }, { status: 500 });
    }
}
