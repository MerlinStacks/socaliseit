/**
 * Motion Graphics Library
 * Animated overlays for video content.
 * 
 * Why: Motion graphics increase engagement and brand recognition.
 * Pre-built templates make professional graphics accessible.
 */

// ============================================================================
// TYPES
// ============================================================================

export type GraphicCategory = 'lower-third' | 'intro' | 'cta' | 'transition' | 'social';

export interface MotionGraphic {
    id: string;
    name: string;
    category: GraphicCategory;
    description: string;
    thumbnail: string;
    duration: number;        // Seconds
    hasText: boolean;
    textFields: TextFieldConfig[];
    colorizable: boolean;
    defaultColors: string[];
    animation: AnimationConfig;
}

export interface TextFieldConfig {
    id: string;
    label: string;
    defaultValue: string;
    maxLength: number;
    position: { x: number; y: number };
    style: TextStyle;
}

export interface TextStyle {
    fontSize: number;
    fontFamily: string;
    fontWeight: number;
    color: string;
    alignment: 'left' | 'center' | 'right';
}

export interface AnimationConfig {
    type: 'slide' | 'fade' | 'scale' | 'bounce' | 'typewriter';
    direction?: 'left' | 'right' | 'up' | 'down';
    easing: string;
    stagger?: number;        // Delay between elements
}

export interface GraphicInstance {
    graphicId: string;
    startFrame: number;
    endFrame: number;
    position: { x: number; y: number };
    scale: number;
    textValues: Record<string, string>;
    colors: string[];
}

// ============================================================================
// MOTION GRAPHICS LIBRARY
// ============================================================================

