/**
 * Billing Module Unit Tests
 *
 * Why: Validates plan-config boundaries and feature-gate logic
 * without requiring a live database or Stripe connection.
 */

import { describe, it, expect } from 'vitest';
import {
    getPlanLimits,
    isFeatureEnabled,
    getFeatureLimit,
    PLAN_LIMITS,
    PLAN_DISPLAY,
} from '../billing/plan-config';

describe('Plan Configuration', () => {
    describe('getPlanLimits', () => {
        it('returns FREE limits for FREE tier', () => {
            const limits = getPlanLimits('FREE');
            expect(limits.socialAccounts).toBe(3);
            expect(limits.teamMembers).toBe(2);
            expect(limits.scheduledPostsPerMonth).toBe(30);
            expect(limits.aiGenerationsPerMonth).toBe(10);
            expect(limits.videoEditor).toBe(false);
            expect(limits.competitorTracking).toBe(0);
            expect(limits.analyticsExport).toBe(false);
        });

        it('returns PRO limits for PRO tier', () => {
            const limits = getPlanLimits('PRO');
            expect(limits.socialAccounts).toBe(10);
            expect(limits.teamMembers).toBe(5);
            expect(limits.videoEditor).toBe(true);
            expect(limits.competitorTracking).toBe(3);
            expect(limits.analyticsExport).toBe(true);
        });

        it('returns Infinity for ADMIN tier numerical limits', () => {
            const limits = getPlanLimits('ADMIN');
            expect(limits.socialAccounts).toBe(Infinity);
            expect(limits.teamMembers).toBe(Infinity);
            expect(limits.scheduledPostsPerMonth).toBe(Infinity);
            expect(limits.aiGenerationsPerMonth).toBe(Infinity);
            expect(limits.competitorTracking).toBe(Infinity);
        });

        it('returns Infinity for ENTERPRISE tier numerical limits', () => {
            const limits = getPlanLimits('ENTERPRISE');
            expect(limits.socialAccounts).toBe(Infinity);
            expect(limits.teamMembers).toBe(Infinity);
            expect(limits.scheduledPostsPerMonth).toBe(Infinity);
        });

        it('returns all boolean features enabled for ADMIN', () => {
            const limits = getPlanLimits('ADMIN');
            expect(limits.videoEditor).toBe(true);
            expect(limits.analyticsExport).toBe(true);
            expect(limits.customBranding).toBe(true);
            expect(limits.prioritySupport).toBe(true);
        });

        it('falls back to FREE for unknown tier', () => {
            const limits = getPlanLimits('UNKNOWN_TIER');
            expect(limits).toEqual(PLAN_LIMITS.FREE);
        });

        it('falls back to FREE for empty string', () => {
            const limits = getPlanLimits('');
            expect(limits).toEqual(PLAN_LIMITS.FREE);
        });
    });

    describe('isFeatureEnabled', () => {
        it('returns false for FREE videoEditor', () => {
            expect(isFeatureEnabled('FREE', 'videoEditor')).toBe(false);
        });

        it('returns true for PRO videoEditor', () => {
            expect(isFeatureEnabled('PRO', 'videoEditor')).toBe(true);
        });

        it('returns true for ADMIN videoEditor', () => {
            expect(isFeatureEnabled('ADMIN', 'videoEditor')).toBe(true);
        });

        it('returns false for FREE competitorTracking (limit = 0)', () => {
            expect(isFeatureEnabled('FREE', 'competitorTracking')).toBe(false);
        });

        it('returns true for PRO competitorTracking (limit = 3)', () => {
            expect(isFeatureEnabled('PRO', 'competitorTracking')).toBe(true);
        });

        it('returns false for FREE analyticsExport', () => {
            expect(isFeatureEnabled('FREE', 'analyticsExport')).toBe(false);
        });

        it('returns true for BUSINESS analyticsExport', () => {
            expect(isFeatureEnabled('BUSINESS', 'analyticsExport')).toBe(true);
        });

        it('returns false for FREE customBranding', () => {
            expect(isFeatureEnabled('FREE', 'customBranding')).toBe(false);
        });

        it('returns false for PRO customBranding', () => {
            expect(isFeatureEnabled('PRO', 'customBranding')).toBe(false);
        });

        it('returns true for BUSINESS customBranding', () => {
            expect(isFeatureEnabled('BUSINESS', 'customBranding')).toBe(true);
        });

        it('returns true for ADMIN on all features', () => {
            const allFeatures = [
                'socialAccounts', 'teamMembers', 'scheduledPostsPerMonth',
                'aiGenerationsPerMonth', 'videoEditor', 'competitorTracking',
                'analyticsExport', 'customBranding', 'prioritySupport',
            ] as const;

            for (const feature of allFeatures) {
                expect(isFeatureEnabled('ADMIN', feature)).toBe(true);
            }
        });
    });

    describe('getFeatureLimit', () => {
        it('returns numerical limit for countable features', () => {
            expect(getFeatureLimit('FREE', 'socialAccounts')).toBe(3);
            expect(getFeatureLimit('PRO', 'socialAccounts')).toBe(10);
            expect(getFeatureLimit('BUSINESS', 'socialAccounts')).toBe(25);
            expect(getFeatureLimit('ADMIN', 'socialAccounts')).toBe(Infinity);
        });

        it('returns 1/0 for boolean features', () => {
            expect(getFeatureLimit('FREE', 'videoEditor')).toBe(0);
            expect(getFeatureLimit('PRO', 'videoEditor')).toBe(1);
            expect(getFeatureLimit('ADMIN', 'videoEditor')).toBe(1);
        });
    });

    describe('PLAN_DISPLAY', () => {
        it('has display metadata for all tiers', () => {
            const tiers = ['FREE', 'PRO', 'BUSINESS', 'ENTERPRISE', 'ADMIN'] as const;
            for (const tier of tiers) {
                const display = PLAN_DISPLAY[tier];
                expect(display).toBeDefined();
                expect(display.name).toBeTruthy();
                expect(display.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
            }
        });

        it('ADMIN display name is "Admin"', () => {
            expect(PLAN_DISPLAY.ADMIN.name).toBe('Admin');
        });
    });
});
