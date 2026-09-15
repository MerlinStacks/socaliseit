/** Inline rewriting uses the active tenant and Seb's read-only writing context. */
import { NextRequest, NextResponse } from 'next/server';
import { sebErrorResponse } from '@/lib/ai/seb-provider-error';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rewriteSebCaption } from '@/lib/ai/seb-writing';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';

const RequestSchema = z.object({
    caption: z.string().min(1, 'Caption is required'),
    platform: z.enum(['instagram', 'facebook', 'tiktok', 'youtube', 'pinterest', 'bluesky', 'linkedin', 'google_business']),
    instruction: z.string().max(500).optional(),
    mediaContext: z.object({ hasVideo: z.boolean(), hasImage: z.boolean(), mediaCount: z.number() }).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        const rateLimit = await checkRateLimit(`${session.user.id}:ai-rewrite`, EXPENSIVE_RATE_LIMIT);
        if (!rateLimit.allowed) {
            return NextResponse.json({ success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimit) });
        }
        const { data: body, error } = await parseJsonBody(request);
        if (error) return error;
        const caption = await rewriteSebCaption(session.user.currentOrganizationId, RequestSchema.parse(body));
        return NextResponse.json({ success: true, data: { caption } });
    } catch (error) {
        const providerResponse = sebErrorResponse(error);
        if (providerResponse) return providerResponse;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        createRouteLogger('API', '/api/ai/rewrite-caption').error({ err: error }, 'Caption rewrite error');
        return NextResponse.json({ success: false, error: 'Failed to rewrite caption' }, { status: 500 });
    }
}
