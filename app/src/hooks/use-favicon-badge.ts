'use client';

/**
 * Favicon Badge Hook
 * Dynamically updates favicon to show notification count
 * Uses canvas to draw a badge overlay on the base favicon
 */

import { useEffect, useCallback, useRef } from 'react';

interface UseFaviconBadgeOptions {
    /** Badge background color */
    backgroundColor?: string;
    /** Badge text color */
    textColor?: string;
    /** Font size relative to favicon size */
    fontSize?: number;
}

const DEFAULT_OPTIONS: UseFaviconBadgeOptions = {
    backgroundColor: '#D4A574', // accent-gold
    textColor: '#FFFFFF',
    fontSize: 0.6,
};

/**
 * Hook to display notification badge on favicon
 * 
 * @param count - Number to display (0 removes badge)
 * @param options - Customization options
 * 
 * @example
 * // Show badge with count
 * useFaviconBadge(5);
 * 
 * @example
 * // Custom colors
 * useFaviconBadge(3, { backgroundColor: '#E8B4B8' });
 */
export function useFaviconBadge(count: number, options: UseFaviconBadgeOptions = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const originalFaviconRef = useRef<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    /**
     * Get the current favicon element
     */
    const getFaviconElement = useCallback((): HTMLLinkElement | null => {
        const existingFavicon = document.querySelector<HTMLLinkElement>(
            'link[rel="icon"], link[rel="shortcut icon"]'
        );

        if (existingFavicon) return existingFavicon;

        // Create one if it doesn't exist
        const newFavicon = document.createElement('link');
        newFavicon.rel = 'icon';
        newFavicon.type = 'image/png';
        document.head.appendChild(newFavicon);
        return newFavicon;
    }, []);

    /**
     * Draw badge on favicon
     */
    const drawBadge = useCallback((img: HTMLImageElement, badgeCount: number): string => {
        if (!canvasRef.current) {
            canvasRef.current = document.createElement('canvas');
        }

        const canvas = canvasRef.current;
        const size = img.width || 32;
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d');
        if (!ctx) return img.src;

        // Draw original favicon
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);

        if (badgeCount <= 0) {
            return canvas.toDataURL('image/png');
        }

        // Calculate badge dimensions
        const badgeRadius = size * 0.3;
        const badgeX = size - badgeRadius;
        const badgeY = badgeRadius;

        // Draw badge background (circle)
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = opts.backgroundColor!;
        ctx.fill();

        // Draw badge text
        const displayText = badgeCount > 99 ? '99+' : String(badgeCount);
        const fontSizePixels = badgeRadius * opts.fontSize! * (displayText.length > 2 ? 0.7 : 1);

        ctx.font = `bold ${fontSizePixels}px -apple-system, BlinkMacSystemFont, sans-serif`;
        ctx.fillStyle = opts.textColor!;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayText, badgeX, badgeY + 1);

        return canvas.toDataURL('image/png');
    }, [opts.backgroundColor, opts.textColor, opts.fontSize]);

    /**
     * Update favicon with badge
     */
    const updateFavicon = useCallback((badgeCount: number) => {
        const faviconElement = getFaviconElement();
        if (!faviconElement) return;

        // Store original favicon on first run
        if (!originalFaviconRef.current && faviconElement.href) {
            originalFaviconRef.current = faviconElement.href;
        }

        // Use original favicon as base
        const baseFavicon = originalFaviconRef.current || '/favicon.ico';

        // If count is 0, restore original
        if (badgeCount <= 0) {
            faviconElement.href = baseFavicon;
            return;
        }

        // Load base image and draw badge
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const newFavicon = drawBadge(img, badgeCount);
            faviconElement.href = newFavicon;
        };
        img.onerror = () => {
            // Fallback: just use original if loading fails
            faviconElement.href = baseFavicon;
        };
        img.src = baseFavicon;
    }, [getFaviconElement, drawBadge]);

    // Update when count changes
    useEffect(() => {
        updateFavicon(count);

        // Cleanup: restore original on unmount
        return () => {
            if (originalFaviconRef.current) {
                const faviconElement = getFaviconElement();
                if (faviconElement) {
                    faviconElement.href = originalFaviconRef.current;
                }
            }
        };
    }, [count, updateFavicon, getFaviconElement]);

    // Also update document title with count
    useEffect(() => {
        const originalTitle = document.title.replace(/^\(\d+\+?\)\s*/, '');

        if (count > 0) {
            const prefix = count > 99 ? '(99+)' : `(${count})`;
            document.title = `${prefix} ${originalTitle}`;
        } else {
            document.title = originalTitle;
        }

        return () => {
            document.title = originalTitle;
        };
    }, [count]);
}

/**
 * Set favicon badge imperatively (for non-React contexts)
 */
export function setFaviconBadge(count: number, backgroundColor = '#D4A574', textColor = '#FFFFFF') {
    const faviconElement = document.querySelector<HTMLLinkElement>(
        'link[rel="icon"], link[rel="shortcut icon"]'
    );

    if (!faviconElement) return;

    const baseFavicon = faviconElement.getAttribute('data-original-href') || faviconElement.href;

    // Store original
    if (!faviconElement.getAttribute('data-original-href')) {
        faviconElement.setAttribute('data-original-href', baseFavicon);
    }

    if (count <= 0) {
        faviconElement.href = baseFavicon;
        return;
    }

    const canvas = document.createElement('canvas');
    const size = 32;
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        ctx.drawImage(img, 0, 0, size, size);

        // Draw badge
        const badgeRadius = size * 0.3;
        const badgeX = size - badgeRadius;
        const badgeY = badgeRadius;

        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, 2 * Math.PI);
        ctx.fillStyle = backgroundColor;
        ctx.fill();

        const displayText = count > 99 ? '99+' : String(count);
        const fontSize = badgeRadius * 0.6 * (displayText.length > 2 ? 0.7 : 1);

        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(displayText, badgeX, badgeY + 1);

        faviconElement.href = canvas.toDataURL('image/png');
    };
    img.src = baseFavicon;
}
