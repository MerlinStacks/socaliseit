'use client';

/**
 * Progressive Image Component
 * Blur-up/LQIP loading for smooth image transitions
 * Why: Better perceived performance for media-heavy content
 */

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

interface ProgressiveImageProps {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    fill?: boolean;
    className?: string;
    containerClassName?: string;
    priority?: boolean;
    /** Low-quality placeholder (data URL or tiny image URL) */
    placeholder?: string;
    /** Blur radius for placeholder */
    blurAmount?: number;
}

/**
 * Image with blur-up loading effect
 */
export function ProgressiveImage({
    src,
    alt,
    width,
    height,
    fill,
    className,
    containerClassName,
    priority = false,
    placeholder,
    blurAmount = 20,
}: ProgressiveImageProps) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [error, setError] = useState(false);

    // Reset state when src changes
    useEffect(() => {
        setIsLoaded(false);
        setError(false);
    }, [src]);

    if (error) {
        return (
            <div
                className={cn(
                    'flex items-center justify-center bg-[var(--bg-tertiary)]',
                    containerClassName
                )}
                style={{ width, height }}
            >
                <span className="text-xs text-[var(--text-muted)]">Failed to load</span>
            </div>
        );
    }

    return (
        <div className={cn('relative overflow-hidden', containerClassName)}>
            {/* Placeholder with blur */}
            {placeholder && !isLoaded && (
                <div
                    className="absolute inset-0 bg-cover bg-center animate-pulse"
                    style={{
                        backgroundImage: `url(${placeholder})`,
                        filter: `blur(${blurAmount}px)`,
                        transform: 'scale(1.1)', // Prevent blur edges from showing
                    }}
                />
            )}

            {/* Gradient shimmer while loading */}
            {!isLoaded && !placeholder && (
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg-secondary)] via-[var(--bg-tertiary)] to-[var(--bg-secondary)] animate-shimmer bg-[length:200%_100%]" />
            )}

            {/* Actual image */}
            <Image
                src={src}
                alt={alt}
                width={width}
                height={height}
                fill={fill}
                priority={priority}
                className={cn(
                    'transition-opacity duration-300',
                    isLoaded ? 'opacity-100' : 'opacity-0',
                    className
                )}
                onLoad={() => setIsLoaded(true)}
                onError={() => setError(true)}
            />
        </div>
    );
}

/**
 * Generate a tiny placeholder from src (for external images)
 */
export function generatePlaceholder(src: string, size = 10): string {
    // For Next.js image optimization, use blur placeholder
    // For external images, we'd need a separate service
    return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'%3E%3Crect fill='%23333' width='100%25' height='100%25'/%3E%3C/svg%3E`;
}

export default ProgressiveImage;