export const MOTION_GRAPHICS: MotionGraphic[] = [
    // Lower Thirds
    {
        id: 'lower-third-minimal',
        name: 'Minimal Lower Third',
        category: 'lower-third',
        description: 'Clean, minimal name/title display',
        thumbnail: '📝',
        duration: 4,
        hasText: true,
        textFields: [
            {
                id: 'name',
                label: 'Name',
                defaultValue: 'John Doe',
                maxLength: 30,
                position: { x: 0.05, y: 0.8 },
                style: {
                    fontSize: 32,
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    color: '#ffffff',
                    alignment: 'left',
                },
            },
            {
                id: 'title',
                label: 'Title',
                defaultValue: 'CEO & Founder',
                maxLength: 40,
                position: { x: 0.05, y: 0.86 },
                style: {
                    fontSize: 18,
                    fontFamily: 'Inter',
                    fontWeight: 400,
                    color: '#a0a0a0',
                    alignment: 'left',
                },
            },
        ],
        colorizable: true,
        defaultColors: ['#6366f1', '#ffffff'],
        animation: {
            type: 'slide',
            direction: 'left',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            stagger: 0.1,
        },
    },
    {
        id: 'lower-third-boxed',
        name: 'Boxed Lower Third',
        category: 'lower-third',
        description: 'Name with colored background box',
        thumbnail: '🏷️',
        duration: 5,
        hasText: true,
        textFields: [
            {
                id: 'name',
                label: 'Name',
                defaultValue: 'Jane Smith',
                maxLength: 25,
                position: { x: 0.05, y: 0.82 },
                style: {
                    fontSize: 28,
                    fontFamily: 'Inter',
                    fontWeight: 700,
                    color: '#ffffff',
                    alignment: 'left',
                },
            },
        ],
        colorizable: true,
        defaultColors: ['#10b981', '#ffffff'],
        animation: {
            type: 'scale',
            easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        },
    },

    // CTAs
    {
        id: 'cta-subscribe',
        name: 'Subscribe Button',
        category: 'cta',
        description: 'Animated subscribe/follow button',
        thumbnail: '🔔',
        duration: 3,
        hasText: true,
        textFields: [
            {
                id: 'text',
                label: 'Button Text',
                defaultValue: 'SUBSCRIBE',
                maxLength: 15,
                position: { x: 0.85, y: 0.85 },
                style: {
                    fontSize: 16,
                    fontFamily: 'Inter',
                    fontWeight: 700,
                    color: '#ffffff',
                    alignment: 'center',
                },
            },
        ],
        colorizable: true,
        defaultColors: ['#ef4444', '#ffffff'],
        animation: {
            type: 'bounce',
            easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        },
    },
    {
        id: 'cta-like',
        name: 'Like Reminder',
        category: 'cta',
        description: 'Animated like button with heart',
        thumbnail: '❤️',
        duration: 2.5,
        hasText: false,
        textFields: [],
        colorizable: true,
        defaultColors: ['#ec4899'],
        animation: {
            type: 'scale',
            easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        },
    },
    {
        id: 'cta-follow',
        name: 'Follow Button',
        category: 'cta',
        description: 'Platform-style follow button',
        thumbnail: '➕',
        duration: 3,
        hasText: true,
        textFields: [
            {
                id: 'text',
                label: 'Button Text',
                defaultValue: 'FOLLOW',
                maxLength: 10,
                position: { x: 0.85, y: 0.1 },
                style: {
                    fontSize: 14,
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    color: '#ffffff',
                    alignment: 'center',
                },
            },
        ],
        colorizable: true,
        defaultColors: ['#3b82f6', '#ffffff'],
        animation: {
            type: 'slide',
            direction: 'down',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        },
    },

    // Intros
    {
        id: 'intro-title-minimal',
        name: 'Minimal Title',
        category: 'intro',
        description: 'Simple centered title reveal',
        thumbnail: '🎬',
        duration: 3,
        hasText: true,
        textFields: [
            {
                id: 'title',
                label: 'Title',
                defaultValue: 'VIDEO TITLE',
                maxLength: 40,
                position: { x: 0.5, y: 0.5 },
                style: {
                    fontSize: 48,
                    fontFamily: 'Inter',
                    fontWeight: 800,
                    color: '#ffffff',
                    alignment: 'center',
                },
            },
        ],
        colorizable: true,
        defaultColors: ['#000000', '#ffffff'],
        animation: {
            type: 'fade',
            easing: 'ease-out',
        },
    },
    {
        id: 'intro-typewriter',
        name: 'Typewriter Title',
        category: 'intro',
        description: 'Text types in character by character',
        thumbnail: '⌨️',
        duration: 4,
        hasText: true,
        textFields: [
            {
                id: 'title',
                label: 'Title',
                defaultValue: 'Welcome to my channel',
                maxLength: 50,
                position: { x: 0.5, y: 0.5 },
                style: {
                    fontSize: 36,
                    fontFamily: 'JetBrains Mono',
                    fontWeight: 500,
                    color: '#10b981',
                    alignment: 'center',
                },
            },
        ],
        colorizable: true,
        defaultColors: ['#18181b', '#10b981'],
        animation: {
            type: 'typewriter',
            easing: 'linear',
            stagger: 0.05,
        },
    },

    // Social
    {
        id: 'social-handles',
        name: 'Social Handles',
        category: 'social',
        description: 'Display social media handles',
        thumbnail: '📱',
        duration: 4,
        hasText: true,
        textFields: [
            {
                id: 'instagram',
                label: 'Instagram',
                defaultValue: '@username',
                maxLength: 30,
                position: { x: 0.1, y: 0.9 },
                style: {
                    fontSize: 18,
                    fontFamily: 'Inter',
                    fontWeight: 500,
                    color: '#ffffff',
                    alignment: 'left',
                },
            },
            {
                id: 'tiktok',
                label: 'TikTok',
                defaultValue: '@username',
                maxLength: 30,
                position: { x: 0.1, y: 0.95 },
                style: {
                    fontSize: 18,
                    fontFamily: 'Inter',
                    fontWeight: 500,
                    color: '#ffffff',
                    alignment: 'left',
                },
            },
        ],
        colorizable: true,
        defaultColors: ['#000000cc', '#ffffff'],
        animation: {
            type: 'slide',
            direction: 'up',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            stagger: 0.15,
        },
    },

    // Transitions
    {
        id: 'transition-wipe',
        name: 'Color Wipe',
        category: 'transition',
        description: 'Full-screen color wipe transition',
        thumbnail: '🎨',
        duration: 1,
        hasText: false,
        textFields: [],
        colorizable: true,
        defaultColors: ['#6366f1'],
        animation: {
            type: 'slide',
            direction: 'right',
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
        },
    },
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get graphics by category.
 */
export function getGraphicsByCategory(
    category: GraphicCategory
): MotionGraphic[] {
    return MOTION_GRAPHICS.filter(g => g.category === category);
}

/**
 * Get all categories.
 */
export function getCategories(): Array<{ id: GraphicCategory; name: string }> {
    return [
        { id: 'lower-third', name: 'Lower Thirds' },
        { id: 'intro', name: 'Intros' },
        { id: 'cta', name: 'Call to Action' },
        { id: 'social', name: 'Social' },
        { id: 'transition', name: 'Transitions' },
    ];
}

/**
 * Get graphic by ID.
 */
export function getGraphicById(id: string): MotionGraphic | undefined {
    return MOTION_GRAPHICS.find(g => g.id === id);
}

/**
 * Create instance of graphic.
 */
export function createGraphicInstance(
    graphicId: string,
    startFrame: number,
    fps: number = 30
): GraphicInstance | null {
    const graphic = getGraphicById(graphicId);
    if (!graphic) return null;

    const textValues: Record<string, string> = {};
    for (const field of graphic.textFields) {
        textValues[field.id] = field.defaultValue;
    }

    return {
        graphicId,
        startFrame,
        endFrame: startFrame + Math.floor(graphic.duration * fps),
        position: { x: 0.5, y: 0.5 },
        scale: 1,
        textValues,
        colors: [...graphic.defaultColors],
    };
}

// ============================================================================
// CSS ANIMATION GENERATION
// ============================================================================

/**
 * Generate CSS keyframes for animation.
 */
export function generateAnimationCSS(
    animation: AnimationConfig,
    duration: number
): string {
    const { type, direction, easing, stagger } = animation;

    let keyframes = '';
    const animationName = `motion-${type}`;

    switch (type) {
        case 'slide':
            const translateStart = direction === 'left' ? '-100%' :
                direction === 'right' ? '100%' :
                    direction === 'up' ? '100%' : '-100%';
            const axis = direction === 'left' || direction === 'right' ? 'X' : 'Y';
            keyframes = `
                @keyframes ${animationName} {
                    0% { transform: translate${axis}(${translateStart}); opacity: 0; }
                    20% { opacity: 1; }
                    100% { transform: translate${axis}(0); opacity: 1; }
                }
            `;
            break;

        case 'fade':
            keyframes = `
                @keyframes ${animationName} {
                    0% { opacity: 0; }
                    100% { opacity: 1; }
                }
            `;
            break;

        case 'scale':
            keyframes = `
                @keyframes ${animationName} {
                    0% { transform: scale(0); opacity: 0; }
                    100% { transform: scale(1); opacity: 1; }
                }
            `;
            break;

        case 'bounce':
            keyframes = `
                @keyframes ${animationName} {
                    0% { transform: scale(0); }
                    50% { transform: scale(1.2); }
                    70% { transform: scale(0.9); }
                    100% { transform: scale(1); }
                }
            `;
            break;

        case 'typewriter':
            // Typewriter is handled differently with text reveal
            keyframes = `
                @keyframes ${animationName} {
                    from { width: 0; }
                    to { width: 100%; }
                }
            `;
            break;
    }

    return keyframes;
}

/**
 * Get animation style for element.
 */
export function getAnimationStyle(
    animation: AnimationConfig,
    duration: number,
    index: number = 0
): React.CSSProperties {
    const delay = (animation.stagger || 0) * index;
    const animationName = `motion-${animation.type}`;

    return {
        animation: `${animationName} ${duration}s ${animation.easing} ${delay}s forwards`,
        opacity: 0,
    };
}
