/**
 * Brand Voice AI Service
 * Learns from content samples to generate on-brand captions
 */

import { z } from 'zod';

// Types
export interface BrandVoiceProfile {
    id: string;
    workspaceId: string;
    samples: string[];
    toneProfile: ToneProfile;
    guidelines: string;
    vocabulary: VocabularyProfile;
    updatedAt: Date;
}

export interface ToneProfile {
    formality: number;      // 0 (casual) to 1 (formal)
    enthusiasm: number;     // 0 (reserved) to 1 (excited)
    humor: number;          // 0 (serious) to 1 (playful)
    directness: number;     // 0 (indirect) to 1 (direct)
    emotion: number;        // 0 (neutral) to 1 (emotional)
}

export interface VocabularyProfile {
    commonPhrases: string[];
    avoidWords: string[];
    emojiStyle: 'none' | 'minimal' | 'moderate' | 'heavy';
    hashtagStyle: 'none' | 'minimal' | 'moderate' | 'heavy';
    ctaStyle: 'soft' | 'direct' | 'urgent';
}

export interface GenerationRequest {
    prompt: string;
    platform: 'instagram' | 'tiktok' | 'youtube' | 'facebook';
    contentType: 'product' | 'educational' | 'behind-the-scenes' | 'promotional' | 'engagement';
    tone?: Partial<ToneProfile>;
    maxLength?: number;
    includeHashtags?: boolean;
    includeCTA?: boolean;
}

export interface GenerationResult {
    caption: string;
    hashtags: string[];
    viralityScore: number;
    brandVoiceScore: number;
    suggestions: string[];
    alternatives: string[];
}

// Validation schemas
export const GenerationRequestSchema = z.object({
    prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
    platform: z.enum(['instagram', 'tiktok', 'youtube', 'facebook']),
    contentType: z.enum(['product', 'educational', 'behind-the-scenes', 'promotional', 'engagement']),
    tone: z.object({
        formality: z.number().min(0).max(1).optional(),
        enthusiasm: z.number().min(0).max(1).optional(),
        humor: z.number().min(0).max(1).optional(),
        directness: z.number().min(0).max(1).optional(),
        emotion: z.number().min(0).max(1).optional(),
    }).optional(),
    maxLength: z.number().min(50).max(2200).optional(),
    includeHashtags: z.boolean().optional(),
    includeCTA: z.boolean().optional(),
});

/**
 * Analyze content samples to extract brand voice profile
 */
