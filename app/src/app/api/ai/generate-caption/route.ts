/** Stateless Seb caption generation with shared organization context. */
import { NextRequest, NextResponse } from 'next/server';
import { sebErrorResponse } from '@/lib/ai/seb-provider-error';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { generateSebCaption } from '@/lib/ai/seb-writing';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';

const RequestSchema = z.object({
    prompt: z.string().min(10).max(500),
    platform: z.enum(['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'pinterest', 'bluesky', 'google_business']),
    contentType: z.enum(['product', 'educational', 'behind-the-scenes', 'promotional', 'engagement']),
    includeHashtags: z.boolean().optional().default(true),
    maxLength: z.number().min(50).max(2200).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        const rateLimit = await checkRateLimit(`${session.user.id}:ai-caption`, EXPENSIVE_RATE_LIMIT);
        if (!rateLimit.allowed) {
            return NextResponse.json({ success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimit) });
        }
        const { data: body, error } = await parseJsonBody(request);
        if (error) return error;
        const result = await generateSebCaption(session.user.currentOrganizationId, RequestSchema.parse(body));
        return NextResponse.json({ success: true, data: {
            ...result,
            // Compatibility fields: this operation does not perform performance/voice scoring.
            viralityScore: 0, brandVoiceScore: 0, suggestions: [], alternatives: [],
        } });
    } catch (error) {
        const providerResponse = sebErrorResponse(error);
        if (providerResponse) return providerResponse;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        createRouteLogger('API', '/api/ai/generate-caption').error({ err: error }, 'Caption generation error');
        return NextResponse.json({ success: false, error: 'Failed to generate caption' }, { status: 500 });
    }
}
