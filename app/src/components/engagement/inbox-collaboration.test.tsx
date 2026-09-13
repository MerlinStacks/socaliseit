import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InboxCollaboration } from './inbox-collaboration';
import { collaborationStream, editNoteDraft, NoteDraft, submitInternalNote } from './inbox-collaboration-model';
import { InboxEntity, InboxItem, normalizeInboxEntity } from './inbox-model';
import { useInboxDraft } from './use-inbox-draft';

const auth = vi.hoisted(() => ({ user: { id: 'user', currentOrganizationId: 'org' } }));
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: auth }) }));
const item: InboxItem = { id: 'local', type: 'dm', socialAccountId: 'account', socialAccount: { id: 'account', name: 'Brand', platform: 'INSTAGRAM', avatar: null }, platform: 'INSTAGRAM', authorId: 'sender', authorUsername: 'Sender', authorAvatar: null, text: 'Hello', createdAt: '2026-09-13T00:00:00Z', isRead: false, workflow: { status: 'open', assignedToId: null, labelIds: [], snoozedUntil: null }, meta: { conversationId: 'canonical-thread' } };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); auth.user = { id: 'user', currentOrganizationId: 'org' }; });

describe('private collaboration', () => {
    it('deduplicates refreshed copies and orders overlapping pages deterministically', () => {
        expect(collaborationStream([[{ id: 'b', createdAt: '2026-09-13', body: 'updated' }], [{ id: 'a', createdAt: '2026-09-12', body: 'old' }, { id: 'b', createdAt: '2026-09-13', body: 'stale' }]]).map(row => row.body)).toEqual(['updated', 'old']);
    });

    it('paginates streams independently, preserves loaded history on refresh and stops repeated cursors', async () => {
        let refreshed = false;
        const note = (id: string) => ({ id, body: `Note ${id}`, authorName: 'Alex', createdAt: `2026-09-${id}T00:00:00Z`, mentions: [] });
        const fetch = vi.fn().mockImplementation((url: string) => {
            const params = new URL(url, 'https://test.local').searchParams;
            const olderNotes = params.has('noteCursor');
            const olderActivity = params.has('activityCursor');
            return Promise.resolve({ ok: true, json: async () => ({ data: {
                canWrite: true,
                notes: olderNotes ? [note('12'), note('11')] : refreshed ? [note('13'), note('12')] : [note('12')],
                activity: [{ id: olderActivity ? 'old-event' : 'new-event', actorName: 'Alex', description: olderActivity ? 'Older event' : 'Latest event', createdAt: '2026-09-12T00:00:00Z' }],
                pagination: { notes: { nextCursor: 'notes-next' }, activity: { nextCursor: olderActivity ? null : 'activity-next' } },
            } }) });
        });
        vi.stubGlobal('fetch', fetch);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const view = (mode: 'notes' | 'activity') => <QueryClientProvider client={client}><InboxCollaboration item={item} mode={mode} /></QueryClientProvider>;
        const mounted = render(view('notes'));
        fireEvent.click(await screen.findByRole('button', { name: 'Load more notes' }));
        await screen.findByText('Note 11');
        expect(screen.getAllByText('Note 12')).toHaveLength(1);
        expect(screen.queryByRole('button', { name: 'Load more notes' })).toBeNull();
        refreshed = true;
        fireEvent.click(screen.getByRole('button', { name: 'Refresh notes' }));
        await screen.findByText('Note 13');
        expect(screen.getAllByRole('article').map(node => node.querySelector('p')?.textContent)).toEqual(['Note 13', 'Note 12', 'Note 11']);
        mounted.rerender(view('activity'));
        fireEvent.click(await screen.findByRole('button', { name: 'Load more activity' }));
        await screen.findByText(/Older event/);
        expect(screen.queryByRole('button', { name: 'Load more activity' })).toBeNull();
        const requests = fetch.mock.calls.map(([url]) => new URL(url, 'https://test.local').searchParams);
        expect(requests.some(params => params.get('noteCursor') === 'notes-next')).toBe(true);
        expect(requests.some(params => params.get('activityCursor') === 'activity-next')).toBe(true);
        expect(requests.every(params => !(params.has('noteCursor') && params.has('activityCursor')))).toBe(true);
        client.clear();
    });

    it('rejects empty, oversized notes and more than 20 explicit mentions before sending', async () => {
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        for (const draft of [{ body: '   ', mentionIds: [] }, { body: 'x'.repeat(5001), mentionIds: [] }, { body: 'Note', mentionIds: Array.from({ length: 21 }, (_, i) => String(i)) }]) {
            await expect(submitInternalNote('limits', item, draft, vi.fn())).rejects.toThrow('at most 20 mentions');
        }
        expect(fetch).not.toHaveBeenCalled();
    });

    it('renders read-only notes and an empty activity state without allowing submission', async () => {
        const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { notes: [], activity: [], canWrite: false } }) });
        vi.stubGlobal('fetch', fetch);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        const view = (mode: 'notes' | 'activity') => <QueryClientProvider client={client}><InboxCollaboration item={{ ...item, meta: { conversationId: 'readonly' } }} mode={mode} /></QueryClientProvider>;
        const mounted = render(view('notes'));
        await screen.findByText('You have read-only access to team collaboration.');
        expect((screen.getByLabelText('Add a private note') as HTMLTextAreaElement).disabled).toBe(true);
        expect((screen.getByRole('button', { name: 'Add private note' }) as HTMLButtonElement).disabled).toBe(true);
        mounted.rerender(view('activity'));
        await screen.findByText('No team activity yet.');
        expect(screen.queryByLabelText('Add a private note')).toBeNull();
        expect(fetch.mock.calls.every(([, init]) => init?.method !== 'POST')).toBe(true);
        client.clear();
    });

    it('posts only to the private route, retains failed attempts and locks duplicate clicks', async () => {
        let reject!: (error: Error) => void;
        const fetch = vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }))
            .mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { id: 'note' } }) });
        vi.stubGlobal('fetch', fetch);
        let draft: NoteDraft = { body: 'Private handoff @not-an-id', mentionIds: ['explicit-member-id'] };
        const retain = (value: NoteDraft) => { draft = value; };
        const first = submitInternalNote('retry-test', item, draft, retain);
        const requestId = draft.requestId;
        expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
        expect(await submitInternalNote('retry-test', item, draft, retain)).toBe(false);
        reject(new Error('Network unavailable'));
        await expect(first).rejects.toThrow('Network unavailable');
        expect(draft.body).toBe('Private handoff @not-an-id');
        await submitInternalNote('retry-test', item, draft, retain);
        expect(fetch).toHaveBeenCalledTimes(2);
        for (const [url, init] of fetch.mock.calls) {
            expect(url).toBe('/api/inbox/collaboration');
            expect(init.method).toBe('POST');
            expect(JSON.parse(init.body)).toEqual({ id: 'local', type: 'dm', socialAccountId: 'account', body: 'Private handoff @not-an-id', mentionIds: ['explicit-member-id'], requestId });
        }
        expect(draft).toEqual({ body: '', mentionIds: [] });
        expect(editNoteDraft({ body: 'Original', mentionIds: [], requestId }, { body: 'Changed' }).requestId).toBeUndefined();
        expect(editNoteDraft({ body: 'Original', mentionIds: [], requestId }, { mentionIds: ['other'] }).requestId).toBeUndefined();
    });

    it('shows submission errors and preserves body and explicitly selected members across remount', async () => {
        const fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => Promise.resolve({ ok: init?.method !== 'POST', status: 503,
            json: async () => init?.method === 'POST' ? { error: 'Please retry later' } : { data: { notes: [], activity: [], canWrite: true } } }));
        vi.stubGlobal('fetch', fetch);
        const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
        const onComposerActivity = vi.fn();
        const view = () => <QueryClientProvider client={client}><InboxCollaboration onComposerActivity={onComposerActivity} item={{ ...item, id: 'component', meta: { conversationId: 'component' } }} mode="notes" options={{ accounts: [], labels: [], members: [{ id: 'member-id', name: 'Alex' }] }} /></QueryClientProvider>;
        const mounted = render(view());
        await screen.findByText('No internal notes yet. Leave context for your team.');
        expect(onComposerActivity).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('Add a private note'), { target: { value: 'Only for the team' } });
        fireEvent.click(screen.getByLabelText('Alex'));
        expect(onComposerActivity.mock.calls).toEqual([[], []]);
        fireEvent.click(screen.getByRole('button', { name: 'Add private note' }));
        await screen.findByRole('alert');
        expect(screen.getByRole('alert').textContent).toContain('Please retry later');
        mounted.unmount();
        render(view());
        expect(onComposerActivity).toHaveBeenCalledTimes(2);
        expect((screen.getByLabelText('Add a private note') as HTMLTextAreaElement).value).toBe('Only for the team');
        expect((screen.getByLabelText('Alex') as HTMLInputElement).checked).toBe(true);
        await waitFor(() => expect((screen.getByRole('button', { name: 'Add private note' }) as HTMLButtonElement).disabled).toBe(false));
        fireEvent.click(screen.getByRole('button', { name: 'Add private note' }));
        await screen.findByRole('alert');
        const posts = fetch.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(init!.body as string));
        expect(posts).toHaveLength(2);
        expect(posts[0].requestId).toBe(posts[1].requestId);
        client.clear();
    });

    it('isolates drafts by organization, user, conversation and mode and restores on switching', () => {
        const { result, rerender } = renderHook(({ identity, mode }) => useInboxDraft(identity, mode), { initialProps: { identity: '[account,thread-a]', mode: 'reply' } });
        act(() => result.current.update('Public draft'));
        rerender({ identity: '[account,thread-a]', mode: 'internal-note' });
        expect(result.current.text).toBe('');
        act(() => result.current.update('Private draft'));
        rerender({ identity: '[account,thread-b]', mode: 'internal-note' });
        expect(result.current.text).toBe('');
        rerender({ identity: '[account,thread-a]', mode: 'internal-note' });
        expect(result.current.text).toBe('Private draft');
        auth.user = { id: 'other', currentOrganizationId: 'org' };
        rerender({ identity: '[account,thread-a]', mode: 'internal-note' });
        expect(result.current.text).toBe('');
        auth.user = { id: 'user', currentOrganizationId: 'other-org' };
        rerender({ identity: '[account,thread-a]', mode: 'internal-note' });
        expect(result.current.text).toBe('');
        auth.user = { id: 'user', currentOrganizationId: 'org' };
        rerender({ identity: '[account,thread-a]', mode: 'reply' });
        expect(result.current.text).toBe('Public draft');
    });

    it('normalizes raw notification rows, retains canonical DMs and rejects account mismatches', () => {
        const row: InboxEntity = { ...item, conversationId: 'canonical-thread', senderId: 'sender', senderUsername: 'Sam', direction: 'inbound' };
        const normalized = normalizeInboxEntity(row, 'dm', 'account');
        expect(normalized).toMatchObject({ id: 'local', authorUsername: 'Sam', meta: { conversationId: 'canonical-thread' } });
        expect(normalizeInboxEntity({ ...row, direction: 'outbound' }, 'dm', 'account').authorId).toBe('');
        expect(() => normalizeInboxEntity(row, 'dm', 'other')).toThrow('does not match');
        expect(normalizeInboxEntity({ ...row, type: 'review', authorUsername: undefined, authorName: 'Reviewer', rating: 5 }, 'review', 'account')).toMatchObject({ authorUsername: 'Reviewer', meta: { reviewId: 'local', rating: 5 } });
    });
});
