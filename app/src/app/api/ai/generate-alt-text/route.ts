/** POST /api/ai/generate-alt-text — objective image descriptions through Seb. */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';
import { generateAltText } from '@/lib/ai/generate-alt-text';
import { sebErrorResponse } from '@/lib/ai/seb-provider-error';

const log = createRouteLogger('API', '/api/ai/generate-alt-text');
const RequestSchema = z.object({
    mediaId: z.string().min(1).optional(),
    imageUrl: z.string().min(1).optional(),
    context: z.string().max(10000).optional(),
}).refine(body => body.mediaId || body.imageUrl, 'mediaId or imageUrl is required');

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        const organizationId = session.user.currentOrganizationId;
        const rateLimit = await checkRateLimit(`${session.user.id}:ai-alt-text`, EXPENSIVE_RATE_LIMIT);
        if (!rateLimit.allowed) {
            return NextResponse.json(
                { success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimit) },
            );
        }
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;
        const { mediaId, imageUrl, context } = RequestSchema.parse(body);

        let resolvedUrl = imageUrl;
        if (mediaId) {
            const media = await db.media.findFirst({ where: { id: mediaId, organizationId } });
            if (!media) {
                return NextResponse.json({ success: false, error: 'Media not found' }, { status: 404 });
            }
            resolvedUrl = media.url;
        }

        const altText = await generateAltText(resolvedUrl!, organizationId, context);

        if (mediaId) {
            try {
                await db.media.update({ where: { id: mediaId, organizationId }, data: { altText } });
            } catch {
                log.warn({ mediaId }, 'Failed to save alt text to media record');
            }
        }
        return NextResponse.json({ success: true, data: { altText } });
    } catch (error) {
        const providerResponse = sebErrorResponse(error);
        if (providerResponse) return providerResponse;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        log.error({ err: error }, 'Alt text generation failed');
        return NextResponse.json({ success: false, error: 'Failed to generate alt text' }, { status: 500 });
    }
}
