/**
 * Loading Spinner Component
 * Gold-themed spinner using design system accent colors
 */

import { cn } from '@/lib/utils';

type SpinnerSize = 'sm' | 'md' | 'lg';

interface LoadingSpinnerProps {
    /** Size of the spinner */
    size?: SpinnerSize;
    /** Additional CSS classes */
    className?: string;
    /** Accessible label for screen readers */
    label?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
    sm: 'loading-spinner-sm',
    md: '',
    lg: 'loading-spinner-lg',
};

/**
 * Gold-themed loading spinner using design system accent color.
 * Uses CSS-only animation for performance.
 */
export function LoadingSpinner({
    size = 'md',
    className,
    label = 'Loading...'
}: LoadingSpinnerProps) {
    return (
        <div
            role="status"
            aria-label={label}
            className={cn('loading-spinner', sizeClasses[size], className)}
        >
            <span className="sr-only">{label}</span>
        </div>
    );
}

/**
 * Full-page loading overlay with centered spinner
 */
interface LoadingOverlayProps {
    /** Whether the overlay is visible */
    visible?: boolean;
    /** Loading message to display */
    message?: string;
}

export function LoadingOverlay({ visible = true, message }: LoadingOverlayProps) {
    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-sm">
            <LoadingSpinner size="lg" />
            {message && (
                <p className="mt-4 text-sm font-medium text-[var(--text-secondary)]">
                    {message}
                </p>
            )}
        </div>
    );
}

/**
 * Inline loading indicator for buttons or small spaces
 */
interface InlineLoaderProps {
    className?: string;
}

export function InlineLoader({ className }: InlineLoaderProps) {
    return (
        <div className={cn('flex items-center gap-1', className)}>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-gold)] animate-pulse" />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-gold)] animate-pulse" style={{ animationDelay: '150ms' }} />
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-gold)] animate-pulse" style={{ animationDelay: '300ms' }} />
        </div>
    );
}
