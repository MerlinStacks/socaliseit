import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SebClient from '@/app/(dashboard)/seb/seb-client';
import type { Recommendation, Workspace } from '../types';

const navigation = vi.hoisted(() => ({ search: '' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(navigation.search) }));

const date = '2026-09-15T10:00:00.000Z';
function recommendation(id: string, status: Recommendation['status'], account = 'account-a'): Recommendation {
    return { id, title: `Action ${id}`, advice: 'Use a clear opening question.', rationale: 'Questions prompted replies.',
        category: 'CONTENT', priority: 'HIGH', status, reportId: 'older-report', socialAccountId: account,
        socialAccount: { id: account, name: account, username: null }, platform: 'INSTAGRAM',
        evidence: { sample: 12 }, citations: [{ url: 'https://example.com/post' }, { url: 'javascript:alert(1)' }],
        confidence: .8, impactBaseline: null, impactResult: null, impactCheckedAt: null, dueAt: null,
        completedAt: null, createdAt: date, updatedAt: date };
}
function fixture(): Workspace {
    return { latest: { id: 'last', title: 'Your completed briefing', summary: 'Keep the useful work visible.', status: 'COMPLETED', trigger: 'MANUAL', overallScore: null, confidence: null, createdAt: date, updatedAt: date, dataStartDate: date, dataEndDate: date },
        review: { id: 'refresh', status: 'RUNNING', stage: 'generating', createdAt: date, updatedAt: date },
        recommendations: [recommendation('new', 'NEW'), recommendation('working', 'IN_PROGRESS', 'account-b'), recommendation('done', 'DONE'), recommendation('dismissed', 'DISMISSED')],
        experiments: [], history: [], activity: [{ id: 'milestone', title: 'Recommendation updated', actor: 'System', createdAt: date, detail: 'Record-derived milestone: current status only.' }],
        hasMore: { recommendations: { active: false, closed: true }, experiments: { active: false, closed: false }, history: false, activity: false } };
}
function mount(data = fixture(), mutation?: (url: string, init?: RequestInit) => Promise<Response>) {
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
        if (init?.method && mutation) return mutation(url, init);
        return Promise.resolve(Response.json(url === '/api/seb/workspace' ? data : { sessions: [] }));
    });
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><SebClient /></QueryClientProvider>);
    return { client, fetcher };
}
afterEach(() => { vi.unstubAllGlobals(); navigation.search = ''; });

