import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CalendarPost, PLATFORMS } from '@/components/calendar/calendar-types';
import { POST_STATUSES, POST_TYPES } from '@/app/(dashboard)/calendar/CalendarFilters';
import { useCalendarSettingsStore } from '@/lib/stores/calendar-settings-store';
import { useCalendarOrchestration } from '../use-calendar-orchestration';

const mocks = vi.hoisted(() => ({
    router: { prefetch: vi.fn() },
    searchParams: new URLSearchParams(),
    queryClient: { prefetchQuery: vi.fn() },
    nav: {
        viewMode: 'month',
        selectedDate: new Date('2026-09-15T12:00:00Z'),
        currentWeekStart: new Date('2026-09-14T00:00:00Z'),
        currentMonthStart: new Date('2026-09-01T00:00:00Z'),
        getDateRange: () => null,
    },
}));

vi.mock('next/navigation', () => ({
    useRouter: () => mocks.router,
    useSearchParams: () => mocks.searchParams,
}));
vi.mock('@tanstack/react-query', () => ({
    useQuery: ({ initialData }: { initialData: unknown }) => ({ data: initialData }),
    useQueryClient: () => mocks.queryClient,
}));
vi.mock('@/hooks/use-organization', () => ({ useOrganization: () => ({ organization: { id: 'org' } }) }));
vi.mock('@/hooks/use-calendar-navigation', () => ({ useCalendarNavigation: () => mocks.nav }));
vi.mock('@/hooks/use-drag-drop-calendar', () => ({ useDragDropCalendar: () => ({}) }));
vi.mock('@/hooks/use-ai-recommended-slots', () => ({ useAiRecommendedSlots: () => ({ slots: [] }) }));
vi.mock('@/hooks/use-compose-data', () => ({
    ACCOUNTS_QUERY_KEY: ['accounts'], accountsQueryFn: vi.fn(), ACCOUNTS_STALE_TIME: 30_000,
}));
vi.mock('@/lib/holidays', () => ({ getHolidaysForDate: () => [] }));
vi.mock('@/lib/logger', () => ({ logger: {} }));
vi.mock('@/components/ui/toast', () => ({ toast: vi.fn() }));

function post(id: string, overrides: Partial<CalendarPost> = {}): CalendarPost {
    return {
        id, dragKey: id, caption: id, time: '12:00', platform: 'instagram',
        postType: 'feed', status: 'published', isExternal: false,
        thumbnail: null, pillarColor: null, externalUrl: null,
        ...overrides,
    };
}

const internal = post('internal');
const external = post('external', { isExternal: true });
const otherPlatform = post('facebook', { platform: 'facebook' });
const otherType = post('reel', { postType: 'reel' });
const otherStatus = post('draft', { status: 'draft' });
const externalOnly = post('external-only', { isExternal: true });
const posts = {
    '2026-09-15': [internal, external, otherPlatform, otherType, otherStatus],
    '2026-09-16': [externalOnly],
};
const initialData = { posts, notes: {} };

beforeEach(() => {
    vi.clearAllMocks();
    useCalendarSettingsStore.setState(useCalendarSettingsStore.getInitialState());
});
afterEach(() => {
    cleanup();
    useCalendarSettingsStore.setState(useCalendarSettingsStore.getInitialState());
    localStorage.clear();
});

describe('calendar external-post filtering', () => {
    it('hides external posts with every filter selected and omits external-only days', () => {
        useCalendarSettingsStore.getState().update({ showExternalPosts: false });
        const { result } = renderHook(() => useCalendarOrchestration({ initialData }));

        expect(result.current.selectedPlatforms).toEqual([...PLATFORMS]);
        expect(result.current.selectedPostTypes).toEqual([...POST_TYPES]);
        expect(result.current.selectedStatuses).toEqual([...POST_STATUSES]);
        expect(result.current.filteredPosts).toEqual({
            '2026-09-15': [internal, otherPlatform, otherType, otherStatus],
        });
        expect(posts['2026-09-15']).toContain(external);
        expect(posts['2026-09-16']).toEqual([externalOnly]);
    });

    it('returns all posts when every filter is selected and external posts are visible', () => {
        const { result } = renderHook(() => useCalendarOrchestration({ initialData }));

        expect(result.current.filteredPosts).toBe(posts);
    });

    it('recomputes when external visibility changes without changing filters or data', () => {
        const { result } = renderHook(() => useCalendarOrchestration({ initialData }));

        act(() => useCalendarSettingsStore.getState().update({ showExternalPosts: false }));
        expect(result.current.filteredPosts).toEqual({
            '2026-09-15': [internal, otherPlatform, otherType, otherStatus],
        });

        act(() => useCalendarSettingsStore.getState().update({ showExternalPosts: true }));
        expect(result.current.filteredPosts).toBe(posts);
    });

    it.each([false, true])('respects narrowed platform, type, and status filters with showExternalPosts=%s', (showExternalPosts) => {
        useCalendarSettingsStore.getState().update({ showExternalPosts });
        const { result } = renderHook(() => useCalendarOrchestration({ initialData }));

        act(() => {
            result.current.setSelectedPlatforms(['instagram']);
            result.current.setSelectedPostTypes(['feed']);
            result.current.setSelectedStatuses(['published']);
        });

        expect(result.current.filteredPosts).toEqual(showExternalPosts ? {
            '2026-09-15': [internal, external],
            '2026-09-16': [externalOnly],
        } : {
            '2026-09-15': [internal],
        });
    });
});
