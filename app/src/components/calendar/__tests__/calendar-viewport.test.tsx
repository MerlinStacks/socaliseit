import { StrictMode } from 'react';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarViewport, calendarUiContextKey } from '../calendar-viewport';
import { MonthView, type MonthViewProps } from '../month-view';

const monthProps: MonthViewProps = {
    monthStart: new Date(2026, 8, 1),
    posts: {
        '2026-09-15': Array.from({ length: 7 }, (_, index) => ({
            id: `post-${index}`, dragKey: `post-${index}`, time: '2026-09-15T12:00:00Z',
            caption: `Caption ${index}`, platform: 'instagram', status: 'scheduled',
            thumbnail: null, pillarColor: null, isExternal: false, externalUrl: null,
        })),
    },
    notes: {},
    dragState: { isDragging: false, draggedPostId: null, draggedDragKey: null, dropTarget: null },
    dragHandlers: { onDragStart: vi.fn(), onDragEnd: vi.fn(), onDragOver: vi.fn(), onDragLeave: vi.fn(), onDrop: vi.fn() },
    onPostClick: vi.fn(), onDayClick: vi.fn(), onQuickAddClick: vi.fn(), onNoteClick: vi.fn(), onNewNote: vi.fn(),
    postPreview: 'condensed',
};

let height = 2000;
let sequence = 0;
const resizeCallbacks = new Set<() => void>();
const resize = () => act(() => { resizeCallbacks.forEach(callback => callback()); });

function Calendar({ contextKey, ready = true, delayed = false, layoutReady = true, posts = monthProps.posts }: {
    contextKey: string | null; ready?: boolean; delayed?: boolean; layoutReady?: boolean; posts?: MonthViewProps['posts'];
}) {
    return <StrictMode><CalendarViewport contextKey={contextKey} ready={ready} onClick={() => {}}>
        {(expandedWeeks, onExpandedWeeksChange) => <div data-calendar-view-ready={ready && layoutReady ? '' : undefined}>
            {ready && !delayed
                ? <MonthView {...monthProps} posts={posts} expandedWeeks={expandedWeeks} onExpandedWeeksChange={onExpandedWeeksChange} />
                : <div data-calendar-view-loading>Loading</div>}
        </div>}
    </CalendarViewport></StrictMode>;
}

