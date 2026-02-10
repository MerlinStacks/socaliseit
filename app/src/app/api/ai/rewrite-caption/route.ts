/**
 * API route for AI caption rewriting
 * POST /api/ai/rewrite-caption
 * 
 * Why: Inline rewrite that reads current context, brand voice, and past posts
 * to generate an enhanced caption without opening a popup/modal.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, getClientIp, createRateLimitHeaders } from '@/lib/rate-limit';

const RequestSchema = z.object({
    caption: z.string().min(1, 'Caption is required'),
    platform: z.enum(['instagram', 'facebook', 'tiktok', 'youtube', 'pinterest', 'bluesky', 'linkedin', 'google_business']),
    mediaContext: z.object({
        hasVideo: z.boolean(),
        hasImage: z.boolean(),
        mediaCount: z.number(),
    }).optional(),
});

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        // Rate limit: 5 requests per minute for expensive AI operations
        const rateLimitResult = await checkRateLimit(
            `${session.user.id}:ai-rewrite`, EXPENSIVE_RATE_LIMIT
        );
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) }
            );
        }

        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;
        const data = RequestSchema.parse(body);

        // Get the user's organization
        const membership = await db.organizationMember.findFirst({
            where: { userId: session.user.id },
            include: {
                organization: {
                    include: {
                        brandVoice: true,
                    },
                },
            },
        });

        if (!membership?.organization) {
            return NextResponse.json(
                { success: false, error: 'No organization found' },
                { status: 404 }
            );
        }

        const { organization } = membership;

        // Fetch recent published posts for context (last 15 captions)
        const recentPosts = await db.post.findMany({
            where: {
                organizationId: organization.id,
                status: 'PUBLISHED',
                caption: { not: '' },
            },
            orderBy: { publishedAt: 'desc' },
            take: 15,
            select: {
                caption: true,
                platform: true,
            },
        });

        // Build context for AI
        const brandVoice = organization.brandVoice;
        const toneProfile = brandVoice?.toneProfile as Record<string, number> | null;
        const guidelines = brandVoice?.guidelines || '';
        const samples = brandVoice?.samples || [];

        // Build the rewrite prompt
        const platformContext = getPlatformContext(data.platform);
        const pastCaptions = recentPosts
            .slice(0, 5)
            .map(p => p.caption)
            .join('\n---\n');

        // Generate rewritten caption
        const rewrittenCaption = await generateRewrittenCaption({
            originalCaption: data.caption,
            platform: data.platform,
            platformContext,
            toneProfile,
            guidelines,
            samples,
            pastCaptions,
            mediaContext: data.mediaContext,
        });

        return NextResponse.json({
            success: true,
            data: {
                caption: rewrittenCaption,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: 'Invalid request', details: error.issues },
                { status: 400 }
            );
        }

        createRouteLogger('API', '/api/ai/rewrite-caption').error({ err: error }, '[AI Rewrite] Error');
        return NextResponse.json(
            { success: false, error: 'Failed to rewrite caption' },
            { status: 500 }
        );
    }
}

/**
 * Get platform-specific context for caption generation
 */
function getPlatformContext(platform: string): string {
    const contexts: Record<string, string> = {
        instagram: 'Instagram captions work best with emojis, hashtags at the end, and engaging hooks. Max 2200 chars.',
        facebook: 'Facebook posts can be longer and more conversational. Questions drive engagement.',
        tiktok: 'TikTok captions should be short, punchy, and trend-aware. Use relevant hashtags.',
        youtube: 'YouTube descriptions should include keywords and clear calls-to-action.',
        pinterest: 'Pinterest descriptions should be keyword-rich and descriptive for search.',
        bluesky: 'Bluesky posts are limited to 300 chars. Keep it concise and conversational.',
        linkedin: 'LinkedIn posts should be professional yet personable. Storytelling works well.',
        google_business: 'Google Business posts should be clear, local-focused, and include CTAs.',
    };
    return contexts[platform] || '';
}

interface RewriteContext {
    originalCaption: string;
    platform: string;
    platformContext: string;
    toneProfile: Record<string, number> | null;
    guidelines: string;
    samples: string[];
    pastCaptions: string;
    mediaContext?: {
        hasVideo: boolean;
        hasImage: boolean;
        mediaCount: number;
    };
}

/**
 * Generate rewritten caption using AI
 * Calls OpenRouter API with brand voice context; falls back to mock if unconfigured.
 */
