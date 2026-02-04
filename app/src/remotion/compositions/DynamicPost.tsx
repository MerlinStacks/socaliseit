/**
 * DynamicPost - Caption-to-Video Remotion Composition
 * Why: Generate animated video content from text captions with customizable themes
 */

import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Img } from 'remotion';
import { z } from 'zod';

/**
 * Theme presets for dynamic posts
 */
export const THEME_PRESETS = {
    GRADIENT_DARK: {
        id: 'gradient-dark',
        label: 'Gradient Dark',
        backgroundColor: '#1a1a2e',
        gradientColors: ['#16213e', '#1a1a2e', '#0f3460'],
        textColor: '#ffffff',
        accentColor: '#e94560',
    },
    GRADIENT_LIGHT: {
        id: 'gradient-light',
        label: 'Gradient Light',
        backgroundColor: '#ffecd2',
        gradientColors: ['#fcb69f', '#ffecd2', '#a18cd1'],
        textColor: '#2d3436',
        accentColor: '#ff7675',
    },
    SOLID_DARK: {
        id: 'solid-dark',
        label: 'Solid Dark',
        backgroundColor: '#0a0a0a',
        gradientColors: null,
        textColor: '#ffffff',
        accentColor: '#D4A574',
    },
    SOLID_LIGHT: {
        id: 'solid-light',
        label: 'Solid Light',
        backgroundColor: '#ffffff',
        gradientColors: null,
        textColor: '#1a1a1a',
        accentColor: '#D4A574',
    },
    NEON: {
        id: 'neon',
        label: 'Neon',
        backgroundColor: '#0a0a0a',
        gradientColors: ['#0a0a0a', '#111111', '#0a0a0a'],
        textColor: '#ffffff',
        accentColor: '#00ff88',
        glowEffect: true,
    },
} as const;

export const dynamicPostSchema = z.object({
    caption: z.string(),
    profileName: z.string().optional(),
    profilePhotoUrl: z.string().optional(),
    theme: z.enum(['gradient-dark', 'gradient-light', 'solid-dark', 'solid-light', 'neon']),
    backgroundColor: z.string().optional(),
    gradientColors: z.array(z.string()).optional(),
    backgroundImageUrl: z.string().optional(),
    textColor: z.string().optional(),
    accentColor: z.string().optional(),
});

export type DynamicPostProps = z.infer<typeof dynamicPostSchema>;

/**
 * Animated text component with word-by-word reveal
 */
const AnimatedCaption: React.FC<{
    text: string;
    textColor: string;
    accentColor: string;
    startFrame: number;
}> = ({ text, textColor, accentColor, startFrame }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const words = text.split(' ');

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '12px' }}>
            {words.map((word, index) => {
                const wordDelay = startFrame + index * 3;
                const opacity = interpolate(
                    frame,
                    [wordDelay, wordDelay + 10],
                    [0, 1],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                );
                const translateY = interpolate(
                    frame,
                    [wordDelay, wordDelay + 10],
                    [20, 0],
                    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                );

                return (
                    <span
                        key={index}
                        style={{
                            color: textColor,
                            fontSize: '48px',
                            fontWeight: 700,
                            fontFamily: 'Inter, system-ui, sans-serif',
                            opacity,
                            transform: `translateY(${translateY}px)`,
                        }}
                    >
                        {word}
                    </span>
                );
            })}
        </div>
    );
};

/**
 * Profile badge component
 */
const ProfileBadge: React.FC<{
    name: string;
    photoUrl?: string;
    textColor: string;
    accentColor: string;
}> = ({ name, photoUrl, textColor, accentColor }) => {
    const frame = useCurrentFrame();
    const opacity = interpolate(frame, [10, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const scale = spring({ frame, fps: 30, from: 0.8, to: 1, config: { damping: 15 } });

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                opacity,
                transform: `scale(${scale})`,
            }}
        >
            {photoUrl ? (
                <Img
                    src={photoUrl}
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        border: `3px solid ${accentColor}`,
                        objectFit: 'cover',
                    }}
                />
            ) : (
                <div
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: '50%',
                        backgroundColor: accentColor,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '28px',
                        fontWeight: 700,
                        color: '#fff',
                    }}
                >
                    {name.charAt(0).toUpperCase()}
                </div>
            )}
            <span
                style={{
                    color: textColor,
                    fontSize: '24px',
                    fontWeight: 600,
                    fontFamily: 'Inter, system-ui, sans-serif',
                }}
            >
                {name}
            </span>
        </div>
    );
};

/**
 * DynamicPost Composition
 * Generates animated video from caption text with customizable themes
 */
export const DynamicPost: React.FC<DynamicPostProps> = ({
    caption,
    profileName,
    profilePhotoUrl,
    theme,
    backgroundColor: customBg,
    gradientColors: customGradient,
    backgroundImageUrl,
    textColor: customText,
    accentColor: customAccent,
}) => {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();

    // Get theme defaults
    const themeKey = Object.keys(THEME_PRESETS).find(
        (key) => THEME_PRESETS[key as keyof typeof THEME_PRESETS].id === theme
    ) as keyof typeof THEME_PRESETS;
    const themeConfig = themeKey ? THEME_PRESETS[themeKey] : THEME_PRESETS.GRADIENT_DARK;

    const bgColor = customBg || themeConfig.backgroundColor;
    const gradient = customGradient || themeConfig.gradientColors;
    const textColor = customText || themeConfig.textColor;
    const accentColor = customAccent || themeConfig.accentColor;

    // Background animation
    const gradientAngle = interpolate(frame, [0, 300], [0, 360], { extrapolateRight: 'loop' });

    return (
        <AbsoluteFill
            style={{
                background: gradient
                    ? `linear-gradient(${gradientAngle}deg, ${gradient.join(', ')})`
                    : bgColor,
            }}
        >
            {/* Background image overlay */}
            {backgroundImageUrl && (
                <AbsoluteFill>
                    <Img
                        src={backgroundImageUrl}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            opacity: 0.3,
                        }}
                    />
                </AbsoluteFill>
            )}

            {/* Content container */}
            <AbsoluteFill
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '80px',
                }}
            >
                {/* Profile badge */}
                {profileName && (
                    <div style={{ marginBottom: '48px' }}>
                        <ProfileBadge
                            name={profileName}
                            photoUrl={profilePhotoUrl}
                            textColor={textColor}
                            accentColor={accentColor}
                        />
                    </div>
                )}

                {/* Animated caption */}
                <div style={{ maxWidth: '85%', textAlign: 'center' }}>
                    <AnimatedCaption
                        text={caption}
                        textColor={textColor}
                        accentColor={accentColor}
                        startFrame={profileName ? 30 : 15}
                    />
                </div>

                {/* Accent line */}
                <div
                    style={{
                        marginTop: '48px',
                        width: interpolate(
                            frame,
                            [50, 80],
                            [0, Math.min(caption.length * 3, 200)],
                            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
                        ),
                        height: 4,
                        backgroundColor: accentColor,
                        borderRadius: 2,
                    }}
                />
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

/**
 * Calculate optimal duration based on caption length
 */
export function calculateDynamicPostDuration(caption: string, fps: number = 30): number {
    const wordCount = caption.split(' ').length;
    // 3 frames per word reveal + buffer
    const revealDuration = wordCount * 3 + 60;
    // Minimum 3 seconds, maximum 15 seconds
    return Math.min(Math.max(revealDuration, fps * 3), fps * 15);
}
