/**
 * Scheduling Calendar Modal Tests
 * The suggested times shown must belong to the date the user selected — the
 * complaint this guards is a Thursday showing Sunday's best times.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulingCalendarModal } from '../scheduling-calendar-modal';
import { type SocialAccount } from '@/components/compose/profile-selector';

const account: SocialAccount = {
    id: 'acc-1',
    platform: 'instagram',
    name: 'Test Profile',
    isActive: true,
};

/** Weekday buckets line up with 2026-11: 4th Wed, 5th Thu, 8th Sun. */
const optimalTimesResponse = {
    suggestions: [{ time: '19:15', label: '7:15 PM', lift: 12 }],
    dataPoints: 638,
    confidence: 'high' as const,
    byDayOfWeek: Array.from({ length: 7 }, (_, dayOfWeek) => {
        if (dayOfWeek === 4) {
            return { suggestions: [{ time: '16:11', label: 'Thu 4:11 PM', lift: 200, dayOfWeek }], dataPoints: 71 };
        }
        if (dayOfWeek === 0) {
            return { suggestions: [{ time: '14:10', label: 'Sun 2:10 PM', lift: 156, dayOfWeek }], dataPoints: 64 };
        }
        return { suggestions: [], dataPoints: 9 };
    }),
};

function renderModal(scheduledDate: string, accounts = [account], response = optimalTimesResponse) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    queryClient.setQueryData(['optimal-times'], response);

    return render(
        <QueryClientProvider client={queryClient}>
            <SchedulingCalendarModal
                isOpen
                onClose={() => {}}
                selectedAccounts={accounts}
                scheduledDate={scheduledDate}
                scheduledTime="09:00"
                onSchedule={() => {}}
            />
        </QueryClientProvider>
    );
}

function renderWithOptimalTimesShown(scheduledDate: string, accounts = [account], response = optimalTimesResponse) {
    renderModal(scheduledDate, accounts, response);
    fireEvent.click(screen.getByRole('button', { name: /show optimal times/i }));
}

describe('suggestions for the selected date', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ posts: {} }) })));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('shows the selected date’s weekday times, not the best weekday overall', () => {
        renderWithOptimalTimesShown('2026-11-05'); // Thursday

        // The label appears both on the chip and in the reasoning bullets
        expect(screen.getAllByText('Thu 4:11 PM').length).toBeGreaterThan(0);
        expect(screen.queryByText('Sun 2:10 PM')).toBeNull();
        expect(screen.getByText('Based on 71 Thursday posts')).toBeTruthy();
        expect(screen.getByText('200% higher engagement than other Thursday slots')).toBeTruthy();
    });

    it('follows the date when it changes', () => {
        renderWithOptimalTimesShown('2026-11-05');

        fireEvent.change(screen.getByDisplayValue('2026-11-05'), { target: { value: '2026-11-08' } });

        expect(screen.getAllByText('Sun 2:10 PM').length).toBeGreaterThan(0);
        expect(screen.queryByText('Thu 4:11 PM')).toBeNull();
    });

    it('falls back to the overall ranking for a weekday with no history', () => {
        renderWithOptimalTimesShown('2026-11-04'); // Wednesday, thin sample

        expect(screen.getAllByText('7:15 PM').length).toBeGreaterThan(0);
        expect(screen.getByText('Based on engagement data from 638 posts (all weekdays)')).toBeTruthy();
    });
});

const profiles: SocialAccount[] = [
    { id: 'acc-ig', platform: 'instagram', name: 'IG Profile', isActive: true },
    { id: 'acc-tt', platform: 'tiktok', name: 'TT Profile', isActive: true },
];

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** One distinct suggestion per weekday, tagged with the profile it belongs to. */
const weekdayBuckets = (prefix: string) => SHORT_DAYS.map((shortDay, dayOfWeek) => ({
    suggestions: [{
        time: `12:0${dayOfWeek}`,
        label: `${prefix} ${shortDay} 12:0${dayOfWeek} PM`,
        lift: 40,
        dayOfWeek,
    }],
    dataPoints: 40,
}));

/** Separate-mode payload: org-wide buckets plus one ranking per profile. */
const perProfileResponse = {
    suggestions: [{ time: '19:15', label: '7:15 PM', lift: 12 }],
    dataPoints: 638,
    confidence: 'high' as const,
    byDayOfWeek: weekdayBuckets('Org'),
    perAccount: {
        'acc-ig': { suggestions: [], dataPoints: 120, confidence: 'high' as const, byDayOfWeek: weekdayBuckets('IG') },
        'acc-tt': { suggestions: [], dataPoints: 88, confidence: 'high' as const, byDayOfWeek: weekdayBuckets('TT') },
    },
};

describe('suggestions per profile in separate mode', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ posts: {} }) })));
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /** Both profiles start on the same date; the first one is focused. */
    function renderSeparately(scheduledDate = '2026-11-05') {
        renderModal(scheduledDate, profiles, perProfileResponse);
        fireEvent.click(screen.getByRole('button', { name: /schedule together/i }));
        // The focused card renders the toggle twice (picker link and quick link)
        fireEvent.click(screen.getAllByRole('button', { name: /show optimal times/i })[0]);
    }

    it('uses the focused profile’s own ranking, not the org-wide one', () => {
        renderSeparately();

        expect(screen.getAllByText('IG Thu 12:04 PM').length).toBeGreaterThan(0);
        expect(screen.queryByText(/Org Thu/)).toBeNull();
    });

    it('follows each profile’s own date when switching between them', () => {
        renderSeparately();

        // Only TT moves to Sunday; IG keeps its Thursday date.
        fireEvent.change(screen.getAllByDisplayValue('2026-11-05')[1], { target: { value: '2026-11-08' } });
        fireEvent.click(screen.getByText('TT Profile'));

        expect(screen.getAllByText('TT Sun 12:00 PM').length).toBeGreaterThan(0);
        expect(screen.queryByText(/IG Thu/)).toBeNull();
        expect(screen.getAllByDisplayValue('2026-11-05')).toHaveLength(1);
    });
});
