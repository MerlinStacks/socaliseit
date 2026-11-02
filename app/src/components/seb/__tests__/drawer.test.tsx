import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SebChatProvider, useSebChatSurface, useSebDiscussions } from '../seb-chat-provider';
import { SebDrawer } from '../seb-drawer';

const sync = vi.hoisted(() => vi.fn());
vi.mock('@/lib/cross-tab-sync', () => ({ broadcastSync: sync }));

/** Stands in for a page: it says what is discussable for as long as it is mounted. */
function Page({ topics = [] }: { topics?: { id: string; title: string; prompt: string }[] }) {
    useSebDiscussions(topics);
    const { openChat } = useSebChatSurface();
    return <main><h1>Calendar</h1>{topics.map(topic => <button key={topic.id} onClick={() => openChat(topic)}>Discuss {topic.title}</button>)}</main>;
}

const reply = {
    session: { id: 'session-1' },
    message: {
        content: 'I drafted it and found the creative.',
        metadata: {
            tools: [
                { name: 'search_media', label: 'Searched your media library', ok: true },
                { name: 'schedule_draft', label: 'Tried to schedule a draft', ok: false },
            ],
            artifacts: [
                { kind: 'posts', id: 'draft:p1', title: 'Drafted from chat', write: true, posts: [{ id: 'p1', caption: 'Something worth saying', status: 'draft', platform: 'instagram', accountName: 'Instagram main', postType: 'reel', scheduledAt: null, publishedAt: null, editUrl: '/compose?edit=p1', media: [{ previewUrl: '/media/t.jpg', type: 'image' }] }] },
                { kind: 'metrics', id: 'metrics:30d:ALL', title: 'Last 30 days', range: '30d', rows: [{ label: 'Likes', value: '120', change: 8 }, { label: 'Comments', value: '9', change: -3 }], note: 'Metrics are from the last sync.' },
            ],
        },
    },
};

function mount(topics: { id: string; title: string; prompt: string }[] = []) {
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === '/api/seb/chat/sessions') return Promise.resolve(Response.json({ sessions: [] }));
        if (url === '/api/seb/chat') return Promise.resolve(Response.json(reply));
        return Promise.resolve(Response.json({}));
    });
    vi.stubGlobal('fetch', fetcher);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const view = render(
        <QueryClientProvider client={client}>
            <SebChatProvider><Page topics={topics} /><SebDrawer /></SebChatProvider>
        </QueryClientProvider>,
    );
    return { ...view, fetcher, client };
}

const tab = () => screen.getByRole('button', { name: /Seb/ });
const panel = () => document.querySelector<HTMLElement>('.seb-dock-panel')!;
const composer = () => panel().querySelector('textarea')!;

/** Down, a move of `delta` pixels, up. jsdom measures 0 width, so the drawer falls back to 420px and 30% of that is 126px. */
function drag(handle: HTMLElement, delta: number, pointerId = 1) {
    fireEvent.pointerDown(handle, { clientX: 800, pointerId, pointerType: 'mouse', button: 0 });
    fireEvent.pointerMove(handle, { clientX: 800 - delta, pointerId, pointerType: 'mouse' });
    fireEvent.pointerUp(handle, { clientX: 800 - delta, pointerId, pointerType: 'mouse' });
}

/** The body of the first call to an endpoint that carried one. */
function posted(view: { fetcher: ReturnType<typeof vi.fn> }, url: string) {
    return view.fetcher.mock.calls.find(([u, init]) => String(u) === url && init?.method === 'POST')?.[1]?.body as RequestInit['body'] | undefined;
}

async function ask(text: string) {
    fireEvent.click(tab());
    fireEvent.change(composer(), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('I drafted it and found the creative.');
}

/** This jsdom ships without storage, and the drawer keeps its state in it. */
const storage = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
        removeItem: (key: string) => { storage.delete(key); },
        clear: () => storage.clear(),
    },
});

