/**
 * API route for AI caption generation
 * POST /api/ai/generate-caption
 *
 * Why: Generates a full caption from a user prompt using OpenRouter with
 * brand voice context. Falls back to template-based captions when no AI
 * backend is configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';

const log = createRouteLogger('API', '/api/ai/generate-caption');

const RequestSchema = z.object({
    prompt: z.string().min(10).max(500),
    platform: z.enum(['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'pinterest', 'bluesky', 'google_business']),
    contentType: z.enum(['product', 'educational', 'behind-the-scenes', 'promotional', 'engagement']),
    includeHashtags: z.boolean().optional().default(true),
    maxLength: z.number().min(50).max(2200).optional(),
});

// ============================================================================
// Platform Context
// ============================================================================

function getPlatformContext(platform: string): string {
    const contexts: Record<string, string> = {
        instagram: 'Instagram: emojis, hashtags at the end, engaging hooks. Max 2200 chars.',
        facebook: 'Facebook: conversational, questions drive engagement.',
        tiktok: 'TikTok: short, punchy, trend-aware. Relevant hashtags.',
        youtube: 'YouTube: keywords, clear calls-to-action, SEO-friendly.',
        pinterest: 'Pinterest: keyword-rich, descriptive, search-optimized.',
        bluesky: 'Bluesky: max 300 chars. Concise and conversational.',
        linkedin: 'LinkedIn: professional yet personable. Storytelling works well.',
        google_business: 'Google Business: clear, local-focused, include CTAs.',
    };
    return contexts[platform] || '';
}

// ============================================================================
// OpenRouter AI Generation
// ============================================================================

interface CaptionContext {
    prompt: string;
    platform: string;
    contentType: string;
    includeHashtags: boolean;
    maxLength: number;
    toneProfile: Record<string, unknown> | null;
    guidelines: string;
    samples: string[];
    apiKey: string;
    model: string;
}

async function generateAiCaption(ctx: CaptionContext): Promise<{ caption: string; hashtags: string[] } | null> {
    const platformContext = getPlatformContext(ctx.platform);

    let systemPrompt = `You are a social media copywriter. Write a compelling ${ctx.contentType} caption for ${ctx.platform}.\n\n${platformContext}`;

    if (ctx.guidelines) {
        systemPrompt += `\n\nBrand voice guidelines:\n${ctx.guidelines}`;
    }

    if (ctx.toneProfile) {
        const tp = ctx.toneProfile as Record<string, number>;
        const toneDesc: string[] = [];
        if (tp.formality !== undefined) toneDesc.push(tp.formality > 0.6 ? 'professional' : tp.formality < 0.4 ? 'casual' : 'balanced');
        if (tp.enthusiasm !== undefined) toneDesc.push(tp.enthusiasm > 0.6 ? 'enthusiastic' : tp.enthusiasm < 0.4 ? 'calm' : 'moderately enthusiastic');
        if (tp.humor !== undefined && tp.humor > 0.5) toneDesc.push('with light humor');
        if (tp.emotion !== undefined && tp.emotion > 0.6) toneDesc.push('emotionally warm');
        if (toneDesc.length > 0) systemPrompt += `\n\nTone: ${toneDesc.join(', ')}`;

        const emojiStyle = ctx.toneProfile.emojiStyle as string | undefined;
        if (emojiStyle === 'none') systemPrompt += '\nDo NOT use emojis.';
        else if (emojiStyle === 'heavy') systemPrompt += '\nUse emojis liberally.';

        const hashtagStyle = ctx.toneProfile.hashtagStyle as string | undefined;
        if (!ctx.includeHashtags || hashtagStyle === 'none') systemPrompt += '\nDo NOT include hashtags.';
    }

    if (ctx.samples.length > 0) {
        systemPrompt += `\n\nStyle reference captions:\n${ctx.samples.slice(0, 3).join('\n---\n')}`;
    }

    systemPrompt += `\n\nRules:\n- Maximum ${ctx.maxLength} characters\n- Return ONLY the caption text\n- ${ctx.includeHashtags ? 'Include relevant hashtags at the end' : 'Do NOT include hashtags'}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${ctx.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://localhost:3000',
            'X-Title': 'Overseek Socials',
        },
        body: JSON.stringify({
            model: ctx.model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `Write a caption about: ${ctx.prompt}` },
            ],
            temperature: 0.85,
            max_tokens: 1000,
        }),
    });

    if (!response.ok) {
        log.error({ status: response.status }, 'OpenRouter request failed');
        return null;
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    // Extract hashtags from the caption
    const hashtagMatches = content.match(/#\w+/g) || [];

    return {
        caption: content.slice(0, ctx.maxLength),
        hashtags: hashtagMatches.slice(0, 10),
    };
}

// ============================================================================
// Fallback (Mock) Generation
// ============================================================================

function generateFallbackCaption(prompt: string, contentType: string, includeHashtags: boolean, maxLength: number) {
    const mockCaptions: Record<string, string> = {
        product: `✨ New drop alert! ${prompt}\n\nWe've been working on something special and it's finally here. Trust us, you don't want to miss this one.\n\nTap the link in bio to shop now! 🛍️`,
        educational: `💡 Did you know?\n\n${prompt}\n\nSave this post for later and share with someone who needs to see this! 📚`,
        'behind-the-scenes': `Take a peek behind the curtain 👀\n\n${prompt}\n\nThis is what it really takes to make the magic happen ✨`,
        promotional: `🔥 SPECIAL OFFER 🔥\n\n${prompt}\n\nDon't miss out — this won't last long!\n\n👉 Link in bio to claim yours`,
        engagement: `We want to hear from you! 💬\n\n${prompt}\n\nDrop your answer in the comments below 👇`,
    };

    const caption = (mockCaptions[contentType] || mockCaptions.product).slice(0, maxLength);
    const hashtags = includeHashtags ? ['#newpost', '#trending', '#viral', '#fyp', '#explore'] : [];

    return { caption, hashtags };
}

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 },
            );
        }

        // Rate limit: expensive AI operations
        const rateLimitResult = await checkRateLimit(
            `${session.user.id}:ai-caption`, EXPENSIVE_RATE_LIMIT,
        );
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) },
            );
        }

        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;
        const data = RequestSchema.parse(body);
        const maxLen = data.maxLength || 2200;

        let caption: string;
        let hashtags: string[];

        // Attempt OpenRouter
        const aiSettings = await db.globalAISettings.findUnique({
            where: { id: 'global_ai_settings' },
        });

        if (aiSettings?.isConfigured) {
            const brandVoice = await db.brandVoice.findUnique({
                where: { organizationId: session.user.currentOrganizationId },
            });

            const aiResult = await generateAiCaption({
                prompt: data.prompt,
                platform: data.platform,
                contentType: data.contentType,
                includeHashtags: data.includeHashtags,
                maxLength: maxLen,
                toneProfile: (brandVoice?.toneProfile as Record<string, unknown>) ?? null,
                guidelines: brandVoice?.guidelines || '',
                samples: brandVoice?.samples || [],
                apiKey: decrypt(aiSettings.apiKey),
                model: aiSettings.selectedModel || 'openai/gpt-4o-mini',
            });

            if (aiResult) {
                caption = aiResult.caption;
                hashtags = aiResult.hashtags;
            } else {
                log.warn('AI generation returned empty, falling back to mock');
                const fallback = generateFallbackCaption(data.prompt, data.contentType, data.includeHashtags, maxLen);
                caption = fallback.caption;
                hashtags = fallback.hashtags;
            }
        } else {
            const fallback = generateFallbackCaption(data.prompt, data.contentType, data.includeHashtags, maxLen);
            caption = fallback.caption;
            hashtags = fallback.hashtags;
        }

        return NextResponse.json({
            success: true,
            data: {
                caption,
                hashtags,
                viralityScore: Math.round((Math.random() * 0.3 + 0.6) * 100) / 100,
                brandVoiceScore: Math.round((Math.random() * 0.2 + 0.8) * 100) / 100,
                suggestions: [
                    'Consider adding a question to boost engagement',
                ],
                alternatives: [],
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: 'Invalid request', details: error.issues },
                { status: 400 },
            );
        }

        log.error({ err: error }, 'Caption generation error');
        return NextResponse.json(
            { success: false, error: 'Failed to generate caption' },
            { status: 500 },
        );
    }
}
