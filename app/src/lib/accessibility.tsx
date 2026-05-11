/**
 * Accessibility Utilities
 * WCAG 2.2 AA compliance helpers
 */

/**
 * Screen reader only text
 * Visually hidden but accessible to screen readers
 */
export function ScreenReaderOnly({ children }: { children: React.ReactNode }) {
    return (
        <span
            style={{
                position: 'absolute',
                width: '1px',
                height: '1px',
                padding: 0,
                margin: '-1px',
                overflow: 'hidden',
                clip: 'rect(0, 0, 0, 0)',
                whiteSpace: 'nowrap',
                border: 0,
            }}
        >
            {children}
        </span>
    );
}

/**
 * Skip to main content link
 */
export function SkipLink({ href = '#main-content' }: { href?: string }) {
    return (
        <a
            href={href}
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-[var(--accent-gold)] focus:px-4 focus:py-2 focus:text-white focus:outline-none"
        >
            Skip to main content
        </a>
    );
}

/**
 * Reduced motion preference
 */
export function usePrefersReducedMotion(): boolean {
    if (typeof window === 'undefined') return false;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    return mediaQuery.matches;
}

/**
 * High contrast mode detection
 */
export function usePrefersHighContrast(): boolean {
    if (typeof window === 'undefined') return false;

    const mediaQuery = window.matchMedia('(prefers-contrast: high)');
    return mediaQuery.matches;
}

/**
 * Accessible loading state
 */
interface LoadingProps {
    isLoading: boolean;
    loadingText?: string;
    children: React.ReactNode;
}

export function AccessibleLoading({ isLoading, loadingText = 'Loading...', children }: LoadingProps) {
    return (
        <div aria-busy={isLoading} aria-live="polite">
            {isLoading ? (
                <div role="status">
                    <span className="sr-only">{loadingText}</span>
                    {children}
                </div>
            ) : (
                children
            )}
        </div>
    );
}

/**
 * Color contrast checker
 */
export function getContrastRatio(color1: string, color2: string): number {
    const lum1 = getLuminance(color1);
    const lum2 = getLuminance(color2);

    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);

    return (lighter + 0.05) / (darker + 0.05);
}

function getLuminance(hex: string): number {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;

    const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        }
        : null;
}

/**
 * Check if contrast meets WCAG AA standard
 * Normal text: 4.5:1
 * Large text: 3:1
 */
export function meetsContrastRequirement(
    foreground: string,
    background: string,
    isLargeText: boolean = false
): boolean {
    const ratio = getContrastRatio(foreground, background);
    return isLargeText ? ratio >= 3 : ratio >= 4.5;
}
