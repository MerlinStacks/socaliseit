'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Plus, Send, Trash2, X } from 'lucide-react';
import type { ChatController } from './use-seb-chat';
import type { MediaAttachment } from './types';
import { MediaPreview, MediaPreviewGrid } from './media-preview';
import { formatDate } from './helpers';

export function ChatPanel({ chat, close }: { chat: ChatController; close: () => void }) {
    const [preview, setPreview] = useState<MediaAttachment | null>(null);
    const end = useRef<HTMLDivElement>(null);
    useEffect(() => { end.current?.scrollIntoView?.({ block: 'nearest' }); }, [chat.messages.length, chat.isPending]);
    return <div className="seb-chat-inner">
        <header className="seb-chat-header"><div><span className="seb-eyebrow"><Bot size={16} /> Your thinking partner</span><h2 id="seb-chat-title">Chat with Seb</h2></div><button className="seb-button" onClick={close} aria-label="Close chat"><X size={18} /></button></header>
        <div className="seb-chat-tools"><button className="seb-button" onClick={chat.newChat}><Plus size={15} />New chat</button><details className="seb-chat-history" open={chat.sessions.isError || chat.deletion.isError || undefined}><summary>Saved chats</summary>
            {chat.sessions.isPending && <p role="status">Loading chats…</p>}
            {chat.sessions.error && <p className="seb-error" role="alert">{chat.sessions.error.message}<button className="seb-button" onClick={() => chat.sessions.refetch()}>Retry</button></p>}
            {chat.deletion.error && <p className="seb-error" role="alert">{chat.deletion.error.message}<button className="seb-button" onClick={() => chat.deletion.variables && chat.deletion.mutate(chat.deletion.variables)}>Retry delete</button></p>}
            {chat.sessions.data?.sessions.length === 0 && <p className="seb-muted">No saved chats yet.</p>}
            {chat.sessions.data?.sessions.map(session => <div className="seb-saved-chat" key={session.id}><button className="seb-button" onClick={event => { chat.select(`chat:${session.id}`); event.currentTarget.closest('details')?.removeAttribute('open'); }}><span>{session.title}<small>{formatDate(session.updatedAt)}</small></span></button><button className="seb-button seb-quiet" aria-label={`Delete chat: ${session.title}`} disabled={chat.deletion.isPending || chat.anyPending} onClick={() => chat.deletion.mutate(session.id)}><Trash2 size={15} /></button></div>)}
        </details></div>
        {(chat.context || chat.title !== 'Chat with Seb') && <div className="seb-chat-context"><small>{chat.context ? 'Discussing' : 'Conversation'}</small><strong>{chat.title}</strong></div>}
        <div className="seb-messages" role="log" aria-label="Conversation" aria-live="polite">
            {!chat.messages.length && !chat.unavailable && <div className="seb-chat-empty"><Bot size={32} /><h3>{chat.context ? 'Turn this insight into a next step' : 'A little clarity goes a long way'}</h3><p>{chat.context ? 'Ask a question below. This recommendation, experiment or briefing will be included with your first message.' : 'Ask about your content, timing or creative. Use Discuss on any workspace item to bring its context along.'}</p></div>}
            {chat.unavailable && <p className="seb-error" role="alert">{chat.sessions.isPending ? 'Loading this discussion…' : 'This discussion is not in the available workspace or saved chats. Retry loading, or choose an item from the workspace to discuss.'}</p>}
            {chat.messages.map((item, index) => <div key={index} className={`seb-message seb-message-${item.role}`}><small>{item.role === 'user' ? 'You' : 'Seb'}</small><p>{item.content}</p>{item.attachments?.length ? <MediaPreviewGrid attachments={item.attachments} onOpen={setPreview} /> : null}</div>)}
            {chat.isPending && <p className="seb-muted" role="status">Seb is thinking…</p>}<div ref={end} />
        </div>
        <form className="seb-composer" onSubmit={event => { event.preventDefault(); void chat.send(); }}>
            {chat.error && <p className="seb-error" role="alert">{chat.error} Your draft is available below; send it again to retry.</p>}
            <label htmlFor="seb-message" className="seb-sr-only">Message Seb</label><textarea id="seb-message" rows={3} placeholder="Ask Seb for advice…" value={chat.draft} disabled={chat.isPending} onChange={event => chat.setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); void chat.send(); } }} />
            <div className="seb-section-heading"><small>Enter for a new line · Ctrl / ⌘ Enter to send</small><button className="seb-button seb-primary" type="submit" disabled={chat.isPending || chat.unavailable || !chat.draft.trim()}><Send size={15} />{chat.isPending ? 'Sending…' : 'Send'}</button></div>
        </form>
        {preview && <MediaPreview attachment={preview} close={() => setPreview(null)} />}
    </div>;
}
