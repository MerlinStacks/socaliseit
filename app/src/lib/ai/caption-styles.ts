/**
 * Caption Styles
 * Pre-defined caption style presets for auto-captions.
 * 
 * Why: Quick application of professional caption styles without manual configuration.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface CaptionStyle {
    id: string;
    name: string;
    description: string;
    fontSize: number;
    fontFamily: string;
    color: string;
    backgroundColor: string | null;
    backgroundPadding: number;
    borderRadius: number;
    position: 'bottom' | 'center' | 'top';
    offsetY: number; // Pixels from position
    animation: CaptionAnimation;
    highlightColor?: string;
    textShadow?: string;
    textTransform?: 'none' | 'uppercase' | 'lowercase';
    letterSpacing?: number;
    fontWeight: 'normal' | 'bold' | 'black';
}

export type CaptionAnimation =
    | 'none'
    | 'fade'
    | 'word-highlight'
    | 'karaoke'
    | 'bounce'
    | 'typewriter'
    | 'pop';

// ============================================================================
// STYLE PRESETS
// ============================================================================

export const CAPTION_STYLES: CaptionStyle[] = [
    {
        id: 'tiktok-bold',
        name: 'TikTok Bold',
        description: 'Bold, attention-grabbing style popular on TikTok',
        fontSize: 48,
        fontFamily: 'Inter',
        fontWeight: 'black',
        color: '#ffffff',
        backgroundColor: null,
        backgroundPadding: 0,
        borderRadius: 0,
        position: 'center',
        offsetY: 100,
        animation: 'word-highlight',
        highlightColor: '#FFD700',
        textShadow: '3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000',
        textTransform: 'uppercase',
    },
    {
        id: 'youtube-clean',
        name: 'YouTube Clean',
        description: 'Clean, readable style for YouTube videos',
        fontSize: 32,
        fontFamily: 'Roboto',
        fontWeight: 'bold',
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backgroundPadding: 12,
        borderRadius: 4,
        position: 'bottom',
        offsetY: 50,
        animation: 'fade',
    },
    {
        id: 'instagram-minimal',
        name: 'Instagram Minimal',
        description: 'Minimalist style for Instagram Reels',
        fontSize: 36,
        fontFamily: 'Outfit',
        fontWeight: 'bold',
        color: '#ffffff',
        backgroundColor: null,
        backgroundPadding: 0,
        borderRadius: 0,
        position: 'center',
        offsetY: 0,
        animation: 'pop',
        textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
    },
    {
        id: 'karaoke',
        name: 'Karaoke',
        description: 'Word-by-word highlight like karaoke lyrics',
        fontSize: 40,
        fontFamily: 'Inter',
        fontWeight: 'bold',
        color: 'rgba(255, 255, 255, 0.5)',
        backgroundColor: null,
        backgroundPadding: 0,
        borderRadius: 0,
        position: 'center',
        offsetY: 80,
        animation: 'karaoke',
        highlightColor: '#ffffff',
        textShadow: '2px 2px 0 #000',
    },
    {
        id: 'subtitle-classic',
        name: 'Classic Subtitle',
        description: 'Traditional subtitle style',
        fontSize: 28,
        fontFamily: 'Arial',
        fontWeight: 'normal',
        color: '#ffffff',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backgroundPadding: 8,
        borderRadius: 0,
        position: 'bottom',
        offsetY: 30,
        animation: 'none',
    },
    {
        id: 'neon-glow',
        name: 'Neon Glow',
        description: 'Glowing neon effect for dramatic content',
        fontSize: 44,
        fontFamily: 'Inter',
        fontWeight: 'black',
        color: '#00ffff',
        backgroundColor: null,
        backgroundPadding: 0,
        borderRadius: 0,
        position: 'center',
        offsetY: 50,
        animation: 'bounce',
        textShadow: '0 0 10px #00ffff, 0 0 20px #00ffff, 0 0 30px #00ffff',
        textTransform: 'uppercase',
    },
    {
        id: 'typewriter',
        name: 'Typewriter',
        description: 'Character-by-character reveal effect',
        fontSize: 32,
        fontFamily: 'Courier New',
        fontWeight: 'normal',
        color: '#00ff00',
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        backgroundPadding: 16,
        borderRadius: 0,
        position: 'bottom',
        offsetY: 40,
        animation: 'typewriter',
    },
    {
        id: 'professional',
        name: 'Professional',
        description: 'Clean style for business/educational content',
        fontSize: 30,
        fontFamily: 'Inter',
        fontWeight: 'normal',
        color: '#ffffff',
        backgroundColor: 'rgba(30, 30, 30, 0.85)',
        backgroundPadding: 14,
        borderRadius: 8,
        position: 'bottom',
        offsetY: 60,
        animation: 'fade',
    },
];

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get a caption style by ID
 */
export function getCaptionStyle(id: string): CaptionStyle | undefined {
    return CAPTION_STYLES.find(style => style.id === id);
}

/**
 * Get the default caption style
 */
export function getDefaultCaptionStyle(): CaptionStyle {
    return CAPTION_STYLES.find(s => s.id === 'youtube-clean') || CAPTION_STYLES[0];
}

/**
 * Create a custom caption style based on a preset
 */
export function createCustomStyle(
    baseStyleId: string,
    overrides: Partial<CaptionStyle>
): CaptionStyle {
    const baseStyle = getCaptionStyle(baseStyleId) || getDefaultCaptionStyle();
    return {
        ...baseStyle,
        ...overrides,
        id: 'custom',
        name: 'Custom Style',
    };
}

/**
 * Calculate caption position in pixels
 */
export function calculateCaptionPosition(
    style: CaptionStyle,
    canvasHeight: number
): number {
    switch (style.position) {
        case 'top':
            return style.offsetY + 50;
        case 'center':
            return canvasHeight / 2 + style.offsetY;
        case 'bottom':
            return canvasHeight - style.offsetY - 50;
        default:
            return canvasHeight - 100;
    }
}

/**
 * Get CSS styles for caption rendering
 */
export function getCaptionCss(style: CaptionStyle): React.CSSProperties {
    return {
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fontWeight: style.fontWeight === 'black' ? 900 : style.fontWeight === 'bold' ? 700 : 400,
        color: style.color,
        backgroundColor: style.backgroundColor || 'transparent',
        padding: style.backgroundPadding,
        borderRadius: style.borderRadius,
        textShadow: style.textShadow,
        textTransform: style.textTransform,
        letterSpacing: style.letterSpacing,
        textAlign: 'center' as const,
        maxWidth: '80%',
        wordWrap: 'break-word' as const,
    };
}
