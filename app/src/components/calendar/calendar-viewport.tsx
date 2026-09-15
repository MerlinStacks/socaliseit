'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { format, startOfMonth } from 'date-fns';
import type { CalendarViewMode } from '@/hooks/use-calendar-navigation';

interface CalendarUiState {
    expandedWeeks: Set<string>;
    scrollTop: number;
}

// Transient, tab-local UI only: survives SPA route unmounts, not a page reload.
// Bound retained contexts so browsing dates does not grow this cache indefinitely.
const contexts = new Map<string, CalendarUiState>();
function saveContext(key: string, state: CalendarUiState) {
    contexts.delete(key);
    contexts.set(key, state);
    if (contexts.size > 40) contexts.delete(contexts.keys().next().value!);
}

export function calendarUiContextKey(organizationId: string, view: CalendarViewMode, date: Date, weekStartsOn: 0 | 1) {
    const displayedDate = view === 'month' || view === 'grid' ? startOfMonth(date) : date;
    return JSON.stringify([organizationId, view, format(displayedDate, 'yyyy-MM-dd'), weekStartsOn]);
}

interface CalendarViewportProps {
    contextKey: string | null;
    ready: boolean;
    onClick: () => void;
    children: (expandedWeeks: Set<string>, onExpandedWeeksChange: (weeks: Set<string>) => void) => ReactNode;
}

/** A keyed viewport prevents a context change from saving the old DOM's offset under a new key. */
export function CalendarViewport(props: CalendarViewportProps) {
    return <ScopedCalendarViewport key={props.contextKey ?? 'pending'} {...props} />;
}

function ScopedCalendarViewport({ contextKey, ready, onClick, children }: CalendarViewportProps) {
    const [initial] = useState(() => (contextKey && contexts.get(contextKey)) || { expandedWeeks: new Set<string>(), scrollTop: 0 });
    const [expandedWeeks, setExpandedWeeks] = useState(initial.expandedWeeks);
    const saved = useRef(initial);
    const pending = useRef(true);
    const viewport = useRef<HTMLDivElement>(null);
    const content = useRef<HTMLDivElement>(null);

    const contentReady = () => ready && !!contextKey && !content.current?.querySelector('[data-calendar-view-loading]');

    useLayoutEffect(() => {
        const element = viewport.current!;
        const inner = content.current!;
        // A refresh can replace this same mounted viewport's contents with a skeleton.
        // Keep the saved offset/expansion, but restore again when its data returns.
        if (!ready) pending.current = true;
        const restore = () => {
            if (!pending.current || !ready || !contextKey || inner.querySelector('[data-calendar-view-loading]')) return;
            if (element.clientHeight === 0) return;
            const max = Math.max(0, element.scrollHeight - element.clientHeight);
            // Only a completed layout can prove that deletion made the target unreachable.
            // Without that signal, retain the target while delayed content grows.
            if (max < saved.current.scrollTop && !inner.querySelector('[data-calendar-view-ready]')) return;
            const target = Math.min(saved.current.scrollTop, max);
            element.scrollTop = target;
            if (Math.abs(element.scrollTop - target) < 1) {
                pending.current = false;
                saved.current = { ...saved.current, scrollTop: target };
                saveContext(contextKey, saved.current);
            }
        };
        restore();
        const resize = new ResizeObserver(restore);
        resize.observe(element);
        resize.observe(inner);
        // Dynamic imports can replace a same-sized fallback without a resize.
        const mutations = new MutationObserver(restore);
        mutations.observe(inner, { childList: true, subtree: true, attributes: true });
        return () => { resize.disconnect(); mutations.disconnect(); };
    }, [contextKey, ready]);

    const changeExpandedWeeks = (weeks: Set<string>) => {
        setExpandedWeeks(weeks);
        saved.current = { ...saved.current, expandedWeeks: weeks };
        if (contextKey) saveContext(contextKey, saved.current);
    };
    const saveScroll = () => {
        if (pending.current || !contentReady()) return;
        saved.current = { ...saved.current, scrollTop: viewport.current!.scrollTop };
        saveContext(contextKey!, saved.current);
    };
    // Intentional user scrolling takes precedence over a delayed restoration.
    const cancelRestore = () => { if (contentReady()) pending.current = false; };

    return (
        <div ref={viewport} className="flex-1 overflow-auto p-8" data-testid="calendar-viewport"
            onClick={onClick} onScroll={saveScroll} onWheel={cancelRestore} onTouchMove={cancelRestore}
            onKeyDown={event => {
                if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancelRestore();
            }}>
            <div ref={content}>{children(expandedWeeks, changeExpandedWeeks)}</div>
        </div>
    );
}
