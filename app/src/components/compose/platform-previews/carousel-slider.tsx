/**
 * CarouselSlider Component for Platform Previews
 * Why: Real Instagram/Facebook carousel posts show swipeable images with
 * dot indicators and navigation arrows — this replicates that UX inside previews.
 */

'use client';

import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MediaPreview } from './shared';
import type { MediaItem } from '../platform-editor';

interface CarouselSliderProps {
    media: MediaItem[];
    /** CSS aspect-ratio class, e.g. "aspect-square" or "aspect-video" */
    aspectRatio?: string;
    /** Show slide counter badge (e.g. "1/4") in top-right — Instagram style */
    showCounter?: boolean;
    /** Background class for empty/loading state */
    bgClass?: string;
    className?: string;
}

/**
 * Swipeable carousel for multi-image previews
 * Why: Matches the native Instagram/Facebook carousel UX with arrows + dot indicators
 */
export function CarouselSlider({
    media,
    aspectRatio = 'aspect-square',
    showCounter = false,
    bgClass = 'bg-gray-100',
    className,
}: CarouselSliderProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const total = media.length;

    const goTo = useCallback((index: number) => {
        setCurrentIndex(Math.max(0, Math.min(index, total - 1)));
    }, [total]);

    const goPrev = useCallback(() => goTo(currentIndex - 1), [goTo, currentIndex]);
    const goNext = useCallback(() => goTo(currentIndex + 1), [goTo, currentIndex]);

    if (total === 0) return null;

    /* Single image — no carousel UI needed */
    if (total === 1) {
        return (
            <div className={cn(aspectRatio, bgClass, className)}>
                <MediaPreview media={media[0]} />
            </div>
        );
    }

    return (
        <div className={cn('relative group', className)}>
            {/* Slides container */}
            <div className={cn(aspectRatio, bgClass, 'overflow-hidden')}>
                <div
                    className="flex h-full transition-transform duration-300 ease-out"
                    style={{ transform: `translateX(-${currentIndex * 100}%)` }}
                >
                    {media.map((item) => (
                        <div
                            key={item.id}
                            className="h-full w-full flex-shrink-0"
                        >
                            <MediaPreview media={item} />
                        </div>
                    ))}
                </div>
            </div>

            {/* Slide counter badge — Instagram style */}
            {showCounter && (
                <div className="absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">
                    {currentIndex + 1}/{total}
                </div>
            )}

            {/* Previous arrow */}
            {currentIndex > 0 && (
                <button
                    onClick={goPrev}
                    className="absolute left-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Previous slide"
                >
                    <ChevronLeft className="h-3.5 w-3.5 text-gray-800" />
                </button>
            )}

            {/* Next arrow */}
            {currentIndex < total - 1 && (
                <button
                    onClick={goNext}
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Next slide"
                >
                    <ChevronRight className="h-3.5 w-3.5 text-gray-800" />
                </button>
            )}

            {/* Dot indicators */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1">
                {media.map((_, idx) => (
                    <button
                        key={idx}
                        onClick={() => goTo(idx)}
                        aria-label={`Go to slide ${idx + 1}`}
                        className={cn(
                            'rounded-full transition-all duration-200',
                            idx === currentIndex
                                ? 'h-1.5 w-1.5 bg-blue-500'
                                : 'h-1 w-1 bg-white/60 hover:bg-white/80'
                        )}
                    />
                ))}
            </div>
        </div>
    );
}
