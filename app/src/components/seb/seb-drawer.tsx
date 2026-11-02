'use client';

/**
 * Seb's tab drawer.
 *
 * A slim tab pinned to the right edge, on every page of the workspace, that pulls out
 * into the chat. It lives in the dashboard layout, above the SPA shell, so the thread
 * survives view swaps, deep links, and hard refreshes without remounting.
 *
 * Three ways in, because hands differ: click or Enter on the tab, drag the tab inward
 * (or the panel's left edge outward to dismiss), or Escape to put it away. A drag under
 * a few pixels counts as a click, so a slightly shaky tap still opens it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot } from 'lucide-react';
import { useSebChatSurface } from './seb-chat-provider';
import { ChatPanel } from './chat-panel';
import './seb-drawer.css';

/** Fraction of the panel a drag must cover to commit. Below that it springs back. */
const COMMIT_RATIO = 0.3;
/** Movement under this many pixels is treated as a press, not a drag. */
const CLICK_SLOP = 6;
const DESKTOP_QUERY = '(min-width: 1024px)';

export function SebDrawer() {
    const { chat, open, openChat, closeChat, toggleChat } = useSebChatSurface();
    const panel = useRef<HTMLElement>(null);
    const tab = useRef<HTMLButtonElement>(null);
    const [reveal, setReveal] = useState<number | null>(null);
    const [desktop, setDesktop] = useState(true);
    const drag = useRef({ active: false, startX: 0, from: 0, moved: false });
    const revealNow = useRef(0);
    const suppressClick = useRef(false);

    const width = useCallback(() => panel.current?.getBoundingClientRect().width
        || Math.min(420, Math.round(window.innerWidth * 0.92)), []);

    useEffect(() => {
        const media = window.matchMedia(DESKTOP_QUERY);
        const sync = () => setDesktop(media.matches);
        sync();
        media.addEventListener('change', sync);
        return () => media.removeEventListener('change', sync);
    }, []);

    const begin = (event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        suppressClick.current = false;
        drag.current = { active: true, startX: event.clientX, from: open ? width() : 0, moved: false };
        revealNow.current = drag.current.from;
        event.currentTarget.setPointerCapture?.(event.pointerId);
    };

    const move = (event: React.PointerEvent<HTMLElement>) => {
        if (!drag.current.active) return;
        const limit = width();
        const delta = drag.current.startX - event.clientX;
        if (Math.abs(delta) > CLICK_SLOP) drag.current.moved = true;
        revealNow.current = Math.min(limit, Math.max(0, drag.current.from + delta));
        setReveal(revealNow.current);
    };

    const end = (event: React.PointerEvent<HTMLElement>) => {
        if (!drag.current.active) return;
        drag.current.active = false;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        const moved = drag.current.moved;
        suppressClick.current = moved;
        const value = revealNow.current;
        setReveal(null);
        // A press that never travelled is the button's own click.
        if (moved) (value > width() * COMMIT_RATIO ? chatAndOpen : closeChat)();
    };

    const cancelDrag = (event: React.PointerEvent<HTMLElement>) => {
        drag.current.active = false;
        suppressClick.current = true;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        setReveal(null);
    };

    /** Opening from a drag needs the same focus follow a click gets. */
    const chatAndOpen = () => {
        openChat();
        requestAnimationFrame(() => {
            const target = desktop
                ? panel.current?.querySelector<HTMLTextAreaElement>('#seb-drawer-input')
                : panel.current?.querySelector<HTMLButtonElement>('button[aria-label="Close chat"]');
            target?.focus();
        });
    };

    // Escape closes from anywhere; focus returns to the tab that opened it.
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape' || document.querySelector('.seb-media-dialog[open]')) return;
            event.stopPropagation();
            closeChat();
            requestAnimationFrame(() => tab.current?.focus());
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open, closeChat]);

    // On a phone the drawer is the whole screen, so the page behind must go inert.
    useEffect(() => {
        if (!open || desktop) return;
        const drawer = panel.current;
        if (!drawer) return;
        // Everything except the drawer and its ancestors. Hiding `body > div` would
        // take the drawer with it, so the walk collects siblings on the way up.
        const background = new Set<HTMLElement>();
        for (let node: HTMLElement | null = drawer; node?.parentElement; node = node.parentElement) {
            for (const sibling of Array.from(node.parentElement.children)) {
                if (sibling instanceof HTMLElement && sibling !== node) background.add(sibling);
            }
            if (node.parentElement === document.body) break;
        }
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        // setAttribute rather than the property: it is what the browser reads, and it
        // is the only form that survives in a test environment without the property.
        background.forEach(node => node.setAttribute('inert', ''));
        return () => {
            document.body.style.overflow = previous;
            background.forEach(node => node.removeAttribute('inert'));
        };
    }, [open, desktop]);

    const dragging = reveal !== null;

    return <div className={`seb-dock ${open ? 'seb-dock-open' : ''} ${dragging ? 'seb-dock-dragging' : ''} ${desktop ? 'seb-dock-desktop' : 'seb-dock-mobile'}`}
        style={dragging ? { ['--seb-dock-reveal' as string]: `${reveal}px` } as React.CSSProperties : undefined}>

        <button ref={tab} type="button" className="seb-dock-tab" onClick={event => {
            if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; }
            toggleChat();
        }}
            onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={cancelDrag}
            aria-expanded={open} aria-controls="seb-drawer-panel">
            <Bot size={17} aria-hidden="true" />
            <span>Seb</span>
        </button>

        <aside ref={panel} id="seb-drawer-panel" className="seb-dock-panel"
            aria-label="Chat with Seb"
            inert={!open}
            {...open && !desktop ? { role: 'dialog', 'aria-modal': 'true' as const } : {}}>
            {/* Grab edge: drag it right to dismiss without hunting for the close button. */}
            <div className="seb-dock-grip" onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={cancelDrag} aria-hidden="true" />
            <div className="seb-dock-body"><ChatPanel chat={chat} close={closeChat} variant="drawer" /></div>
        </aside>
    </div>;
}
