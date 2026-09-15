// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Platform } from '@/components/calendar/calendar-types';
import type { CalendarViewMode } from '@/hooks/use-calendar-navigation';
import { useComposeAccounts } from '@/hooks/use-compose-data';
import { CalendarToolbar, type CalendarToolbarProps } from '../CalendarToolbar';
import { PLATFORMS, POST_TYPES, POST_STATUSES, type PostTypeFilter, type PostStatusFilter } from '../CalendarFilters';

vi.mock('@/hooks/use-compose-data', () => ({ useComposeAccounts: vi.fn() }));

function mockAccounts(platforms: readonly Platform[]) {
    vi.mocked(useComposeAccounts).mockReturnValue({
        accounts: platforms.map((platform, index) => ({ id: String(index), name: platform, platform, isActive: true })),
        isLoadingAccounts: false,
        accountsError: null,
    });
}

beforeEach(() => mockAccounts(PLATFORMS));
afterEach(cleanup);

function setup(overrides: Partial<CalendarToolbarProps> = {}) {
    const actions = {
        handleNewNote: vi.fn(), handleSync: vi.fn(async () => {}), onCompose: vi.fn(),
        goToPrevious: vi.fn(), goToNext: vi.fn(), goToToday: vi.fn(),
    };
    function Harness() {
        const [platforms, setPlatforms] = useState<Platform[]>(overrides.selectedPlatforms ?? [...PLATFORMS]);
        const [types, setTypes] = useState<PostTypeFilter[]>(overrides.selectedPostTypes ?? [...POST_TYPES]);
        const [statuses, setStatuses] = useState<PostStatusFilter[]>(overrides.selectedStatuses ?? [...POST_STATUSES]);
        const [view, setView] = useState<CalendarViewMode>('month');
        return <>
            <CalendarToolbar {...actions} syncing={overrides.syncing ?? false}
                selectedPlatforms={platforms} setSelectedPlatforms={setPlatforms}
                selectedPostTypes={types} setSelectedPostTypes={setTypes}
                selectedStatuses={statuses} setSelectedStatuses={setStatuses}
                nav={{ ...actions, viewMode: view, setViewMode: setView, getHeaderText: () => 'September 2026' }} />
            <button type="button">Outside</button>
        </>;
    }
    render(<Harness />);
    return actions;
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const group = (name: string) => within(screen.getByRole('group', { name }));

describe('CalendarToolbar filters', () => {
    it('shows only connected platforms, without duplicate accounts or hidden-selection counts', () => {
        mockAccounts(['instagram', 'instagram', 'facebook']);
        setup();
        click('Filters (0)');
        expect(group('Platform').getAllByRole('checkbox')).toHaveLength(2);
        expect(group('Platform').queryByLabelText('Bluesky')).toBeNull();
        expect(group('Platform').queryByLabelText('Remind to Post')).toBeNull();
        fireEvent.click(group('Platform').getByLabelText('Instagram'));
        expect(screen.getByText('Platform: 1 of 2')).toBeTruthy();
        fireEvent.click(group('Platform').getByRole('button', { name: 'Select All' }));
        expect(screen.queryByLabelText('Active filters')).toBeNull();
        fireEvent.click(group('Platform').getByRole('button', { name: 'Clear' }));
        expect(screen.getByText('Platform: None')).toBeTruthy();
        click('Clear platform filter');
        expect(screen.queryByLabelText('Active filters')).toBeNull();
    });

    it('shows Remind to Post when a manual account exists', () => {
        mockAccounts(['manual']);
        setup();
        click('Filters (0)');
        expect(group('Platform').getAllByRole('checkbox')).toHaveLength(1);
        expect(group('Platform').getByLabelText('Remind to Post')).toBeTruthy();
    });

    it.each([
        { isLoadingAccounts: false, accountsError: null, message: 'No social accounts connected.' },
        { isLoadingAccounts: true, accountsError: null, message: 'Loading platforms…' },
        { isLoadingAccounts: false, accountsError: 'Failed', message: 'Unable to load connected platforms.' },
    ])('does not show unconnected platforms: $message', ({ message, ...state }) => {
        vi.mocked(useComposeAccounts).mockReturnValue({ accounts: [], ...state });
        setup();
        click('Filters (0)');
        expect(group('Platform').queryAllByRole('checkbox')).toHaveLength(0);
        expect(screen.getByText(message)).toBeTruthy();
    });

    it('anchors the desktop panel to the Filters button while retaining narrow-screen bounds', () => {
        setup();
        click('Filters (0)');
        const trigger = screen.getByRole('button', { name: 'Filters (0)' });
        const panel = screen.getByRole('region', { name: 'Calendar filters' });
        expect(panel.parentElement).toBe(trigger.parentElement);
        expect(panel.parentElement?.classList.contains('lg:relative')).toBe(true);
        for (const className of ['absolute', 'top-full', 'lg:left-auto', 'lg:right-0', 'max-w-[calc(100%-2rem)]', 'lg:max-w-[calc(100vw-2rem)]']) {
            expect(panel.classList.contains(className)).toBe(true);
        }
    });

    it('counts active categories, rather than selected options, in one inline panel', () => {
        setup();
        click('Filters (0)');
        expect(screen.getAllByRole('region', { name: 'Calendar filters' })).toHaveLength(1);
        expect(screen.getAllByRole('group')).toHaveLength(3);
        fireEvent.click(group('Platform').getByLabelText('Instagram'));
        fireEvent.click(group('Platform').getByLabelText('TikTok'));
        expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeTruthy();
        fireEvent.click(group('Type').getByLabelText('Feed'));
        fireEvent.click(group('Status').getByLabelText('AI Draft'));
        expect(screen.getByRole('button', { name: 'Filters (3)' })).toBeTruthy();
        expect(within(screen.getByLabelText('Active filters')).getAllByRole('button')).toHaveLength(4);
    });

    it.each(['Platform', 'Type', 'Status'])('keeps zero-selection %s active and resets its chip to ALL', category => {
        setup();
        click('Filters (0)');
        fireEvent.click(group(category).getByRole('button', { name: 'Clear' }));
        expect(group(category).getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
        expect(screen.getByText(`${category}: None`)).toBeTruthy();
        expect(screen.getByRole('button', { name: 'Filters (1)' })).toBeTruthy();
        click(`Clear ${category.toLowerCase()} filter`);
        expect(screen.queryByLabelText('Active filters')).toBeNull();
        click('Filters (0)');
        expect(group(category).getAllByRole('checkbox').every(box => (box as HTMLInputElement).checked)).toBe(true);
    });

    it('Select All resets only its category; Clear all restores every category including empty ones', () => {
        setup({ selectedPlatforms: [], selectedPostTypes: ['feed'], selectedStatuses: [] });
        click('Filters (3)');
        fireEvent.click(group('Type').getByRole('button', { name: 'Select All' }));
        expect(screen.getByRole('button', { name: 'Filters (2)' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Clear type filter' })).toBeNull();
        click('Clear all');
        expect(screen.queryByLabelText('Active filters')).toBeNull();
        click('Filters (0)');
        expect(screen.getAllByRole('checkbox').every(box => (box as HTMLInputElement).checked)).toBe(true);
    });
});

describe('CalendarToolbar navigation and actions', () => {
    it('changes all five views and invokes existing date navigation', () => {
        const actions = setup();
        const select = screen.getByRole('combobox', { name: 'Calendar view' }) as HTMLSelectElement;
        for (const value of ['day', 'week', 'month', 'timeline', 'grid']) {
            fireEvent.change(select, { target: { value } });
            expect(select.value).toBe(value);
        }
        expect(screen.getByRole('heading', { name: 'September 2026' })).toBeTruthy();
        click('Previous date range');
        click('Today');
        click('Next date range');
        expect(actions.goToPrevious).toHaveBeenCalledOnce();
        expect(actions.goToToday).toHaveBeenCalledOnce();
        expect(actions.goToNext).toHaveBeenCalledOnce();
    });

    it.each([
        { selectedPlatforms: ['instagram', 'tiktok'] as Platform[], url: '/compose?platforms=instagram,tiktok' },
        { selectedPlatforms: [...PLATFORMS], url: '/compose' },
        { selectedPlatforms: [], url: '/compose' },
    ])('preserves the compose URL $url', ({ selectedPlatforms, url }) => {
        const actions = setup({ selectedPlatforms });
        click('New Post');
        expect(actions.onCompose).toHaveBeenCalledWith(url);
    });

    it('discloses New Note and sync, invokes each once and closes after an action', () => {
        const actions = setup();
        expect(screen.queryByRole('button', { name: 'New Note' })).toBeNull();
        click('More actions');
        click('New Note');
        expect(actions.handleNewNote).toHaveBeenCalledExactlyOnceWith();
        expect(screen.queryByRole('region', { name: 'More calendar actions' })).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'More actions' }));
        click('More actions');
        click('Sync external posts');
        expect(actions.handleSync).toHaveBeenCalledOnce();
        expect(screen.queryByRole('region', { name: 'More calendar actions' })).toBeNull();
    });

    it('disables sync while already syncing', () => {
        const actions = setup({ syncing: true });
        click('More actions');
        const sync = screen.getByRole('button', { name: 'Syncing external posts…' }) as HTMLButtonElement;
        expect(sync.disabled).toBe(true);
        fireEvent.click(sync);
        expect(actions.handleSync).not.toHaveBeenCalled();
    });
});

describe('CalendarToolbar disclosure accessibility', () => {
    it.each([
        ['Filters (0)', 'Calendar filters'],
        ['More actions', 'More calendar actions'],
        ['Calendar settings', 'Calendar settings'],
    ])('%s supports Escape with focus restoration and outside pointer/focus/click dismissal', (triggerName, regionName) => {
        setup();
        const trigger = screen.getByRole('button', { name: triggerName });
        const open = () => {
            fireEvent.click(trigger);
            expect(trigger.getAttribute('aria-expanded')).toBe('true');
            const panel = screen.getByRole('region', { name: regionName });
            expect(panel.id).toBe(trigger.getAttribute('aria-controls'));
            return panel;
        };
        const panel = open();
        act(() => within(panel).getAllByRole('button')[0].focus());
        expect(screen.getByRole('region', { name: regionName })).toBeTruthy();
        fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(trigger);
        open();
        fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
        expect(screen.queryByRole('region', { name: regionName })).toBeNull();
        open();
        act(() => screen.getByRole('button', { name: 'Outside' }).focus());
        expect(screen.queryByRole('region', { name: regionName })).toBeNull();
        expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Outside' }));
        open();
        click('Outside');
        expect(screen.queryByRole('region', { name: regionName })).toBeNull();
    });

    it('dismisses other disclosures when switching controls', () => {
        setup();
        click('Filters (0)');
        click('More actions');
        expect(screen.queryByRole('region', { name: 'Calendar filters' })).toBeNull();
        click('Calendar settings');
        expect(screen.queryByRole('region', { name: 'More calendar actions' })).toBeNull();
        click('Filters (0)');
        expect(screen.queryByRole('region', { name: 'Calendar settings' })).toBeNull();
        expect(screen.queryByRole('menu')).toBeNull();
    });
});
