/**
 * Cross-Post Variations Service
 * Platform-specific caption and media variations
 */

export interface PostVariation {
    id: string;
    postId: string;
    platform: string;
    caption: string;
    hashtags: string[];
    mentions: string[];
    mediaIds: string[];
    linkUrl?: string;
    ctaText?: string;
    isCustomized: boolean;
    aiSuggestions?: {
        caption: string;
        hashtags: string[];
        reasoning: string;
    };
}

export interface VariationConfig {
    autoGenerate: boolean;
    preserveHashtags: boolean;
    adaptLength: boolean;
    platformTone: boolean;
}

// Platform character limits and best practices
export const PLATFORM_SPECS: Record<string, {
    maxCaption: number;
    maxHashtags: number;
    hashtagPosition: 'inline' | 'end' | 'first-comment';
    linkBehavior: 'embed' | 'bio' | 'shortened';
    tone: string;
    emojiDensity: 'low' | 'medium' | 'high';
}> = {
    instagram: {
        maxCaption: 2200,
        maxHashtags: 30,
        hashtagPosition: 'end',
        linkBehavior: 'bio',
        tone: 'casual, visual-focused',
        emojiDensity: 'high',
    },
    tiktok: {
        maxCaption: 2200,
        maxHashtags: 5,
        hashtagPosition: 'inline',
        linkBehavior: 'bio',
        tone: 'trendy, authentic, fun',
        emojiDensity: 'medium',
    },
    facebook: {
        maxCaption: 63206,
        maxHashtags: 3,
        hashtagPosition: 'end',
        linkBehavior: 'embed',
        tone: 'conversational, community',
        emojiDensity: 'low',
    },
    youtube: {
        maxCaption: 5000,
        maxHashtags: 15,
        hashtagPosition: 'end',
        linkBehavior: 'embed',
        tone: 'informative, engaging',
        emojiDensity: 'medium',
    },
    pinterest: {
        maxCaption: 500,
        maxHashtags: 20,
        hashtagPosition: 'end',
        linkBehavior: 'embed',
        tone: 'inspiring, descriptive',
        emojiDensity: 'low',
    },
};

/**
 * Generate platform-specific variations from base post
 */
export async function generateVariations(
    baseCaption: string,
    baseHashtags: string[],
    targetPlatforms: string[],
    config: VariationConfig
): Promise<PostVariation[]> {
    const variations: PostVariation[] = [];

    for (const platform of targetPlatforms) {
        const specs = PLATFORM_SPECS[platform];
        if (!specs) continue;

        let adaptedCaption = baseCaption;
        let adaptedHashtags = [...baseHashtags];

        if (config.adaptLength && adaptedCaption.length > specs.maxCaption) {
            // Truncate and add ellipsis
            adaptedCaption = adaptedCaption.slice(0, specs.maxCaption - 20) + '... [continued]';
        }

        if (specs.maxHashtags < adaptedHashtags.length) {
            // Keep most relevant hashtags
            adaptedHashtags = adaptedHashtags.slice(0, specs.maxHashtags);
        }

        // Platform-specific adjustments
        if (platform === 'tiktok') {
            // TikTok: shorter, trendier
            if (adaptedCaption.length > 150) {
                adaptedCaption = adaptedCaption.slice(0, 150) + '...';
            }
            // Add trending hashtags
            if (!adaptedHashtags.includes('#fyp')) {
                adaptedHashtags.push('#fyp');
            }
        } else if (platform === 'facebook') {
            // Facebook: more conversational, fewer hashtags
            adaptedHashtags = adaptedHashtags.slice(0, 3);
            // Remove "link in bio" since FB supports links
            adaptedCaption = adaptedCaption.replace(/link in bio/gi, '');
        } else if (platform === 'pinterest') {
            // Pinterest: descriptive, keyword-rich
            if (adaptedCaption.length < 100) {
                adaptedCaption = `${adaptedCaption}\n\nTap to learn more! 📌`;
            }
        }

        // Format hashtags based on position
        let finalCaption = adaptedCaption;
        const hashtagString = adaptedHashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ');

        if (specs.hashtagPosition === 'end' && adaptedHashtags.length > 0) {
            finalCaption = `${adaptedCaption}\n\n${hashtagString}`;
        } else if (specs.hashtagPosition === 'inline') {
            // Keep hashtags where they are or append
            if (!adaptedCaption.includes('#')) {
                finalCaption = `${adaptedCaption} ${hashtagString}`;
            }
        }

        variations.push({
            id: `var_${platform}_${Date.now()}`,
            postId: '',
            platform,
            caption: finalCaption,
            hashtags: adaptedHashtags,
            mentions: extractMentions(adaptedCaption),
            mediaIds: [],
            isCustomized: false,
            aiSuggestions: {
                caption: finalCaption,
                hashtags: adaptedHashtags,
                reasoning: `Adapted for ${platform}: ${specs.tone}`,
            },
        });
    }

    return variations;
}

