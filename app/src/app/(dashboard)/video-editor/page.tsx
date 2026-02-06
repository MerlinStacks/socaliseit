'use client';

/**
 * Video Editor Page
 * Full-featured video editor for creating and editing social media videos.
 *
 * Why client-side: The entire page uses @remotion/player and complex
 * timeline interactions that require browser APIs.
 */
import React, { useRef, useCallback, useMemo, useEffect } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import {
    VideoTimeline,
    VideoExportModal,
    TimelineTrack,
    TimelineTextTrack,
    ClipProperties,
    TextProperties,
    TimelineAudioTrack,
    AudioProperties,
    ExportSettings,
} from '@/components/video-editor';
import { useVideoProject } from '@/hooks/useVideoProject';
import { EditedVideo, EditedVideoProps } from '@/remotion/compositions/EditedVideo';
import { ASPECT_RATIOS } from '@/remotion/index';
import { useWakeLock } from '@/hooks/use-wake-lock';

// Extracted components
import { EditorHeader } from './editor-header';
import { EditorSidebar, SidebarTab } from './editor-sidebar';
import { TransportControls } from './transport-controls';
import {
    containerStyle,
    mainContentStyle,
    centerPanelStyle,
    previewContainerStyle,
    aspectBadgeStyle,
    rightSidebarStyle,
    timelineContainerStyle,
} from './styles';

type AspectRatioKey = keyof typeof ASPECT_RATIOS;