export function analyzeBrandVoice(samples: string[]): ToneProfile {
    // In production, this would use NLP/ML to analyze the samples
    // For now, return a sensible default based on sample characteristics

    const avgLength = samples.reduce((sum, s) => sum + s.length, 0) / samples.length || 100;
    const emojiCount = samples.reduce((sum, s) => sum + (s.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length, 0);
    const exclamationCount = samples.reduce((sum, s) => sum + (s.match(/!/g) || []).length, 0);
    const questionCount = samples.reduce((sum, s) => sum + (s.match(/\?/g) || []).length, 0);

    return {
        formality: avgLength > 200 ? 0.7 : 0.4,
        enthusiasm: Math.min(1, exclamationCount / samples.length * 0.3),
        humor: emojiCount > samples.length * 2 ? 0.6 : 0.3,
        directness: questionCount > samples.length ? 0.4 : 0.7,
        emotion: emojiCount > samples.length ? 0.6 : 0.4,
    };
}

/**
 * Extract common vocabulary patterns from samples
 */
export function extractVocabulary(samples: string[]): VocabularyProfile {
    // Count phrases, emojis, hashtags
    const allText = samples.join(' ');
    const emojiMatches = allText.match(/[\u{1F600}-\u{1F64F}]/gu) || [];
    const hashtagMatches = allText.match(/#\w+/g) || [];

    // Determine emoji style
    let emojiStyle: VocabularyProfile['emojiStyle'] = 'none';
    const emojiRatio = emojiMatches.length / samples.length;
    if (emojiRatio > 3) emojiStyle = 'heavy';
    else if (emojiRatio > 1) emojiStyle = 'moderate';
    else if (emojiRatio > 0) emojiStyle = 'minimal';

    // Determine hashtag style
    let hashtagStyle: VocabularyProfile['hashtagStyle'] = 'none';
    const hashtagRatio = hashtagMatches.length / samples.length;
    if (hashtagRatio > 10) hashtagStyle = 'heavy';
    else if (hashtagRatio > 5) hashtagStyle = 'moderate';
    else if (hashtagRatio > 0) hashtagStyle = 'minimal';

    return {
        commonPhrases: extractCommonPhrases(samples),
        avoidWords: [], // Would be configured by user
        emojiStyle,
        hashtagStyle,
        ctaStyle: 'soft',
    };
}

/**
 * Extract commonly used phrases from samples
 */
function extractCommonPhrases(samples: string[]): string[] {
    // Simple n-gram extraction - in production would use NLP
    const phrases = new Map<string, number>();

    samples.forEach(sample => {
        const words = sample.toLowerCase().split(/\s+/);
        for (let i = 0; i < words.length - 2; i++) {
            const trigram = words.slice(i, i + 3).join(' ');
            if (trigram.length > 10) {
                phrases.set(trigram, (phrases.get(trigram) || 0) + 1);
            }
        }
    });

    return Array.from(phrases.entries())
        .filter(([_, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([phrase]) => phrase);
}

/**
 * Generate AI caption (mock implementation)
 * In production, this would call OpenAI/Anthropic API
 */
export async function generateCaption(
    request: GenerationRequest,
    brandVoice: BrandVoiceProfile
): Promise<GenerationResult> {
    // Validate request
    GenerationRequestSchema.parse(request);

    // In production, this would:
    // 1. Build a prompt with brand voice context
    // 2. Call AI API (OpenAI, Anthropic, etc.)
    // 3. Parse and validate the response
    // 4. Calculate scores

    // Mock response for demo
    const platformLimits = {
        instagram: 2200,
        tiktok: 2200,
        youtube: 5000,
        facebook: 63206,
    };

    const mockCaptions: Record<string, string> = {
        product: `✨ New drop alert! ${request.prompt}\n\nWe've been working on something special and it's finally here. Trust us, you don't want to miss this one.\n\nTap the link in bio to shop now! 🛍️`,
        educational: `💡 Did you know?\n\n${request.prompt}\n\nSave this post for later and share with someone who needs to see this! 📚`,
        'behind-the-scenes': `Take a peek behind the curtain 👀\n\n${request.prompt}\n\nThis is what it really takes to make the magic happen ✨`,
        promotional: `🔥 SPECIAL OFFER 🔥\n\n${request.prompt}\n\nDon't miss out - this won't last long!\n\n👉 Link in bio to claim yours`,
        engagement: `We want to hear from you! 💬\n\n${request.prompt}\n\nDrop your answer in the comments below 👇`,
    };

    const baseCaption = mockCaptions[request.contentType] || mockCaptions.product;

    const hashtags = request.includeHashtags
        ? ['#newpost', '#trending', '#viral', '#fyp', '#explore']
        : [];

    return {
        caption: baseCaption.slice(0, request.maxLength || platformLimits[request.platform]),
        hashtags,
        viralityScore: Math.random() * 0.3 + 0.6, // 60-90%
        brandVoiceScore: Math.random() * 0.2 + 0.8, // 80-100%
        suggestions: [
            'Consider adding a question to boost engagement',
            'Optimal posting time: 7:30 PM today',
        ],
        alternatives: [
            'Alternative caption 1...',
            'Alternative caption 2...',
        ],
    };
}

/**
 * Calculate optimal posting times based on historical data
 */
export function getOptimalPostingTimes(
    platform: string,
    timezone: string = 'UTC'
): { time: string; score: number; reason: string }[] {
    // In production, this would analyze historical engagement data
    // Mock data for demo
    const slots = [
        { time: '7:30 PM', score: 0.95, reason: 'Peak engagement based on your audience' },
        { time: '12:00 PM', score: 0.82, reason: 'Lunch break browsing surge' },
        { time: '9:00 AM', score: 0.78, reason: 'Morning commute engagement' },
        { time: '6:00 PM', score: 0.75, reason: 'Post-work relaxation time' },
    ];

    return slots;
}

/**
 * Predict virality score for content
 */
export function predictViralityScore(
    caption: string,
    media: { type: string; duration?: number }[],
    platform: string
): { score: number; factors: { factor: string; impact: number }[] } {
    // Mock implementation - would use ML model in production
    let baseScore = 0.5;
    const factors: { factor: string; impact: number }[] = [];

    // Caption length analysis
    if (caption.length >= 100 && caption.length <= 200) {
        baseScore += 0.1;
        factors.push({ factor: 'Optimal caption length', impact: 0.1 });
    }

    // Question engagement
    if (caption.includes('?')) {
        baseScore += 0.08;
        factors.push({ factor: 'Includes question (drives comments)', impact: 0.08 });
    }

    // CTA presence
    if (caption.toLowerCase().includes('link in bio') || caption.toLowerCase().includes('tap')) {
        baseScore += 0.05;
        factors.push({ factor: 'Clear call-to-action', impact: 0.05 });
    }

    // Video content boost
    if (media.some(m => m.type === 'video')) {
        baseScore += 0.12;
        factors.push({ factor: 'Video content (higher reach)', impact: 0.12 });
    }

    // Emoji engagement
    const emojiCount = (caption.match(/[\u{1F600}-\u{1F64F}]/gu) || []).length;
    if (emojiCount >= 2 && emojiCount <= 5) {
        baseScore += 0.05;
        factors.push({ factor: 'Optimal emoji usage', impact: 0.05 });
    }

    return {
        score: Math.min(1, baseScore),
        factors,
    };
}
