// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInboxPresence } from './use-inbox-presence';
import { InboxPresence } from './inbox-presence';
import { InboxItem } from './inbox-model';

const item = { id: 'row-1', type: 'dm', socialAccountId: 'account', meta: { conversationId: 'conversation' } } as InboxItem;
const response = (status = 200) => Promise.resolve({ ok: status === 200, status, json: async () => ({ data: { participants: [], ttlSeconds: 45 } }) });
let request: ReturnType<typeof vi.fn>;
const bodies = (method = 'PUT') => request.mock.calls.filter(([, init]) => init.method === method).map(([, init]) => JSON.parse(init.body));
const tick = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
const visible = async (value: 'visible' | 'hidden') => {
    await act(async () => { Object.defineProperty(document, 'visibilityState', { configurable: true, value }); document.dispatchEvent(new Event('visibilitychange')); });
};
beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    request = vi.fn(() => response());
    vi.stubGlobal('fetch', request);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('inbox presence lease', () => {
    it('heartbeats only visible selected detail, releases on hide/pagehide/unmount with independent IDs', async () => {
        const first = renderHook(() => useInboxPresence(item, 'conversation'));
        const second = renderHook(() => useInboxPresence(item, 'conversation'));
        await tick();
        const ids = bodies().map(body => body.tabId);
        expect(new Set(ids).size).toBe(2);
        await tick(15_000);
        expect(bodies()).toHaveLength(4);
        await visible('hidden');
        expect(bodies('DELETE').map(body => body.tabId)).toEqual(ids);
        await tick(60_000);
        expect(bodies()).toHaveLength(4);
        await visible('visible');
        expect(bodies()).toHaveLength(6);
        act(() => window.dispatchEvent(new Event('pagehide')));
        expect(request.mock.calls.filter(([, init]) => init.method === 'DELETE').every(([, init]) => init.keepalive)).toBe(true);
        first.unmount(); second.unmount();
        await tick(30_000);
        expect(bodies()).toHaveLength(6);
    });

    it('throttles input, expires drafting after eight seconds, resets tabs and keeps canonical DM identity', async () => {
        const hook = renderHook(({ row, tab }) => useInboxPresence(row, tab), { initialProps: { row: item, tab: 'conversation' } });
        await tick();
        act(() => { for (let i = 0; i < 20; i++) hook.result.current.reportActivity('replying'); });
        await tick(1000);
        expect(bodies().map(body => body.state)).toEqual(['viewing', 'replying']);
        hook.rerender({ row: { ...item, id: 'newest-row' }, tab: 'conversation' });
        await tick(7001);
        expect(bodies().at(-1)).toMatchObject({ id: 'newest-row', state: 'viewing', tabId: bodies()[0].tabId });
        expect(bodies('DELETE')).toHaveLength(0);
        act(() => hook.result.current.reportActivity('noting'));
        await tick(1000);
        expect(bodies().at(-1).state).toBe('noting');
        hook.rerender({ row: item, tab: 'activity' });
        await tick(1000);
        expect(bodies().at(-1).state).toBe('viewing');
        for (const body of bodies()) expect(Object.keys(body).sort()).toEqual(['id', 'socialAccountId', 'state', 'tabId', 'type']);
    });

    it('shows unknown and network failures distinctly from a confirmed empty response', async () => {
        request.mockImplementationOnce(() => response(503));
        const hook = renderHook(() => useInboxPresence(item, 'conversation'));
        expect(hook.result.current.status).toBe('unknown');
        await tick();
        const banner = render(<InboxPresence {...hook.result.current} />);
        expect(screen.getByText('Presence unavailable')).toBeTruthy();
        expect(screen.queryByText('No other teammates currently present.')).toBeNull();
        await tick(15_000);
        banner.rerender(<InboxPresence {...hook.result.current} />);
        expect(screen.getByText('No other teammates currently present.')).toBeTruthy();
    });

    it('falls back to viewing after drafting 403, and does not hide a failed fallback', async () => {
        const hook = renderHook(() => useInboxPresence(item, 'conversation'));
        await tick();
        request.mockImplementationOnce(() => response(403)).mockImplementationOnce(() => response(503));
        act(() => hook.result.current.reportActivity('replying'));
        await tick(2000);
        expect(bodies().map(body => body.state)).toEqual(['viewing', 'replying', 'viewing']);
        expect(hook.result.current.status).toBe('unavailable');
        act(() => hook.result.current.reportActivity('noting'));
        await tick(13_000);
        expect(bodies().at(-1).state).toBe('viewing');
        expect(hook.result.current.status).toBe('available');
    });

    it('ignores late responses and re-releases only the old lease after hiding/resuming', async () => {
        let resolve!: (value: Awaited<ReturnType<typeof response>>) => void;
        request.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        const hook = renderHook(() => useInboxPresence(item, 'conversation'));
        const oldId = bodies()[0].tabId;
        await visible('hidden');
        await visible('visible');
        const newId = bodies().at(-1).tabId;
        expect(newId).not.toBe(oldId);
        await act(async () => resolve(await response(503)));
        expect(hook.result.current.status).toBe('available');
        expect(bodies('DELETE').at(-1).tabId).toBe(oldId);
    });

    it('releases on direct unmount and does not restart on later visibility events', async () => {
        const hook = renderHook(() => useInboxPresence(item, 'conversation'));
        await tick();
        hook.unmount();
        expect(bodies('DELETE')[0].tabId).toBe(bodies()[0].tabId);
        await visible('hidden'); await visible('visible'); await tick(30_000);
        expect(bodies()).toHaveLength(1);
    });

    it('expires last known presence even if a transport ignores abort and never settles', async () => {
        const hook = renderHook(() => useInboxPresence(item, 'conversation'));
        await tick();
        request.mockImplementation(() => new Promise(() => {}));
        await tick(45_000);
        expect(hook.result.current.status).toBe('unavailable');
    });

    it('distinguishes private note writing from the prominent public reply warning', () => {
        const participant = { userId: 'other', name: 'Alex', state: 'noting' as const, updatedAt: new Date().toISOString() };
        const banner = render(<InboxPresence status="available" participants={[participant]} />);
        expect(screen.getByText(/writing an internal note \(private\)/)).toBeTruthy();
        expect(screen.queryByText(/Coordinate to avoid/)).toBeNull();
        banner.rerender(<InboxPresence status="available" participants={[{ ...participant, state: 'replying' }]} />);
        expect(screen.getByText(/Coordinate to avoid/)).toBeTruthy();
        expect(screen.getByText(/Advisory only/)).toBeTruthy();
    });
});
