/**
 * SocialPost Composition
 * Versatile template for text-based social media posts with optional media.
 * 
 * Why this design: Social media posts typically need bold text, brand colors,
 * and subtle animations to capture attention in feeds.
 */
import React from 'react';
import {
    AbsoluteFill,
    interpolate,
    useCurrentFrame,
    useVideoConfig,
    spring,
    Img,
} from 'remotion';
import { z } from 'zod';

export const socialPostSchema = z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    backgroundColor: z.string(),
    textColor: z.string(),
    accentColor: z.string(),
    mediaUrl: z.string().nullable(),
    animationStyle: z.enum(['fade', 'slide', 'zoom', 'bounce']),
});

type SocialPostProps = z.infer<typeof socialPostSchema>;

export const SocialPost: React.FC<SocialPostProps> = ({
    title,
    subtitle,
    backgroundColor,
    textColor,
    accentColor,
    mediaUrl,
    animationStyle,
}) => {
    const frame = useCurrentFrame();
    const { fps, durationInFrames } = useVideoConfig();

    // Animation calculations based on style
    const getAnimationStyles = () => {
        const progress = spring({
            frame,
            fps,
            config: { damping: 200, stiffness: 100 },
        });

        switch (animationStyle) {
            case 'slide':
                return {
                    transform: `translateY(${interpolate(progress, [0, 1], [50, 0])}px)`,
                    opacity: progress,
                };
            case 'zoom':
                return {
                    transform: `scale(${interpolate(progress, [0, 1], [0.8, 1])})`,
                    opacity: progress,
                };
            case 'bounce':
                const bounceProgress = spring({
                    frame,
                    fps,
                    config: { damping: 10, stiffness: 100, mass: 0.5 },
                });
                return {
                    transform: `translateY(${interpolate(bounceProgress, [0, 1], [-30, 0])}px)`,
                    opacity: Math.min(1, frame / 10),
                };
            case 'fade':
            default:
                return {
                    opacity: interpolate(frame, [0, 20], [0, 1], {
                        extrapolateRight: 'clamp',
                    }),
                };
        }
    };

    // Fade out animation for the last 20 frames
    const fadeOut = interpolate(
        frame,
        [durationInFrames - 20, durationInFrames],
        [1, 0],
        { extrapolateLeft: 'clamp' }
    );

    const animationStyles = getAnimationStyles();

    return (
        <AbsoluteFill
            style={{
                backgroundColor,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 60,
                opacity: fadeOut,
            }}
        >
            {/* Optional background media */}
            {mediaUrl && (
                <AbsoluteFill style={{ opacity: 0.3 }}>
                    <Img
                        src={mediaUrl}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                        }}
                    />
                </AbsoluteFill>
            )}

            {/* Accent bar decoration */}
            <div
                style={{
                    width: 100,
                    height: 6,
                    backgroundColor: accentColor,
                    marginBottom: 40,
                    borderRadius: 3,
                    ...animationStyles,
                }}
            />

            {/* Title */}
            <h1
                style={{
                    color: textColor,
                    fontSize: 72,
                    fontWeight: 800,
                    textAlign: 'center',
                    margin: 0,
                    lineHeight: 1.2,
                    textShadow: '0 4px 20px rgba(0,0,0,0.3)',
                    ...animationStyles,
                }}
            >
                {title}
            </h1>

            {/* Subtitle */}
            {subtitle && (
                <p
                    style={{
                        ...animationStyles,
                        color: textColor,
                        fontSize: 36,
                        fontWeight: 400,
                        textAlign: 'center',
                        marginTop: 24,
                        opacity: animationStyles.opacity ? animationStyles.opacity * 0.8 : 0.8,
                    }}
                >
                    {subtitle}
                </p>
            )}
        </AbsoluteFill>
    );
};
