/**
 * API route for AI YouTube tag generation
 * POST /api/ai/generate-tags
 * 
 * Uses OpenRouter AI system (configured in admin settings)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { createRouteLogger } from '@/lib/logger';

const RequestSchema = z.object({
    title: z.string().min(1).max(100),
    description: z.string().max(5000).optional(),
    category: z.string().optional(),
    existingTags: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
    try {
        // Auth check
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const data = RequestSchema.parse(body);

        // Get global AI settings (super admin configured)
        const aiSettings = await db.globalAISettings.findUnique({
            where: { id: 'global_ai_settings' },
        });

        if (!aiSettings?.isConfigured) {
            // Fallback to mock response if no API key configured
            return generateMockTags(data);
        }

        // Decrypt the API key
        let apiKey: string;
        try {
            apiKey = decrypt(aiSettings.apiKey);
        } catch {
            createRouteLogger('API', '/api/ai/generate-tags').error('Failed to decrypt AI API key');
            return generateMockTags(data);
        }

        const prompt = buildPrompt(data);
        const model = aiSettings.selectedModel || 'openai/gpt-4o-mini';

        // Call OpenRouter API
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
                    {
                        role: 'system',
                        content: `You are a YouTube SEO expert. Generate relevant, searchable tags for YouTube videos. 
                    
Rules:
- Return 10-15 highly relevant tags
- Include a mix of broad and specific tags
- Focus on searchability and discoverability
- Tags should be lowercase
- Each tag should be 1-3 words max
- Include trending variations where applicable
- Avoid generic tags that won't help discoverability
- Return ONLY a JSON array of strings, no explanation`,
                    },
                    {
                        role: 'user',
                        content: prompt,
                    },
                ],
                temperature: 0.7,
                max_tokens: 1000,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            createRouteLogger('API', '/api/ai/generate-tags').error({ details: [response.status, errorText] }, 'OpenRouter API error');
            return generateMockTags(data);
        }

        const result = await response.json();
        const responseText = result.choices?.[0]?.message?.content || '[]';

        // Parse the JSON response
        let tags: string[];
        try {
            // Clean the response - sometimes AI includes markdown
            const cleanedResponse = responseText
                .replace(/```json\n?/g, '')
                .replace(/```\n?/g, '')
                .trim();
            tags = JSON.parse(cleanedResponse);

            // Ensure all tags are strings and valid
            tags = tags
                .filter((tag): tag is string => typeof tag === 'string')
                .map(tag => tag.toLowerCase().trim())
                .filter(tag => tag.length > 0 && tag.length <= 30);
        } catch {
            createRouteLogger('API', '/api/ai/generate-tags').error({ err: responseText }, 'Failed to parse AI tag response');
            return generateMockTags(data);
        }

        // Filter out existing tags
        if (data.existingTags?.length) {
            tags = tags.filter(tag => !data.existingTags!.includes(tag.toLowerCase()));
        }

        return NextResponse.json({
            success: true,
            data: {
                tags: tags.slice(0, 15),
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { success: false, error: 'Invalid request', details: error.issues },
                { status: 400 }
            );
        }

        createRouteLogger('API', '/api/ai/generate-tags').error({ err: error }, 'Tag generation error');
        return NextResponse.json(
            { success: false, error: 'Failed to generate tags' },
            { status: 500 }
        );
    }
}

function buildPrompt(data: z.infer<typeof RequestSchema>): string {
    let prompt = `Generate YouTube tags for this video:\n\nTitle: ${data.title}`;

    if (data.description) {
        prompt += `\n\nDescription: ${data.description.slice(0, 500)}`;
    }

    if (data.category) {
        const categoryNames: Record<string, string> = {
            '1': 'Film & Animation',
            '2': 'Autos & Vehicles',
            '10': 'Music',
            '15': 'Pets & Animals',
            '17': 'Sports',
            '19': 'Travel & Events',
            '20': 'Gaming',
            '22': 'People & Blogs',
            '23': 'Comedy',
            '24': 'Entertainment',
            '25': 'News & Politics',
            '26': 'Howto & Style',
            '27': 'Education',
            '28': 'Science & Technology',
            '29': 'Nonprofits & Activism',
        };
        prompt += `\n\nCategory: ${categoryNames[data.category] || data.category}`;
    }

    if (data.existingTags?.length) {
        prompt += `\n\nExisting tags (don't repeat these): ${data.existingTags.join(', ')}`;
    }

    return prompt;
}

function generateMockTags(data: z.infer<typeof RequestSchema>): NextResponse {
    // Extract keywords from title
    const titleWords = data.title.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2);

    // Base tags from title
    const baseTags = titleWords.slice(0, 5);

    // Add common YouTube tags based on category
    const categoryTags: Record<string, string[]> = {
        '20': ['gaming', 'gameplay', 'gamer', 'lets play', 'gaming video'],
        '10': ['music', 'song', 'official', 'audio', 'music video'],
        '27': ['tutorial', 'how to', 'learn', 'tips', 'education'],
        '26': ['howto', 'diy', 'tips', 'style', 'fashion'],
        '28': ['tech', 'technology', 'review', 'science', 'gadgets'],
        '24': ['entertainment', 'funny', 'comedy', 'viral', 'trending'],
    };

    const catTags = data.category ? (categoryTags[data.category] || []) : [];

    // Combine and deduplicate
    const allTags = [...new Set([
        ...baseTags,
        ...catTags,
        'youtube',
        '2026',
        'new',
        'video',
    ])].filter(tag => !data.existingTags?.includes(tag));

    return NextResponse.json({
        success: true,
        data: {
            tags: allTags.slice(0, 12),
        },
    });
}
