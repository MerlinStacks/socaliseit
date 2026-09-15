import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ListeningWorkspace from '../listening-workspace';
import { EMPTY_FILTERS, listeningQuery } from '../listening-filters';
import { HighlightedText, MentionCard, safeListeningUrl } from '../listening-item';
import type { ListeningData } from '../listening-types';

const access = vi.hoisted(() => ({ manage: true }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ isLoading: false, hasPermission: () => access.manage }) }));
vi.mock('@/hooks/use-organization', () => ({ useOrganization: () => ({ organization: { id: 'org-1' } }) }));

const data: ListeningData = {
    platforms: [], totalCount: 61, unreadCount: 35, page: 1, pageSize: 25, totalPages: 3,
    sentiment: { positive: 42, negative: 19 },
    monitors: [{ id: 'm1', name: 'Brand', keywords: ['brand'], excludedTerms: [], platforms: [], isActive: true, lastSyncedAt: null, _count: { items: 61 } }],
    crawlerSources: [{ id: 's1', name: 'News', url: 'https://example.com', sourceType: 'rss', isActive: true, lastCrawledAt: null, lastError: 'Timeout' }],
    items: [{ id: 'i1', platform: 'MANUAL', sourceType: 'crawler', authorName: 'Alex', content: 'A brand mention', matchedKeywords: ['brand'], isRead: false, occurredAt: '2026-09-15T12:00:00Z', sentiment: 'positive', monitor: { name: 'Brand' }, externalUrl: null, mediaUrl: null }],
};
const fetchMock = vi.fn();
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } }); }
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ListeningWorkspace /></QueryClientProvider>); }
beforeEach(() => { access.manage = true; fetchMock.mockReset(); fetchMock.mockImplementation(async () => response(data)); vi.stubGlobal('fetch', fetchMock); });

