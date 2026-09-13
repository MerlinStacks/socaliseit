'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useSession } from 'next-auth/react';

// Retain drafts across panel/filter changes and SPA navigation, even if storage is unavailable.
const drafts = new Map<string, string>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useInboxDraft(identity: string, mode = 'reply') {
    const { data: session } = useSession();
    const ready = !!session?.user?.id && !!session.user.currentOrganizationId;
    const key = `engagement-draft:${JSON.stringify([session?.user?.currentOrganizationId, session?.user?.id, identity, mode])}`;
    const load = () => {
        if (!ready) return '';
        if (drafts.has(key)) return drafts.get(key)!;
        try { return sessionStorage.getItem(key) || ''; } catch { return ''; }
    };
    const text = useSyncExternalStore(subscribe, load, () => '');
    const update = (value: string) => {
        if (!ready) return;
        drafts.set(key, value);
        try { if (value) sessionStorage.setItem(key, value); else sessionStorage.removeItem(key); } catch { /* In-memory fallback. */ }
        listeners.forEach(listener => listener());
    };
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => {
            if (text.trim()) { event.preventDefault(); event.returnValue = ''; }
        };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [text]);
    const insert = (value: string) => update(text ? `${text}\n${value}` : value);
    return { text, update, insert, key, ready };
}
