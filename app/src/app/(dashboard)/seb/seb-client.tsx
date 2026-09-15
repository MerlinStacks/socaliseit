'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageCircle, Sparkles } from 'lucide-react';
import { useWorkspace } from '@/components/seb/use-workspace';
import { useSebChat } from '@/components/seb/use-seb-chat';
import { workspaceDiscussions } from '@/components/seb/helpers';
import { ReviewStrip, Briefing, WorkspaceHistory } from '@/components/seb/workspace-panels';
import { ActionBacklog } from '@/components/seb/action-backlog';
import { ChatPanel } from '@/components/seb/chat-panel';
import './seb.css';

export default function SebClient() {
    const controller = useWorkspace();
    const { query } = controller;
    const chat = useSebChat(workspaceDiscussions(query.data));
    const params = useSearchParams();
    const thread = params.get('thread');
    const [desktopOpen, setDesktopOpen] = useState(true);
    const [mobileOpen, setMobileOpen] = useState(false);
    const panel = useRef<HTMLElement>(null);
    const opener = useRef<HTMLElement | null>(null);
    const selectedLink = useRef<string | null>(null);

    const showChat = useCallback(() => {
        opener.current = document.activeElement as HTMLElement;
        setDesktopOpen(true);
        setMobileOpen(true);
        requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>('button[aria-label="Close chat"]')?.focus());
    }, []);
    const closeChat = useCallback(() => {
        setDesktopOpen(false);
        setMobileOpen(false);
        requestAnimationFrame(() => {
            const target = opener.current?.isConnected ? opener.current : document.querySelector<HTMLButtonElement>('.seb-page-header button');
            target?.focus();
        });
    }, []);

    useEffect(() => {
        if (thread && selectedLink.current !== thread) {
            selectedLink.current = thread;
            chat.open(thread);
            showChat();
        }
        if (!thread) selectedLink.current = null;
    }, [thread, chat, showChat]);

    useEffect(() => {
        if (!mobileOpen) return;
        const media = window.matchMedia('(max-width: 1023px)');
        const previous = document.body.style.overflow;
        const background = Array.from(document.querySelectorAll<HTMLElement>('.seb-page-header, .seb-review, .seb-main'));
        const currentPanel = panel.current;
        const sync = () => {
            document.body.style.overflow = media.matches ? 'hidden' : previous;
            background.forEach(node => { node.inert = media.matches; });
            if (media.matches) { currentPanel?.setAttribute('role', 'dialog'); currentPanel?.setAttribute('aria-modal', 'true'); }
            else { currentPanel?.removeAttribute('role'); currentPanel?.removeAttribute('aria-modal'); }
        };
        sync(); media.addEventListener('change', sync);
        const keyboard = (event: KeyboardEvent) => {
            if (document.querySelector('.seb-media-dialog[open]')) return;
            if (event.key === 'Escape') closeChat();
            if (event.key !== 'Tab' || !media.matches) return;
            const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), summary, a[href]') || []).filter(node => node.getClientRects().length);
            const first = nodes[0]; const last = nodes.at(-1);
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        };
        document.addEventListener('keydown', keyboard);
        return () => { document.body.style.overflow = previous; background.forEach(node => { node.inert = false; }); currentPanel?.removeAttribute('role'); currentPanel?.removeAttribute('aria-modal'); media.removeEventListener('change', sync); document.removeEventListener('keydown', keyboard); };
    }, [mobileOpen, closeChat]);

    const discuss = (id: string) => { chat.open(id); showChat(); };
    return <div className="seb-workspace">
        <header className="seb-page-header"><div><span className="seb-eyebrow"><Sparkles size={16} /> Your social strategy, in motion</span><h1>Seb <span>Workspace</span></h1><p>Know what matters. Make your next move.</p></div><button className="seb-button" onClick={showChat} aria-controls="seb-chat-panel"><MessageCircle size={17} />Chat with Seb</button></header>
        <ReviewStrip controller={controller} />
        {query.error && <div className="seb-error" role="alert">{query.data ? 'Workspace updates are unavailable. Showing the last loaded data. ' : ''}{query.error.message}<button className="seb-button" disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? 'Retrying…' : 'Retry loading'}</button></div>}
        <div className={`seb-layout ${desktopOpen ? 'seb-layout-chat' : ''}`}>
            <main className="seb-main" aria-busy={query.isPending}>
                {query.isPending && <div className="seb-card seb-loading" role="status"><Sparkles size={25} /><h2>Loading your workspace…</h2><p>Gathering your briefing, recommendations and recorded milestones.</p></div>}
                {query.data && <><Briefing data={query.data} discuss={discuss} /><ActionBacklog data={query.data} controller={controller} discuss={discuss} /><WorkspaceHistory data={query.data} controller={controller} discuss={discuss} /></>}
            </main>
            <aside ref={panel} id="seb-chat-panel" aria-labelledby="seb-chat-title" className={`seb-chat-panel ${desktopOpen ? 'seb-chat-desktop-open' : ''} ${mobileOpen ? 'seb-chat-mobile-open' : ''}`}><ChatPanel chat={chat} close={closeChat} /></aside>
        </div>
    </div>;
}
