import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSebChat } from '../use-seb-chat';

const context = { id: 'recommendation:one', title: 'Try a new opening', prompt: 'Recommendation one: ask a clear question.' };
function setup(post: (init?: RequestInit) => Promise<Response>) {
    const fetcher = vi.fn((url: string, init?: RequestInit) => url === '/api/seb/chat' ? post(init) : Promise.resolve(Response.json({ sessions: [] })));
    vi.stubGlobal('fetch', fetcher);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { ...renderHook(() => useSebChat([context]), { wrapper }), fetcher };
}
afterEach(() => vi.unstubAllGlobals());

describe('Seb saved chat continuity', () => {
    it('retains the discussion and messages after session creation, then uses that session for follow-ups', async () => {
        const { result, fetcher } = setup(() => Promise.resolve(Response.json({ session: { id: 'saved' }, message: { content: 'Try this approach.', metadata: { attachments: [{ id: 'media', type: 'image', title: 'Example' }] } } })));
        act(() => result.current.open(context.id));
        act(() => result.current.setDraft('How should I start?'));
        await act(async () => { await result.current.send(); });
        expect(result.current.context?.title).toBe(context.title);
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[1].attachments?.[0].id).toBe('media');
        act(() => result.current.select('chat:saved'));
        expect(result.current.context?.id).toBe(context.id);
        act(() => result.current.setDraft('And next?'));
        await act(async () => { await result.current.send(); });
        const requests = fetcher.mock.calls.filter(([url]) => url === '/api/seb/chat').map(([, init]) => JSON.parse(init?.body as string));
        expect(requests[0].message).toContain(context.prompt);
        expect(requests[1]).toEqual({ sessionId: 'saved', message: 'And next?' });
        expect(result.current.messages).toHaveLength(4);
    });

    it('restores failed drafts, retains context, and does not turn errors into assistant messages', async () => {
        const { result } = setup(() => Promise.resolve(Response.json({ error: 'Seb is unavailable' }, { status: 503 })));
        act(() => result.current.open(context.id));
        act(() => result.current.setDraft('Help me with this\nPlease'));
        await act(async () => { await result.current.send(); });
        expect(result.current.error).toBe('Seb is unavailable');
        expect(result.current.draft).toBe('Help me with this\nPlease');
        expect(result.current.messages).toHaveLength(0);
        expect(result.current.context).toEqual(context);
    });

    it('does not switch away from another draft when an earlier response arrives', async () => {
        let finish!: (response: Response) => void;
        const { result } = setup(() => new Promise(resolve => { finish = resolve; }));
        act(() => result.current.open(context.id));
        act(() => result.current.setDraft('Help'));
        act(() => { void result.current.send(); });
        await waitFor(() => expect(result.current.isPending).toBe(true));
        act(() => result.current.newChat());
        const selected = result.current.selected;
        await act(async () => finish(Response.json({ session: { id: 'saved' }, message: { content: 'Ready' } })));
        expect(result.current.selected).toBe(selected);
        act(() => result.current.open(context.id));
        expect(result.current.messages.at(-1)?.content).toBe('Ready');
    });

    it('does not silently send an unresolved deep link as a context-free question', async () => {
        const { result, fetcher } = setup(() => Promise.resolve(Response.json({})));
        act(() => result.current.open('recommendation:missing'));
        act(() => result.current.setDraft('Discuss this'));
        await act(async () => { await result.current.send(); });
        expect(result.current.unavailable).toBe(true);
        expect(fetcher.mock.calls.some(([url]) => url === '/api/seb/chat')).toBe(false);
    });
});
