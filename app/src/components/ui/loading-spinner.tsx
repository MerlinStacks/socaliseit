/**
 * Loading Spinner Component
 * Gold-themed spinner using design system accent colors
 */

import { cn } from '@/lib/utils';

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';
type SpinnerVariant = 'default' | 'branded';

interface LoadingSpinnerProps {
    /** Size of the spinner */
    size?: SpinnerSize;
    /** Visual variant - 'branded' uses gold/pink gradient */
    variant?: SpinnerVariant;
    /** Additional CSS classes */
    className?: string;
    /** Accessible label for screen readers */
    label?: string;
}

const sizeClasses: Record<SpinnerSize, { default: string; branded: string }> = {
    sm: { default: 'loading-spinner-sm', branded: 'spinner-gradient-sm' },
    md: { default: '', branded: '' },
    lg: { default: 'loading-spinner-lg', branded: 'spinner-gradient-lg' },
    xl: { default: 'loading-spinner-lg', branded: 'spinner-gradient-xl' },
};

/**
 * Gold-themed loading spinner using design system accent color.
 * Uses CSS-only animation for performance.
 * 
 * @example
 * // Default spinner
 * <LoadingSpinner size="lg" />
 * 
 * @example
 * // Branded gradient spinner
 * <LoadingSpinner variant="branded" size="xl" />
 */
export function LoadingSpinner({
    size = 'md',
    variant = 'default',
    className,
    label = 'Loading...'
}: LoadingSpinnerProps) {
    const baseClass = variant === 'branded' ? 'spinner-gradient' : 'loading-spinner';
    const sizeClass = sizeClasses[size][variant];

    return (
        <div
            role="status"
            aria-label={label}
            className={cn(baseClass, sizeClass, className)}
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
    /** Use branded gradient spinner */
    branded?: boolean;
}

export function LoadingOverlay({ visible = true, message, branded = false }: LoadingOverlayProps) {
    if (!visible) return null;

    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-sm">
            <LoadingSpinner size="lg" variant={branded ? 'branded' : 'default'} />
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

