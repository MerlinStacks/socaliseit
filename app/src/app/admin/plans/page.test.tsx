import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlansPage from './page';

vi.mock('@/lib/client-logger', () => ({ clientLogger: { error: vi.fn() } }));
afterEach(() => vi.unstubAllGlobals());

const plan = {
    tier: 'FREE', displayName: 'Free', description: '', color: '#123456', priceMonthly: 0,
    pricingLabel: '$0', pricingPeriod: '/mo', popular: false, ctaText: 'Get Started',
    socialAccounts: 3, teamMembers: 2, scheduledPostsPerMonth: 30, aiGenerationsPerMonth: 10,
    competitorTracking: 0, analyticsExport: false, customBranding: false, prioritySupport: false,
    featureBullets: [],
};

describe('PlansPage', () => {
    it.each([
        [{ error: 'Validation Error', details: { fieldErrors: { displayName: ['Required'] } } }, 'displayName: Required'],
        [{ error: 'Forbidden' }, 'Forbidden'],
    ])('shows actionable save failures', async (body, message) => {
        vi.stubGlobal('fetch', vi.fn()
            .mockResolvedValueOnce({ ok: true, json: async () => ({ plans: [plan] }) })
            .mockResolvedValueOnce({ ok: false, json: async () => body }));
        render(<PlansPage />);
        fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

        expect(await screen.findByText(message)).toBeTruthy();
        expect(screen.queryByText('Free plan saved')).toBeNull();
    });
});
