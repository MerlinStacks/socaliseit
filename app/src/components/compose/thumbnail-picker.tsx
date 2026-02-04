'use client';

/**
 * ThumbnailPicker - Custom video thumbnail selection component
 * Why: Allows users to pick a frame from the video or upload a custom image
 * as the thumbnail, instead of using the auto-generated one.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
    Image,
    Upload,
    RefreshCw,
    Check,
    ChevronLeft,
    ChevronRight,
    Film,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ThumbnailCandidate {
    timestamp: number;
    dataUrl: string;
}

interface ThumbnailPickerProps {
    /** Video URL to extract frames from */
    videoUrl: string;
    /** Currently selected thumbnail URL */
    currentThumbnail?: string;
    /** Callback when thumbnail is selected */
    onThumbnailChange: (thumbnailUrl: string) => void;
    /** Callback to trigger custom upload */
    onUploadCustom?: () => void;
    /** CSS class name */
    className?: string;
}

const FRAME_COUNT = 8; // Number of frames to extract
const THUMBNAIL_WIDTH = 160;
const THUMBNAIL_HEIGHT = 90;

/**
 * ThumbnailPicker - Frame scrubber + custom upload for video thumbnails
 */
export function ThumbnailPicker({
    videoUrl,
    currentThumbnail,
    onThumbnailChange,
    onUploadCustom,
    className,
}: ThumbnailPickerProps) {
    const [candidates, setCandidates] = useState<ThumbnailCandidate[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [scrollPosition, setScrollPosition] = useState(0);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    /**
     * Extract frames from video at evenly distributed intervals
     * Why: Canvas-based extraction works client-side without server dependencies
     */
    const extractFrames = useCallback(async () => {
        if (!videoUrl) return;
        setIsLoading(true);
        setError(null);
        setCandidates([]);
        setSelectedIndex(null);

        try {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.preload = 'metadata';

            await new Promise<void>((resolve, reject) => {
                video.onloadedmetadata = () => resolve();
                video.onerror = () => reject(new Error('Failed to load video'));
                video.src = videoUrl;
            });

            const duration = video.duration;
            if (!duration || duration <= 0) {
                throw new Error('Invalid video duration');
            }

            const canvas = document.createElement('canvas');
            canvas.width = THUMBNAIL_WIDTH * 2; // 2x for retina
            canvas.height = THUMBNAIL_HEIGHT * 2;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas context unavailable');

            const frames: ThumbnailCandidate[] = [];
            const interval = duration / (FRAME_COUNT + 1);

            for (let i = 1; i <= FRAME_COUNT; i++) {
                const timestamp = interval * i;
                await seekToTime(video, timestamp);
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                frames.push({
                    timestamp,
                    dataUrl: canvas.toDataURL('image/jpeg', 0.8),
                });
            }

            setCandidates(frames);
            video.remove();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to extract frames');
        } finally {
            setIsLoading(false);
        }
    }, [videoUrl]);

    /**
     * Seek video to specific time and wait for frame
     */
    const seekToTime = (video: HTMLVideoElement, time: number): Promise<void> => {
        return new Promise((resolve) => {
            const onSeeked = () => {
                video.removeEventListener('seeked', onSeeked);
                // Small delay for frame to render
                setTimeout(resolve, 50);
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = time;
        });
    };

    // Extract frames on mount or when video URL changes
    useEffect(() => {
        extractFrames();
    }, [extractFrames]);

    /**
     * Handle frame selection
     */
    const handleSelectFrame = (index: number) => {
        setSelectedIndex(index);
        const candidate = candidates[index];
        if (candidate) {
            onThumbnailChange(candidate.dataUrl);
        }
    };

    /**
     * Scroll carousel left/right
     */
    const scroll = (direction: 'left' | 'right') => {
        const container = scrollContainerRef.current;
        if (!container) return;
        const scrollAmount = THUMBNAIL_WIDTH + 8; // thumbnail width + gap
        const newPosition = direction === 'left'
            ? scrollPosition - scrollAmount
            : scrollPosition + scrollAmount;
        container.scrollTo({ left: newPosition, behavior: 'smooth' });
        setScrollPosition(newPosition);
    };

    /**
     * Handle scroll events to update position
     */
    const handleScroll = () => {
        if (scrollContainerRef.current) {
            setScrollPosition(scrollContainerRef.current.scrollLeft);
        }
    };

    /**
     * Format timestamp for display
     */
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const canScrollLeft = scrollPosition > 0;
    const canScrollRight = scrollContainerRef.current
        ? scrollPosition < scrollContainerRef.current.scrollWidth - scrollContainerRef.current.clientWidth - 10
        : false;

    return (
        <div className={cn('space-y-3', className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
                    <Film className="h-4 w-4" />
                    Video Thumbnail
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={extractFrames}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                    >
                        <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
                        Refresh
                    </button>
                    {onUploadCustom && (
                        <button
                            onClick={onUploadCustom}
                            className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-tertiary)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--accent-gold-light)] hover:text-[var(--accent-gold)]"
                        >
                            <Upload className="h-3 w-3" />
                            Upload Custom
                        </button>
                    )}
                </div>
            </div>

            {/* Frame Carousel */}
            <div className="relative">
                {/* Scroll Left Button */}
                {canScrollLeft && (
                    <button
                        onClick={() => scroll('left')}
                        className="absolute -left-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--bg-primary)] shadow-lg transition-colors hover:bg-[var(--bg-tertiary)]"
                    >
                        <ChevronLeft className="h-5 w-5 text-[var(--text-primary)]" />
                    </button>
                )}

                {/* Frames Container */}
                <div
                    ref={scrollContainerRef}
                    onScroll={handleScroll}
                    className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {isLoading ? (
                        // Loading skeletons
                        Array.from({ length: FRAME_COUNT }).map((_, i) => (
                            <div
                                key={i}
                                className="flex-shrink-0 animate-pulse rounded-lg bg-[var(--bg-tertiary)]"
                                style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }}
                            />
                        ))
                    ) : error ? (
                        // Error state
                        <div className="flex w-full flex-col items-center justify-center py-6 text-center">
                            <Image className="mb-2 h-8 w-8 text-[var(--text-muted)]" />
                            <p className="text-sm text-[var(--text-muted)]">{error}</p>
                            <button
                                onClick={extractFrames}
                                className="mt-2 text-xs font-medium text-[var(--accent-gold)] hover:underline"
                            >
                                Try again
                            </button>
                        </div>
                    ) : (
                        // Frame candidates
                        candidates.map((candidate, index) => (
                            <button
                                key={index}
                                onClick={() => handleSelectFrame(index)}
                                className={cn(
                                    'group relative flex-shrink-0 overflow-hidden rounded-lg border-2 transition-all',
                                    selectedIndex === index
                                        ? 'border-[var(--accent-gold)] ring-2 ring-[var(--accent-gold-light)]'
                                        : 'border-transparent hover:border-[var(--border)]'
                                )}
                                style={{ width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT }}
                            >
                                <img
                                    src={candidate.dataUrl}
                                    alt={`Frame at ${formatTime(candidate.timestamp)}`}
                                    className="h-full w-full object-cover"
                                />
                                {/* Time label */}
                                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                    {formatTime(candidate.timestamp)}
                                </span>
                                {/* Selected indicator */}
                                {selectedIndex === index && (
                                    <div className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-gold)]">
                                        <Check className="h-3 w-3 text-white" />
                                    </div>
                                )}
                                {/* Hover overlay */}
                                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/10" />
                            </button>
                        ))
                    )}
                </div>

                {/* Scroll Right Button */}
                {canScrollRight && (
                    <button
                        onClick={() => scroll('right')}
                        className="absolute -right-2 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--bg-primary)] shadow-lg transition-colors hover:bg-[var(--bg-tertiary)]"
                    >
                        <ChevronRight className="h-5 w-5 text-[var(--text-primary)]" />
                    </button>
                )}
            </div>

            {/* Current selection info */}
            {selectedIndex !== null && candidates[selectedIndex] && (
                <p className="text-xs text-[var(--text-muted)]">
                    Selected: Frame at {formatTime(candidates[selectedIndex].timestamp)}
                </p>
            )}
        </div>
    );
}
