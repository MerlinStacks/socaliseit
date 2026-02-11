/**
 * AI Reply Suggestions API
 * POST /api/ai/generate-reply
 *
 * Why: Generates contextual reply suggestions for inbox items (comments,
 * DMs, reviews). When OpenRouter is configured, it builds a prompt that
 * includes the actual message text, brand voice, and conversation history
 * to produce relevant, on-brand replies. Falls back to hardcoded templates
 * only when no AI backend is available.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';

const log = createRouteLogger('API', '/api/ai/generate-reply');

const RequestSchema = z.object({
    /** Original message text */
    messageText: z.string().min(1).max(5000),
    /** Type of inbox item */
    messageType: z.enum(['comment', 'mention', 'dm', 'review']),
    /** Platform for tone calibration */
    platform: z.enum(['instagram', 'facebook', 'tiktok', 'youtube', 'twitter', 'linkedin', 'google_business']),
    /** Detected sentiment of the message */
    sentiment: z.enum(['positive', 'negative', 'neutral', 'question']).optional(),
    /** Star rating for reviews (1-5) */
    rating: z.number().min(1).max(5).optional(),
    /** Author username for personalization */
    authorUsername: z.string().optional(),
    /** Conversation history for context */
    conversationHistory: z.array(z.object({
        direction: z.enum(['inbound', 'outbound']),
        text: z.string(),
    })).optional(),
    /** Desired reply tone */
    tone: z.enum(['professional', 'friendly', 'casual', 'empathetic', 'enthusiastic']).optional().default('friendly'),
    /** Number of suggestions to generate */
    suggestionCount: z.number().min(1).max(5).optional().default(3),
});

type ReplyRequest = z.infer<typeof RequestSchema>;

// ============================================================================
// OpenRouter AI Generation
// ============================================================================

interface AiReplyContext {
    request: ReplyRequest;
    toneProfile: Record<string, unknown> | null;
    guidelines: string;
    apiKey: string;
    model: string;
}

/**
 * Build a system prompt that encodes brand voice + platform conventions.
 */
function buildSystemPrompt(ctx: AiReplyContext): string {
    const { request, toneProfile, guidelines } = ctx;
    const { messageType, platform } = request;

    let prompt = `You are a social media community manager. Generate ${request.suggestionCount} reply suggestions for a ${messageType} on ${platform}.`;

    prompt += '\n\nKey rules:';
    prompt += '\n- Each reply must directly address the specific content of the message';
    prompt += '\n- Keep replies concise (1-3 sentences)';
    prompt += '\n- Match the appropriate emotional register for the sentiment';
    prompt += '\n- Never invent facts about products or policies';

    if (guidelines) {
        prompt += `\n\nBrand voice guidelines:\n${guidelines}`;
    }

    if (toneProfile) {
        const toneDesc: string[] = [];
        const tp = toneProfile as Record<string, number>;
        if (tp.formality !== undefined) {
            toneDesc.push(tp.formality > 0.6 ? 'professional/formal' : tp.formality < 0.4 ? 'casual/informal' : 'balanced formality');
        }
        if (tp.enthusiasm !== undefined) {
            toneDesc.push(tp.enthusiasm > 0.6 ? 'enthusiastic and energetic' : tp.enthusiasm < 0.4 ? 'calm and measured' : 'moderately enthusiastic');
        }
        if (tp.humor !== undefined && tp.humor > 0.5) {
            toneDesc.push('light humor welcome');
        }
        if (tp.emotion !== undefined && tp.emotion > 0.6) {
            toneDesc.push('emotionally warm and empathetic');
        }
        if (toneDesc.length > 0) {
            prompt += `\n\nBrand tone: ${toneDesc.join(', ')}`;
        }

        const emojiStyle = toneProfile.emojiStyle as string | undefined;
        if (emojiStyle) {
            const emojiMap: Record<string, string> = {
                none: 'Do NOT use any emojis.',
                minimal: 'Use emojis sparingly (0-1 per reply).',
                moderate: 'Use a moderate amount of emojis (1-2 per reply).',
                heavy: 'Liberally use emojis throughout.',
            };
            prompt += `\n${emojiMap[emojiStyle] || ''}`;
        }
    }

    prompt += `\n\nReturn ONLY a JSON array of ${request.suggestionCount} reply strings. No explanation, no markdown fencing.`;

    return prompt;
}

