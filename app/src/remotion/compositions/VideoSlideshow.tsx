/**
 * VideoSlideshow Composition
 * Multi-slide video montage with configurable transitions.
 * 
 * Why this design: Slideshows are the most common social media video format,
 * used for product showcases, stories, and recap content.
 */
import React from 'react';
import {
    AbsoluteFill,
    Sequence,
    Img,
    Video,
    interpolate,
    useCurrentFrame,
} from 'remotion';
import { z } from 'zod';

const slideSchema = z.object({
    id: z.string(),
    type: z.enum(['image', 'video']),
    src: z.string(),
    duration: z.number().optional(),
    caption: z.string().optional(),
});

export const slideshowSchema = z.object({
    slides: z.array(slideSchema),
    transitionDuration: z.number(),
    transitionStyle: z.enum(['crossfade', 'slide', 'zoom', 'none']),
    backgroundColor: z.string(),
});

type Slide = z.infer<typeof slideSchema>;
type SlideshowProps = z.infer<typeof slideshowSchema>;

interface SlideComponentProps {
    slide: Slide;
    transitionStyle: SlideshowProps['transitionStyle'];
    transitionDuration: number;
    slideDuration: number;
}

const SlideComponent: React.FC<SlideComponentProps> = ({
    slide,
    transitionStyle,
    transitionDuration,
    slideDuration,
}) => {
    const frame = useCurrentFrame();

    // Transition in animation
    const transitionIn = () => {
        if (transitionStyle === 'none') return {};

        const progress = interpolate(frame, [0, transitionDuration], [0, 1], {
            extrapolateRight: 'clamp',
        });

        switch (transitionStyle) {
            case 'slide':
                return {
                    transform: `translateX(${interpolate(progress, [0, 1], [100, 0])}%)`,
                };
            case 'zoom':
                return {
                    transform: `scale(${interpolate(progress, [0, 1], [1.2, 1])})`,
                    opacity: progress,
                };
            case 'crossfade':
            default:
                return { opacity: progress };
        }
    };

    // Transition out animation
    const transitionOut = () => {
        if (transitionStyle === 'none') return {};

        const outStart = slideDuration - transitionDuration;
        const progress = interpolate(frame, [outStart, slideDuration], [1, 0], {
            extrapolateLeft: 'clamp',
        });

        switch (transitionStyle) {
            case 'slide':
                return {
                    transform: `translateX(${interpolate(progress, [1, 0], [0, -100])}%)`,
                };
            case 'zoom':
                return {
                    transform: `scale(${interpolate(progress, [1, 0], [1, 0.8])})`,
                    opacity: progress,
                };
            case 'crossfade':
            default:
                return { opacity: progress };
        }
    };

    const inStyles = transitionIn();
    const outStyles = frame > slideDuration - transitionDuration ? transitionOut() : {};
    const combinedStyles = { ...inStyles, ...outStyles };

    return (
        <AbsoluteFill style={combinedStyles}>
            {slide.type === 'image' ? (
                <Img
                    src={slide.src}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            ) : (
                <Video
                    src={slide.src}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                    }}
                />
            )}

            {/* Caption overlay */}
            {slide.caption && (
                <div
                    style={{
                        position: 'absolute',
                        bottom: 60,
                        left: 60,
                        right: 60,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        padding: '20px 30px',
                        borderRadius: 12,
                    }}
                >
                    <p
                        style={{
                            color: '#ffffff',
                            fontSize: 28,
                            fontWeight: 500,
                            margin: 0,
                            textAlign: 'center',
                        }}
                    >
                        {slide.caption}
                    </p>
                </div>
            )}
        </AbsoluteFill>
    );
};

export const VideoSlideshow: React.FC<SlideshowProps> = ({
    slides,
    transitionDuration,
    transitionStyle,
    backgroundColor,
}) => {
    // Default slide duration if not specified (90 frames = 3 seconds at 30fps)
    const defaultSlideDuration = 90;

    // Calculate cumulative start frames for each slide
    let currentFrame = 0;
    const slideConfigs = slides.map((slide) => {
        const duration = slide.duration || defaultSlideDuration;
        const startFrame = currentFrame;
        currentFrame += duration - transitionDuration; // Overlap transitions
        return { slide, startFrame, duration };
    });

    return (
        <AbsoluteFill style={{ backgroundColor }}>
            {slideConfigs.map(({ slide, startFrame, duration }) => (
                <Sequence
                    key={slide.id}
                    from={startFrame}
                    durationInFrames={duration}
                    layout="none"
                >
                    <SlideComponent
                        slide={slide}
                        transitionStyle={transitionStyle}
                        transitionDuration={transitionDuration}
                        slideDuration={duration}
                    />
                </Sequence>
            ))}

            {/* Empty state placeholder */}
            {slides.length === 0 && (
                <AbsoluteFill
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <p style={{ color: '#666', fontSize: 32 }}>Add slides to begin</p>
                </AbsoluteFill>
            )}
        </AbsoluteFill>
    );
};
