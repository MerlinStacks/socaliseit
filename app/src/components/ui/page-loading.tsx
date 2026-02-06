/**
 * Page Loading Component
 * Full-page loading spinner with branded animation for initial app loads
 * 
 * Why: Provides a premium loading experience during route transitions
 * and initial app hydration, matching native app feel.
 */

'use client';

import { cn } from '@/lib/utils';

interface PageLoadingProps {
    /** Additional CSS classes */
    className?: string;
    /** Loading message to display */
    message?: string;
    /** Show the full-screen overlay variant */
    fullScreen?: boolean;
}

/**
 * Animated loading component with Overseek branding
 * Uses gradient pulsing and scale animation for premium feel
 */
export function PageLoading({
    className,
    message = 'Loading...',
    fullScreen = true
}: PageLoadingProps) {
    return (
        <div
            className={cn(
                'flex flex-col items-center justify-center gap-6',
                fullScreen && 'fixed inset-0 z-50 bg-[var(--bg-primary)]',
                className
            )}
        >
            {/* Animated Logo */}
            <div className="relative">
                {/* Outer glow ring */}
                <div className="absolute inset-0 animate-ping rounded-full bg-gradient-to-br from-[var(--accent-gold)] to-[var(--accent-pink)] opacity-20" />

                {/* Logo container with pulse */}
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--accent-gold)] to-[var(--accent-pink)] shadow-lg animate-pulse">
                    <span className="text-3xl font-bold text-white">O</span>
                </div>
            </div>

            {/* Loading text */}
            <div className="flex flex-col items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                    {message}
                </span>

                {/* Animated dots */}
                <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-gold)] [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-gold)] [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--accent-gold)]" />
                </div>
            </div>
        </div>
    );
}

/**
 * Skeleton variant for inline loading
 * Use within content areas instead of full-page
 */
export function PageLoadingInline({
    className,
    message = 'Loading...'
}: Omit<PageLoadingProps, 'fullScreen'>) {
    return (
        <PageLoading
            className={className}
            message={message}
            fullScreen={false}
        />
    );
}