/**
 * Build the user prompt that includes the actual message content.
 */
function buildUserPrompt(request: ReplyRequest): string {
    const { messageText, messageType, rating, sentiment, authorUsername, conversationHistory } = request;

    let prompt = '';

    if (messageType === 'review') {
        const ratingStr = typeof rating === 'number' ? ` (${rating}/5 stars)` : '';
        prompt += `Customer review${ratingStr}:\n"${messageText}"`;
    } else {
        prompt += `${messageType.charAt(0).toUpperCase() + messageType.slice(1)} from ${authorUsername || 'a user'}:\n"${messageText}"`;
    }

    if (sentiment) {
        prompt += `\n\nDetected sentiment: ${sentiment}`;
    }

    if (conversationHistory && conversationHistory.length > 0) {
        prompt += '\n\nPrior conversation:';
        for (const msg of conversationHistory.slice(-5)) {
            prompt += `\n  [${msg.direction}] ${msg.text}`;
        }
    }

    return prompt;
}

/**
 * Call OpenRouter to generate reply suggestions.
 */
async function generateAiReplies(ctx: AiReplyContext): Promise<string[] | null> {
    try {
        const systemPrompt = buildSystemPrompt(ctx);
        const userPrompt = buildUserPrompt(ctx.request);

        log.debug({ model: ctx.model }, 'Calling OpenRouter for reply suggestions');

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
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.85,
                max_tokens: 600,
            }),
        });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => '(unreadable)');
            log.error(
                { status: response.status, body: errorBody.slice(0, 500) },
                'OpenRouter request failed',
            );
            return null;
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content?.trim();

        if (!content) {
            log.warn(
                { result: JSON.stringify(result).slice(0, 500) },
                'OpenRouter returned empty content',
            );
            return null;
        }

        // Parse JSON array from response (strip markdown fencing if present)
        const cleaned = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
        try {
            const parsed = JSON.parse(cleaned);
            if (Array.isArray(parsed) && parsed.every((s: unknown) => typeof s === 'string')) {
                return parsed.slice(0, ctx.request.suggestionCount);
            }
            // Parsed but not a string array — try extracting strings anyway
            if (Array.isArray(parsed)) {
                const strings = parsed.map((s: unknown) => String(s)).filter(Boolean);
                if (strings.length > 0) return strings.slice(0, ctx.request.suggestionCount);
            }
            log.warn({ parsed: JSON.stringify(parsed).slice(0, 300) }, 'OpenRouter response parsed but not a string array');
        } catch {
            // If the model didn't return valid JSON, split by newlines as a fallback
            log.debug({ rawContent: cleaned.slice(0, 300) }, 'JSON parse failed, trying line split');
            const lines = cleaned.split('\n')
                .map((l: string) => l.replace(/^\d+\.\s*/, '').replace(/^["']|["']$/g, '').trim())
                .filter(Boolean);
            if (lines.length > 0) return lines.slice(0, ctx.request.suggestionCount);
        }

        log.warn({ contentLength: content.length }, 'Could not extract suggestions from AI response');
        return null;
    } catch (err) {
        log.error({ err }, 'Unexpected error in generateAiReplies');
        return null;
    }
}

// ============================================================================
// Fallback Templates (when no AI backend is configured)
// ============================================================================

/**
 * Generate template-based reply suggestions as a fallback.
 */
function generateFallbackSuggestions(data: ReplyRequest): string[] {
    const { messageType, sentiment, authorUsername } = data;
    const name = authorUsername ? `@${authorUsername}` : 'there';

    const templates: Record<string, Record<string, string[]>> = {
        positive: {
            comment: [
                'Thank you so much for your kind words! We really appreciate your support!',
                `This made our day! ${name} Thank you for being part of our community!`,
                'So glad you love it! Thanks for sharing your thoughts with us!',
            ],
            review: [
                'Thank you for your wonderful review! We\'re thrilled you had a great experience!',
                'Your kind words mean the world to our team! Thank you!',
                'We\'re so grateful for your review! Customers like you inspire us!',
            ],
            mention: [
                `Thanks for the shoutout ${name}! We're so happy you're enjoying it!`,
                'We\'re thrilled to see this! Thank you for sharing!',
            ],
            dm: [
                `Hey ${name}! Thanks for reaching out! We appreciate your kind message!`,
                'Thank you so much for your message — it means a lot to us!',
            ],
        },
        negative: {
            comment: [
                'We\'re sorry to hear about your experience. Could you DM us so we can help resolve this?',
                'Thank you for letting us know. We\'d love to make this right — please reach out via DM.',
            ],
            review: [
                'We sincerely apologize for your experience. We\'d love the chance to make this right — please reach out to us directly.',
                'Thank you for your honest feedback. We take this seriously and would like to resolve this.',
                'We\'re sorry we fell short of your expectations. Your feedback helps us improve.',
            ],
            mention: [
                'We\'re sorry this happened. Please DM us your details so we can help fix this.',
            ],
            dm: [
                `Hi ${name}, we're really sorry about this experience. Let us look into this right away.`,
                'We apologize for the inconvenience and want to make this right.',
            ],
        },
        neutral: {
            comment: [
                'Thanks for your comment! Let us know if you have any questions.',
                'We appreciate you taking the time to share this!',
            ],
            review: [
                'Thank you for taking the time to share your feedback! We truly value your input.',
                'We appreciate your review! Your feedback helps us continue to improve.',
            ],
            mention: [
                `Thanks for the tag ${name}! We hope you're having a great day!`,
            ],
            dm: [
                `Hi ${name}! Thanks for getting in touch. How can we help you today?`,
            ],
        },
        question: {
            comment: [
                'Great question! Please feel free to DM us for more details.',
                'Thanks for asking! We\'d be happy to help — send us a DM!',
            ],
            review: [
                'Thank you for your review and question! Please reach out to us directly and we\'d be happy to assist.',
            ],
            mention: [
                'Thanks for reaching out with your question! DM us for more info.',
            ],
            dm: [
                `Hi ${name}! Thanks for your question. We'll look into this for you.`,
            ],
        },
    };

    const sentimentKey = sentiment || 'neutral';
    const baseTemplates = templates[sentimentKey]?.[messageType] || templates.neutral[messageType] || templates.neutral.comment;
    return baseTemplates.slice(0, data.suggestionCount);
}

// ============================================================================
// Route Handler
// ============================================================================

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.currentOrganizationId) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 },
            );
        }

        // Rate limit expensive AI calls
        const rateLimitResult = await checkRateLimit(
            `${session.user.id}:ai-reply`, EXPENSIVE_RATE_LIMIT,
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

        let suggestions: string[];

        // Attempt OpenRouter generation
        const aiSettings = await db.globalAISettings.findUnique({
            where: { id: 'global_ai_settings' },
        });

        if (aiSettings?.isConfigured) {
            // Fetch brand voice for the organization
            const brandVoice = await db.brandVoice.findUnique({
                where: { organizationId: session.user.currentOrganizationId },
            });

            const aiSuggestions = await generateAiReplies({
                request: data,
                toneProfile: (brandVoice?.toneProfile as Record<string, unknown>) ?? null,
                guidelines: brandVoice?.guidelines || '',
                apiKey: decrypt(aiSettings.apiKey),
                model: aiSettings.selectedModel || 'openai/gpt-4o-mini',
            });

            if (aiSuggestions && aiSuggestions.length > 0) {
                suggestions = aiSuggestions;
            } else {
                log.warn('AI generation returned empty, falling back to templates');
                suggestions = generateFallbackSuggestions(data);
            }
        } else {
            // No AI configured — use template fallback
            suggestions = generateFallbackSuggestions(data);
        }

        log.debug(
            { messageType: data.messageType, sentiment: data.sentiment, aiUsed: aiSettings?.isConfigured },
            'Generated reply suggestions',
        );

        return NextResponse.json({
            success: true,
            data: {
                suggestions,
                metadata: {
                    sentiment: data.sentiment || 'neutral',
                    tone: data.tone,
                    platform: data.platform,
                    generatedAt: new Date().toISOString(),
                },
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: 'Invalid request', details: error.issues },
                { status: 400 },
            );
        }

        log.error({ err: error }, 'Reply suggestion generation error');
        return NextResponse.json(
            { success: false, error: 'Failed to generate suggestions' },
            { status: 500 },
        );
    }
}
