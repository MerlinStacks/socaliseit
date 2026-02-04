/**
 * Color Correction Service
 * AI-based color grading with cinematic presets.
 * 
 * Why: Enables creators to apply professional color grades
 * with real-time preview using CSS filters and FFmpeg for export.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ColorPreset {
    id: string;
    name: string;
    description: string;
    filters: ColorFilters;
    thumbnail: string;
}

export interface ColorFilters {
    brightness: number;      // 0-200, default 100
    contrast: number;        // 0-200, default 100
    saturation: number;      // 0-200, default 100
    hueRotate: number;       // 0-360 degrees
    temperature: number;     // -100 to 100 (warm/cool)
    tint: number;            // -100 to 100 (green/magenta)
    shadows: number;         // -100 to 100
    highlights: number;      // -100 to 100
    vignette: number;        // 0-100
}

export interface ColorCorrectionConfig {
    preset: string;
    intensity: number;       // 0-100
    customFilters?: Partial<ColorFilters>;
}

// ============================================================================
// PRESETS
// ============================================================================

const DEFAULT_FILTERS: ColorFilters = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    hueRotate: 0,
    temperature: 0,
    tint: 0,
    shadows: 0,
    highlights: 0,
    vignette: 0,
};

export const COLOR_PRESETS: ColorPreset[] = [
    {
        id: 'natural',
        name: 'Natural',
        description: 'No color adjustment',
        filters: { ...DEFAULT_FILTERS },
        thumbnail: '🎨',
    },
    {
        id: 'cinematic',
        name: 'Cinematic',
        description: 'Cool shadows, warm highlights, crushed blacks',
        filters: {
            ...DEFAULT_FILTERS,
            contrast: 115,
            saturation: 85,
            temperature: -15,
            shadows: -20,
            highlights: 10,
            vignette: 25,
        },
        thumbnail: '🎬',
    },
    {
        id: 'vibrant',
        name: 'Vibrant',
        description: 'Punchy colors for social media',
        filters: {
            ...DEFAULT_FILTERS,
            contrast: 110,
            saturation: 130,
            brightness: 105,
            highlights: 15,
        },
        thumbnail: '🌈',
    },
    {
        id: 'moody',
        name: 'Moody',
        description: 'Desaturated, high contrast, dark tones',
        filters: {
            ...DEFAULT_FILTERS,
            contrast: 125,
            saturation: 60,
            brightness: 90,
            shadows: -30,
            vignette: 40,
        },
        thumbnail: '🌙',
    },
    {
        id: 'warm',
        name: 'Warm Glow',
        description: 'Golden hour warmth',
        filters: {
            ...DEFAULT_FILTERS,
            temperature: 30,
            saturation: 110,
            brightness: 105,
            highlights: 20,
        },
        thumbnail: '☀️',
    },
    {
        id: 'cool',
        name: 'Cool Tones',
        description: 'Blue-tinted, modern look',
        filters: {
            ...DEFAULT_FILTERS,
            temperature: -25,
            saturation: 90,
            contrast: 105,
            shadows: -10,
        },
        thumbnail: '❄️',
    },
    {
        id: 'vintage',
        name: 'Vintage',
        description: 'Faded, nostalgic film look',
        filters: {
            ...DEFAULT_FILTERS,
            saturation: 75,
            contrast: 90,
            brightness: 105,
            temperature: 15,
            vignette: 30,
        },
        thumbnail: '📷',
    },
    {
        id: 'bw',
        name: 'Black & White',
        description: 'Classic monochrome',
        filters: {
            ...DEFAULT_FILTERS,
            saturation: 0,
            contrast: 120,
        },
        thumbnail: '⬛',
    },
];

// ============================================================================
// CSS FILTER GENERATION
// ============================================================================

/**
 * Generate CSS filter string for real-time preview.
 */
