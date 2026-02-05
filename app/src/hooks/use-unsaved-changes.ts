'use client';

/**
 * useUnsavedChanges Hook
 * Warns users before leaving page with unsaved content
 * Why: Prevents accidental data loss when navigating away
 */

import { useEffect, useCallback, useState } from 'react';

interface UseUnsavedChangesOptions {
    /** Whether there are unsaved changes */
    hasChanges: boolean;
    /** Custom warning message */
    message?: string;
    /** Whether the warning is enabled */
    enabled?: boolean;
}

/**
 * Hook to warn users before leaving page with unsaved changes
 * Uses beforeunload event for browser navigation and Next.js router for internal navigation
 */
export function useUnsavedChanges({
    hasChanges,
    message = 'You have unsaved changes. Are you sure you want to leave?',
    enabled = true,
}: UseUnsavedChangesOptions) {
    const shouldWarn = hasChanges && enabled;

    // Browser navigation (refresh, close tab, type URL)
    useEffect(() => {
        if (!shouldWarn) return;

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            // Modern browsers ignore custom messages but require returnValue
            e.returnValue = message;
            return message;
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [shouldWarn, message]);

    // Optional: Provide a confirm function for programmatic navigation
    const confirmNavigation = useCallback(() => {
        if (!shouldWarn) return true;
        return window.confirm(message);
    }, [shouldWarn, message]);

    return { confirmNavigation, shouldWarn };
}

/**
 * Simpler hook that just tracks if content has changed from initial state
 */
export function useHasChanges<T>(current: T, initial: T): boolean {
    return JSON.stringify(current) !== JSON.stringify(initial);
}

/**
 * Hook for managing auto-save with debounced updates
 */
interface UseAutoSaveOptions<T> {
    data: T;
    onSave: (data: T) => Promise<void>;
    debounceMs?: number;
    enabled?: boolean;
}

interface AutoSaveState {
    status: 'idle' | 'saving' | 'saved' | 'error';
    lastSaved: Date | null;
    error: string | null;
}

export function useAutoSave<T>({
    data,
    onSave,
    debounceMs = 3000,
    enabled = true,
}: UseAutoSaveOptions<T>) {
    const [state, setState] = useState<AutoSaveState>({
        status: 'idle',
        lastSaved: null,
        error: null,
    });

    useEffect(() => {
        if (!enabled) return;

        const timer = setTimeout(async () => {
            setState(prev => ({ ...prev, status: 'saving', error: null }));
            try {
                await onSave(data);
                setState({
                    status: 'saved',
                    lastSaved: new Date(),
                    error: null,
                });
                // Reset to idle after showing "Saved"
                setTimeout(() => {
                    setState(prev => prev.status === 'saved' ? { ...prev, status: 'idle' } : prev);
                }, 2000);
            } catch (err) {
                setState({
                    status: 'error',
                    lastSaved: null,
                    error: err instanceof Error ? err.message : 'Save failed',
                });
            }
        }, debounceMs);

        return () => clearTimeout(timer);
    }, [data, onSave, debounceMs, enabled]);

    return state;
}