beforeEach(() => {
    height = 2000;
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => height);
    vi.stubGlobal('ResizeObserver', class {
        callback: () => void;
        constructor(callback: () => void) { this.callback = callback; }
        observe() { resizeCallbacks.add(this.callback); }
        disconnect() { resizeCallbacks.delete(this.callback); }
    });
});
afterEach(() => {
    cleanup();
    expect(resizeCallbacks.size).toBe(0);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function seed(contextKey: string) {
    const mounted = render(<Calendar contextKey={contextKey} />);
    fireEvent.click(screen.getByText('+3 more'));
    const viewport = screen.getByTestId('calendar-viewport');
    fireEvent.scroll(viewport, { target: { scrollTop: 900 } });
    mounted.unmount();
}

describe('calendar route-surviving UI', () => {
    it('restores actual month expansion and the inner offset after an edit-route remount', () => {
        const key = `remount-${sequence++}`;
        seed(key);
        render(<Calendar contextKey={key} />);
        expect(screen.getAllByTestId('calendar-post')).toHaveLength(7);
        expect(screen.getByText('Show less').getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(900);
        // Restoration is one-shot: later layout changes must not undo user scrolling.
        fireEvent.scroll(screen.getByTestId('calendar-viewport'), { target: { scrollTop: 300 } });
        resize();
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(300);
        fireEvent.click(screen.getByText('Show less'));
        cleanup();
        render(<Calendar contextKey={key} />);
        expect(screen.getAllByTestId('calendar-post')).toHaveLength(4);
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(300);
    });

    it('waits for data, dynamic imports, and sufficient height without saving initial/clamped zero', async () => {
        const key = `delayed-${sequence++}`;
        seed(key);
        height = 500;
        const mounted = render(<Calendar contextKey={key} ready={false} />);
        const viewport = screen.getByTestId('calendar-viewport');
        fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
        height = 2000;
        mounted.rerender(<Calendar contextKey={key} delayed />);
        resize();
        expect(viewport.scrollTop).toBe(0); // A tall dynamic fallback is still not ready.
        height = 700;
        await act(async () => mounted.rerender(<Calendar contextKey={key} layoutReady={false} />));
        resize();
        expect(viewport.scrollTop).toBe(0); // Do not attempt a partial/clamped restoration.
        fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
        mounted.unmount(); // Leaving while still waiting must not destroy the saved target.
        const returned = render(<Calendar contextKey={key} layoutReady={false} />);
        height = 2000;
        resize();
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(900);
        expect(screen.getAllByTestId('calendar-post')).toHaveLength(7);
        returned.unmount();
    });

    it('restores when a same-sized dynamic fallback is replaced (without a resize)', async () => {
        const key = `mutation-${sequence++}`;
        seed(key);
        const mounted = render(<Calendar contextKey={key} delayed />);
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(0);
        await act(async () => mounted.rerender(<Calendar contextKey={key} />));
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(900);
    });

    it.each([700, 500])('restores the nearest valid offset after deletion with final height %i', async finalHeight => {
        const key = `deleted-${sequence++}`;
        seed(key);
        const posts = { '2026-09-15': monthProps.posts['2026-09-15'].slice(0, -1) };
        height = finalHeight;
        const mounted = render(<Calendar contextKey={key} posts={posts} delayed />);
        const viewport = screen.getByTestId('calendar-viewport');
        resize();
        expect(viewport.scrollTop).toBe(0);
        await act(async () => mounted.rerender(<Calendar contextKey={key} posts={posts} layoutReady={false} />));
        expect(viewport.scrollTop).toBe(0);
        // Readiness can change without a resize, and proves this height is final.
        await act(async () => mounted.rerender(<Calendar contextKey={key} posts={posts} />));
        expect(viewport.scrollTop).toBe(finalHeight - 500);
        expect(screen.getAllByTestId('calendar-post')).toHaveLength(6);
        expect(screen.getByText('Show less').getAttribute('aria-expanded')).toBe('true');
        mounted.unmount();
        height = 2000;
        render(<Calendar contextKey={key} posts={posts} />);
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(finalHeight - 500);
    });

    it('rearms repeated same-mounted loading cycles without losing expansion or the latest offset', async () => {
        const key = `refresh-${sequence++}`;
        seed(key);
        const mounted = render(<Calendar contextKey={key} />);
        const viewport = screen.getByTestId('calendar-viewport');
        fireEvent.scroll(viewport, { target: { scrollTop: 800 } });

        for (const finalHeight of [2000, 700]) {
            height = 500;
            mounted.rerender(<Calendar contextKey={key} ready={false} />);
            fireEvent.scroll(viewport, { target: { scrollTop: 0 } });
            resize();
            height = finalHeight;
            mounted.rerender(<Calendar contextKey={key} delayed />);
            resize();
            expect(viewport.scrollTop).toBe(0);
            await act(async () => mounted.rerender(<Calendar contextKey={key} />));
            expect(screen.getByTestId('calendar-viewport')).toBe(viewport);
            expect(viewport.scrollTop).toBe(Math.min(800, finalHeight - 500));
            expect(screen.getAllByTestId('calendar-post')).toHaveLength(7);
            expect(screen.getByText('Show less').getAttribute('aria-expanded')).toBe('true');
        }
        mounted.unmount();
        height = 2000;
        render(<Calendar contextKey={key} />);
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(200);
    });

    it.each(['organization', 'view', 'date', 'week-start'] as const)('isolates %s changes and restores the original context', dimension => {
        const organization = `org-${sequence++}`;
        const key = calendarUiContextKey(organization, 'month', new Date(2026, 8, 1), 1);
        const otherKey = calendarUiContextKey(
            dimension === 'organization' ? `${organization}-other` : organization,
            dimension === 'view' ? 'week' : 'month',
            new Date(2026, dimension === 'date' ? 9 : 8, 1),
            dimension === 'week-start' ? 0 : 1,
        );
        seed(key);
        const mounted = render(<Calendar contextKey={key} />);
        mounted.rerender(<Calendar contextKey={otherKey} />);
        expect(screen.getAllByTestId('calendar-post')).toHaveLength(4);
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(0);
        fireEvent.scroll(screen.getByTestId('calendar-viewport'), { target: { scrollTop: 100 } });
        mounted.rerender(<Calendar contextKey={key} />);
        expect(screen.getAllByTestId('calendar-post')).toHaveLength(7);
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(900);
    });

    it('lets explicit scrolling supersede restoration when refreshed content is shorter', async () => {
        const key = `shorter-${sequence++}`;
        seed(key);
        height = 700;
        const mounted = render(<Calendar contextKey={key} layoutReady={false} />);
        fireEvent.wheel(screen.getByTestId('calendar-viewport'));
        fireEvent.scroll(screen.getByTestId('calendar-viewport'), { target: { scrollTop: 150 } });
        await act(async () => mounted.rerender(<Calendar contextKey={key} />));
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(150);
        height = 2000;
        resize();
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(150);
        cleanup();
        render(<Calendar contextKey={key} />);
        expect(screen.getByTestId('calendar-viewport').scrollTop).toBe(150);
    });
});
