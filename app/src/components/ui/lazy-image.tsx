/**
 * Lazy Image Component
 * Image with lazy loading via Intersection Observer.
 *
 * Why: Reduce initial page load by only loading visible images.
 */

'use client';

import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface LazyImageProps {
    src: string;
    alt: string;
    className?: string;
    placeholderClassName?: string;
    width?: number;
    height?: number;
    objectFit?: 'cover' | 'contain' | 'fill' | 'none';
    onLoad?: () => void;
    onError?: () => void;
}

export function LazyImage({
    src,
    alt,
    className,
    placeholderClassName,
    width,
    height,
    objectFit = 'cover',
    onLoad,
    onError,
}: LazyImageProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const [isLoaded, setIsLoaded] = useState(false);
    const [isInView, setIsInView] = useState(false);
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        const img = imgRef.current;
        if (!img) return;

        // Use native lazy loading as primary strategy
        if ('loading' in HTMLImageElement.prototype) {
            img.loading = 'lazy';
            setIsInView(true);
            return;
        }

        // Fallback: Intersection Observer for older browsers
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsInView(true);
                        observer.unobserve(entry.target);
                    }
                });
            },
            {
                rootMargin: '100px', // Start loading 100px before visible
                threshold: 0.01,
            }
        );

        observer.observe(img);

        return () => observer.disconnect();
    }, []);

    const handleLoad = () => {
        setIsLoaded(true);
        onLoad?.();
    };

    const handleError = () => {
        setHasError(true);
        onError?.();
    };

    return (
        <div className={cn('relative overflow-hidden', className)}>
            {/* Placeholder skeleton */}
            {!isLoaded && !hasError && (
                <div
                    className={cn(
                        'absolute inset-0 animate-pulse bg-[var(--bg-tertiary)]',
                        placeholderClassName
                    )}
                />
            )}

            {/* Error state */}
            {hasError && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-tertiary)]">
                    <span className="text-xs text-[var(--text-muted)]">Failed to load</span>
                </div>
            )}

            {/* Actual image */}
            <img
                ref={imgRef}
                src={isInView ? src : undefined}
                data-src={src}
                alt={alt}
                width={width}
                height={height}
                onLoad={handleLoad}
                onError={handleError}
                className={cn(
                    'transition-opacity duration-300',
                    isLoaded ? 'opacity-100' : 'opacity-0',
                    objectFit === 'cover' && 'object-cover',
                    objectFit === 'contain' && 'object-contain',
                    'h-full w-full'
                )}
            />
        </div>
    );
}

/**
 * Lazy video thumbnail with play icon overlay.
 */
interface LazyVideoThumbnailProps extends Omit<LazyImageProps, 'src'> {
    thumbnailUrl?: string | null;
    videoUrl: string;
    duration?: number;
}

export function LazyVideoThumbnail({
    thumbnailUrl,
    videoUrl,
    duration,
    alt,
    className,
    ...props
}: LazyVideoThumbnailProps) {
    return (
        <div className={cn('relative', className)}>
            {thumbnailUrl ? (
                <LazyImage src={thumbnailUrl} alt={alt} className="h-full w-full" {...props} />
            ) : (
                <video
                    src={videoUrl}
                    className="h-full w-full object-cover"
                    preload="metadata"
                    muted
                />
            )}

            {/* Play icon overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="rounded-full bg-black/60 p-2">
                    <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </div>
            </div>

            {/* Duration badge */}
            {duration !== undefined && (
                <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
                    {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')}
                </div>
            )}
        </div>
    );
}