export function generateCSSFilter(
    filters: ColorFilters,
    intensity: number = 100
): string {
    // Blend filters with defaults based on intensity
    const blend = (value: number, defaultValue: number): number => {
        const diff = value - defaultValue;
        return defaultValue + (diff * intensity / 100);
    };

    const brightness = blend(filters.brightness, 100);
    const contrast = blend(filters.contrast, 100);
    const saturation = blend(filters.saturation, 100);
    const hueRotate = blend(filters.hueRotate, 0);

    // Temperature is simulated via sepia + hue-rotate
    const temperature = blend(filters.temperature, 0);
    const sepiaAmount = Math.abs(temperature) / 100 * 0.2;
    const tempHue = temperature > 0 ? -10 : 10;

    const parts: string[] = [
        `brightness(${brightness / 100})`,
        `contrast(${contrast / 100})`,
        `saturate(${saturation / 100})`,
    ];

    if (hueRotate !== 0) {
        parts.push(`hue-rotate(${hueRotate}deg)`);
    }

    if (temperature !== 0) {
        parts.push(`sepia(${sepiaAmount})`);
        parts.push(`hue-rotate(${tempHue}deg)`);
    }

    return parts.join(' ');
}

/**
 * Generate vignette overlay CSS.
 */
export function generateVignetteCSS(
    vignetteAmount: number,
    intensity: number = 100
): React.CSSProperties | null {
    const amount = vignetteAmount * intensity / 100;
    if (amount <= 0) return null;

    return {
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${amount / 100}) 100%)`,
        pointerEvents: 'none',
    };
}

// ============================================================================
// FFMPEG FILTER GENERATION
// ============================================================================

/**
 * Generate FFmpeg filter string for export.
 */
export function generateFFmpegFilter(
    filters: ColorFilters,
    intensity: number = 100
): string {
    const parts: string[] = [];

    const blend = (value: number, defaultValue: number): number => {
        const diff = value - defaultValue;
        return defaultValue + (diff * intensity / 100);
    };

    const brightness = (blend(filters.brightness, 100) - 100) / 100;
    const contrast = blend(filters.contrast, 100) / 100;
    const saturation = blend(filters.saturation, 100) / 100;

    // eq filter for brightness, contrast, saturation
    parts.push(`eq=brightness=${brightness.toFixed(2)}:contrast=${contrast.toFixed(2)}:saturation=${saturation.toFixed(2)}`);

    // Color temperature via colortemperature filter
    const temperature = blend(filters.temperature, 0);
    if (temperature !== 0) {
        // Map -100 to 100 → 2000K to 10000K (6500K is neutral)
        const kelvin = 6500 + (temperature * 35);
        parts.push(`colortemperature=temperature=${kelvin}`);
    }

    // Hue rotation
    const hueRotate = blend(filters.hueRotate, 0);
    if (hueRotate !== 0) {
        parts.push(`hue=h=${hueRotate}`);
    }

    // Shadows and highlights via curves
    const shadows = blend(filters.shadows, 0);
    const highlights = blend(filters.highlights, 0);
    if (shadows !== 0 || highlights !== 0) {
        // Simplified curves adjustment
        const shadowPoint = Math.max(0, 0.25 + shadows / 400);
        const highlightPoint = Math.min(1, 0.75 + highlights / 400);
        parts.push(`curves=master='0/0 0.25/${shadowPoint} 0.75/${highlightPoint} 1/1'`);
    }

    // Vignette
    const vignette = blend(filters.vignette, 0);
    if (vignette > 0) {
        const amount = vignette / 100;
        parts.push(`vignette=PI*${amount}`);
    }

    return parts.join(',');
}

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Apply color correction to video frame data.
 * For real-time preview, use CSS filters instead.
 */
export function applyColorCorrection(
    config: ColorCorrectionConfig
): {
    cssFilter: string;
    vignetteStyle: React.CSSProperties | null;
    ffmpegFilter: string;
} {
    const preset = COLOR_PRESETS.find(p => p.id === config.preset) || COLOR_PRESETS[0];

    // Merge preset with custom overrides
    const filters: ColorFilters = {
        ...preset.filters,
        ...config.customFilters,
    };

    return {
        cssFilter: generateCSSFilter(filters, config.intensity),
        vignetteStyle: generateVignetteCSS(filters.vignette, config.intensity),
        ffmpegFilter: generateFFmpegFilter(filters, config.intensity),
    };
}

/**
 * Get all available presets.
 */
export function getColorPresets(): ColorPreset[] {
    return COLOR_PRESETS;
}

/**
 * Get preset by ID.
 */
export function getPresetById(id: string): ColorPreset | undefined {
    return COLOR_PRESETS.find(p => p.id === id);
}
