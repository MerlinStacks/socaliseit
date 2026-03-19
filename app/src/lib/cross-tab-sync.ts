/**
 * Cross-Tab Sync
 * Synchronizes state across browser tabs using BroadcastChannel API.
 *
 * Why: Users may have multiple tabs open (calendar, compose, etc.).
 * Without sync, editing a post in one tab leaves stale data in others.
 * This creates a real-time sync mechanism for critical data changes.
 */

'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { clientLogger } from '@/lib/client-logger';
import { buildCalendarQueryKey, calendarPrefetchFn, CALENDAR_STALE_TIME } from '@/hooks/use-calendar-data';

/** The BroadcastChannel name for SocialiseIT sync */
const CHANNEL_NAME = 'socialiseit-sync';

/** Types of sync events */
export type SyncEventType =
    | 'post:created'
    | 'post:updated'
    | 'post:deleted'
    | 'post:published'
    | 'draft:saved'
    | 'account:connected'
    | 'account:disconnected'
    | 'settings:updated';

/** Sync event payload */
export interface SyncEvent {
    type: SyncEventType;
    resourceId?: string;
    organizationId?: string;
    timestamp: number;
    tabId: string;
}

/** Unique ID for this tab */
const TAB_ID = typeof window !== 'undefined'
    ? `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`
    : 'server';

let channel: BroadcastChannel | null = null;

/**
 * Get or create the BroadcastChannel singleton.
 * Returns null if BroadcastChannel is not supported.
 */
function getChannel(): BroadcastChannel | null {
    if (typeof window === 'undefined') return null;
    if (!('BroadcastChannel' in window)) return null;

    if (!channel) {
        channel = new BroadcastChannel(CHANNEL_NAME);
    }

    return channel;
}

/**
 * Broadcast a sync event to other tabs.
 *
 * @param type - The type of event
 * @param resourceId - Optional ID of the affected resource
 * @param organizationId - Optional organization context
 */
export function broadcastSync(
    type: SyncEventType,
    resourceId?: string,
    organizationId?: string
): void {
    const event: SyncEvent = {
        type,
        resourceId,
        organizationId,
        timestamp: Date.now(),
        tabId: TAB_ID,
    };

    // Broadcast to OTHER tabs via BroadcastChannel
    const ch = getChannel();
    if (ch) {
        try {
            ch.postMessage(event);
        } catch (error) {
            clientLogger.error('Failed to broadcast sync event', String(error));
        }
    }

    // Why: BroadcastChannel only delivers to OTHER tabs (same-origin).
    // The current tab's React Query caches (calendar, posts, drafts) won't
    // update until staleTime expires. Dispatch a local DOM event so
    // useCrossTabSync can invalidate caches immediately in this tab too.
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('socialiseit-local-sync', { detail: event }));
    }
}

/**
 * React hook to subscribe to cross-tab sync events.
 * Automatically invalidates relevant React Query caches.
 *
 * @param organizationId - Only handle events for this organization
 */
export function useCrossTabSync(organizationId?: string): void {
    const queryClient = useQueryClient();
    const channelRef = useRef<BroadcastChannel | null>(null);

    /**
     * Shared invalidation handler — used for both cross-tab BroadcastChannel
     * messages and same-tab local sync events.
     */
    const invalidateForEvent = useCallback(
        (data: SyncEvent) => {
            // Ignore events for other organizations (if we have context)
            if (organizationId && data.organizationId && data.organizationId !== organizationId) {
                return;
            }

            clientLogger.debug({ type: data.type, resourceId: data.resourceId }, '[CrossTabSync] Invalidating');

            // Invalidate relevant queries based on event type
            switch (data.type) {
                case 'post:created':
                case 'post:updated':
                case 'post:deleted':
                case 'post:published':
                    queryClient.invalidateQueries({ queryKey: ['posts'] });
                    queryClient.invalidateQueries({ queryKey: ['calendar'] });
                    // Why: Eagerly populate the cache so back-navigation
                    // finds fresh data even with Next.js Router Cache
                    queryClient.fetchQuery({
                        queryKey: buildCalendarQueryKey(organizationId),
                        queryFn: calendarPrefetchFn,
                        staleTime: CALENDAR_STALE_TIME,
                    });
                    if (data.resourceId) {
                        queryClient.invalidateQueries({ queryKey: ['post', data.resourceId] });
                    }
                    break;

                case 'draft:saved':
                    queryClient.invalidateQueries({ queryKey: ['drafts'] });
                    queryClient.invalidateQueries({ queryKey: ['calendar'] });
                    queryClient.fetchQuery({
                        queryKey: buildCalendarQueryKey(organizationId),
                        queryFn: calendarPrefetchFn,
                        staleTime: CALENDAR_STALE_TIME,
                    });
                    break;

                case 'account:connected':
                case 'account:disconnected':
                    queryClient.invalidateQueries({ queryKey: ['accounts'] });
                    queryClient.invalidateQueries({ queryKey: ['social-accounts'] });
                    break;

                case 'settings:updated':
                    queryClient.invalidateQueries({ queryKey: ['settings'] });
                    queryClient.invalidateQueries({ queryKey: ['organization'] });
                    break;
            }
        },
        [queryClient, organizationId]
    );

    /** Handle cross-tab BroadcastChannel messages */
    const handleMessage = useCallback(
        (event: MessageEvent<SyncEvent>) => {
            const data = event.data;
            // Ignore events from this tab (handled by local sync)
            if (data.tabId === TAB_ID) return;
            invalidateForEvent(data);
        },
        [invalidateForEvent]
    );

    /** Handle same-tab local sync events dispatched by broadcastSync */
    const handleLocalSync = useCallback(
        (event: Event) => {
            const data = (event as CustomEvent<SyncEvent>).detail;
            invalidateForEvent(data);
        },
        [invalidateForEvent]
    );

    useEffect(() => {
        const ch = getChannel();
        if (ch) {
            channelRef.current = ch;
            ch.addEventListener('message', handleMessage);
        }

        // Why: Listen for same-tab sync events so the current tab's
        // calendar/posts/drafts caches are invalidated immediately.
        window.addEventListener('socialiseit-local-sync', handleLocalSync);

        return () => {
            if (ch) ch.removeEventListener('message', handleMessage);
            window.removeEventListener('socialiseit-local-sync', handleLocalSync);
        };
    }, [handleMessage, handleLocalSync]);
}

/**
 * Hook to get a broadcast function bound to the current organization.
 *
 * @param organizationId - The organization context
 */
export function useBroadcastSync(organizationId?: string) {
    const broadcast = useCallback(
        (type: SyncEventType, resourceId?: string) => {
            broadcastSync(type, resourceId, organizationId);
        },
        [organizationId]
    );

    return broadcast;
}

/**
 * Close the BroadcastChannel.
 * Call this during application cleanup if needed.
 */
export function closeSyncChannel(): void {
    if (channel) {
        channel.close();
        channel = null;
    }
}
