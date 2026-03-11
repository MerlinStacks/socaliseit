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
    const ch = getChannel();
    if (!ch) return;

    const event: SyncEvent = {
        type,
        resourceId,
        organizationId,
        timestamp: Date.now(),
        tabId: TAB_ID,
    };

    try {
        ch.postMessage(event);
    } catch (error) {
        clientLogger.error('Failed to broadcast sync event', String(error));
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

    const handleMessage = useCallback(
        (event: MessageEvent<SyncEvent>) => {
            const data = event.data;

            // Ignore events from this tab
            if (data.tabId === TAB_ID) return;

            // Ignore events for other organizations (if we have context)
            if (organizationId && data.organizationId && data.organizationId !== organizationId) {
                return;
            }

            console.debug('[CrossTabSync] Received:', data.type, data.resourceId);

            // Invalidate relevant queries based on event type
            switch (data.type) {
                case 'post:created':
                case 'post:updated':
                case 'post:deleted':
                case 'post:published':
                    // Invalidate all post-related queries
                    queryClient.invalidateQueries({ queryKey: ['posts'] });
                    queryClient.invalidateQueries({ queryKey: ['calendar'] });
                    if (data.resourceId) {
                        queryClient.invalidateQueries({ queryKey: ['post', data.resourceId] });
                    }
                    break;

                case 'draft:saved':
                    queryClient.invalidateQueries({ queryKey: ['drafts'] });
                    // Why: Drafts can have scheduled dates, so the calendar in other tabs needs refreshing too
                    queryClient.invalidateQueries({ queryKey: ['calendar'] });
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

    useEffect(() => {
        const ch = getChannel();
        if (!ch) return;

        channelRef.current = ch;
        ch.addEventListener('message', handleMessage);

        return () => {
            ch.removeEventListener('message', handleMessage);
        };
    }, [handleMessage]);
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
