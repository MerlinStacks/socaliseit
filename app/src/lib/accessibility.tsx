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
 * Focus trap for modals and dialogs
 */
import { useEffect, useRef, useCallback } from 'react';

export function useFocusTrap(isActive: boolean) {
    const containerRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isActive) return;

        // Store currently focused element
        previousFocusRef.current = document.activeElement as HTMLElement;

        // Focus first focusable element
        const container = containerRef.current;
        if (!container) return;

        const focusableElements = getFocusableElements(container);
        if (focusableElements.length > 0) {
            (focusableElements[0] as HTMLElement).focus();
        }

        // Trap focus
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;

            const focusable = getFocusableElements(container);
            if (focusable.length === 0) return;

            const firstElement = focusable[0] as HTMLElement;
            const lastElement = focusable[focusable.length - 1] as HTMLElement;

            if (e.shiftKey && document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        };

        container.addEventListener('keydown', handleKeyDown);

        return () => {
            container.removeEventListener('keydown', handleKeyDown);
            // Restore focus
            previousFocusRef.current?.focus();
        };
    }, [isActive]);

    return containerRef;
}

function getFocusableElements(container: HTMLElement): NodeListOf<Element> {
    return container.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
}

/**
 * Announce changes to screen readers
 */
export function useAnnounce() {
    const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
        const announcer = document.createElement('div');
        announcer.setAttribute('role', 'status');
        announcer.setAttribute('aria-live', priority);
        announcer.setAttribute('aria-atomic', 'true');
        announcer.style.cssText = `
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    `;

        document.body.appendChild(announcer);

        // Small delay to ensure screen readers pick it up
        setTimeout(() => {
            announcer.textContent = message;
        }, 100);

        // Clean up
        setTimeout(() => {
            document.body.removeChild(announcer);
        }, 1000);
    }, []);

    return announce;
}

/**
 * Roving tabindex for keyboard navigation
 */
export function useRovingTabindex<T extends HTMLElement>(
    items: React.RefObject<T>[],
    options: {
        orientation?: 'horizontal' | 'vertical' | 'both';
        loop?: boolean;
    } = {}
) {
    const { orientation = 'horizontal', loop = true } = options;
    const currentIndexRef = useRef(0);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const isHorizontal = orientation === 'horizontal' || orientation === 'both';
        const isVertical = orientation === 'vertical' || orientation === 'both';

        let newIndex = currentIndexRef.current;

        if ((isHorizontal && e.key === 'ArrowRight') || (isVertical && e.key === 'ArrowDown')) {
            e.preventDefault();
            newIndex = currentIndexRef.current + 1;
            if (newIndex >= items.length) {
                newIndex = loop ? 0 : items.length - 1;
            }
        } else if ((isHorizontal && e.key === 'ArrowLeft') || (isVertical && e.key === 'ArrowUp')) {
            e.preventDefault();
            newIndex = currentIndexRef.current - 1;
            if (newIndex < 0) {
                newIndex = loop ? items.length - 1 : 0;
            }
        } else if (e.key === 'Home') {
            e.preventDefault();
            newIndex = 0;
        } else if (e.key === 'End') {
            e.preventDefault();
            newIndex = items.length - 1;
        } else {
            return;
        }

        currentIndexRef.current = newIndex;
        items[newIndex]?.current?.focus();
    }, [items, orientation, loop]);

    return { handleKeyDown, currentIndex: currentIndexRef.current };
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
