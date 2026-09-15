import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ActivityPage from '@/app/(dashboard)/activity/page';
import type { ActivityItem, ActivityResponse } from '../activity-utils';

const session = vi.hoisted(() => ({ organizationId: 'workspace-a' as string | undefined }));
vi.mock('next-auth/react', () => ({
    useSession: () => ({ data: { user: { currentOrganizationId: session.organizationId } }, status: 'authenticated' }),
}));

const item = (id: string, resourceType = 'post'): ActivityItem => ({
    id, user: { name: 'Alex' }, action: `${resourceType}.created`, resourceType,
    resourceId: id, resourceName: id, timestamp: 'a moment ago', createdAt: '2026-09-01T12:00:00.000Z',
});
const page = (activities: ActivityItem[], overrides: Partial<ActivityResponse> = {}): ActivityResponse => ({
    activities, categories: [{ type: 'post', count: 2 }, { type: 'team', count: 1 }],
    workspaceTotal: 3, total: activities.length, offset: 0, hasMore: false, ...overrides,
});
const response = (body: ActivityResponse) => new Response(JSON.stringify(body));
const fetcher = vi.fn<typeof fetch>();
let client: QueryClient;

function mount() {
    const tree = () => <QueryClientProvider client={client}><ActivityPage /></QueryClientProvider>;
    const view = render(tree());
    return { ...view, rerenderPage: () => view.rerender(tree()) };
}
function params(call: number) {
    return new URL(String(fetcher.mock.calls[call][0]), 'http://localhost').searchParams;
}

