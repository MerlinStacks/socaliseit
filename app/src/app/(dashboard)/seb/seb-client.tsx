'use client';

/**
 * Seb's workspace: the briefing, the backlog, and the record of what he has already
 * acted on. The conversation itself is not here — it lives in the drawer mounted by the
 * dashboard shell, so a member who asks Seb about a recommendation from the calendar
 * and one who asks from this page are in the same thread. This page's job is to say
 * what is discussable while it is on screen and to hand off to the drawer.
 */
import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { MessageCircle, Sparkles } from 'lucide-react';
import { useWorkspace } from '@/components/seb/use-workspace';
import { useSebChatSurface, useSebDiscussions } from '@/components/seb/seb-chat-provider';
import { workspaceDiscussions } from '@/components/seb/helpers';
import { ReviewStrip, Briefing, WorkspaceHistory } from '@/components/seb/workspace-panels';
import { ActionBacklog } from '@/components/seb/action-backlog';
import './seb.css';

export default function SebClient() {
    const controller = useWorkspace();
    const { query } = controller;
    const discussions = workspaceDiscussions(query.data);
    useSebDiscussions(discussions);
    const { openChat } = useSebChatSurface();
    const params = useSearchParams();
    const thread = params.get('thread');
    // A `?thread=` link must open its conversation once, not on every workspace refetch.
    const opened = useRef<string | null>(null);

    const discuss = (id: string) => openChat(discussions.find(item => item.id === id) || id);

    useEffect(() => {
        if (!thread) { opened.current = null; return; }
        if (opened.current === thread) return;
        opened.current = thread;
        discuss(thread);
        // Deliberately keyed on the link alone: a workspace refetch must not yank the
        // member back to this thread. Topics that arrive later are picked up by the chat.
    }, [thread]);

    return <div className="seb-workspace">
        <header className="seb-page-header"><div><span className="seb-eyebrow"><Sparkles size={16} /> Your social strategy, in motion</span><h1>Seb <span>Workspace</span></h1><p>Know what matters. Make your next move.</p></div><button className="seb-button" onClick={() => openChat()}><MessageCircle size={17} />Chat with Seb</button></header>
        <ReviewStrip controller={controller} />
        {query.error && <div className="seb-error" role="alert">{query.data ? 'Workspace updates are unavailable. Showing the last loaded data. ' : ''}{query.error.message}<button className="seb-button" disabled={query.isFetching} onClick={() => query.refetch()}>{query.isFetching ? 'Retrying…' : 'Retry loading'}</button></div>}
        <main className="seb-main" aria-busy={query.isPending}>
            {query.isPending && <div className="seb-card seb-loading" role="status"><Sparkles size={25} /><h2>Loading your workspace…</h2><p>Gathering your briefing, recommendations and recorded milestones.</p></div>}
            {query.data && <><Briefing data={query.data} discuss={discuss} /><ActionBacklog data={query.data} controller={controller} discuss={discuss} /><WorkspaceHistory data={query.data} controller={controller} discuss={discuss} /></>}
        </main>
    </div>;
}
