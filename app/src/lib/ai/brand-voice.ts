/**
 * Brand voice analysis helpers
 * Extracts tone and vocabulary characteristics from content samples
 */

// Types
export interface BrandVoiceProfile {
    id: string;
    organizationId: string;
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
