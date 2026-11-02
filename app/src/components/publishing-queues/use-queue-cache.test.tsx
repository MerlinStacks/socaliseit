import { renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { DashboardSessionProvider } from '@/components/layout/session-provider';
const m = vi.hoisted(() => ({ mutate: vi.fn(), sync: vi.fn() }));
vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate: m.mutate }) }));
vi.mock('@/lib/cross-tab-sync', () => ({ broadcastSync: m.sync }));
import { useQueueCache } from './use-queue-cache';

it('scopes cache keys and invalidation to the workspace, without recursively polling batches', async () => {
    m.mutate.mockResolvedValue(undefined);
    const { result } = renderHook(useQueueCache, { wrapper: ({ children }) => <DashboardSessionProvider session={{ userId: 'u', userName: 'U', userEmail: '', userImage: null, currentOrganizationId: 'org', isSuperAdmin: false }}>{children}</DashboardSessionProvider> });
    expect(result.current.key('batches')).toEqual(['publishing-queues', 'org', 'batches']);
    await result.current.invalidate(false);
    const predicate = m.mutate.mock.calls[0][0];
    expect(predicate(['publishing-queues', 'org', 'preview'])).toBe(true);
    expect(predicate(['publishing-queues', 'other-org', 'preview'])).toBe(false);
    expect(predicate(['publishing-queues', 'org', 'batches'])).toBe(false);
    expect(m.sync).toHaveBeenCalledWith('post:updated', undefined, 'org');
});

it('does not relabel a committed mutation as failed when cache refresh is offline', async () => {
    m.mutate.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(useQueueCache, { wrapper: ({ children }) => <DashboardSessionProvider session={{ userId: 'u', userName: 'U', userEmail: '', userImage: null, currentOrganizationId: 'org', isSuperAdmin: false }}>{children}</DashboardSessionProvider> });
    await expect(result.current.invalidate()).resolves.toBeUndefined();
});
