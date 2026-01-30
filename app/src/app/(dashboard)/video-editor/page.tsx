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
    MediaPicker,
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
import {
    Film,
    Download,
    ChevronDown,
    Undo2,
    Redo2,
    ZoomIn,
    ZoomOut,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Repeat,

    LayoutGrid,
    Type,
    Plus,
} from 'lucide-react';

type AspectRatioKey = keyof typeof ASPECT_RATIOS;

export default function VideoEditorPage() {
    const playerRef = useRef<PlayerRef>(null);

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
    } = useVideoProject();

    // Modal state
    const [isExportModalOpen, setExportModalOpen] = React.useState(false);
    const [showMediaPicker, setShowMediaPicker] = React.useState(true);
    const [activeSidebarTab, setActiveSidebarTab] = React.useState<'media' | 'text'>('media');

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


    // Handle add text
    const handleAddText = () => {
        addTextOverlay({
            text: 'New Text',
            startFrame: currentFrame,
            durationFrames: 90, // 3 seconds
            position: { x: 540, y: 960 }, // Center (for Story/Portrait) - will need adjustment based on aspect ratio
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

    // Format timecode
    const formatTimecode = (frame: number): string => {
        const totalSeconds = Math.floor(frame / fps);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const frames = frame % fps;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
    };

    return (
        <div style={containerStyle}>
            {/* Header */}
            <header style={headerStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <Film size={24} style={{ color: '#6366f1' }} />
                    <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                        {project.name}
                    </h1>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Aspect ratio selector */}
                    <select
                        value={project.aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value as AspectRatioKey)}
                        style={selectStyle}
                    >
                        {Object.entries(ASPECT_RATIOS).map(([key, value]) => (
                            <option key={key} value={key}>
                                {value.label}
                            </option>
                        ))}
                    </select>

                    {/* Toggle media picker */}
                    <button
                        onClick={() => setShowMediaPicker(!showMediaPicker)}
                        style={{
                            ...iconButtonStyle,
                            backgroundColor: showMediaPicker
                                ? 'rgba(99, 102, 241, 0.3)'
                                : 'rgba(255,255,255,0.05)',
                        }}
                        title="Toggle media panel"
                    >
                        <LayoutGrid size={16} />
                    </button>

                    {/* Export button */}
                    <button
                        onClick={() => setExportModalOpen(true)}
                        style={exportButtonStyle}
                    >
                        <Download size={16} />
                        Export
                    </button>
                </div>
            </header>

            {/* Main content */}
            <div style={mainContentStyle}>
                {/* Left sidebar - Media Picker */}
                {showMediaPicker && (
                    <aside style={leftSidebarStyle}>
                        {/* Sidebar Tabs */}
                        <div style={sidebarTabsStyle}>
                            <button
                                onClick={() => setActiveSidebarTab('media')}
                                style={{
                                    ...sidebarTabStyle,
                                    borderBottom: activeSidebarTab === 'media' ? '2px solid #6366f1' : '2px solid transparent',
                                    color: activeSidebarTab === 'media' ? '#fff' : 'rgba(255,255,255,0.5)',
                                }}
                            >
                                <Film size={14} />
                                Media
                            </button>
                            <button
                                onClick={() => setActiveSidebarTab('text')}
                                style={{
                                    ...sidebarTabStyle,
                                    borderBottom: activeSidebarTab === 'text' ? '2px solid #6366f1' : '2px solid transparent',
                                    color: activeSidebarTab === 'text' ? '#fff' : 'rgba(255,255,255,0.5)',
                                }}
                            >
                                <Type size={14} />
                                Text
                            </button>
                        </div>

                        {/* Sidebar Content */}
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            {activeSidebarTab === 'media' ? (
                                <MediaPicker />
                            ) : (
                                <div style={textPanelStyle}>
                                    <button onClick={handleAddText} style={addTextButtonStyle}>
                                        <Plus size={16} />
                                        Add Text Overlay
                                    </button>
                                    <p style={helperTextStyle}>
                                        Add text to the timeline using the button above.
                                        Select text on the timeline to edit properties.
                                    </p>
                                </div>
                            )}
                        </div>
                    </aside>
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
                {/* Transport controls */}
                <div style={transportStyle}>
                    <div style={timecodeStyle}>
                        {formatTimecode(currentFrame)} / {formatTimecode(totalDurationFrames)}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button
                            onClick={() => setCurrentFrame(0)}
                            style={transportButtonStyle}
                            title="Go to start"
                        >
                            <SkipBack size={16} />
                        </button>
                        <button
                            onClick={() => setCurrentFrame(Math.max(0, currentFrame - fps))}
                            style={transportButtonStyle}
                            title="Back 1 second"
                        >
                            <SkipBack size={14} />
                        </button>
                        <button
                            onClick={togglePlay}
                            style={playButtonStyle}
                            title={isPlaying ? 'Pause' : 'Play'}
                        >
                            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                        </button>
                        <button
                            onClick={() => setCurrentFrame(Math.min(totalDurationFrames, currentFrame + fps))}
                            style={transportButtonStyle}
                            title="Forward 1 second"
                        >
                            <SkipForward size={14} />
                        </button>
                        <button
                            onClick={() => setCurrentFrame(totalDurationFrames)}
                            style={transportButtonStyle}
                            title="Go to end"
                        >
                            <SkipForward size={16} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Zoom controls */}
                        <button
                            onClick={() => setZoom(zoom / 1.5)}
                            style={transportButtonStyle}
                            title="Zoom out"
                        >
                            <ZoomOut size={14} />
                        </button>
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', minWidth: 40, textAlign: 'center' }}>
                            {Math.round(zoom * 100)}%
                        </span>
                        <button
                            onClick={() => setZoom(zoom * 1.5)}
                            style={transportButtonStyle}
                            title="Zoom in"
                        >
                            <ZoomIn size={14} />
                        </button>

                        {/* Loop toggle */}
                        <button
                            onClick={() => setIsLooping(!isLooping)}
                            style={{
                                ...transportButtonStyle,
                                backgroundColor: isLooping
                                    ? 'rgba(99, 102, 241, 0.3)'
                                    : 'transparent',
                                border: isLooping
                                    ? '1px solid #6366f1'
                                    : '1px solid rgba(255,255,255,0.2)',
                            }}
                            title="Toggle loop"
                        >
                            <Repeat size={14} />
                        </button>
                    </div>
                </div>

                {/* Timeline track */}
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

// ============================================================================
// STYLES
// ============================================================================

const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#0a0a0f',
    color: '#fff',
    overflow: 'hidden',
};

const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    flexShrink: 0,
};

const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    fontSize: 13,
    cursor: 'pointer',
};

const iconButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
};

const exportButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 16px',
    backgroundColor: '#6366f1',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
};

const mainContentStyle: React.CSSProperties = {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
};

const leftSidebarStyle: React.CSSProperties = {
    width: 240,
    borderRight: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    padding: 0,
    overflowY: 'hidden',
    display: 'flex',
    flexDirection: 'column',
};

const centerPanelStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    overflow: 'hidden',
};

const previewContainerStyle: React.CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: 900,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
};

const aspectBadgeStyle: React.CSSProperties = {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: '#fff',
    padding: '4px 8px',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500,
};

const rightSidebarStyle: React.CSSProperties = {
    width: 260,
    borderLeft: '1px solid rgba(255,255,255,0.08)',
    flexShrink: 0,
    padding: 12,
    overflowY: 'auto',
};

const timelineContainerStyle: React.CSSProperties = {
    borderTop: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    flexShrink: 0,
};

const transportStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
};

const timecodeStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    minWidth: 120,
};

const transportButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.08)',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    cursor: 'pointer',
};

const playButtonStyle: React.CSSProperties = {
    color: '#fff',
    cursor: 'pointer',
};

const sidebarTabsStyle: React.CSSProperties = {
    display: 'flex',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const sidebarTabStyle: React.CSSProperties = {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '12px',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
};

const textPanelStyle: React.CSSProperties = {
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
};

const addTextButtonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '12px',
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    borderRadius: 6,
    color: '#6366f1',
    fontWeight: 600,
    cursor: 'pointer',
};

const helperTextStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 1.5,
};
