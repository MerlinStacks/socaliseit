'use client';

/**
 * VideoEditorCanvas Component
 * Main canvas area displaying the Remotion Player for real-time video preview.
 * 
 * Why client-side only: @remotion/player requires browser APIs and cannot
 * be server-rendered.
 */
import React, { useRef, useCallback, useMemo, forwardRef, useImperativeHandle, useEffect } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { SocialPost } from '@/remotion/compositions/SocialPost';
import { VideoSlideshow } from '@/remotion/compositions/VideoSlideshow';
import { ASPECT_RATIOS } from '@/remotion/index';

export interface VideoEditorProps {
    compositionId: 'SocialPost' | 'VideoSlideshow';
    aspectRatio: keyof typeof ASPECT_RATIOS;
    durationInSeconds: number;
    fps?: number;
    inputProps: Record<string, unknown>;
    currentFrame?: number;
    isPlaying?: boolean;
    isLooping?: boolean;
    onFrameChange?: (frame: number) => void;
    onPlayStateChange?: (isPlaying: boolean) => void;
}

/**
 * Imperative handle for controlling the player from parent components
 */
export interface VideoEditorCanvasHandle {
    play: () => void;
    pause: () => void;
    seekTo: (frame: number) => void;
    toggle: () => void;
    getCurrentFrame: () => number;
}

/**
 * Map composition IDs to their React components
 */
const COMPOSITION_MAP = {
    SocialPost,
    VideoSlideshow,
} as const;

export const VideoEditorCanvas = forwardRef<VideoEditorCanvasHandle, VideoEditorProps>(
    (
        {
            compositionId,
            aspectRatio,
            durationInSeconds,
            fps = 30,
            inputProps,
            currentFrame,
            isPlaying,
            isLooping = true,
            onFrameChange,
            onPlayStateChange,
        },
        ref
    ) => {
        const playerRef = useRef<PlayerRef>(null);
        const dimensions = ASPECT_RATIOS[aspectRatio];
        const durationInFrames = Math.ceil(durationInSeconds * fps);

        const CompositionComponent = COMPOSITION_MAP[compositionId];

        // Memoize input props to prevent unnecessary re-renders
        const memoizedProps = useMemo(() => inputProps, [JSON.stringify(inputProps)]);

        // Expose imperative methods to parent
        useImperativeHandle(
            ref,
            () => ({
                play: () => playerRef.current?.play(),
                pause: () => playerRef.current?.pause(),
                seekTo: (frame: number) => playerRef.current?.seekTo(frame),
                toggle: () => playerRef.current?.toggle(),
                getCurrentFrame: () => playerRef.current?.getCurrentFrame() ?? 0,
            }),
            []
        );

        // Sync play state from parent
        useEffect(() => {
            if (!playerRef.current) return;
            if (isPlaying) {
                playerRef.current.play();
            } else {
                playerRef.current.pause();
            }
        }, [isPlaying]);

        // Sync seek from parent (timeline scrubbing)
        useEffect(() => {
            if (currentFrame !== undefined && playerRef.current) {
                const playerFrame = playerRef.current.getCurrentFrame();
                // Only seek if difference is significant (avoid feedback loop)
                if (Math.abs(playerFrame - currentFrame) > 1) {
                    playerRef.current.seekTo(currentFrame);
                }
            }
        }, [currentFrame]);

        const handlePlay = useCallback(() => {
            onPlayStateChange?.(true);
        }, [onPlayStateChange]);

        const handlePause = useCallback(() => {
            onPlayStateChange?.(false);
        }, [onPlayStateChange]);

        const handleSeekChange = useCallback(
            (frame: number) => {
                onFrameChange?.(frame);
            },
            [onFrameChange]
        );

        /**
         * Why type assertion: Remotion Player requires strict generic typing between
         * the component and inputProps. Since we're dynamically selecting compositions,
         * we use type assertion for the entire Player props object.
         */
        /**
         * Why controls: false - We use a custom VideoTimeline component for
         * playback controls to avoid duplicate seek bars and provide a
         * consistent, customizable editing experience.
         */
        const playerProps = {
            ref: playerRef,
            component: CompositionComponent,
            durationInFrames,
            compositionWidth: dimensions.width,
            compositionHeight: dimensions.height,
            fps,
            inputProps: memoizedProps,
            style: {
                width: '100%',
                aspectRatio: `${dimensions.width} / ${dimensions.height}`,
            },
            controls: false,
            loop: isLooping,
            clickToPlay: true,
            doubleClickToFullscreen: true,
            spaceKeyToPlayOrPause: true,
            onPlay: handlePlay,
            onPause: handlePause,
            onSeeked: (e: { detail: { frame: number } }) => handleSeekChange(e.detail.frame),
            onFrameUpdate: (e: { detail: { frame: number } }) => onFrameChange?.(e.detail.frame),
        };

        return (
            <div className="video-editor-canvas">
                <div
                    className="player-container"
                    style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: 800,
                        margin: '0 auto',
                        backgroundColor: '#0a0a0a',
                        borderRadius: 12,
                        overflow: 'hidden',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    }}
                >
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <Player {...(playerProps as any)} />

                    {/* Aspect ratio badge */}
                    <div
                        style={{
                            position: 'absolute',
                            top: 12,
                            right: 12,
                            backgroundColor: 'rgba(0,0,0,0.7)',
                            color: '#fff',
                            padding: '6px 12px',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 500,
                        }}
                    >
                        {dimensions.label}
                    </div>
                </div>
            </div>
        );
    });

VideoEditorCanvas.displayName = 'VideoEditorCanvas';
