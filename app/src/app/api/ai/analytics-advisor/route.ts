/**
 * AI Analytics Advisor API Route
 * POST /api/ai/analytics-advisor
 *
 * Why: Sends aggregated analytics metrics to OpenRouter and returns a
 * structured narrative summary with headline, bullets, and recommendations.
 * Falls back gracefully when AI is not configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { createRouteLogger } from '@/lib/logger';
import { parseJsonBody } from '@/lib/parse-json-body';
import { checkRateLimit, EXPENSIVE_RATE_LIMIT, createRateLimitHeaders } from '@/lib/rate-limit';
import {
    buildAdvisorPrompt,
    getAdvisorSystemPrompt,
    type AdvisorResponse,
} from '@/lib/ai/analytics-advisor-prompt';

const log = createRouteLogger('API', '/api/ai/analytics-advisor');

const RequestSchema = z.object({
    totalLikes: z.number(),
    totalComments: z.number(),
    totalShares: z.number(),
    totalSaves: z.number(),
    totalReach: z.number(),
    totalImpressions: z.number(),
    likesChange: z.number(),
    commentsChange: z.number(),
    sharesChange: z.number(),
    reachChange: z.number(),
    impressionsChange: z.number(),
    savesChange: z.number(),
    avgEngagementRate: z.number(),
    totalFollowers: z.number(),
    totalFollowerChange: z.number(),
    accounts: z.array(z.object({
        platform: z.string(),
        name: z.string(),
        currentFollowers: z.number(),
        followerChange: z.number(),
    })),
    contentTypes: z.array(z.object({
        postType: z.string(),
        count: z.number(),
        avgEngagement: z.number(),
    })),
    totalPosts: z.number(),
    postsChange: z.number(),
    rangeLabel: z.string(),
});

/**
 * POST handler — generates an AI advisor summary from analytics metrics.
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id || !session.user.currentOrganizationId) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 },
            );
        }

        const rateLimitResult = await checkRateLimit(
            `${session.user.id}:ai-advisor`, EXPENSIVE_RATE_LIMIT,
        );
        if (!rateLimitResult.allowed) {
            return NextResponse.json(
                { success: false, error: 'Rate limit exceeded. Please try again later.' },
                { status: 429, headers: createRateLimitHeaders(rateLimitResult) },
            );
        }

        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;
        const metrics = RequestSchema.parse(body);

        // Check if AI is configured
        const aiSettings = await db.globalAISettings.findUnique({
            where: { id: 'global_ai_settings' },
        });

        if (!aiSettings?.isConfigured) {
            return NextResponse.json({
                success: true,
                data: null,
                fallback: true,
            });
        }

        const apiKey = decrypt(aiSettings.apiKey);
        const model = aiSettings.selectedModel || 'openai/gpt-4o-mini';
        const userPrompt = buildAdvisorPrompt(metrics);

        log.debug({ model }, 'Calling OpenRouter for analytics advisor');

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': process.env.APP_URL || 'https://socialiseit.app',
                'X-Title': 'SocialiseIT Analytics Advisor',
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: getAdvisorSystemPrompt() },
                    { role: 'user', content: userPrompt },
                ],
                temperature: 0.4,
                max_tokens: 800,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            log.error({ status: response.status, error: errorText }, 'OpenRouter API error');
            return NextResponse.json({
                success: true,
                data: null,
                fallback: true,
            });
        }

        const result = await response.json();
        const content = result.choices?.[0]?.message?.content;

        if (!content) {
            log.warn('OpenRouter returned empty content');
            return NextResponse.json({
                success: true,
                data: null,
                fallback: true,
            });
        }

        // Parse the JSON response from the LLM
        const parsed = parseAdvisorJson(content);
        if (!parsed) {
            log.warn({ content: content.slice(0, 300) }, 'Failed to parse advisor JSON');
            return NextResponse.json({
                success: true,
                data: null,
                fallback: true,
            });
        }

        return NextResponse.json({
            success: true,
            data: parsed,
            fallback: false,
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: 'Invalid request', details: error.issues },
                { status: 400 },
            );
        }

        log.error({ err: error }, 'Analytics advisor generation error');
        return NextResponse.json(
            { success: false, error: 'Failed to generate advisor summary' },
            { status: 500 },
        );
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Safely parse the LLM's JSON response, handling markdown fences.
 * Why: Some models wrap JSON in ```json ... ``` even when told not to.
 */
function parseAdvisorJson(raw: string): AdvisorResponse | null {
    try {
        let cleaned = raw.trim();
        // Strip markdown code fences if present
        if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
        }
        const obj = JSON.parse(cleaned);

        if (
            typeof obj.headline === 'string' &&
            typeof obj.summary === 'string' &&
            Array.isArray(obj.bullets) &&
            Array.isArray(obj.recommendations)
        ) {
            return obj as AdvisorResponse;
        }
        return null;
    } catch {
        return null;
    }
}
