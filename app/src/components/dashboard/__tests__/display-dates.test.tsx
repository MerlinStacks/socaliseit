import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { WeeklyHeatmap } from '../weekly-heatmap';
import { PlatformActivityBanner } from '../platform-activity-banner';
import { LocalDate } from '@/components/ui/local-date';

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('date display render regressions', () => {
    it.each(['malformed', '', null, undefined, new Date(NaN)])('renders LocalDate safely for %s', date => {
        render(<LocalDate date={date} />);
        expect(screen.getByText('—')).toBeDefined();
    });

    it('handles an omitted LocalDate date prop', () => {
        render(<LocalDate />);
        expect(screen.getByText('—')).toBeDefined();
    });

    it('preserves local Intl formatting for valid dates', () => {
        const date = new Date('2026-09-14T10:30:00Z');
        render(<LocalDate date={date} />);
        expect(screen.getByText(new Intl.DateTimeFormat('en-US', {
            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
        }).format(date))).toBeDefined();
    });

    it.each(['default', 'compact'] as const)('skips invalid heatmap entries in %s view', variant => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2026, 8, 14, 12));
        // Why: API payloads can violate the declared string[] type at runtime.
        const dates = ['malformed', '', null, undefined, new Date(2026, 8, 14, 10).toISOString(), new Date(2026, 8, 14, 11).toISOString()];
        render(<WeeklyHeatmap scheduledDates={dates as string[]} variant={variant} />);
        expect(screen.getByText('2')).toBeDefined();
        expect(screen.getAllByText('0')).toHaveLength(6);
    });

    it('renders malformed platform activity safely on desktop and mobile', () => {
        render(<PlatformActivityBanner activity={[{
            platform: 'instagram', accountName: 'Test account',
            lastPostAt: 'malformed', lastStoryAt: '', nextPostAt: 'malformed', nextStoryAt: null,
        }]} />);
        expect(screen.getAllByText('—')).toHaveLength(4);
        expect(screen.getAllByText('No posts yet')).toHaveLength(2);
        expect(screen.getAllByText('None scheduled')).toHaveLength(2);
    });
});
