import { describe, expect, it } from 'vitest';
import { resolveSettingsTab } from '../settings-tabs';

describe('resolveSettingsTab', () => {
    it.each(['profile', 'organization', 'accounts', 'team', 'appearance', 'billing'])(
        'preserves the %s tab', (tab) => {
            expect(resolveSettingsTab(tab)).toBe(tab);
        },
    );

    it.each([
        ['notifications', 'profile'],
        ['brand-tone', 'organization'],
        ['shopping', 'accounts'],
    ])('maps legacy %s links to %s', (legacy, canonical) => {
        expect(resolveSettingsTab(legacy)).toBe(canonical);
    });

    it.each([null, '', 'unknown', '__proto__', 'constructor'])(
        'falls back safely for %s', (tab) => {
            expect(resolveSettingsTab(tab)).toBeNull();
        },
    );
});
