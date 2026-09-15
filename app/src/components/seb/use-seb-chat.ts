'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { cleanSebMessage, sebRequest } from './helpers';
import type { ChatItem, ChatSession, Discussion, MediaAttachment } from './types';

type Reply = { session: { id: string }; message: { content: string; metadata?: { attachments?: MediaAttachment[] } | null } };
type LocalThread = { messages: ChatItem[]; context?: Discussion; sessionId?: string; title?: string };

/** Local thread identity survives creation of its server-side chat session. */
export function useSebChat(discussions: Discussion[]) {
    const client = useQueryClient();
    const [selected, setSelected] = useState('new');
    const [locals, setLocals] = useState<Record<string, LocalThread>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [pending, setPending] = useState<string[]>([]);
    const locks = useRef(new Set<string>());
    const sessions = useQuery({ queryKey: ['seb-chat-sessions'], queryFn: () => sebRequest<{ sessions: ChatSession[] }>('/api/seb/chat/sessions'), staleTime: 30_000 });
    const saved = sessions.data?.sessions.find(session => `chat:${session.id}` === selected);
    const local = locals[selected];
    const context = local?.context || discussions.find(item => item.id === selected);
    const messages: ChatItem[] = local?.messages || (saved?.messages || []).map(message => ({ role: message.role === 'USER' ? 'user' : 'assistant', content: cleanSebMessage(message.content), attachments: message.metadata?.attachments }));
    const unavailable = selected !== 'new' && !selected.startsWith('draft:') && !local && !saved && !context;
    const title = context?.title || local?.title || saved?.title || (unavailable ? 'Discussion unavailable' : 'Chat with Seb');
    const select = (id: string) => {
        // Saved-session links reuse their local context immediately, before list refetch.
        const alias = Object.entries(locals).find(([, item]) => item.sessionId && `chat:${item.sessionId}` === id);
        setSelected(alias?.[0] || id);
    };
    const open = (id: string) => {
        const discussion = discussions.find(item => item.id === id);
        if (discussion) setLocals(current => ({ ...current, [id]: current[id] || { messages: [], context: discussion } }));
        select(id);
    };
    const send = async () => {
        const message = (drafts[selected] || '').trim();
        if (!message || unavailable || locks.current.has(selected)) return;
        const key = selected;
        const sessionId = local?.sessionId || saved?.id;
        const before = messages;
        locks.current.add(key);
        setPending(current => [...current, key]);
        setErrors(current => ({ ...current, [key]: '' }));
        setDrafts(current => ({ ...current, [key]: '' }));
        setLocals(current => ({ ...current, [key]: { ...local, context, messages: [...before, { role: 'user', content: message }] } }));
        try {
            const reply = await sebRequest<Reply>('/api/seb/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId, message: !sessionId && context ? `${context.prompt}\n\nUser question: ${message}` : message }),
            });
            if (!reply.session?.id || typeof reply.message?.content !== 'string') throw new Error('Seb returned an incomplete reply. Your question has been restored.');
            setLocals(current => ({ ...current, [key]: { context, sessionId: reply.session.id, title: local?.title || saved?.title || message.slice(0, 80), messages: [...before, { role: 'user', content: message }, { role: 'assistant', content: cleanSebMessage(reply.message.content), attachments: reply.message.metadata?.attachments }] } }));
            void client.invalidateQueries({ queryKey: ['seb-chat-sessions'] });
        } catch (error) {
            setLocals(current => ({ ...current, [key]: { ...local, context, messages: before } }));
            setDrafts(current => ({ ...current, [key]: current[key] || message }));
            setErrors(current => ({ ...current, [key]: error instanceof Error ? error.message : 'Message could not be sent. Please retry.' }));
        } finally {
            locks.current.delete(key);
            setPending(current => current.filter(item => item !== key));
        }
    };
    const deletion = useMutation({
        mutationFn: (id: string) => sebRequest(`/api/seb/chat/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        onSuccess: (_data, id) => {
            setLocals(current => Object.fromEntries(Object.entries(current).filter(([key, item]) => key !== `chat:${id}` && item.sessionId !== id)));
            if (selected === `chat:${id}` || local?.sessionId === id) setSelected(`draft:${crypto.randomUUID()}`);
            return client.invalidateQueries({ queryKey: ['seb-chat-sessions'] });
        },
    });
    return { sessions, deletion, selected, title, context, messages, unavailable, open, select, send,
        draft: drafts[selected] || '', setDraft: (value: string) => setDrafts(current => ({ ...current, [selected]: value })),
        error: errors[selected], isPending: pending.includes(selected), anyPending: pending.length > 0,
        newChat: () => setSelected(`draft:${crypto.randomUUID()}`),
    };
}
export type ChatController = ReturnType<typeof useSebChat>;
