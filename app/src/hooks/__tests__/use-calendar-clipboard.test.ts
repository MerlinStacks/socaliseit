import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useCalendarClipboard } from '../use-calendar-clipboard';
import type { CalendarPost } from '@/components/calendar/calendar-types';

vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }));
vi.mock('@/lib/api-error', () => ({ handleApiError: vi.fn(), showErrorToast: vi.fn() }));

const post: CalendarPost = {
    id: 'source', dragKey: 'source:instagram', platform: 'instagram', status: 'published',
    time: '2026-10-01T14:35:00', caption: 'Original', thumbnail: null,
    pillarColor: null, isExternal: false, externalUrl: null,
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T12:00:00'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('retains the original time for a month cell and allows repeated pastes', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useCalendarClipboard('org', refresh));
    act(() => result.current.copyPost(post));
    await act(() => result.current.pastePost(new Date('2026-10-08T00:00:00')));
    expect(fetch).toHaveBeenCalledWith('/api/posts/source', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'duplicate', scheduledAt: new Date('2026-10-08T14:35:00').toISOString() }),
    }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.current.copiedPost?.id).toBe('source');
    await act(() => result.current.pastePost(new Date('2026-10-09T00:00:00'), 9));
    expect(fetch).toHaveBeenLastCalledWith('/api/posts/source', expect.objectContaining({
        body: JSON.stringify({ action: 'duplicate', scheduledAt: new Date('2026-10-09T09:00:00').toISOString() }),
    }));
});

it('rejects past targets and isolates the clipboard across organizations', async () => {
    const { result, rerender } = renderHook(({ org }) => useCalendarClipboard(org, vi.fn()), { initialProps: { org: 'one' } });
    act(() => result.current.copyPost(post));
    await act(() => result.current.pastePost(new Date('2026-10-05T00:00:00'), 9));
    expect(fetch).not.toHaveBeenCalled();
    rerender({ org: 'two' });
    expect(result.current.copiedPost).toBeNull();
    await act(() => result.current.pastePost(new Date('2026-10-09T00:00:00'), 9));
    expect(fetch).not.toHaveBeenCalled();
});

it('blocks concurrent pastes and retains the clipboard after server failure', async () => {
    let resolve!: (value: { ok: boolean }) => void;
    vi.mocked(fetch).mockReturnValue(new Promise<Response>(done => { resolve = value => done(value as Response); }));
    const refresh = vi.fn();
    const { result } = renderHook(() => useCalendarClipboard('org', refresh));
    act(() => result.current.copyPost(post));
    let first!: Promise<void>;
    act(() => { first = result.current.pastePost(new Date('2026-10-08T00:00:00'), 10); });
    await act(() => result.current.pastePost(new Date('2026-10-08T00:00:00'), 10));
    expect(fetch).toHaveBeenCalledOnce();
    await act(async () => { resolve({ ok: false }); await first; });
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.isPasting).toBe(false);
    expect(result.current.copiedPost?.id).toBe('source');
});

it('does not copy imported external posts', () => {
    const { result } = renderHook(() => useCalendarClipboard('org', vi.fn()));
    act(() => result.current.copyPost({ ...post, isExternal: true }));
    expect(result.current.copiedPost).toBeNull();
});
