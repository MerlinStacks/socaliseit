import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CalendarContextMenu } from '../calendar-context-menu';
import type { CalendarPost } from '../calendar-types';

afterEach(cleanup);

function setup(overrides: Partial<CalendarPost> = {}) {
    const post: CalendarPost = {
        id: 'post', dragKey: 'post:instagram', platform: 'instagram', status: 'scheduled',
        time: '2026-10-08T09:00:00Z', caption: 'Post', thumbnail: null,
        pillarColor: null, isExternal: false, externalUrl: null, ...overrides,
    };
    const handlers = { onPostClick: vi.fn(), onEdit: vi.fn(), onCompose: vi.fn(), onQuickAdd: vi.fn(), onNewNote: vi.fn() };
    render(
        <CalendarContextMenu posts={{ day: [post, { ...post, dragKey: 'post:facebook', platform: 'facebook' }] }} {...handlers}>
            <div data-testid="slot" data-calendar-date="2026-10-08T00:00:00" data-hour="9" tabIndex={0}>
                <button data-calendar-post-key="post:facebook"><span>Thumbnail</span></button>
                <button data-calendar-note="">Note</button>
            </div>
        </CalendarContextMenu>
    );
    return handlers;
}

it('targets the platform-specific post rather than its containing time slot', () => {
    const handlers = setup();
    fireEvent.contextMenu(screen.getByText('Thumbnail'));
    expect(screen.queryByRole('menuitem', { name: 'Create post' })).toBeNull();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open post' }));
    expect(handlers.onPostClick).toHaveBeenCalledWith('post:facebook');
    expect(handlers.onCompose).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
});

it('preserves the selected local date and hour for quick add', () => {
    const handlers = setup();
    fireEvent.contextMenu(screen.getByTestId('slot'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Quick add placeholder' }));
    expect(handlers.onQuickAdd).toHaveBeenCalledWith(new Date('2026-10-08T00:00:00'), 9);
});

it('does not offer editing for external posts or treat notes as empty slots', () => {
    setup({ isExternal: true });
    fireEvent.contextMenu(screen.getByText('Note'));
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.contextMenu(screen.getByText('Thumbnail'));
    expect(screen.queryByRole('menuitem', { name: 'Edit post' })).toBeNull();
});

it('supports keyboard opening, navigation and Escape focus restoration', () => {
    setup();
    const slot = screen.getByTestId('slot');
    slot.focus();
    fireEvent.keyDown(slot, { key: 'F10', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Create post' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Add note' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(slot);
});

it('dismisses on outside pointer interaction and calendar scrolling', () => {
    setup();
    fireEvent.contextMenu(screen.getByTestId('slot'));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.contextMenu(screen.getByTestId('slot'));
    fireEvent.scroll(window);
    expect(screen.queryByRole('menu')).toBeNull();
});
