/** Grounded inbox replies using the same business context as Seb. */
import { NextRequest, NextResponse } from 'next/server';
import { sebErrorResponse } from '@/lib/ai/seb-provider-error';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { generateSebReplies } from '@/lib/ai/seb-writing';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';

const RequestSchema = z.object({
    messageText: z.string().min(1).max(5000),
    messageType: z.enum(['comment', 'mention', 'dm', 'review']),
    platform: z.enum(['instagram', 'facebook', 'tiktok', 'youtube', 'twitter', 'linkedin', 'google_business']),
    sentiment: z.enum(['positive', 'negative', 'neutral', 'question']).optional(),
    rating: z.number().min(1).max(5).optional(),
    authorUsername: z.string().optional(),
    conversationHistory: z.array(z.object({ direction: z.enum(['inbound', 'outbound']), text: z.string() })).optional(),
    tone: z.enum(['professional', 'friendly', 'casual', 'empathetic', 'enthusiastic']).optional().default('friendly'),
    suggestionCount: z.number().int().min(1).max(5).optional().default(3),
});

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }
        const rateLimit = await checkRateLimit(`${session.user.id}:ai-reply`, EXPENSIVE_RATE_LIMIT);
        if (!rateLimit.allowed) {
            return NextResponse.json({ success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimit) });
        }
        const { data: body, error } = await parseJsonBody(request);
        if (error) return error;
        const data = RequestSchema.parse(body);
        const suggestions = await generateSebReplies(session.user.currentOrganizationId, data);
        return NextResponse.json({ success: true, data: {
            suggestions,
            metadata: { sentiment: data.sentiment || 'neutral', tone: data.tone, platform: data.platform, generatedAt: new Date().toISOString() },
        } });
    } catch (error) {
        const providerResponse = sebErrorResponse(error);
        if (providerResponse) return providerResponse;
        if (error instanceof z.ZodError) {
            return NextResponse.json({ success: false, error: 'Invalid request', details: error.issues }, { status: 400 });
        }
        createRouteLogger('API', '/api/ai/generate-reply').error({ err: error }, 'Reply generation error');
        return NextResponse.json({ success: false, error: 'Failed to generate suggestions' }, { status: 500 });
    }
}
