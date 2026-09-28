import { cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CalendarPost, isPastCalendarPost } from '../calendar-types';
import { DraggablePostCard } from '../draggable-post-card';
import { MonthView } from '../month-view';

const now = new Date('2026-09-16T12:00:00Z');
const future = '2026-09-16T12:00:00.001Z';

function post(overrides: Partial<CalendarPost> = {}): CalendarPost {
    return {
        id: 'post', dragKey: 'post:instagram', caption: 'Calendar regression post',
        time: future, platform: 'instagram', status: 'scheduled',
        thumbnail: '/calendar-test.jpg', pillarColor: null, isExternal: false, externalUrl: null,
        ...overrides,
    };
}

const historicalCases: [string, Partial<CalendarPost>][] = [
    ['past scheduled', { time: '2026-09-16T11:59:59.999Z' }],
    ['exactly now', { time: now.toISOString() }],
    ['published with future time', { status: 'PUBLISHED' }],
    ['external with future time', { isExternal: true }],
];

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('isPastCalendarPost', () => {
    it.each(historicalCases)('treats %s as view-only', (_label, overrides) => {
        expect(isPastCalendarPost(post(overrides))).toBe(true);
    });

    it('allows future internal posts and respects an explicit clock at the boundary', () => {
        expect(isPastCalendarPost(post())).toBe(false);
        expect(isPastCalendarPost(post(), new Date(future).getTime())).toBe(true);
    });
});

describe.each(['DraggablePostCard', 'MonthView'] as const)('%s interactions', view => {
    function mount(value: CalendarPost) {
        const onDragStart = vi.fn();
        const onClick = vi.fn();
        const onParentClick = vi.fn();
        render(<div onClick={onParentClick}>
            {view === 'DraggablePostCard'
                ? <DraggablePostCard post={value} platformColors={{}} onClick={onClick} onDragStart={onDragStart} />
                : <MonthView
                    monthStart={new Date(2026, 8, 1)}
                    posts={{ '2026-09-16': [value] }} notes={{}}
                    dragState={{ isDragging: false, draggedPostId: null, draggedDragKey: null, dropTarget: null }}
                    dragHandlers={{ onDragStart, onDragEnd: vi.fn(), onDragOver: vi.fn(), onDragLeave: vi.fn(), onDrop: vi.fn() }}
                    onPostClick={onClick} onDayClick={onParentClick} onQuickAddClick={vi.fn()}
                    onNoteClick={vi.fn()} onNewNote={vi.fn()} postPreview="large"
                />}
        </div>);
        const card = screen.getByTestId('calendar-post');
        // Exercise a real descendant, including native image dragging in month view.
        const descendant = view === 'MonthView' ? card.querySelector('img')! : screen.getByText(value.caption);
        return { card, descendant, onDragStart, onClick, onParentClick };
    }

    it.each(historicalCases)('blocks card and descendant dragging for %s but preserves single click', (_label, overrides) => {
        const value = post(overrides);
        const { card, descendant, onDragStart, onClick, onParentClick } = mount(value);
        expect(card.draggable).toBe(false);
        if (view === 'MonthView') expect(descendant.getAttribute('draggable')).toBe('false');

        for (const target of [card, descendant]) {
            const event = createEvent.dragStart(target, { bubbles: true, cancelable: true, dataTransfer: { setData: vi.fn() } });
            fireEvent(target, event);
            expect(event.defaultPrevented).toBe(true);
        }
        expect(onDragStart).not.toHaveBeenCalled();

        fireEvent.click(descendant);
        expect(onClick).toHaveBeenCalledTimes(1);
        if (view === 'MonthView') expect(onClick).toHaveBeenCalledWith(value.dragKey);
        expect(onParentClick).not.toHaveBeenCalled();
    });

    it('allows future dragging and a single click', () => {
        const value = post();
        const { card, descendant, onDragStart, onClick, onParentClick } = mount(value);
        const dataTransfer = { setData: vi.fn() };
        const event = createEvent.dragStart(card, { bubbles: true, cancelable: true, dataTransfer });
        expect(card.draggable).toBe(true);
        fireEvent(card, event);
        expect(event.defaultPrevented).toBe(false);
        expect(onDragStart).toHaveBeenCalledTimes(1);
        if (view === 'MonthView') {
            expect(onDragStart).toHaveBeenCalledWith(value.id, expect.anything(), value.dragKey);
            expect(dataTransfer.setData).toHaveBeenCalledWith('application/x-original-time', value.time);
        }
        fireEvent.click(descendant);
        expect(onClick).toHaveBeenCalledTimes(1);
        expect(onParentClick).not.toHaveBeenCalled();
    });

    it('rechecks the clock when a future card becomes historical without rerendering', () => {
        const { card, descendant, onDragStart } = mount(post());
        expect(card.draggable).toBe(true);
        vi.setSystemTime(new Date(future));
        const event = createEvent.dragStart(descendant, { bubbles: true, cancelable: true, dataTransfer: { setData: vi.fn() } });
        fireEvent(descendant, event);
        expect(event.defaultPrevented).toBe(true);
        expect(onDragStart).not.toHaveBeenCalled();
    });
});
