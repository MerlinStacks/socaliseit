// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { analyzeListeningContent, matchTerms } from '../services/listening-analysis';
import { createMonitorSchema, updateMonitorSchema } from '../validation/social-listening';

describe('listening relevance', () => {
    it('normalizes Unicode, case and whitespace and respects word boundaries', () => {
        expect(matchTerms('ＡＣＭＥ\n  café!', ['acme café'], [])).toEqual(['acme café']);
        expect(matchTerms('concatenate scar', ['cat', 'car'], [])).toEqual([]);
        expect(matchTerms('concatenate scar', ['cat', 'car'], [], 'substring')).toEqual(['cat', 'car']);
        expect(matchTerms('caféine', ['café'], [])).toEqual([]);
    });
    it('escapes punctuation and applies the same matching mode to exclusions', () => {
        expect(matchTerms('C++ and a.b', ['c++', 'a.b', 'a*b'], [])).toEqual(['c++', 'a.b']);
        expect(matchTerms('brand scar', ['brand'], ['car'])).toEqual(['brand']);
        expect(matchTerms('brand car', ['brand'], ['car'])).toEqual([]);
    });
    it.each([
        ['Why is this broken?', 'negative', true],
        ['Amazing, thanks?', 'positive', true],
        ['not great', 'neutral', false],
        ['no problem', 'neutral', false],
        ["isn’t really bad", 'neutral', false],
        ['not great. Terrible support', 'negative', false],
        ['great but broken', 'neutral', false],
        ['badge and glove', 'neutral', false],
        ['Broken？', 'negative', true],
    ])('analyzes %s independently of question status', (content, sentiment, isQuestion) => {
        expect(analyzeListeningContent(content)).toEqual({ sentiment, isQuestion });
    });
    it('defaults new monitors to phrase and opt-out and validates cooldown/server fields', () => {
        expect(createMonitorSchema.parse({ keywords: ['Brand'] })).toMatchObject({
            matchMode: 'phrase', alertsEnabled: false, alertCooldownMinutes: 60,
        });
        for (const value of [14, 1441, 60.5, '60']) expect(updateMonitorSchema.safeParse({ alertCooldownMinutes: value }).success).toBe(false);
        for (const value of [15, 1440]) expect(updateMonitorSchema.safeParse({ alertCooldownMinutes: value }).success).toBe(true);
        expect(updateMonitorSchema.safeParse({ alertsEnabledAt: new Date().toISOString() }).success).toBe(false);
    });
});
