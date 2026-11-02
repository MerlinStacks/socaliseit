import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { SebChatProvider, useSebChatSurface, useSebDiscussions } from '../seb-chat-provider';
import type { Discussion } from '../types';

function Page({ topics }: { topics: Discussion[] }) {
    useSebDiscussions(topics);
    const { openChat, chat } = useSebChatSurface();
    return <><button onClick={() => openChat('a')}>Open A</button><button onClick={() => openChat('b')}>Open B</button>
        <output data-testid="context">{chat.context?.prompt || (chat.unavailable ? 'unavailable' : 'none')}</output></>;
}
afterEach(() => vi.unstubAllGlobals());

function mount(topics: Discussion[]) {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ sessions: [] })));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (items: Discussion[]) => <QueryClientProvider client={client}><SebChatProvider><Page topics={items} /></SebChatProvider></QueryClientProvider>;
    const rendered = render(view(topics));
    return { change: (items: Discussion[]) => rendered.rerender(view(items)) };
}

it('refreshes a topic whose advice changed without changing its id', async () => {
    const view = mount([{ id: 'a', title: 'Advice', prompt: 'Old recommendation' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Open A' }));
    expect(screen.getByTestId('context').textContent).toBe('Old recommendation');
    view.change([{ id: 'a', title: 'Advice revised', prompt: 'New recommendation' }]);
    await waitFor(() => expect(screen.getByTestId('context').textContent).toBe('New recommendation'));
});

it('unregisters the old topic ids rather than deleting the newly registered set', async () => {
    const view = mount([{ id: 'a', title: 'A', prompt: 'Old page' }]);
    view.change([{ id: 'b', title: 'B', prompt: 'New page' }]);
    fireEvent.click(screen.getByRole('button', { name: 'Open A' }));
    expect(screen.getByTestId('context').textContent).toBe('unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Open B' }));
    expect(screen.getByTestId('context').textContent).toBe('New page');
});