beforeEach(() => {
    storage.clear();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    // Desktop by default, so the drawer behaves like a panel rather than a sheet.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('min-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('the tab', () => {
    it('opens on a click and says so to assistive technology', async () => {
        mount();
        expect(tab().getAttribute('aria-expanded')).toBe('false');
        fireEvent.click(tab());
        await waitFor(() => expect(tab().getAttribute('aria-expanded')).toBe('true'));
        expect(panel().getAttribute('aria-label')).toBe('Chat with Seb');
    });

    it('takes the closed drawer out of the tab order', async () => {
        mount();
        expect(panel().hasAttribute('inert')).toBe(true);
        fireEvent.click(tab());
        await waitFor(() => expect(panel().hasAttribute('inert')).toBe(false));
    });

    it('opens with a drag inward and springs back from a short one', async () => {
        mount();
        drag(tab(), 40);
        expect(tab().getAttribute('aria-expanded')).toBe('false');
        drag(tab(), 200);
        await waitFor(() => expect(tab().getAttribute('aria-expanded')).toBe('true'));
    });

    it('closes by dragging the panel edge outward', async () => {
        mount();
        fireEvent.click(tab());
        await waitFor(() => expect(tab().getAttribute('aria-expanded')).toBe('true'));
        drag(document.querySelector<HTMLElement>('.seb-dock-grip')!, -350, 2);
        await waitFor(() => expect(tab().getAttribute('aria-expanded')).toBe('false'));
    });

    it('is a sheet that locks the page on a phone', async () => {
        vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('max-width'), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
        mount();
        fireEvent.click(tab());
        await waitFor(() => expect(panel().getAttribute('role')).toBe('dialog'));
        expect(panel().getAttribute('aria-modal')).toBe('true');
        expect(document.body.style.overflow).toBe('hidden');
        expect(document.querySelector('main')!.hasAttribute('inert')).toBe(true);

        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(tab().getAttribute('aria-expanded')).toBe('false'));
        expect(document.body.style.overflow).not.toBe('hidden');
        expect(document.querySelector('main')!.hasAttribute('inert')).toBe(false);
    });

    it('returns focus to the tab after Escape', async () => {
        mount();
        fireEvent.click(tab());
        await waitFor(() => expect(tab().getAttribute('aria-expanded')).toBe('true'));
        composer().focus();
        fireEvent.keyDown(document, { key: 'Escape' });
        await waitFor(() => expect(document.activeElement).toBe(tab()));
    });

    it('reappears open to a member who left it open', async () => {
        const first = mount();
        fireEvent.click(tab());
        await waitFor(() => expect(tab().getAttribute('aria-expanded')).toBe('true'));
        first.unmount();
        mount();
        await waitFor(() => expect(tab().getAttribute('aria-expanded')).toBe('true'));
    });
});

describe('what the drawer shows', () => {
    it('shows the actions behind the answer, then what they produced', async () => {
        mount();
        await ask('Draft something from the launch reel.');

        const trace = screen.getByRole('list', { name: 'What Seb did' });
        expect(trace.textContent).toContain('Searched your media library');
        expect(screen.getByText('Tried to schedule a draft')).toBeTruthy();

        expect(screen.getByText('Something worth saying')).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Open in composer' }).getAttribute('href')).toBe('/compose?edit=p1');
        expect(panel().querySelector('img')?.getAttribute('src')).toBe('/media/t.jpg');
        expect(screen.getByText('Likes')).toBeTruthy();
        expect(screen.getByText('+8%')).toBeTruthy();
        expect(screen.getByText('-3%')).toBeTruthy();
        expect(screen.getByText('Metrics are from the last sync.')).toBeTruthy();
    });

    it('tells the rest of the workspace that a post changed', async () => {
        mount();
        await ask('Draft something.');
        expect(sync).toHaveBeenCalledWith('post:updated', 'p1');
    });

    it('keeps one thread across a change of page', async () => {
        const topics = [{ id: 'recommendation:new', title: 'Action new', prompt: 'Recommendation: Action new' }];
        const view = mount(topics);
        await ask('How do I start?');

        // The page underneath is replaced; the chat is not the page's to give up.
        view.rerender(
            <QueryClientProvider client={new QueryClient()}>
                <SebChatProvider><Page topics={[]} /><SebDrawer /></SebChatProvider>
            </QueryClientProvider>,
        );
        expect(screen.getByText('I drafted it and found the creative.')).toBeTruthy();
    });

    it('carries a topic from the page into the first message', async () => {
        const topics = [{ id: 'recommendation:new', title: 'Action new', prompt: 'Recommendation: start with a question.' }];
        const view = mount(topics);
        fireEvent.click(screen.getByRole('button', { name: 'Discuss Action new' }));
        fireEvent.change(composer(), { target: { value: 'Where do I begin?' } });
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        await screen.findByText('I drafted it and found the creative.');

        // A topic that only this page knew about must still reach the model.
        const body = JSON.parse(posted(view, '/api/seb/chat') as string);
        expect(body.message).toContain('Recommendation: start with a question.');
        expect(body.message).toContain('Where do I begin?');
        expect(screen.getByText('Action new')).toBeTruthy();
    });

    it('asks the model nothing when the message is empty', async () => {
        const view = mount();
        fireEvent.click(tab());
        fireEvent.click(screen.getByRole('button', { name: 'Send' }));
        expect(posted(view, '/api/seb/chat')).toBeUndefined();
    });
});
