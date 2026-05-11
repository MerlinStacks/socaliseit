'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Focus trap for modals and dialogs
 */
export function useFocusTrap(isActive: boolean) {
    const containerRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isActive) return;

        previousFocusRef.current = document.activeElement as HTMLElement;

        const container = containerRef.current;
        if (!container) return;

        const focusableElements = getFocusableElements(container);
        if (focusableElements.length > 0) {
            (focusableElements[0] as HTMLElement).focus();
        }

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

        setTimeout(() => {
            announcer.textContent = message;
        }, 100);

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

    return { handleKeyDown, getCurrentIndex: () => currentIndexRef.current };
}