/**
 * Get AI-powered variation suggestions
 */
export async function getAISuggestions(
    caption: string,
    platform: string,
    brandVoice?: string
): Promise<{
    variations: string[];
    reasoning: string[];
}> {
    // In production, call AI API
    const specs = PLATFORM_SPECS[platform];

    // Mock suggestions
    return {
        variations: [
            caption, // Original
            `${caption.slice(0, 100)}... ✨`, // Shortened with emoji
            caption.replace(/!/g, '..').toLowerCase(), // More casual
        ],
        reasoning: [
            'Original caption',
            `Shortened for ${platform}'s fast-scroll behavior`,
            `Adjusted tone to match ${platform}'s casual style`,
        ],
    };
}

/**
 * Validate variation against platform rules
 */
export function validateVariation(variation: PostVariation): {
    valid: boolean;
    errors: string[];
    warnings: string[];
} {
    const specs = PLATFORM_SPECS[variation.platform];
    if (!specs) {
        return { valid: false, errors: ['Unknown platform'], warnings: [] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check caption length
    if (variation.caption.length > specs.maxCaption) {
        errors.push(`Caption exceeds ${specs.maxCaption} character limit`);
    }

    // Check hashtag count
    if (variation.hashtags.length > specs.maxHashtags) {
        warnings.push(`${variation.hashtags.length} hashtags exceeds recommended ${specs.maxHashtags}`);
    }

    // Check for platform-specific issues
    if (variation.platform === 'instagram' && variation.caption.includes('http')) {
        warnings.push('Links in Instagram captions are not clickable');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

/**
 * Copy variation settings across platforms
 */
export function copyVariation(
    source: PostVariation,
    targetPlatform: string
): PostVariation {
    const specs = PLATFORM_SPECS[targetPlatform];

    return {
        ...source,
        id: `var_${targetPlatform}_${Date.now()}`,
        platform: targetPlatform,
        hashtags: source.hashtags.slice(0, specs?.maxHashtags || 10),
        isCustomized: false,
    };
}

// Utility functions

function extractMentions(text: string): string[] {
    const mentions = text.match(/@\w+/g) || [];
    return [...new Set(mentions)];
}

/**
 * Compare variations for A/B testing
 */
export interface VariationPerformance {
    variationId: string;
    platform: string;
    reach: number;
    engagement: number;
    clicks: number;
    conversions: number;
}

export async function compareVariationPerformance(
    postId: string
): Promise<VariationPerformance[]> {
    // Mock data
    return [
        { variationId: 'var_1', platform: 'instagram', reach: 12500, engagement: 5.2, clicks: 234, conversions: 12 },
        { variationId: 'var_2', platform: 'tiktok', reach: 45000, engagement: 7.8, clicks: 890, conversions: 34 },
        { variationId: 'var_3', platform: 'facebook', reach: 8900, engagement: 3.1, clicks: 156, conversions: 8 },
    ];
}