export default function VideoEditorPage() {
    const playerRef = useRef<PlayerRef>(null);

    // Prevent screen from sleeping during video editing
    useWakeLock(true);

    // Zustand store
    const {
        project,
        currentFrame,
        isPlaying,
        selectedClipId,
        selectedTextId,
        selectedAudioId,
        isLooping,
        totalDurationFrames,
        zoom,
        setCurrentFrame,
        play,
        pause,
        togglePlay,
        setIsLooping,
        setAspectRatio,
        setZoom,
        resetProject,
        addTextOverlay,
        removeClip,
        removeAudioClip,
        removeTextOverlay,
    } = useVideoProject();

    // Modal state
    const [isExportModalOpen, setExportModalOpen] = React.useState(false);
    const [showMediaPicker, setShowMediaPicker] = React.useState(true);
    const [activeSidebarTab, setActiveSidebarTab] = React.useState<SidebarTab>('media');

    const fps = project.fps;
    const dimensions = ASPECT_RATIOS[project.aspectRatio];

    // Build Remotion input props from project state
    const inputProps: EditedVideoProps = useMemo(() => ({
        clips: project.clips.map((clip) => ({
            id: clip.id,
            type: clip.type,
            src: clip.mediaUrl,
            startFrame: clip.startFrame,
            durationFrames: clip.durationFrames,
            trimStart: clip.trimStart,
            volume: clip.volume,
        })),
        textOverlays: project.textOverlays.map((text) => ({
            id: text.id,
            text: text.text,
            startFrame: text.startFrame,
            durationFrames: text.durationFrames,
            position: text.position,
            style: text.style,
            animation: text.animation,
        })),
        audioClips: project.audioClips.map((audio) => ({
            id: audio.id,
            src: audio.mediaUrl,
            startFrame: audio.startFrame,
            durationFrames: audio.durationFrames,
            volume: audio.volume,
            trimStart: audio.trimStart,
        })),
        backgroundColor: '#000000',
    }), [project.clips, project.textOverlays, project.audioClips]);

    // Sync player with store state
    useEffect(() => {
        if (!playerRef.current) return;
        if (isPlaying) {
            playerRef.current.play();
        } else {
            playerRef.current.pause();
        }
    }, [isPlaying]);

    useEffect(() => {
        if (!playerRef.current) return;
        const playerFrame = playerRef.current.getCurrentFrame();
        if (Math.abs(playerFrame - currentFrame) > 1) {
            playerRef.current.seekTo(currentFrame);
        }
    }, [currentFrame]);

    // Listen for frame updates from player using polling
    useEffect(() => {
        if (!playerRef.current) return;

        const interval = setInterval(() => {
            if (playerRef.current && isPlaying) {
                const frame = playerRef.current.getCurrentFrame();
                setCurrentFrame(frame);
            }
        }, 50); // ~20fps polling for UI sync

        return () => clearInterval(interval);
    }, [isPlaying, setCurrentFrame]);

    /**
     * Keyboard shortcuts for video editing
     * Why: Faster workflow for power users
     */
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            switch (e.key) {
                case ' ': // Space - Play/Pause
                    e.preventDefault();
                    togglePlay();
                    if (playerRef.current) {
                        if (isPlaying) {
                            playerRef.current.pause();
                        } else {
                            playerRef.current.play();
                        }
                    }
                    break;

                case 'ArrowLeft': // Left arrow - Frame step or 1s skip
                    e.preventDefault();
                    if (e.shiftKey) {
                        setCurrentFrame(Math.max(0, currentFrame - fps));
                    } else {
                        setCurrentFrame(Math.max(0, currentFrame - 1));
                    }
                    if (playerRef.current) {
                        playerRef.current.seekTo(currentFrame);
                    }
                    break;

                case 'ArrowRight': // Right arrow - Frame step or 1s skip
                    e.preventDefault();
                    if (e.shiftKey) {
                        setCurrentFrame(Math.min(totalDurationFrames, currentFrame + fps));
                    } else {
                        setCurrentFrame(Math.min(totalDurationFrames, currentFrame + 1));
                    }
                    if (playerRef.current) {
                        playerRef.current.seekTo(currentFrame);
                    }
                    break;

                case 'Home': // Go to start
                    e.preventDefault();
                    setCurrentFrame(0);
                    if (playerRef.current) {
                        playerRef.current.seekTo(0);
                    }
                    break;

                case 'End': // Go to end
                    e.preventDefault();
                    setCurrentFrame(totalDurationFrames - 1);
                    if (playerRef.current) {
                        playerRef.current.seekTo(totalDurationFrames - 1);
                    }
                    break;

                case 'Delete':
                case 'Backspace': // Remove selected clip
                    e.preventDefault();
                    if (selectedClipId) {
                        removeClip(selectedClipId);
                    } else if (selectedAudioId) {
                        removeAudioClip(selectedAudioId);
                    } else if (selectedTextId) {
                        removeTextOverlay(selectedTextId);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        togglePlay, isPlaying, currentFrame, fps, totalDurationFrames, setCurrentFrame,
        selectedClipId, selectedAudioId, selectedTextId, removeClip, removeAudioClip, removeTextOverlay
    ]);


    // Handle add text
    const handleAddText = () => {
        addTextOverlay({
            text: 'New Text',
            startFrame: currentFrame,
            durationFrames: 90, // 3 seconds
            position: { x: 540, y: 960 },
            style: {
                fontSize: 60,
                fontFamily: 'Inter',
                color: '#ffffff',
                backgroundColor: null,
                fontWeight: 'bold',
            },
            animation: 'fade',
        });
    };

    // Handle export
    const handleExport = useCallback(
        async (settings: ExportSettings) => {
            const response = await fetch('/api/video/render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    compositionId: 'EditedVideo',
                    inputProps,
                    format: settings.format,
                    quality: settings.quality,
                    aspectRatio: settings.aspectRatio,
                    durationInSeconds: totalDurationFrames / fps,
                    fps,
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to start render');
            }

            const { jobId } = await response.json();

            // Poll for completion
            let attempts = 0;
            while (attempts < 120) {
                await new Promise((resolve) => setTimeout(resolve, 1000));
                const statusResponse = await fetch(`/api/video/render/${jobId}`);
                const { job } = await statusResponse.json();

                if (job.status === 'complete') {
                    window.open(job.outputUrl, '_blank');
                    return;
                }

                if (job.status === 'failed') {
                    throw new Error(job.error || 'Render failed');
                }

                attempts++;
            }

            throw new Error('Render timed out');
        },
        [inputProps, totalDurationFrames, fps]
    );

    return (
        <div style={containerStyle}>
            {/* Header */}
            <EditorHeader
                projectName={project.name}
                aspectRatio={project.aspectRatio}
                showMediaPicker={showMediaPicker}
                onAspectRatioChange={setAspectRatio}
                onToggleMediaPicker={() => setShowMediaPicker(!showMediaPicker)}
                onExportClick={() => setExportModalOpen(true)}
            />

            {/* Main content */}
            <div style={mainContentStyle}>
                {/* Left sidebar - Media Picker */}
                {showMediaPicker && (
                    <EditorSidebar
                        activeTab={activeSidebarTab}
                        onTabChange={setActiveSidebarTab}
                        onAddText={handleAddText}
                    />
                )}

                {/* Center - Preview */}
                <div style={centerPanelStyle}>
                    <div style={previewContainerStyle}>
                        <Player
                            ref={playerRef}
                            component={EditedVideo}
                            durationInFrames={Math.max(totalDurationFrames, 30)}
                            compositionWidth={dimensions.width}
                            compositionHeight={dimensions.height}
                            fps={fps}
                            inputProps={inputProps}
                            style={{
                                width: '100%',
                                aspectRatio: `${dimensions.width} / ${dimensions.height}`,
                                maxHeight: 'calc(100vh - 360px)',
                            }}
                            controls={false}
                            loop={isLooping}
                            clickToPlay
                            spaceKeyToPlayOrPause
                        />

                        {/* Aspect ratio badge */}
                        <div style={aspectBadgeStyle}>
                            {dimensions.label}
                        </div>
                    </div>
                </div>

                {/* Right sidebar - Properties */}
                <aside style={rightSidebarStyle}>
                    {selectedTextId ? (
                        <TextProperties />
                    ) : selectedAudioId ? (
                        <AudioProperties />
                    ) : (
                        <ClipProperties fps={fps} />
                    )}
                </aside>
            </div>

            {/* Bottom - Timeline */}
            <div style={timelineContainerStyle}>
                <TransportControls
                    currentFrame={currentFrame}
                    totalDurationFrames={totalDurationFrames}
                    fps={fps}
                    isPlaying={isPlaying}
                    isLooping={isLooping}
                    zoom={zoom}
                    onTogglePlay={togglePlay}
                    onSeek={setCurrentFrame}
                    onSetZoom={setZoom}
                    onToggleLoop={() => setIsLooping(!isLooping)}
                />

                {/* Timeline tracks */}
                <TimelineTrack height={80} />
                <TimelineTextTrack height={40} />
                <TimelineAudioTrack height={40} />
            </div>

            {/* Export Modal */}
            <VideoExportModal
                isOpen={isExportModalOpen}
                onClose={() => setExportModalOpen(false)}
                onExport={handleExport}
                compositionId="EditedVideo"
                inputProps={inputProps}
                durationInSeconds={totalDurationFrames / fps}
            />
        </div>
    );
}
