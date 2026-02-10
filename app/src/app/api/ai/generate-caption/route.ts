/**
 * API route for AI caption generation
 * POST /api/ai/generate-caption
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, getClientIp, createRateLimitHeaders } from '@/lib/rate-limit';

const RequestSchema = z.object({
    prompt: z.string().min(10).max(500),
    platform: z.enum(['instagram', 'tiktok', 'youtube', 'facebook']),
    contentType: z.enum(['product', 'educational', 'behind-the-scenes', 'promotional', 'engagement']),
    includeHashtags: z.boolean().optional().default(true),
    maxLength: z.number().min(50).max(2200).optional(),
});

export async function POST(request: NextRequest) {
    try {
        // Auth check — this endpoint was previously unprotected
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Rate limit: 5 requests per minute for expensive AI operations
        const rateLimitResult = await checkRateLimit(
            `${session.user.id}:ai-caption`, EXPENSIVE_RATE_LIMIT
        );
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
            );
        }

        const { data: body, error } = await parseJsonBody(request);
        if (error) return error;
        const data = RequestSchema.parse(body);

        // In production, this would:
        // 1. Get brand voice profile from database
        // 2. Call AI API (OpenAI/Anthropic) with brand context
        // 3. Post-process and validate response

        // Mock response for demo
        const mockCaptions: Record<string, string> = {
            product: `✨ New drop alert! ${data.prompt}\n\nWe've been working on something special and it's finally here. Trust us, you don't want to miss this one.\n\nTap the link in bio to shop now! 🛍️`,
            educational: `💡 Did you know?\n\n${data.prompt}\n\nSave this post for later and share with someone who needs to see this! 📚`,
            'behind-the-scenes': `Take a peek behind the curtain 👀\n\n${data.prompt}\n\nThis is what it really takes to make the magic happen ✨`,
            promotional: `🔥 SPECIAL OFFER 🔥\n\n${data.prompt}\n\nDon't miss out - this won't last long!\n\n👉 Link in bio to claim yours`,
            engagement: `We want to hear from you! 💬\n\n${data.prompt}\n\nDrop your answer in the comments below 👇`,
        };

        const caption = mockCaptions[data.contentType] || mockCaptions.product;

        const hashtags = data.includeHashtags
            ? ['#newpost', '#trending', '#viral', '#fyp', '#explore']
            : [];

        // Simulate AI processing time
        await new Promise((r) => setTimeout(r, 800));

        return NextResponse.json({
            success: true,
            data: {
                caption: caption.slice(0, data.maxLength || 2200),
                hashtags,
                viralityScore: Math.round((Math.random() * 0.3 + 0.6) * 100) / 100,
                brandVoiceScore: Math.round((Math.random() * 0.2 + 0.8) * 100) / 100,
                suggestions: [
                    'Consider adding a question to boost engagement',
                    `Optimal posting time: 7:30 PM ${data.platform === 'instagram' ? 'for Instagram' : ''}`,
                ],
                alternatives: [
                    `Alternative: ${caption.slice(0, 100)}...`,
                ],
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: 'Invalid request', details: error.issues },
                { status: 400 }
            );
        }

        createRouteLogger('API', '/api/ai/generate-caption').error({ err: error }, 'Caption generation error');
        return NextResponse.json(
            { success: false, error: 'Failed to generate caption' },
            { status: 500 }
        );
    }
}