describe('Seb workspace', () => {
    it('retains the completed briefing while showing truthful review state and cross-report actions', async () => {
        mount();
        expect(await screen.findByText('Your completed briefing')).toBeTruthy();
        expect(screen.getByText('RUNNING')).toBeTruthy();
        expect(screen.getByText('generating')).toBeTruthy();
        expect((screen.getByRole('button', { name: 'Review in progress' }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole('heading', { name: 'Action new' })).toBeTruthy();
        expect(screen.getByRole('heading', { name: 'Action working' })).toBeTruthy();
        expect(screen.queryByRole('heading', { name: 'Action done' })).toBeNull();
        expect(screen.getByText(/Record-derived milestone/)).toBeTruthy();
        expect(screen.getByText(/System ·/)).toBeTruthy();
        expect(screen.queryByText(/uplift|\d+ score/i)).toBeNull();
    });

    it('filters account and closed status, and only renders safe evidence links', async () => {
        mount(); await screen.findByText('Action new');
        fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-b' } });
        expect(screen.queryByRole('heading', { name: 'Action new' })).toBeNull();
        expect(screen.getByRole('heading', { name: 'Action working' })).toBeTruthy();
        fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'all' } });
        fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'DISMISSED' } });
        const card = screen.getByRole('heading', { name: 'Action dismissed' }).closest('article')!;
        expect(within(card).getByRole('button', { name: 'Reopen' })).toBeTruthy();
        fireEvent.click(within(card).getByText('Why this matters & evidence'));
        expect(within(card).getByRole('link').getAttribute('href')).toBe('https://example.com/post');
        expect(within(card).getByText('javascript:alert(1)')).toBeTruthy();
    });

    it('shows pending mutation state and exposes failures with retry', async () => {
        let finish!: (response: Response) => void;
        const { fetcher } = mount(fixture(), () => new Promise(resolve => { finish = resolve; }));
        await screen.findByText('Action new');
        fireEvent.click(screen.getByRole('button', { name: 'Start action' }));
        await screen.findByRole('button', { name: 'Saving…' });
        expect((screen.getByRole('button', { name: 'Mark done' }) as HTMLButtonElement).disabled).toBe(true);
        await act(async () => finish(Response.json({ error: 'Update unavailable' }, { status: 503 })));
        expect(await screen.findByText('Update unavailable')).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Retry update' })).toBeTruthy();
        expect(fetcher.mock.calls.some(([url, init]) => url.endsWith('/recommendations/new') && init?.body === JSON.stringify({ status: 'IN_PROGRESS' }))).toBe(true);
    });

    it.each(['QUEUED', 'FAILED', 'COMPLETED'] as const)('renders %s without inventing a detailed stage', async status => {
        const data = fixture(); data.review = { ...data.review!, status, stage: null };
        mount(data); await screen.findByText('Your completed briefing');
        expect(screen.getByText(status)).toBeTruthy();
        expect(screen.getByText(status === 'FAILED' ? 'The latest review could not finish' : status === 'COMPLETED' ? 'Your latest review is ready' : 'Detailed stage not recorded')).toBeTruthy();
        if (status === 'FAILED') expect(screen.getByRole('button', { name: 'Retry review' })).toBeTruthy();
    });

    it('keeps the last briefing when a refresh fails and exposes loading retry', async () => {
        const { client, fetcher } = mount(); await screen.findByText('Your completed briefing');
        fetcher.mockImplementation(() => Promise.resolve(Response.json({ error: 'Connection interrupted' }, { status: 503 })));
        await act(async () => { await client.invalidateQueries({ queryKey: ['seb-workspace'] }); });
        expect(screen.getByText('Your completed briefing')).toBeTruthy();
        expect(await screen.findByText(/Showing the last loaded data/)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Retry loading' })).toBeTruthy();
    });

    it('opens and closes mobile chat accessibly and supports multiline composition', async () => {
        mount(); await screen.findByText('Action new');
        fireEvent.click(screen.getByRole('button', { name: 'Chat with Seb' }));
        expect(await screen.findByRole('dialog', { name: 'Chat with Seb' })).toBeTruthy();
        const input = screen.getByLabelText('Message Seb') as HTMLTextAreaElement;
        fireEvent.change(input, { target: { value: 'First line\nSecond line' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(input.value).toContain('\n');
        fireEvent.click(screen.getByRole('button', { name: 'Close chat' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(document.body.style.overflow).not.toBe('hidden');
    });

    it('resolves a contextual deep link after the workspace loads', async () => {
        navigation.search = 'thread=recommendation%3Anew';
        const { fetcher } = mount(fixture(), () => Promise.resolve(Response.json({ session: { id: 'saved' }, message: { content: 'Here is a next step.' } })));
        await screen.findByRole('dialog', { name: 'Chat with Seb' });
        await waitFor(() => expect(screen.getByText('Discussing')).toBeTruthy());
        fireEvent.change(screen.getByLabelText('Message Seb'), { target: { value: 'Help me start' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        await screen.findByText('Here is a next step.');
        const request = fetcher.mock.calls.find(([url]) => url === '/api/seb/chat');
        expect(JSON.parse(request?.[1]?.body as string).message).toContain('Use a clear opening question.');
        expect(screen.getByText('Discussing')).toBeTruthy();
    });

    it('shows finished experiments on request and submits the primary transition', async () => {
        const data = fixture();
        const base = { reportId: null, hypothesis: 'A question may invite replies.', platform: null, metric: 'Replies', startAt: null, endAt: null, baseline: null, result: null, createdAt: date, updatedAt: date };
        data.experiments = [{ ...base, id: 'test', title: 'Opening test', status: 'PLANNED' }, { ...base, id: 'finished', title: 'Finished test', status: 'COMPLETED' }];
        const { fetcher } = mount(data, () => Promise.resolve(Response.json({ ok: true })));
        await screen.findByRole('heading', { name: 'Opening test' });
        expect(screen.queryByRole('heading', { name: 'Finished test' })).toBeNull();
        fireEvent.click(screen.getByLabelText('Include finished'));
        expect(screen.getByRole('heading', { name: 'Finished test' })).toBeTruthy();
        fireEvent.click(screen.getByRole('button', { name: 'Start experiment' }));
        await waitFor(() => expect(fetcher.mock.calls.some(([url, init]) => url.endsWith('/experiments/test') && init?.body === JSON.stringify({ status: 'RUNNING' }))).toBe(true));
    });
});
