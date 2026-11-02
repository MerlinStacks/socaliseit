import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueueAccountOption } from './client';
const m = vi.hoisted(() => ({ post: vi.fn(), mutate: vi.fn(), invalidate: vi.fn(), accounts: [] as QueueAccountOption[] }));
vi.mock('swr', () => ({ default: (key: string[]) => ({ data: key[2] === 'accounts' ? m.accounts : undefined, mutate: m.mutate }) }));
vi.mock('./client', async original => ({ ...await original<typeof import('./client')>(), postJson: m.post }));
vi.mock('./use-queue-cache', () => ({ useQueueCache: () => ({ key: (...parts: string[]) => ['publishing-queues', 'org', ...parts], invalidate: m.invalidate }) }));
vi.mock('./bulk-queue-dialog', () => ({ BulkQueueDialog: () => null }));
vi.mock('./bulk-batch-list', () => ({ BulkBatchList: () => null }));
vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }));
import { PublishingQueueSettings } from './publishing-queue-settings';

beforeEach(() => {
    vi.clearAllMocks();
    m.accounts = [
        { id: 'a', name: 'Profile A', platform: 'INSTAGRAM', queues: [{ id: 'queue-a', label: '', name: 'Default', slots: [{ daysOfWeek: [1], time: '10:00' }] }] },
        { id: 'b', name: 'Profile B', platform: 'FACEBOOK', queues: [] },
    ];
    m.post.mockImplementation(async () => Response.json({ data: { id: 'queue-b' } }));
});

describe('queue editor identity', () => {
    it('clears the previous template when switching to a profile without queues', async () => {
        render(<PublishingQueueSettings />);
        fireEvent.click(screen.getByRole('button', { name: /Profile A/ }));
        expect((screen.getByLabelText('Time for slot 1') as HTMLInputElement).value).toBe('10:00');
        fireEvent.click(screen.getByRole('button', { name: /Profile B/ }));
        expect(screen.queryByLabelText('Time for slot 1')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Add a slot' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save queue' }));
        await waitFor(() => expect(m.post).toHaveBeenCalled());
        expect(m.post).toHaveBeenCalledWith('/api/publishing-queues', 'POST', expect.objectContaining({ socialAccountId: 'b', label: '' }));
        expect(m.invalidate).toHaveBeenCalled();
    });

    it('uses the created queue id on the next save instead of creating it again', async () => {
        const view = render(<PublishingQueueSettings />);
        fireEvent.click(screen.getByRole('button', { name: /Profile B/ }));
        fireEvent.click(screen.getByRole('button', { name: 'Add a slot' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save queue' }));
        await waitFor(() => expect(m.invalidate).toHaveBeenCalled());
        m.accounts = [...m.accounts.slice(0, 1), { ...m.accounts[1], queues: [{ id: 'queue-b', label: '', name: 'Default', slots: [{ daysOfWeek: [1], time: '09:00' }] }] }];
        view.rerender(<PublishingQueueSettings />);
        fireEvent.click(screen.getByRole('button', { name: 'Save queue' }));
        await waitFor(() => expect(m.post).toHaveBeenCalledTimes(2));
        expect(m.post.mock.calls[1][0]).toBe('/api/publishing-queues/queue-b');
        expect(m.post.mock.calls[1][1]).toBe('PATCH');
    });
});
