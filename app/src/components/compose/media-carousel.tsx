/**
 * MediaCarousel Component
 * Carousel view for media with bulk selection and validation support
 */

'use client';

import { useState, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Trash2, Check, X, Image, Film, Download } from 'lucide-react';
import { formatDuration, formatFileSize } from '@/lib/formatters';
import type { MediaItem } from './platform-editor';
import type { MediaInfo } from '@/lib/validation/types';
import { MediaValidationBadge, MediaValidationIndicator } from './media-validation-badge';
import { ProgressiveImage } from '@/components/ui/progressive-image';

interface MediaCarouselProps {
    /** Array of media items */
    items: MediaItem[];
    /** IDs of currently selected items */
    selectedIds: string[];
    /** Callback when selection changes */
    onSelectionChange: (ids: string[]) => void;
    /** Callback to remove a single item */
    onRemove: (id: string) => void;
    /** Callback to remove multiple items */
    onBulkRemove: (ids: string[]) => void;
    /** Callback to add more media */
    onAddMore?: () => void;
    /** Selected platforms for validation */
    platforms?: string[];
    /** Post types per platform for validation */
    postTypes?: Record<string, string>;
    /** Additional CSS classes */
    className?: string;
}

/**
 * Carousel view for media items with navigation and bulk selection
 * Why: Provides better UX than flat grid for viewing and managing media
 */
