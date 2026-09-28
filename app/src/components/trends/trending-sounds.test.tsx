import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TrendingSounds } from './trending-sounds';
import type { SoundTrendsData } from '@/types/trending-sounds';

afterEach(cleanup);

const feed: SoundTrendsData = {
    status: 'available',
    source: 'Test ranking provider',
    region: 'AU',
    lastUpdated: '2026-09-28T09:00:00.000Z',
    periodDays: 7,
    sounds: [{ id: 'test', name: 'Test track', artist: 'Test artist', usageCount: null, trend: 'unknown' }],
};

describe('sound trend provenance', () => {
    it('shows an honest empty state for old API responses without provenance', () => {
        render(<TrendingSounds region="AU" />);
        expect(screen.getByRole('status').textContent).toBe('Current sound trends unavailable');
        expect(screen.getByText(/Region: AU/)).toBeTruthy();
        expect(screen.getByText(/Last updated: Not available/)).toBeTruthy();
        expect(screen.getByRole('link', { name: /Creative Center/ })).toBeTruthy();
    });

    it.each([
        { ...feed, source: null },
        { ...feed, lastUpdated: null },
        { ...feed, lastUpdated: 'invalid' },
        { ...feed, region: 'US' },
        { ...feed, status: 'unavailable' as const },
    ])('withholds rankings without matching provenance: %j', data => {
        render(<TrendingSounds data={data} region="AU" />);
        expect(screen.queryByText('Test track')).toBeNull();
        expect(screen.getByText('Current sound trends unavailable')).toBeTruthy();
    });

    it('displays provenance and preserves unknown metrics instead of inventing stability or zero usage', () => {
        render(<TrendingSounds data={feed} region="AU" />);
        expect(screen.getByText('Test track')).toBeTruthy();
        expect(screen.getByText(/Source: Test ranking provider/)).toBeTruthy();
        expect(screen.getByText(/Ranking window: 7 days/)).toBeTruthy();
        expect(screen.getByText('2026-09-28 09:00:00 UTC')).toBeTruthy();
        expect(screen.getByText('Usage unavailable')).toBeTruthy();
        expect(screen.getByText('Trend unknown')).toBeTruthy();
        expect(screen.queryByText('→ Stable')).toBeNull();
    });
});
