/**
 * AI Alt Text Generation API
 * POST /api/ai/generate-alt-text
 * 
 * Why: Vista Social and Buffer auto-generate alt text for accessibility/SEO.
 * Uses OpenRouter with a vision-capable model to describe image content.
 * Falls back to a generic description if AI is not configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { createRouteLogger } from '@/lib/logger';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const log = createRouteLogger('API', '/api/ai/generate-alt-text');

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 },
            );
        }

        const body = await request.json();
        const { mediaId, imageUrl, context } = body as {
            mediaId?: string;
            imageUrl?: string;
            /** Optional context about the post (caption, brand, etc.) */
            context?: string;
        };

        if (!mediaId && !imageUrl) {
            return NextResponse.json(
                { success: false, error: 'mediaId or imageUrl is required' },
                { status: 400 },
            );
        }

        // Resolve image URL from media ID if provided
        let resolvedUrl = imageUrl;
        if (mediaId) {
            const media = await db.media.findFirst({
                where: {
                    id: mediaId,
                    organizationId: session.user.currentOrganizationId,
                },
            });
            if (!media) {
                return NextResponse.json(
                    { success: false, error: 'Media not found' },
                    { status: 404 },
                );
            }
            resolvedUrl = media.url;
        }

        // Get AI settings
        const aiSettings = await db.globalAISettings.findUnique({
            where: { id: 'global_ai_settings' },
        });

        if (!aiSettings?.isConfigured) {
            return generateGenericAltText(resolvedUrl);
        }

        let apiKey: string;
        try {
            apiKey = decrypt(aiSettings.apiKey);
        } catch {
            log.error('Failed to decrypt AI API key');
            return generateGenericAltText(resolvedUrl);
        }

        // Try to get the image as base64 for vision models
        let imageBase64: string | null = null;
        let imageMimeType = 'image/jpeg';
        if (resolvedUrl) {
            const base64Result = await getImageBase64(resolvedUrl);
            if (base64Result) {
                imageBase64 = base64Result.base64;
                imageMimeType = base64Result.mimeType;
            }
        }

        // Use a vision-capable model for image description
        // Why: gpt-4o-mini supports vision and is cost-effective for alt text
        const model = aiSettings.selectedModel || 'openai/gpt-4o-mini';

        // Build messages — use image content if available, otherwise describe URL
        const messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }> = [];

        messages.push({
            role: 'system',
            content: `You are an accessibility expert generating alt text for social media images.

Rules:
- Write a concise, descriptive alt text (1-2 sentences, max 125 characters)
- Describe what's visually shown in the image
- Be specific: mention colors, objects, actions, text visible in image
- Don't start with "Image of" or "Photo of" — screen readers already announce it's an image
- Don't include brand names unless they're visually prominent
- If there's text in the image, include it
- Return ONLY the alt text string, no quotes or explanation`,
        });

        if (imageBase64) {
            messages.push({
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${imageMimeType};base64,${imageBase64}`,
                        },
                    },
                    {
                        type: 'text',
                        text: context
                            ? `Generate alt text for this image. Post context: "${context}"`
                            : 'Generate alt text for this image.',
                    },
                ],
            });
        } else {
            messages.push({
                role: 'user',
                content: context
                    ? `Generate a generic, accessible alt text for a social media image. Post context: "${context}". Return only the alt text.`
                    : 'Generate a generic, accessible alt text for a social media image. Return only the alt text.',
            });
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
                messages,
                temperature: 0.3, // Low temp for factual descriptions
                max_tokens: 200,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            log.error({ status: response.status, error: errorText }, 'OpenRouter API error');
            return generateGenericAltText(resolvedUrl);
        }

        const result = await response.json();
        let altText = result.choices?.[0]?.message?.content?.trim() || '';

        // Clean up: remove surrounding quotes if AI added them
        altText = altText.replace(/^["']|["']$/g, '');

        // Truncate to 125 chars (platform limit for most social media)
        if (altText.length > 125) {
            altText = altText.substring(0, 122) + '...';
        }

        // Optionally update the media record's alt text
        if (mediaId && altText) {
            try {
                await db.media.update({
                    where: { id: mediaId },
                    data: { altText },
                });
            } catch {
                // Non-critical — don't fail the response
                log.warn({ mediaId }, 'Failed to save alt text to media record');
            }
        }

        return NextResponse.json({
            success: true,
            data: { altText },
        });
    } catch (error) {
        log.error({ err: error }, 'Alt text generation failed');
        return NextResponse.json(
            { success: false, error: 'Failed to generate alt text' },
            { status: 500 },
        );
    }
}

/**
 * Read a local image file as base64 for vision model input.
 */
async function getImageBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
    try {
        if (!url.includes('/uploads/')) return null;

        const pathname = url.includes('/uploads/')
            ? url.substring(url.indexOf('/uploads/'))
            : url;
        // Remove leading slash and prefix with public dir
        const filePath = path.join(process.cwd(), 'public', pathname.replace(/^\//, ''));

        if (!existsSync(filePath)) return null;

        const buffer = await readFile(filePath);
        const ext = path.extname(filePath).toLowerCase();
        const mimeMap: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.webp': 'image/webp',
            '.gif': 'image/gif',
        };

        return {
            base64: buffer.toString('base64'),
            mimeType: mimeMap[ext] || 'image/jpeg',
        };
    } catch {
        return null;
    }
}

/**
 * Fallback when AI is not configured — returns a generic alt text.
 */
function generateGenericAltText(imageUrl?: string | null) {
    const altText = 'Social media image shared by the creator';
    return NextResponse.json({
        success: true,
        data: { altText, isGeneric: true },
    });
}
