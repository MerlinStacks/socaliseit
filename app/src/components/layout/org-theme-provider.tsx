'use client';

/**
 * Organization Theme Provider
 *
 * Why: Applies the current organization's accent colors and dark mode
 * preference as CSS custom properties on <html>. This makes the entire
 * app visually distinct per-org so users instantly know which org is active.
 *
 * Re-runs whenever the session org changes (org switch triggers reload).
 */

import { useEffect } from 'react';
import { useOrganization } from '@/hooks/use-organization';

/** Default accent colors matching globals.css :root values */
const DEFAULT_GOLD = '#D4A574';
const DEFAULT_PINK = '#E8B4B8';

/**
 * Generates a lighter variant of a hex color for backgrounds.
 * Why: The design system uses --accent-*-light variants for hover/active
 * states. We derive these dynamically from the org's chosen colors.
 */
function generateLightVariant(hex: string, isDark: boolean): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    if (isDark) {
        return `rgba(${r}, ${g}, ${b}, 0.15)`;
    }
    const blend = 0.9;
    const newR = Math.round(r + (255 - r) * blend);
    const newG = Math.round(g + (255 - g) * blend);
    const newB = Math.round(b + (255 - b) * blend);
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

/**
 * Applies organization-scoped theme to the document.
 * Why: Renders nothing — purely a side-effect component that sets CSS
 * variables so the entire design system adapts to the active org.
 */
export function OrgThemeProvider() {
    const { organization } = useOrganization();

    const accentGold = organization?.accentColor || DEFAULT_GOLD;
    const accentPink = organization?.accentColorAlt || DEFAULT_PINK;
    const isDark = organization?.darkMode ?? false;

    useEffect(() => {
        const root = document.documentElement;

        // Dark mode
        if (isDark) {
            root.setAttribute('data-theme', 'dark');
        } else {
            root.removeAttribute('data-theme');
        }

        // Accent colors
        root.style.setProperty('--accent-gold', accentGold);
        root.style.setProperty('--accent-pink', accentPink);
        root.style.setProperty('--accent-gold-light', generateLightVariant(accentGold, isDark));
        root.style.setProperty('--accent-pink-light', generateLightVariant(accentPink, isDark));

        // Sync localStorage so the sidebar theme toggle stays in sync
        try {
            const prefs = { accentGold, accentPink, darkMode: isDark };
            localStorage.setItem('socialiseit-appearance', JSON.stringify(prefs));
        } catch { /* Ignore storage errors */ }
    }, [accentGold, accentPink, isDark]);

    return null;
}
