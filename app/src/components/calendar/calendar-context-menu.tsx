'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { type CalendarPost } from './calendar-types';

interface Props {
    children: ReactNode;
    posts: Record<string, CalendarPost[]>;
    onPostClick: (key: string) => void;
    onEdit: (id: string) => void;
    onCompose: (date: Date, hour?: number) => void;
    onQuickAdd: (date: Date, hour?: number) => void;
    onNewNote: (date: Date) => void;
    onCopy?: (post: CalendarPost) => void;
    onPaste?: (date: Date, hour?: number) => void;
    canPaste?: boolean;
    isPasting?: boolean;
}

interface MenuState {
    x: number;
    y: number;
    title: string;
    trigger: HTMLElement;
    actions: { label: string; run: () => void; disabled?: boolean }[];
}

/** Explicit targets preserve post identity when right-clicking nested thumbnails. */
export function CalendarContextMenu({ children, posts, onPostClick, onEdit, onCompose, onQuickAdd, onNewNote, onCopy, onPaste, canPaste, isPasting }: Props) {
    const [menu, setMenu] = useState<MenuState | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useLayoutEffect(() => {
        if (!menu || !menuRef.current) return;
        const element = menuRef.current;
        const bounds = element.getBoundingClientRect();
        element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
        element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
        element.querySelector<HTMLButtonElement>('button')?.focus();
    }, [menu]);

    useEffect(() => {
        if (!menu) return;
        const dismiss = () => setMenu(null);
        const outside = (event: Event) => {
            if (!(event.target instanceof Node) || !menuRef.current?.contains(event.target)) dismiss();
        };
        document.addEventListener('pointerdown', outside);
        window.addEventListener('scroll', outside, true);
        window.addEventListener('resize', dismiss);
        window.addEventListener('blur', dismiss);
        return () => {
            document.removeEventListener('pointerdown', outside);
            window.removeEventListener('scroll', outside, true);
            window.removeEventListener('resize', dismiss);
            window.removeEventListener('blur', dismiss);
        };
    }, [menu]);

    const open = (event: MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-calendar-note], input, textarea, [contenteditable="true"]')) return;
        const postElement = target.closest<HTMLElement>('[data-calendar-post-key]');
        const slot = target.closest<HTMLElement>('[data-calendar-date]');
        let title: string;
        let actions: MenuState['actions'];
        if (postElement) {
            const post = Object.values(posts).flat().find(item => item.dragKey === postElement.dataset.calendarPostKey);
            if (!post) return;
            title = 'Post actions';
            actions = [{ label: 'Open post', run: () => onPostClick(post.dragKey) }];
            if (!post.isExternal && onCopy) {
                actions.push({ label: 'Copy post', run: () => onCopy(post) });
            }
            if (!post.isExternal && ['draft', 'scheduled', 'failed'].includes(post.status.toLowerCase())) {
                actions.push({ label: 'Edit post', run: () => onEdit(post.id) });
            }
            if (post.externalUrl && /^https?:\/\//i.test(post.externalUrl)) {
                actions.push({ label: 'View on platform', run: () => window.open(post.externalUrl!, '_blank', 'noopener,noreferrer') });
            }
        } else if (slot) {
            const date = new Date(slot.dataset.calendarDate!);
            if (Number.isNaN(date.getTime())) return;
            const hour = slot.dataset.hour === undefined ? undefined : Number(slot.dataset.hour);
            title = format(date, 'EEE, MMM d') + (hour === undefined ? '' : ` · ${format(new Date(2000, 0, 1, hour), 'h a')}`);
            actions = [
                { label: 'Create post', run: () => onCompose(date, hour) },
                { label: 'Quick add placeholder', run: () => onQuickAdd(date, hour) },
                { label: 'Add note', run: () => onNewNote(date) },
            ];
            if (onPaste) {
                actions.push({ label: isPasting ? 'Pasting post…' : 'Paste post here', run: () => onPaste(date, hour), disabled: !canPaste || isPasting });
            }
        } else return;
        event.preventDefault();
        event.stopPropagation();
        const trigger = postElement ?? slot!;
        const bounds = trigger.getBoundingClientRect();
        setMenu({ title, actions, trigger, x: event.clientX || bounds.left, y: event.clientY || bounds.top });
    };

    return (
        <div className="contents" onContextMenu={open} onKeyDown={event => {
            if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                event.preventDefault();
                (event.target as HTMLElement).dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
            }
        }}>
            {children}
            {menu && createPortal(
                <div ref={menuRef} role="menu" aria-label={menu.title}
                    className="fixed z-[100] min-w-52 max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1 shadow-xl text-[var(--text-primary)]"
                    style={{ left: menu.x, top: menu.y }}
                    onClick={event => event.stopPropagation()}
                    onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
                    onKeyDown={event => {
                        event.stopPropagation();
                        if (event.key === 'Escape' || event.key === 'Tab') {
                            if (event.key === 'Escape') event.preventDefault();
                            menu.trigger.focus();
                            setMenu(null);
                        }
                        const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
                        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                        const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length
                            : event.key === 'ArrowUp' ? (index - 1 + buttons.length) % buttons.length
                            : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1;
                        if (next >= 0) { event.preventDefault(); buttons[next]?.focus(); }
                    }}>
                    <div className="px-3 py-2 text-xs font-medium text-[var(--text-muted)]">{menu.title}</div>
                    {menu.actions.map(action => (
                        <button key={action.label} type="button" role="menuitem" tabIndex={-1}
                            disabled={action.disabled}
                            className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--bg-tertiary)] focus:bg-[var(--bg-tertiary)] focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                            onClick={() => { menu.trigger.focus(); setMenu(null); action.run(); }}>
                            {action.label}
                        </button>
                    ))}
                </div>, document.body
            )}
        </div>
    );
}
