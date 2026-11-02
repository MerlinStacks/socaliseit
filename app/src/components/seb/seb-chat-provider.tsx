'use client';

/**
 * One Seb, everywhere.
 *
 * The chat lives here rather than inside the /seb page, so the drawer mounted in the
 * dashboard shell keeps one thread across every page — through SPA view swaps and hard
 * refreshes alike. Pages contribute *discussions* (recommendation, experiment and
 * briefing topics) and hand off to `openChat`, so "Discuss" on the workspace and "ask
 * Seb" from the calendar are the same conversation.
 *
 * Why a registry rather than the page passing topics down: the drawer is mounted above
 * the page, so the page cannot be its parent. Registering lets a page own what is
 * discussable while it is on screen, and only while it is on screen.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSebChat, type ChatController } from './use-seb-chat';
import type { Discussion } from './types';

/** Remembered per browser, not per user: it is a layout preference, not data. */
const OPEN_KEY = 'seb:dock:open';

type SebChatSurface = {
    chat: ChatController;
    open: boolean;
    /** Opens the drawer, optionally switching to a topic from the page or a saved chat id. */
    openChat: (topic?: Discussion | string) => void;
    closeChat: () => void;
    toggleChat: () => void;
    registerDiscussions: (items: Discussion[]) => void;
    unregisterDiscussions: (ids: string[]) => void;
};

const SebChatContext = createContext<SebChatSurface | null>(null);

export function SebChatProvider({ children }: { children: ReactNode }) {
    const registry = useRef(new Map<string, Discussion>());
    const [discussions, setDiscussions] = useState<Discussion[]>([]);
    const [open, setOpen] = useState(false);
    const chat = useSebChat(discussions);

    // Restored after mount rather than during the first render: the server's markup has
    // to match the client's, and the drawer is a layout preference, not data. The panel
    // slides in on a reload that remembers it open, which reads as Seb arriving.
    useEffect(() => {
        try {
            setOpen(window.localStorage.getItem(OPEN_KEY) === '1');
        } catch { /* Private mode or no storage: the drawer starts closed. */ }
    }, []);

    const sync = useCallback(() => {
        const next = [...registry.current.values()];
        setDiscussions(current =>
            current.length === next.length && current.every((item, index) => item.id === next[index].id) ? current : next);
    }, []);

    const registerDiscussions = useCallback((items: Discussion[]) => {
        for (const item of items) registry.current.set(item.id, item);
        sync();
    }, [sync]);

    const unregisterDiscussions = useCallback((ids: string[]) => {
        for (const id of ids) registry.current.delete(id);
        sync();
    }, [sync]);

    const openChat = useCallback((topic?: Discussion | string) => {
        const id = typeof topic === 'string' ? topic : topic?.id;
        if (topic && typeof topic !== 'string') {
            registry.current.set(topic.id, topic);
            sync();
        }
        // A string is either a topic the page registered or a saved chat, so the thread
        // is picked up even when nothing on this page could have registered it.
        if (id) chat.open(id);
        setOpen(true);
    }, [chat, sync]);

    const closeChat = useCallback(() => setOpen(false), []);
    const toggleChat = useCallback(() => setOpen(value => !value), []);

    useEffect(() => {
        try {
            window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
        } catch { /* Private mode: the drawer simply starts closed next time. */ }
    }, [open]);

    const value = useMemo<SebChatSurface>(() => ({
        chat, open, openChat, closeChat, toggleChat, registerDiscussions, unregisterDiscussions,
    }), [chat, open, openChat, closeChat, toggleChat, registerDiscussions, unregisterDiscussions]);

    return <SebChatContext.Provider value={value}>{children}</SebChatContext.Provider>;
}

export function useSebChatSurface() {
    const surface = useContext(SebChatContext);
    if (!surface) throw new Error('useSebChatSurface must be used inside <SebChatProvider>');
    return surface;
}

/**
 * Publishes a page's discussable topics for as long as that page is mounted.
 * Why keyed on ids: the workspace refetches often, and re-registering the same set of
 * topics must not churn the drawer.
 */
export function useSebDiscussions(discussions: Discussion[]) {
    const { registerDiscussions, unregisterDiscussions } = useSebChatSurface();
    const signature = discussions.map(item => item.id).join('|');
    const latest = useRef(discussions);
    latest.current = discussions;

    useEffect(() => {
        registerDiscussions(latest.current);
        return () => unregisterDiscussions(latest.current.map(item => item.id));
    }, [signature, registerDiscussions, unregisterDiscussions]);
}
