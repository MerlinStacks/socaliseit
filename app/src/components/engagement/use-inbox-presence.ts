'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { InboxItem, inboxKey, workflowTarget } from './inbox-model';

export type PresenceState = 'viewing' | 'replying' | 'noting';
export interface PresenceParticipant { userId: string; name: string; state: PresenceState; updatedAt: string }
export interface PresenceSnapshot { status: 'unknown' | 'available' | 'unavailable'; participants: PresenceParticipant[] }
const unknown: PresenceSnapshot = { status: 'unknown', participants: [] };

/** Only explicit editor events enter this hook: draft content never crosses this boundary. */
export function useInboxPresence(item: InboxItem, tab: string) {
    const key = inboxKey(item);
    const target = useRef({ key, value: workflowTarget(item) });
    target.current = { key, value: workflowTarget(item) };
    const [snapshot, setSnapshot] = useState<PresenceSnapshot>(unknown);
    const activity = useRef<(state: PresenceState) => void>(() => {});
    useEffect(() => {
        let disposed = false;
        let stopLease = () => {};
        const start = () => {
            stopLease();
            if (disposed || document.visibilityState !== 'visible') return;
            // A fresh lease on resume also isolates late cleanup from the previous visibility cycle.
            const tabId = crypto.randomUUID();
            let leaseTarget = target.current.value;
            const currentTarget = () => {
                if (target.current.key === key) leaseTarget = target.current.value;
                return leaseTarget;
            };
            let active = true, pending = false, deniedDrafting = false;
            let state: PresenceState = 'viewing';
            let sentState: PresenceState | undefined;
            let lastSent = -Infinity;
            let idle: ReturnType<typeof setTimeout> | undefined;
            let scheduled: ReturnType<typeof setTimeout> | undefined;
            let expiry: ReturnType<typeof setTimeout> | undefined;
            let controller: AbortController | undefined;
            const release = () => {
                void fetch('/api/inbox/presence', { method: 'DELETE', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...currentTarget(), tabId }), keepalive: true }).catch(() => {});
            };
            setSnapshot(unknown);
            const send = async () => {
                if (!active || pending || document.visibilityState !== 'visible') return;
                clearTimeout(scheduled);
                scheduled = undefined;
                pending = true;
                lastSent = Date.now();
                sentState = state;
                const requested = state;
                controller = new AbortController();
                const timeout = setTimeout(() => controller?.abort(), 10_000);
                try {
                    const response = await fetch('/api/inbox/presence', { method: 'PUT', cache: 'no-store', signal: controller.signal,
                        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...currentTarget(), tabId, state: requested }) });
                    if (!active) return;
                    if (response.status === 403 && requested !== 'viewing') {
                        deniedDrafting = true;
                        state = 'viewing';
                        setSnapshot({ status: 'unavailable', participants: [] });
                        return;
                    }
                    if (!response.ok) throw new Error('Presence unavailable');
                    const { data } = await response.json() as { data: { participants: PresenceParticipant[]; ttlSeconds: number } };
                    if (!Array.isArray(data.participants) || !(data.ttlSeconds > 0)) throw new Error('Invalid presence');
                    if (!active) return;
                    setSnapshot({ status: 'available', participants: data.participants });
                    clearTimeout(expiry);
                    expiry = setTimeout(() => { if (active) setSnapshot({ status: 'unavailable', participants: [] }); }, data.ttlSeconds * 1000);
                } catch {
                    if (active) setSnapshot({ status: 'unavailable', participants: [] });
                } finally {
                    clearTimeout(timeout);
                    pending = false;
                    // Abort cannot retract a write already at Redis; release again after late completion.
                    if (!active) release();
                    else if (state !== sentState) schedule();
                }
            };
            const schedule = () => {
                if (!active || pending || scheduled !== undefined) return;
                scheduled = setTimeout(() => { scheduled = undefined; void send(); }, Math.max(0, 1000 - (Date.now() - lastSent)));
            };
            activity.current = next => {
                if (!active || document.visibilityState !== 'visible') return;
                clearTimeout(idle);
                const nextState = deniedDrafting ? 'viewing' : next;
                if (state !== nextState) { state = nextState; schedule(); }
                if (nextState !== 'viewing') idle = setTimeout(() => { state = 'viewing'; schedule(); }, 8000);
            };
            const heartbeat = setInterval(() => { void send(); }, 15_000);
            stopLease = () => {
                if (!active) return;
                active = false;
                activity.current = () => {};
                clearInterval(heartbeat);
                clearTimeout(idle); clearTimeout(scheduled); clearTimeout(expiry);
                controller?.abort();
                release();
            };
            void send();
        };
        const visibility = () => {
            if (document.visibilityState === 'visible') start();
            else { stopLease(); setSnapshot(unknown); }
        };
        const pagehide = () => stopLease();
        document.addEventListener('visibilitychange', visibility);
        window.addEventListener('pagehide', pagehide);
        window.addEventListener('pageshow', visibility);
        start();
        return () => {
            disposed = true;
            stopLease();
            document.removeEventListener('visibilitychange', visibility);
            window.removeEventListener('pagehide', pagehide);
            window.removeEventListener('pageshow', visibility);
        };
    }, [key]);
    useEffect(() => { activity.current('viewing'); }, [tab]);
    const reportActivity = useCallback((state: PresenceState) => activity.current(state), []);
    return { ...snapshot, reportActivity };
}
