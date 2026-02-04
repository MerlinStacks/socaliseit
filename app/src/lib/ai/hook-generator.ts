/**
 * Hook Generator Service
 * AI-powered opening hooks for short-form content.
 * 
 * Why: The first 3 seconds determine if viewers keep watching.
 * Platform-specific hooks increase retention significantly.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface HookStyle {
    id: string;
    name: string;
    description: string;
    platforms: string[];
    templates: string[];
}

export interface GeneratedHook {
    id: string;
    text: string;
    style: string;
    platform: string;
    characterCount: number;
}

export interface HookGeneratorConfig {
    topic: string;
    platform: 'tiktok' | 'instagram' | 'youtube' | 'twitter';
    style?: string;
    numHooks?: number;
}

// ============================================================================
// HOOK STYLES
// ============================================================================

export const HOOK_STYLES: HookStyle[] = [
    {
        id: 'question',
        name: 'Question',
        description: 'Opens with an intriguing question',
        platforms: ['tiktok', 'instagram', 'youtube'],
        templates: [
            'Did you know {topic}?',
            'What if I told you {fact}?',
            'Ever wondered why {observation}?',
            'Want to know the secret to {goal}?',
            'Why does everyone {common_mistake}?',
        ],
    },
    {
        id: 'shock',
        name: 'Shock/Controversy',
        description: 'Starts with a surprising statement',
        platforms: ['tiktok', 'twitter'],
        templates: [
            'Stop doing {bad_habit} right now.',
            'Nobody talks about this but...',
            'This changed everything for me.',
            'I was doing it wrong for years.',
            'They dont want you to know this.',
        ],
    },
    {
        id: 'promise',
        name: 'Promise/Result',
        description: 'Leads with the outcome',
        platforms: ['youtube', 'instagram'],
        templates: [
            'Here\'s how I {achievement} in {timeframe}.',
            'This simple trick {benefit}.',
            'The exact method I used to {result}.',
            'In 60 seconds, you\'ll know how to {skill}.',
            'By the end of this, you\'ll {transformation}.',
        ],
    },
    {
        id: 'story',
        name: 'Story Hook',
        description: 'Opens with a mini narrative',
        platforms: ['tiktok', 'instagram', 'youtube'],
        templates: [
            'So I tried {experiment} and...',
            'Three months ago, I couldn\'t {skill}.',
            'This morning I discovered something crazy.',
            'A {person} told me this and I couldn\'t believe it.',
            'I spent {time} figuring this out so you don\'t have to.',
        ],
    },
    {
        id: 'direct',
        name: 'Direct Address',
        description: 'Speaks directly to viewer need',
        platforms: ['youtube', 'twitter'],
        templates: [
            'If you\'re struggling with {problem}, watch this.',
            'This is for everyone who {situation}.',
            'You need to see this if {condition}.',
            'Calling all {audience} who want to {goal}.',
            'Here\'s exactly what you need to know about {topic}.',
        ],
    },
];

// ============================================================================
// PLATFORM PREFERENCES
// ============================================================================

interface PlatformPreferences {
    maxLength: number;
    preferredStyles: string[];
    tone: string;
}

const PLATFORM_PREFERENCES: Record<string, PlatformPreferences> = {
    tiktok: {
        maxLength: 100,
        preferredStyles: ['shock', 'question', 'story'],
        tone: 'casual, energetic, slightly controversial',
    },
    instagram: {
        maxLength: 125,
        preferredStyles: ['promise', 'story', 'question'],
        tone: 'aspirational, aesthetic, relatable',
    },
    youtube: {
        maxLength: 150,
        preferredStyles: ['promise', 'direct', 'question'],
        tone: 'informative, trustworthy, value-focused',
    },
    twitter: {
        maxLength: 100,
        preferredStyles: ['shock', 'direct', 'question'],
        tone: 'punchy, provocative, conversation-starting',
    },
};

// ============================================================================
// HOOK GENERATION
// ============================================================================

/**
 * Generate hooks using templates (fallback when AI unavailable).
 */