export function MediaCarousel({
    items,
    selectedIds,
    onSelectionChange,
    onRemove,
    onBulkRemove,
    onAddMore,
    platforms = [],
    postTypes = {},
    className,
}: MediaCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [selectionMode, setSelectionMode] = useState(false);
    const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());

    /**
     * Handle image load error by adding to broken set
     * Why: Shows placeholder icon instead of broken image indicator
     */
    const handleImageError = useCallback((id: string) => {
        setBrokenImages((prev) => new Set([...prev, id]));
    }, []);

    // Ensure currentIndex stays valid
    const safeIndex = useMemo(() => {
        if (items.length === 0) return 0;
        return Math.min(currentIndex, items.length - 1);
    }, [currentIndex, items.length]);

    const currentItem = items[safeIndex];

    /**
     * Convert MediaItem to MediaInfo for validation
     * Why: Validation engine uses a simplified MediaInfo type
     */
    const toMediaInfo = useCallback((item: MediaItem): MediaInfo => ({
        id: item.id,
        type: item.type,
        width: item.width || 0,
        height: item.height || 0,
        size: item.size || 0,
        duration: item.duration,
        mimeType: item.mimeType || '',
        format: item.filename?.split('.').pop() || '',
    }), []);

    /**
     * Navigate to previous item
     */
    const handlePrev = useCallback(() => {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
    }, [items.length]);

    /**
     * Navigate to next item
     */
    const handleNext = useCallback(() => {
        setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
    }, [items.length]);

    /**
     * Toggle selection for current item
     */
    const handleToggleSelection = useCallback(
        (id: string) => {
            if (selectedIds.includes(id)) {
                onSelectionChange(selectedIds.filter((i) => i !== id));
            } else {
                onSelectionChange([...selectedIds, id]);
            }
        },
        [selectedIds, onSelectionChange]
    );

    /**
     * Enter selection mode
     */
    const handleEnterSelectionMode = useCallback(() => {
        setSelectionMode(true);
    }, []);

    /**
     * Exit selection mode and clear selection
     */
    const handleExitSelectionMode = useCallback(() => {
        setSelectionMode(false);
        onSelectionChange([]);
    }, [onSelectionChange]);

    /**
     * Handle bulk delete
     */
    const handleBulkDelete = useCallback(() => {
        onBulkRemove(selectedIds);
        setSelectionMode(false);
        onSelectionChange([]);
    }, [selectedIds, onBulkRemove, onSelectionChange]);

    /**
     * Select all items
     */
    const handleSelectAll = useCallback(() => {
        onSelectionChange(items.map((item) => item.id));
    }, [items, onSelectionChange]);

    /**
     * Download media item
     */
    const handleDownload = useCallback((url: string, filename?: string) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }, []);

    if (items.length === 0) {
        return null;
    }

    return (
        <div className={cn('space-y-3', className)}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Media ({items.length})
                </h4>
                <div className="flex items-center gap-2">
                    {selectionMode ? (
                        <>
                            <button
                                onClick={handleSelectAll}
                                className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                                Select All
                            </button>
                            <button
                                onClick={handleExitSelectionMode}
                                className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                onClick={handleEnterSelectionMode}
                                className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            >
                                Select
                            </button>
                            {onAddMore && (
                                <button
                                    onClick={onAddMore}
                                    className="text-xs font-medium text-[var(--accent-gold)] hover:underline"
                                >
                                    + Add more
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Main Carousel View */}
            <div className="relative">
                {/* Large Preview */}
                <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-[var(--bg-tertiary)]">
                    {currentItem && (
                        <>
                            {brokenImages.has(currentItem.id) || (!currentItem.thumbnailUrl && !currentItem.url) ? (
                                <div className="flex h-full w-full items-center justify-center">
                                    {currentItem.type === 'video' ? (
                                        <Film className="h-16 w-16 text-[var(--text-muted)]" />
                                    ) : (
                                        <Image className="h-16 w-16 text-[var(--text-muted)]" />
                                    )}
                                </div>
                            ) : (
                                <ProgressiveImage
                                    src={currentItem.thumbnailUrl || currentItem.url}
                                    alt="Media preview"
                                    fill
                                    className="h-full w-full object-contain"
                                    priority
                                />
                            )}

                            {/* Video indicator overlay */}
                            {currentItem.type === 'video' && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg">
                                        <div className="ml-1 h-0 w-0 border-l-[12px] border-t-[8px] border-b-[8px] border-l-[var(--text-primary)] border-t-transparent border-b-transparent" />
                                    </div>
                                </div>
                            )}

                            {/* Selection checkbox */}
                            {selectionMode && (
                                <button
                                    onClick={() => handleToggleSelection(currentItem.id)}
                                    className={cn(
                                        'absolute top-3 left-3 flex h-6 w-6 items-center justify-center rounded-lg border-2 transition-all',
                                        selectedIds.includes(currentItem.id)
                                            ? 'border-[var(--accent-gold)] bg-[var(--accent-gold)] text-white'
                                            : 'border-white bg-white/80 text-transparent hover:border-[var(--accent-gold)]'
                                    )}
                                >
                                    <Check className="h-4 w-4" />
                                </button>
                            )}

                            {/* Remove button (single item) */}
                            {!selectionMode && (
                                <button
                                    onClick={() => onRemove(currentItem.id)}
                                    className="absolute top-3 right-12 flex h-7 w-7 items-center justify-center rounded-lg bg-red-500/90 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
                                    style={{ opacity: 1 }}
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}

                            {/* Download button (single item) */}
                            {!selectionMode && currentItem.url && (
                                <button
                                    onClick={() => handleDownload(currentItem.url, currentItem.filename)}
                                    className="absolute top-3 right-20 flex h-7 w-7 items-center justify-center rounded-lg bg-black/50 text-white transition-opacity hover:bg-black/70 opacity-0 group-hover:opacity-100"
                                    style={{ opacity: 1 }}
                                    title="Download Media"
                                >
                                    <Download className="h-4 w-4" />
                                </button>
                            )}

                            {/* Validation Badge */}
                            {platforms.length > 0 && (
                                <MediaValidationBadge
                                    media={toMediaInfo(currentItem)}
                                    platforms={platforms}
                                    postTypes={postTypes}
                                    className="absolute top-3 right-3"
                                />
                            )}

                            {/* Info bar */}
                            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-6 text-xs text-white">
                                <span>
                                    {currentItem.type === 'video' && currentItem.duration
                                        ? formatDuration(currentItem.duration)
                                        : currentItem.width && currentItem.height
                                            ? `${currentItem.width}×${currentItem.height}`
                                            : formatFileSize(currentItem.size)}
                                </span>
                                <span>
                                    {safeIndex + 1} of {items.length}
                                </span>
                            </div>
                        </>
                    )}
                </div>

                {/* Navigation Arrows */}
                {items.length > 1 && (
                    <>
                        <button
                            onClick={handlePrev}
                            className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button
                            onClick={handleNext}
                            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
                        >
                            <ChevronRight className="h-5 w-5" />
                        </button>
                    </>
                )}
            </div>

            {/* Thumbnail Strip */}
            {items.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {items.map((item, index) => {
                        const isActive = index === safeIndex;
                        const isSelected = selectedIds.includes(item.id);

                        return (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setCurrentIndex(index);
                                    if (selectionMode) {
                                        handleToggleSelection(item.id);
                                    }
                                }}
                                className={cn(
                                    'relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-lg transition-all',
                                    isActive
                                        ? 'ring-2 ring-[var(--accent-gold)]'
                                        : 'opacity-60 hover:opacity-100',
                                    selectionMode && isSelected && 'ring-2 ring-[var(--accent-gold)]'
                                )}
                            >
                                {brokenImages.has(item.id) || (!item.thumbnailUrl && !item.url) ? (
                                    <div className="flex h-full w-full items-center justify-center bg-[var(--bg-secondary)]">
                                        {item.type === 'video' ? (
                                            <Film className="h-5 w-5 text-[var(--text-muted)]" />
                                        ) : (
                                            <Image className="h-5 w-5 text-[var(--text-muted)]" />
                                        )}
                                    </div>
                                ) : (
                                    <img
                                        src={item.thumbnailUrl || item.url}
                                        alt=""
                                        className="h-full w-full object-cover"
                                        onError={() => handleImageError(item.id)}
                                    />
                                )}
                                {selectionMode && isSelected && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent-gold)]/40">
                                        <Check className="h-5 w-5 text-white" />
                                    </div>
                                )}
                                {/* Validation indicator dot on thumbnails */}
                                {platforms.length > 0 && (
                                    <MediaValidationIndicator
                                        media={toMediaInfo(item)}
                                        platforms={platforms}
                                        postTypes={postTypes}
                                    />
                                )}
                                {item.type === 'video' && (
                                    <div className="absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[8px] text-white">
                                        {item.duration ? formatDuration(item.duration) : '▶'}
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Bulk Action Bar */}
            {selectionMode && selectedIds.length > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-[var(--bg-tertiary)] px-4 py-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                        {selectedIds.length} selected
                    </span>
                    <button
                        onClick={handleBulkDelete}
                        className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete Selected
                    </button>
                </div>
            )}
        </div>
    );
}