describe('listening workspace', () => {
    it('shows the inbox first and full dataset totals in overview', async () => {
        mount();
        await screen.findByText('Alex');
        expect(screen.getByText('61 matching · 35 unread')).toBeTruthy();
        expect(screen.getByText(/None connected/)).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Create monitor' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Overview' }));
        expect(screen.getByText('61')).toBeTruthy();
        expect(screen.getByText('42')).toBeTruthy();
    });

    it('sends page-scoped selection and reports partial updates', async () => {
        fetchMock.mockImplementation(async (_url, init) => response(init?.method === 'PATCH' ? { success: true, updatedCount: 0 } : data));
        mount(); await screen.findByText('Alex');
        fireEvent.click(screen.getByLabelText('Select this page'));
        fireEvent.click(screen.getByRole('button', { name: 'Mark selected read' }));
        await screen.findByText(/Only 0 of 1 mentions were updated/);
        const mutation = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
        expect(mutation?.[0]).toBe('/api/listening/items');
        expect(JSON.parse(mutation?.[1].body)).toEqual({ ids: ['i1'], isRead: true });
        expect(screen.getByRole('button', { name: 'Retry action' })).toBeTruthy();
    });

    it('resets pagination when filters change and clears page selection', async () => {
        fetchMock.mockImplementation(async url => { const page = Number(new URL(url, 'https://local').searchParams.get('page')); return response({ ...data, page }); });
        mount(); await screen.findByText('Alex');
        fireEvent.click(screen.getByLabelText('Select this page'));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await screen.findByText('Page 2 of 3 · 61 results');
        expect(screen.getByText('0 selected')).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Search text or author'), { target: { value: 'help' } });
        await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => url.includes('page=1') && url.includes('q=help'))).toBe(true));
    });

    it('offers fetch retry and shows partial sync stage failures', async () => {
        fetchMock.mockResolvedValueOnce(response({ error: 'Unavailable' }, 503));
        mount(); await screen.findByText(/Could not load listening: Unavailable/);
        fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
        await screen.findByText('Alex');
        fetchMock.mockImplementation(async (_url, init) => response(init?.method === 'POST' ? { success: false, partial: true, errors: [{ stage: 'crawler', message: 'Crawl failed' }] } : data));
        fireEvent.click(screen.getByRole('button', { name: 'Sync listening' }));
        await screen.findByText(/Sync incomplete. crawler: Crawl failed/);
    });

    it('hides mutations for viewers', async () => {
        access.manage = false; mount(); await screen.findByText('Alex');
        expect(screen.queryByRole('button', { name: 'Sync listening' })).toBeNull();
        expect(screen.queryByLabelText('Select this page')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Mark read' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Sources' }));
        await screen.findByText('News');
        expect(screen.queryByRole('button', { name: 'Create source' })).toBeNull();
    });

    it('edits sourceType through the type request field and shows health', async () => {
        fetchMock.mockImplementation(async (_url, init) => response(init?.method === 'PATCH' ? { ...data.crawlerSources[0], sourceType: 'page' } : data));
        mount(); await screen.findByText('Alex');
        fireEvent.click(screen.getByRole('button', { name: 'Sources' }));
        await screen.findByText('Last crawl error: Timeout');
        fireEvent.click(screen.getByRole('button', { name: 'Edit News' }));
        expect((screen.getByLabelText('Source type') as HTMLSelectElement).value).toBe('rss');
        fireEvent.change(screen.getByLabelText('Source type'), { target: { value: 'page' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save source' }));
        await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => url.endsWith('/sources/s1') && JSON.parse(init.body).type === 'page')).toBe(true));
    });

    it('creates monitors with trimmed arrays and retains forms after validation failure', async () => {
        fetchMock.mockImplementation(async (_url, init) => init?.method === 'POST' ? response({ error: 'Invalid input', issues: [{ message: 'Too many keywords' }] }, 400) : response(data));
        mount(); await screen.findByText('Alex');
        fireEvent.click(screen.getByRole('button', { name: 'Monitors' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Create monitor' }));
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New brand' } });
        fireEvent.change(screen.getByLabelText('Keywords (comma-separated)'), { target: { value: ' brand, product, ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save monitor' }));
        await screen.findByText('Invalid input: Too many keywords');
        const mutation = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
        expect(JSON.parse(mutation?.[1].body)).toEqual({ name: 'New brand', keywords: ['brand', 'product'], excludedTerms: [], platforms: [] });
        expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('New brand');
    });

    it('uses partial updates to pause monitors and disable sources', async () => {
        fetchMock.mockImplementation(async (_url, init) => response(init?.method === 'PATCH' ? { success: true } : data));
        mount(); await screen.findByText('Alex');
        fireEvent.click(screen.getByRole('button', { name: 'Monitors' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
        await screen.findByText('Changes saved.');
        fireEvent.click(screen.getByRole('button', { name: 'Sources' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Disable' }));
        await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(2));
        const calls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PATCH');
        expect(calls.map(([url, init]) => [url, JSON.parse(init.body)])).toEqual([
            ['/api/listening/monitors/m1', { isActive: false }], ['/api/listening/sources/s1', { isActive: false }],
        ]);
    });

    it('allows management tabs even when an inbox date range is invalid', async () => {
        mount(); await screen.findByText('Alex');
        fireEvent.change(screen.getByLabelText('From (local time)'), { target: { value: '2026-09-15T10:00' } });
        fireEvent.change(screen.getByLabelText('To (local time)'), { target: { value: '2026-09-01T10:00' } });
        expect(screen.getByText('From must be before or equal to To.')).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Monitors' }));
        expect(await screen.findByRole('button', { name: 'Create monitor' })).toBeTruthy();
    });
});

describe('listening display and query helpers', () => {
    it('serializes all filters and local dates as ISO timestamps', () => {
        const query = new URLSearchParams(listeningQuery({ ...EMPTY_FILTERS, q: 'a & b', monitorId: 'm1', platform: 'MANUAL', sentiment: 'question', sourceType: 'crawler', unread: 'true', from: '2026-09-01T10:00', to: '2026-09-02T10:00' }, 2, 25));
        expect(query.get('q')).toBe('a & b');
        expect(query.get('unread')).toBe('true');
        expect(query.get('from')).toBe(new Date('2026-09-01T10:00').toISOString());
        expect(query.get('page')).toBe('2');
        expect(query.get('sourceType')).toBe('crawler');
    });
    it('highlights literal keywords safely, including regex metacharacters', () => {
        const { container } = render(<HighlightedText text="C++ and BRAND <script>" keywords={['c++', 'brand']} />);
        expect([...container.querySelectorAll('mark')].map(mark => mark.textContent)).toEqual(['C++', 'BRAND']);
        expect(container.querySelector('script')).toBeNull();
        expect(safeListeningUrl('javascript:alert(1)')).toBeUndefined();
    });
    it('expands long mentions and provides a fallback for failed media', () => {
        render(<MentionCard item={{ ...data.items[0], content: `${'Long text '.repeat(60)}ending`, mediaUrl: 'https://example.com/image.jpg' }} selected={false} canManage={false} busy={false} onSelect={vi.fn()} onRead={vi.fn()} />);
        expect(screen.queryByText(/ending/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Show full text' }));
        expect(screen.getByText(/ending/)).toBeTruthy();
        fireEvent.click(screen.getByText('Media preview'));
        fireEvent.error(screen.getByAltText('Media attached to mention by Alex'));
        expect(screen.getByText('Preview unavailable.')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Open media' }).getAttribute('href')).toBe('https://example.com/image.jpg');
    });
});
