import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, QueryObserverOptions } from '@tanstack/react-query';
import { InboxReporting } from './inbox-reporting';
import { InboxReport, reportingParams, validReportingFilters, workloadPercent } from './inbox-reporting-model';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: { user: { id: 'user', currentOrganizationId: 'org' } } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const accounts = [{ id: 'ig', name: 'Instagram brand', platform: 'INSTAGRAM' }, { id: 'fb', name: 'Facebook brand', platform: 'FACEBOOK' }];
const report: InboxReport = { data: { generatedAt: '2026-09-13T12:00:00Z', summary: { open: 4, resolved: 2, snoozed: 1, unassignedOpen: 1, openOlderThan24h: 3, openOlderThan72h: 1 }, byType: [{ type: 'dm', open: 4, resolved: 2, snoozed: 1 }], byAssignee: [{ userId: null, name: 'Unassigned', open: 1, olderThan24h: 1 }], ageBuckets: [{ key: 'under24h', label: 'Under 24 hours', count: 1 }] }, definitions: { aging: 'Backend aging definition.', resolutions: 'Current resolved totals are a snapshot, not resolution events.' } };
function mount() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><InboxReporting options={{ accounts, labels: [], members: [] }} /></QueryClientProvider>);
    return client;
}
describe('inbox reporting', () => {
    it('validates account/platform combinations and encodes only supported filters', () => {
        expect(validReportingFilters({ platform: 'FACEBOOK', socialAccountId: 'ig' }, accounts)).toEqual({ platform: 'FACEBOOK', socialAccountId: '' });
        expect(validReportingFilters({ platform: 'REMOVED', socialAccountId: 'deleted' }, accounts)).toEqual({ platform: '', socialAccountId: '' });
        expect(reportingParams({ platform: 'INSTAGRAM', socialAccountId: 'a&b' })).toBe('socialAccountId=a%26b&platform=INSTAGRAM');
        expect(workloadPercent(0, 0)).toBe(0);
        expect(workloadPercent(1, 4)).toBe(25);
        expect(workloadPercent(10, 4)).toBe(100);
    });
    it('renders workload, freshness and authoritative definitions with manual refresh and valid filters', async () => {
        const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => report });
        vi.stubGlobal('fetch', fetch);
        const client = mount();
        await screen.findByText('Backend aging definition.');
        expect(screen.getByText(report.definitions.resolutions)).toBeTruthy();
        expect(screen.getByText('Age measures latest activity, not response or waiting time.')).toBeTruthy();
        expect(screen.getByText('Direct messages')).toBeTruthy();
        expect(screen.getByText('Unassigned')).toBeTruthy();
        expect(screen.getByText(/Snapshot generated/).querySelector('time')?.dateTime).toBe(report.data.generatedAt);
        const query = client.getQueryCache().find({ queryKey: ['inbox-reporting', 'org', 'user', ''] });
        const options = query?.options as QueryObserverOptions;
        expect(options.staleTime).toBe(60_000);
        expect(options.refetchInterval).toBeUndefined();
        fireEvent.click(screen.getByRole('button', { name: 'Refresh insights' }));
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
        fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'ig' } });
        await waitFor(() => expect(fetch.mock.calls.at(-1)?.[0]).toContain('socialAccountId=ig'));
        fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'FACEBOOK' } });
        await waitFor(() => expect(fetch.mock.calls.at(-1)?.[0]).toBe('/api/inbox/reporting?platform=FACEBOOK'));
        expect((screen.getByLabelText('Account') as HTMLSelectElement).value).toBe('');
        client.clear();
    });
    it('shows loading, retryable errors and an empty successful snapshot', async () => {
        let resolve!: (value: unknown) => void;
        const fetch = vi.fn().mockImplementationOnce(() => new Promise(done => { resolve = done; }));
        vi.stubGlobal('fetch', fetch);
        const client = mount();
        expect(screen.getByText('Loading inbox insights…')).toBeTruthy();
        resolve({ ok: false, status: 503, json: async () => ({ error: 'Unavailable' }) });
        expect((await screen.findByRole('alert')).textContent).toContain('Unavailable');
        fetch.mockResolvedValue({ ok: true, json: async () => ({ ...report, data: { ...report.data, summary: { open: 0, resolved: 0, snoozed: 0, unassignedOpen: 0, openOlderThan24h: 0, openOlderThan72h: 0 }, byType: [], byAssignee: [], ageBuckets: [] } }) });
        fireEvent.click(screen.getByRole('button', { name: 'Retry insights' }));
        await screen.findByText('No conversations in this view.');
        expect(screen.queryByRole('alert')).toBeNull();
        client.clear();
    });
});
