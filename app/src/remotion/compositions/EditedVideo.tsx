/**
 * EditedVideo Composition
 * Dynamic Remotion composition that renders a user-edited video project.
 *
 * Why separate from other compositions: This composition takes raw clip
 * data rather than predefined templates, enabling freeform video editing.
 */
import React from 'react';
import {
    AbsoluteFill,
    Sequence,
    Img,
    Video,
    useCurrentFrame,
    interpolate,
    Audio,
} from 'remotion';
import { z } from 'zod';

// ============================================================================
// SCHEMAS
// ============================================================================

const clipSchema = z.object({
    id: z.string(),
    type: z.enum(['video', 'image']),
    src: z.string(),
    startFrame: z.number(),
    durationFrames: z.number(),
    trimStart: z.number(),
    volume: z.number().min(0).max(1),
});

const textOverlaySchema = z.object({
    id: z.string(),
    text: z.string(),
    startFrame: z.number(),
    durationFrames: z.number(),
    position: z.object({ x: z.number(), y: z.number() }),
    style: z.object({
        fontSize: z.number(),
        fontFamily: z.string(),
        color: z.string(),
        backgroundColor: z.string().nullable(),
        fontWeight: z.enum(['normal', 'bold']),
    }),
    animation: z.enum(['none', 'fade', 'slide', 'typewriter']),
});

const audioClipSchema = z.object({
    id: z.string(),
    src: z.string(),
    startFrame: z.number(),
    durationFrames: z.number(),
    volume: z.number(),
    trimStart: z.number().optional(),
});

export const editedVideoSchema = z.object({
    clips: z.array(clipSchema),
    textOverlays: z.array(textOverlaySchema),
    audioClips: z.array(audioClipSchema).optional(),
    backgroundColor: z.string(),
});

export type EditedVideoProps = z.infer<typeof editedVideoSchema>;
type ClipData = z.infer<typeof clipSchema>;
type TextOverlayData = z.infer<typeof textOverlaySchema>;

// ============================================================================
// COMPOSITION
// ============================================================================

export const EditedVideo: React.FC<EditedVideoProps> = ({
    clips,
    textOverlays,
    audioClips = [],
    backgroundColor,
}) => {
    return (
        <AbsoluteFill style={{ backgroundColor }}>
            {/* Render clips */}
            {clips.map((clip) => (
                <Sequence
                    key={clip.id}
                    from={clip.startFrame}
                    durationInFrames={clip.durationFrames}
                    layout="none"
                >
                    <ClipRenderer clip={clip} />
                </Sequence>
            ))}

            {/* Render text overlays */}
            {textOverlays.map((text) => (
                <Sequence
                    key={text.id}
                    from={text.startFrame}
                    durationInFrames={text.durationFrames}
                    layout="none"
                >
                    <TextOverlayRenderer text={text} />
                </Sequence>
            ))}

            {/* Render audio clips */}
            {audioClips.map((audio) => (
                <Sequence
                    key={audio.id}
                    from={audio.startFrame}
                    durationInFrames={audio.durationFrames}
                    layout="none"
                >
                    <Audio
                        src={audio.src}
                        startFrom={audio.trimStart || 0}
                        volume={audio.volume}
                    />
                </Sequence>
            ))}

            {/* Empty state */}
            {clips.length === 0 && textOverlays.length === 0 && (
                <AbsoluteFill
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <p style={{ color: '#666', fontSize: 32 }}>
                        Add clips to begin editing
                    </p>
                </AbsoluteFill>
            )}
        </AbsoluteFill>
    );
};

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

interface ClipRendererProps {
    clip: ClipData;
}

const ClipRenderer: React.FC<ClipRendererProps> = ({ clip }) => {
    if (clip.type === 'image') {
        return (
            <AbsoluteFill>
                <Img
                    src={clip.src}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            </AbsoluteFill>
        );
    }

    // Video clip
    return (
        <AbsoluteFill>
            <Video
                src={clip.src}
                startFrom={clip.trimStart}
                volume={clip.volume}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                }}
            />
        </AbsoluteFill>
    );
};

interface TextOverlayRendererProps {
    text: TextOverlayData;
}

const TextOverlayRenderer: React.FC<TextOverlayRendererProps> = ({ text }) => {
    const frame = useCurrentFrame();
    const { animation, style, position, durationFrames } = text;

    // Animation calculations
    const fadeInDuration = 10; // frames
    const fadeOutDuration = 10;
    const fadeOutStart = durationFrames - fadeOutDuration;

    let animationStyle: React.CSSProperties = {};

    switch (animation) {
        case 'fade': {
            const fadeIn = interpolate(frame, [0, fadeInDuration], [0, 1], {
                extrapolateRight: 'clamp',
            });
            const fadeOut = interpolate(
                frame,
                [fadeOutStart, durationFrames],
                [1, 0],
                { extrapolateLeft: 'clamp' }
            );
            animationStyle = {
                opacity: Math.min(fadeIn, fadeOut),
            };
            break;
        }
        case 'slide': {
            const slideIn = interpolate(frame, [0, fadeInDuration], [-100, 0], {
                extrapolateRight: 'clamp',
            });
            const slideOut = interpolate(
                frame,
                [fadeOutStart, durationFrames],
                [0, 100],
                { extrapolateLeft: 'clamp' }
            );
            const translateX = frame < fadeOutStart ? slideIn : slideOut;
            animationStyle = {
                transform: `translateX(${translateX}px)`,
            };
            break;
        }
        case 'typewriter': {
            // Reveal characters one by one
            const totalChars = text.text.length;
            const charsPerFrame = totalChars / (durationFrames * 0.6);
            const visibleChars = Math.floor(
                Math.min(frame * charsPerFrame, totalChars)
            );
            // Use clip-path for typewriter effect
            const revealPercent = (visibleChars / totalChars) * 100;
            animationStyle = {
                clipPath: `inset(0 ${100 - revealPercent}% 0 0)`,
            };
            break;
        }
        case 'none':
        default:
            break;
    }

    return (
        <div
            style={{
                position: 'absolute',
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -50%)',
                ...animationStyle,
            }}
        >
            <p
                style={{
                    margin: 0,
                    fontSize: style.fontSize,
                    fontFamily: style.fontFamily,
                    fontWeight: style.fontWeight,
                    color: style.color,
                    backgroundColor: style.backgroundColor || 'transparent',
                    padding: style.backgroundColor ? '8px 16px' : 0,
                    borderRadius: style.backgroundColor ? 8 : 0,
                    whiteSpace: 'nowrap',
                }}
            >
                {text.text}
            </p>
        </div>
    );
};