export function generateTemplateHooks(
    config: HookGeneratorConfig
): GeneratedHook[] {
    const platform = PLATFORM_PREFERENCES[config.platform];
    const preferredStyles = config.style
        ? [config.style]
        : platform.preferredStyles;

    const hooks: GeneratedHook[] = [];
    const numHooks = config.numHooks || 5;

    for (const styleId of preferredStyles) {
        const style = HOOK_STYLES.find(s => s.id === styleId);
        if (!style) continue;

        for (const template of style.templates) {
            if (hooks.length >= numHooks) break;

            // Simple template filling
            let text = template
                .replace('{topic}', config.topic)
                .replace('{fact}', `${config.topic} isn't what you think`)
                .replace('{observation}', `${config.topic} works this way`)
                .replace('{goal}', `mastering ${config.topic}`)
                .replace('{common_mistake}', `get ${config.topic} wrong`)
                .replace('{bad_habit}', `ignoring ${config.topic}`)
                .replace('{benefit}', `will change your ${config.topic}`)
                .replace('{achievement}', `mastered ${config.topic}`)
                .replace('{timeframe}', '30 days')
                .replace('{result}', `improve my ${config.topic}`)
                .replace('{skill}', config.topic)
                .replace('{transformation}', `understand ${config.topic}`)
                .replace('{experiment}', config.topic)
                .replace('{person}', 'expert')
                .replace('{time}', '100 hours')
                .replace('{problem}', config.topic)
                .replace('{situation}', `wants to learn ${config.topic}`)
                .replace('{condition}', `you care about ${config.topic}`)
                .replace('{audience}', 'creators');

            // Truncate if too long
            if (text.length > platform.maxLength) {
                text = text.substring(0, platform.maxLength - 3) + '...';
            }

            hooks.push({
                id: `hook-${hooks.length}`,
                text,
                style: styleId,
                platform: config.platform,
                characterCount: text.length,
            });
        }

        if (hooks.length >= numHooks) break;
    }

    return hooks.slice(0, numHooks);
}

/**
 * Build AI prompt for hook generation.
 */
export function buildHookPrompt(config: HookGeneratorConfig): string {
    const platform = PLATFORM_PREFERENCES[config.platform];
    const styleInfo = config.style
        ? HOOK_STYLES.find(s => s.id === config.style)
        : null;

    return `Generate ${config.numHooks || 5} engaging video hooks for ${config.platform.toUpperCase()}.

Topic: ${config.topic}
Tone: ${platform.tone}
Max Length: ${platform.maxLength} characters
${styleInfo ? `Style: ${styleInfo.name} - ${styleInfo.description}` : ''}

Requirements:
- Each hook should grab attention in the first 3 seconds
- Make viewers want to keep watching
- Be authentic, not clickbaity
- Platform-appropriate language

Return only the hooks, one per line, numbered 1-${config.numHooks || 5}.`;
}

/**
 * Parse AI response into hooks.
 */
export function parseHookResponse(
    response: string,
    config: HookGeneratorConfig
): GeneratedHook[] {
    const lines = response.split('\n').filter(line => line.trim());
    const hooks: GeneratedHook[] = [];

    for (const line of lines) {
        // Remove numbering
        const text = line.replace(/^\d+[\.\)]\s*/, '').trim();
        if (!text || text.length < 10) continue;

        hooks.push({
            id: `hook-${hooks.length}`,
            text,
            style: config.style || 'generated',
            platform: config.platform,
            characterCount: text.length,
        });
    }

    return hooks;
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Generate hooks for video opening.
 * Uses template-based generation (AI can be integrated via OpenRouter).
 */
export async function generateHooks(
    config: HookGeneratorConfig
): Promise<GeneratedHook[]> {
    // For now, use template-based generation
    // AI integration would call /api/ai/generate with buildHookPrompt()
    return generateTemplateHooks(config);
}

/**
 * Get available hook styles.
 */
export function getHookStyles(): HookStyle[] {
    return HOOK_STYLES;
}

/**
 * Get styles recommended for platform.
 */
export function getStylesForPlatform(
    platform: string
): HookStyle[] {
    const prefs = PLATFORM_PREFERENCES[platform];
    if (!prefs) return HOOK_STYLES;

    return HOOK_STYLES.filter(s =>
        prefs.preferredStyles.includes(s.id)
    );
}