beforeEach(() => {
    session.organizationId = 'workspace-a';
    fetcher.mockReset();
    vi.stubGlobal('fetch', fetcher);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

describe('Activity page', () => {
    it('builds category filters from recorded categories, including unfamiliar types', async () => {
        fetcher.mockResolvedValueOnce(response(page([item('Initial event')], {
            categories: [{ type: 'post', count: 12 }, { type: 'custom_event', count: 1 }], workspaceTotal: 13,
        }))).mockResolvedValue(response(page([item('Custom event', 'custom_event')], {
            categories: [{ type: 'post', count: 12 }, { type: 'custom_event', count: 1 }], workspaceTotal: 13,
        })));
        mount();
        await screen.findByText('Initial event');
        const categories = within(screen.getByRole('group', { name: 'Activity categories' }));
        expect(categories.getAllByRole('button').map(button => button.textContent)).toEqual(['All activity 13', 'Posts 12', 'Custom event 1']);
        expect(categories.queryByRole('button', { name: /Media|Accounts|Team/ })).toBeNull();
        fireEvent.click(categories.getByRole('button', { name: /Custom event\s*1/ }));
        await screen.findByText('Custom event', { selector: 'p' });
        expect(params(1).get('type')).toBe('custom_event');
        expect(categories.getByRole('button', { name: /Custom event\s*1/ }).getAttribute('aria-pressed')).toBe('true');
    });

    it('sends the entire trimmed search to the server and resets pagination for it', async () => {
        fetcher.mockResolvedValueOnce(response(page([item('Previously loaded')], { hasMore: true, total: 50 })))
            .mockResolvedValue(response(page([item('Server search result')])));
        mount();
        await screen.findByText('Previously loaded');
        const search = 'Alex + design & launch / résumé "draft"';
        fireEvent.change(screen.getByRole('searchbox', { name: 'Search activity' }), { target: { value: `  ${search}  ` } });
        expect((screen.getByRole('button', { name: 'Export loaded' }) as HTMLButtonElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Load more' }) as HTMLButtonElement).disabled).toBe(true);
        await screen.findByText('Server search result');
        expect(Object.fromEntries(params(1))).toEqual({ limit: '30', offset: '0', type: 'all', search });
        expect(screen.queryByText('Previously loaded')).toBeNull();
        expect(client.getQueryData(['activity', 'workspace-a', 'all', search])).toBeDefined();
    });

    it('appends subsequent pages using the actual loaded offset and removes exhausted pagination', async () => {
        fetcher.mockResolvedValueOnce(response(page([item('First'), item('Second')], { hasMore: true, total: 3 })))
            .mockResolvedValueOnce(response(page([item('Third')], { offset: 2, total: 3 })));
        mount();
        await screen.findByText('First');
        fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
        await screen.findByText('Third');
        expect(Object.fromEntries(params(1))).toEqual({ limit: '30', offset: '2', type: 'all', search: '' });
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
        expect(screen.getByRole('status').textContent).toBe('Showing 3 of 3 events');
        expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
        expect(screen.getAllByRole('list')).toHaveLength(1);
    });

    it('shows an initial error rather than empty history and retries successfully', async () => {
        fetcher.mockResolvedValueOnce(new Response(null, { status: 503 }))
            .mockResolvedValueOnce(response(page([item('Recovered event')])));
        mount();
        expect((await screen.findByRole('alert')).textContent).toContain('Activity couldn’t be loaded');
        expect(screen.queryByText('Your workspace history starts here')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
        await screen.findByText('Recovered event');
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('shows genuine empty history without an error or retry action', async () => {
        fetcher.mockResolvedValue(response(page([], { categories: [], workspaceTotal: 0 })));
        mount();
        await screen.findByText('Your workspace history starts here');
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.queryByRole('button', { name: /Try again|Retry|Load more/ })).toBeNull();
        expect((screen.getByRole('button', { name: 'Export loaded' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('keeps loaded events after a pagination error and retries the failed offset', async () => {
        fetcher.mockResolvedValueOnce(response(page([item('Retained event')], { hasMore: true, total: 2 })))
            .mockRejectedValueOnce(new Error('Network unavailable'))
            .mockResolvedValueOnce(response(page([item('Retried event')], { offset: 1, total: 2 })));
        mount();
        await screen.findByText('Retained event');
        fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
        expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t load more events.');
        expect(screen.getByText('Retained event')).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await screen.findByText('Retried event');
        expect(params(1).get('offset')).toBe('1');
        expect(params(2).get('offset')).toBe('1');
        expect(screen.getAllByRole('listitem')).toHaveLength(2);
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('retains history on refresh failure and replaces it after a successful retry', async () => {
        fetcher.mockResolvedValueOnce(response(page([item('Original event')])))
            .mockResolvedValueOnce(new Response(null, { status: 500 }))
            .mockResolvedValueOnce(response(page([item('Updated event')])));
        mount();
        await screen.findByText('Original event');
        fireEvent.click(screen.getByRole('button', { name: 'Refresh activity' }));
        expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t refresh events.');
        expect(screen.getByText('Original event')).toBeDefined();
        expect(screen.queryByText('Your workspace history starts here')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await screen.findByText('Updated event');
        expect(screen.queryByText('Original event')).toBeNull();
        expect(screen.queryByRole('alert')).toBeNull();
        expect(params(2).get('offset')).toBe('0');
    });

    it('isolates category caches and clears a no-match filter back to all activity', async () => {
        fetcher.mockResolvedValueOnce(response(page([item('All-only event')])))
            .mockResolvedValueOnce(response(page([])));
        mount();
        await screen.findByText('All-only event');
        fireEvent.click(screen.getByRole('button', { name: /Team\s*1/ }));
        await screen.findByText('No matching activity');
        expect(screen.queryByText('All-only event')).toBeNull();
        expect(params(1).get('type')).toBe('team');
        expect(client.getQueryData(['activity', 'workspace-a', 'all', ''])).toBeDefined();
        expect(client.getQueryData(['activity', 'workspace-a', 'team', ''])).toBeDefined();
        fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]);
        await screen.findByText('All-only event');
        expect(screen.getByRole('button', { name: /All activity\s*3/ }).getAttribute('aria-pressed')).toBe('true');
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('isolates tenants and ignores an old in-flight response after a workspace switch', async () => {
        let resolveOld!: (value: Response) => void;
        fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
            .mockResolvedValueOnce(response(page([item('Workspace B event')])));
        const view = mount();
        await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
        const oldSignal = fetcher.mock.calls[0][1]?.signal;
        session.organizationId = 'workspace-b';
        view.rerenderPage();
        await screen.findByText('Workspace B event');
        expect(oldSignal?.aborted).toBe(true);
        await act(async () => resolveOld(response(page([item('Workspace A late event')]))));
        expect(screen.queryByText('Workspace A late event')).toBeNull();
        expect(client.getQueryData(['activity', 'workspace-b', 'all', ''])).toBeDefined();
        expect(client.getQueryData(['activity', 'workspace-a', 'all', ''])).toBeUndefined();
    });

    it('does not expose cached activity or fetch without a selected workspace', async () => {
        fetcher.mockResolvedValue(response(page([item('Private workspace event')])));
        const view = mount();
        await screen.findByText('Private workspace event');
        session.organizationId = undefined;
        view.rerenderPage();
        expect(screen.getByRole('alert').textContent).toBe('Select a workspace to view its activity.');
        expect(screen.queryByText('Private workspace event')).toBeNull();
        expect((screen.getByRole('button', { name: 'Refresh activity' }) as HTMLButtonElement).disabled).toBe(true);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