async function generateRewrittenCaption(context: RewriteContext): Promise<string> {
    const { originalCaption, platform, platformContext, toneProfile, guidelines, samples, pastCaptions, mediaContext } = context;

    // Try OpenRouter API first
    try {
        const aiSettings = await db.globalAISettings.findUnique({
            where: { id: 'global_ai_settings' },
        });

        if (aiSettings?.isConfigured) {
            const apiKey = decrypt(aiSettings.apiKey);
            const model = aiSettings.selectedModel || 'openai/gpt-4o-mini';

            // Build system prompt with brand voice context
            let systemPrompt = `You are a social media copywriter. Rewrite the given caption to be more engaging and optimized for ${platform}.\n\n${platformContext}`;

            if (guidelines) {
                systemPrompt += `\n\nBrand voice guidelines: ${guidelines}`;
            }
            if (samples.length > 0) {
                systemPrompt += `\n\nBrand voice samples:\n${samples.slice(0, 3).join('\n---\n')}`;
            }
            if (toneProfile) {
                systemPrompt += `\n\nTone profile: ${JSON.stringify(toneProfile)}`;
            }
            if (pastCaptions) {
                systemPrompt += `\n\nRecent captions for style reference:\n${pastCaptions}`;
            }

            systemPrompt += `\n\nRules:\n- Return ONLY the rewritten caption text, no explanation\n- Keep the same core message\n- Optimize for engagement on ${platform}\n- Match the brand's voice and tone`;

            let userPrompt = `Rewrite this caption:\n\n${originalCaption}`;
            if (mediaContext?.hasVideo) {
                userPrompt += '\n\n(This post includes video content)';
            } else if (mediaContext?.hasImage && mediaContext.mediaCount > 1) {
                userPrompt += `\n\n(This is a carousel post with ${mediaContext.mediaCount} images)`;
            }

            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': process.env.NEXTAUTH_URL || 'https://localhost:3000',
                    'X-Title': 'Overseek Socials',
                },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: 0.8,
                    max_tokens: 1000,
                }),
            });

            if (response.ok) {
                const result = await response.json();
                const rewritten = result.choices?.[0]?.message?.content?.trim();
                if (rewritten && rewritten.length > 0) {
                    return rewritten;
                }
            }
        }
    } catch (error) {
        createRouteLogger('API', '/api/ai/rewrite-caption').error({ err: error }, '[AI Rewrite] OpenRouter error, falling back to mock');
    }

    // Fallback to mock enhancement
    const caption = originalCaption.trim();
    if (caption.length < 50) {
        return enhanceShortCaption(caption, platform, mediaContext);
    }
    return polishExistingCaption(caption, platform, toneProfile);
}

/**
 * Enhance a short caption with more engaging content
 */
function enhanceShortCaption(
    caption: string,
    platform: string,
    mediaContext?: { hasVideo: boolean; hasImage: boolean; mediaCount: number }
): string {
    const hooks = [
        '✨ ',
        '🔥 ',
        '💫 ',
        '🚀 ',
    ];
    const hook = hooks[Math.floor(Math.random() * hooks.length)];

    const ctas = [
        '\n\nDouble tap if you agree! 💖',
        '\n\nWhat do you think? Drop a comment below 👇',
        '\n\nSave this for later! 📌',
        '\n\nTag someone who needs to see this! 🏷️',
    ];
    const cta = ctas[Math.floor(Math.random() * ctas.length)];

    // Add video-specific text if applicable
    const videoText = mediaContext?.hasVideo ? '\n\n🎬 Watch till the end!' : '';

    // Platform-specific hashtags
    const hashtags = getRelevantHashtags(platform);

    return `${hook}${caption}${videoText}${cta}\n\n${hashtags}`;
}

/**
 * Polish an existing longer caption
 */
function polishExistingCaption(
    caption: string,
    platform: string,
    toneProfile: Record<string, number> | null
): string {
    // Check if caption already has emojis
    const hasEmojis = /[\u{1F300}-\u{1F9FF}]/u.test(caption);

    // Check if caption already has hashtags
    const hasHashtags = /#\w+/.test(caption);

    let enhanced = caption;

    // Add a hook if not present
    if (!enhanced.startsWith('✨') && !enhanced.startsWith('🔥') && !enhanced.startsWith('💫')) {
        const isEnthusiastic = toneProfile?.enthusiasm && toneProfile.enthusiasm > 0.6;
        if (isEnthusiastic) {
            enhanced = `✨ ${enhanced}`;
        }
    }

    // Add emojis if tone is informal and no emojis present
    if (!hasEmojis && toneProfile?.formality && toneProfile.formality < 0.5) {
        enhanced = enhanced
            .replace(/\!(?=\s|$)/g, '! 🎉')
            .replace(/\?(?=\s|$)/g, '? 🤔');
    }

    // Add hashtags if not present
    if (!hasHashtags) {
        const hashtags = getRelevantHashtags(platform);
        enhanced = `${enhanced}\n\n${hashtags}`;
    }

    // Ensure there's a CTA if missing
    if (!enhanced.includes('comment') && !enhanced.includes('tap') && !enhanced.includes('share')) {
        enhanced = `${enhanced}\n\n💬 We'd love to hear your thoughts!`;
    }

    return enhanced;
}

/**
 * Get relevant hashtags based on platform
 */
function getRelevantHashtags(platform: string): string {
    const platformHashtags: Record<string, string[]> = {
        instagram: ['#instagood', '#photooftheday', '#trending', '#explore', '#fyp'],
        facebook: ['#facebook', '#community', '#share'],
        tiktok: ['#fyp', '#foryou', '#viral', '#trending', '#tiktok'],
        youtube: ['#youtube', '#subscribe', '#newvideo'],
        pinterest: ['#pinterest', '#inspiration', '#ideas'],
        bluesky: [], // Bluesky doesn't heavily use hashtags
        linkedin: ['#business', '#innovation', '#growth'],
        google_business: [], // GMB doesn't use hashtags
    };

    const tags = platformHashtags[platform] || ['#newpost'];
    return tags.slice(0, 4).join(' ');
}
