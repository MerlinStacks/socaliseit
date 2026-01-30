/**
 * Keyboard Shortcuts Service
 * Global keyboard shortcut handling
 */

'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type ShortcutHandler = () => void;

interface Shortcut {
    key: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    alt?: boolean;
    handler: ShortcutHandler;
    description: string;
}

/**
 * All available keyboard shortcuts
 */
export const SHORTCUTS: Record<string, Shortcut> = {
    // Navigation (G + key)
    'go-dashboard': {
        key: 'd',
        description: 'Go to Dashboard',
        handler: () => { },
    },
    'go-calendar': {
        key: 'c',
        description: 'Go to Calendar',
        handler: () => { },
    },
    'go-compose': {
        key: 'n',
        description: 'Go to Compose',
        handler: () => { },
    },
    'go-media': {
        key: 'm',
        description: 'Go to Media',
        handler: () => { },
    },
    'go-analytics': {
        key: 'a',
        description: 'Go to Analytics',
        handler: () => { },
    },
    'go-settings': {
        key: 's',
        description: 'Go to Settings',
        handler: () => { },
    },

    // Actions
    'new-post': {
        key: 'n',
        shift: true,
        description: 'New Post',
        handler: () => { },
    },
    'search': {
        key: '/',
        description: 'Focus Search',
        handler: () => { },
    },
    'command-palette': {
        key: 'k',
        meta: true,
        description: 'Open Command Palette',
        handler: () => { },
    },
    'save': {
        key: 's',
        meta: true,
        description: 'Save',
        handler: () => { },
    },
};

/**
 * Hook for global keyboard shortcuts
 */
export function useKeyboardShortcuts() {
    const router = useRouter();

    // Track "G" key for go-to shortcuts
    let gKeyPressed = false;
    let gTimeout: NodeJS.Timeout | null = null;

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // Don't trigger shortcuts when typing in inputs
        const target = e.target as HTMLElement;
        if (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable
        ) {
            return;
        }

        // Handle "G + key" navigation shortcuts
        if (e.key.toLowerCase() === 'g' && !e.metaKey && !e.ctrlKey) {
            gKeyPressed = true;
            if (gTimeout) clearTimeout(gTimeout);
            gTimeout = setTimeout(() => {
                gKeyPressed = false;
            }, 500);
            return;
        }

        if (gKeyPressed) {
            gKeyPressed = false;
            if (gTimeout) clearTimeout(gTimeout);

            switch (e.key.toLowerCase()) {
                case 'd':
                    e.preventDefault();
                    router.push('/dashboard');
                    break;
                case 'c':
                    e.preventDefault();
                    router.push('/calendar');
                    break;
                case 'n':
                    e.preventDefault();
                    router.push('/compose');
                    break;
                case 'm':
                    e.preventDefault();
                    router.push('/media');
                    break;
                case 'a':
                    e.preventDefault();
                    router.push('/analytics');
                    break;
                case 's':
                    e.preventDefault();
                    router.push('/settings');
                    break;
            }
            return;
        }

        // Focus search with /
        if (e.key === '/') {
            e.preventDefault();
            const searchInput = document.querySelector('[data-search-input]') as HTMLInputElement;
            searchInput?.focus();
            return;
        }

        // New post with Shift + N
        if (e.shiftKey && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            router.push('/compose');
            return;
        }

        // Escape to close modals/overlays
        if (e.key === 'Escape') {
            // Close any open modals
            document.dispatchEvent(new CustomEvent('close-modals'));
            return;
        }
    }, [router]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}

/**
 * Keyboard Shortcuts Help Modal Data
 */
export const SHORTCUT_GROUPS = [
    {
        name: 'Navigation',
        shortcuts: [
            { keys: ['G', 'D'], description: 'Go to Dashboard' },
            { keys: ['G', 'C'], description: 'Go to Calendar' },
            { keys: ['G', 'N'], description: 'Go to Compose' },
            { keys: ['G', 'M'], description: 'Go to Media' },
            { keys: ['G', 'A'], description: 'Go to Analytics' },
            { keys: ['G', 'S'], description: 'Go to Settings' },
        ],
    },
    {
        name: 'Actions',
        shortcuts: [
            { keys: ['⇧', 'N'], description: 'New Post' },
            { keys: ['/'], description: 'Focus Search' },
            { keys: ['⌘', 'K'], description: 'Command Palette' },
            { keys: ['⌘', 'S'], description: 'Save' },
            { keys: ['ESC'], description: 'Close Modal' },
        ],
    },
    {
        name: 'Calendar',
        shortcuts: [
            { keys: ['←'], description: 'Previous Week' },
            { keys: ['→'], description: 'Next Week' },
            { keys: ['T'], description: 'Go to Today' },
        ],
    },
];
