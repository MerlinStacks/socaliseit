'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useOrganization } from '@/hooks/use-organization';

/**
 * Generates a lighter variant of a hex color for use in backgrounds.
 * Why: Approximates --accent-*-light CSS variables for live preview.
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
 * Appearance settings panel.
 * Why: Persists accent colors and dark mode to the organization (server-side)
 * rather than localStorage, so the theme follows the org — not the browser.
 */
export function AppearanceSettings() {
    const { organization } = useOrganization();
    const { update: updateSession } = useSession();
    const router = useRouter();

    const [accentGold, setAccentGold] = useState(organization?.accentColor || '#D4A574');
    const [accentPink, setAccentPink] = useState(organization?.accentColorAlt || '#E8B4B8');
    const [darkMode, setDarkMode] = useState(organization?.darkMode ?? false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const isInitializedRef = useRef(false);

    const presets = [
        { gold: '#D4A574', pink: '#E8B4B8', name: 'Warm Neutral' },
        { gold: '#7C3AED', pink: '#EC4899', name: 'Violet Pink' },
        { gold: '#059669', pink: '#10B981', name: 'Emerald' },
        { gold: '#2563EB', pink: '#60A5FA', name: 'Ocean Blue' },
    ];

    /**
     * Why: Seed state from the org session data on mount.
     * The org data comes from the server, so this ensures the UI
     * reflects the current org's saved preferences.
     */
    useEffect(() => {
        if (organization) {
            setAccentGold(organization.accentColor || '#D4A574');
            setAccentPink(organization.accentColorAlt || '#E8B4B8');
            setDarkMode(organization.darkMode ?? false);
        }
        isInitializedRef.current = true;
    }, [organization?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Live preview — apply CSS vars immediately as the user picks colors
    useEffect(() => {
        if (darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        document.documentElement.style.setProperty('--accent-gold', accentGold);
        document.documentElement.style.setProperty('--accent-pink', accentPink);
        document.documentElement.style.setProperty('--accent-gold-light', generateLightVariant(accentGold, darkMode));
        document.documentElement.style.setProperty('--accent-pink-light', generateLightVariant(accentPink, darkMode));
    }, [accentGold, accentPink, darkMode]);

    /**
     * Persists accent color + dark mode to the organization via API.
     * Why: Server-side persistence means the theme follows the org — not
     * the browser — so all team members and devices see consistent branding.
     */
    async function handleSave() {
        if (!organization?.id) return;

        setIsSaving(true);
        try {
            const response = await fetch(`/api/organizations/${organization.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    accentColor: accentGold,
                    accentColorAlt: accentPink,
                    darkMode,
                }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to save appearance');
            }

            // Sync localStorage so sidebar theme toggle stays current
            try {
                localStorage.setItem('socialiseit-appearance', JSON.stringify({
                    accentGold, accentPink, darkMode,
                }));
            } catch { /* Ignore */ }

            toast('success', 'Appearance saved', 'Your organization theme has been updated.');
            setHasUnsavedChanges(false);

            // Refresh session so OrgThemeProvider picks up new values
            await updateSession();
            router.refresh();
        } catch (error) {
            toast('error', 'Save failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsSaving(false);
        }
    }

    function handlePresetClick(gold: string, pink: string) {
        setAccentGold(gold);
        setAccentPink(pink);
        if (isInitializedRef.current) setHasUnsavedChanges(true);
    }

    function handleThemeToggle(isDark: boolean) {
        setDarkMode(isDark);
        if (isInitializedRef.current) setHasUnsavedChanges(true);
    }

    return (
        <div>
            <h2 className="text-xl font-semibold mb-6">Appearance</h2>

            <div className="card p-6 space-y-6">
                {/* Theme */}
                <div>
                    <label className="mb-3 block text-sm font-medium">Theme</label>
                    <div className="flex gap-3">
                        <button
                            onClick={() => handleThemeToggle(false)}
                            className={`flex-1 rounded-lg border-2 p-4 transition-colors ${!darkMode ? 'border-[var(--accent-gold)]' : 'border-transparent bg-[var(--bg-tertiary)]'
                                }`}
                        >
                            <div className="mb-2 h-8 rounded bg-white shadow" />
                            <p className="text-sm font-medium">Light</p>
                        </button>
                        <button
                            onClick={() => handleThemeToggle(true)}
                            className={`flex-1 rounded-lg border-2 p-4 transition-colors ${darkMode ? 'border-[var(--accent-gold)]' : 'border-transparent bg-[var(--bg-tertiary)]'
                                }`}
                        >
                            <div className="mb-2 h-8 rounded bg-gray-900" />
                            <p className="text-sm font-medium">Dark</p>
                        </button>
                    </div>
                </div>

                {/* Accent Colors */}
                <div>
                    <label className="mb-3 block text-sm font-medium">Accent Colors</label>
                    <div className="grid grid-cols-4 gap-3 mb-4">
                        {presets.map((preset) => (
                            <button
                                key={preset.name}
                                onClick={() => handlePresetClick(preset.gold, preset.pink)}
                                className={`rounded-lg border-2 p-3 transition-colors ${accentGold === preset.gold
                                    ? 'border-[var(--accent-gold)]'
                                    : 'border-transparent hover:border-[var(--border)]'
                                    }`}
                            >
                                <div className="mb-2 flex gap-1">
                                    <div className="h-6 flex-1 rounded" style={{ backgroundColor: preset.gold }} />
                                    <div className="h-6 flex-1 rounded" style={{ backgroundColor: preset.pink }} />
                                </div>
                                <p className="text-xs">{preset.name}</p>
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-4">
                        <div>
                            <label className="mb-1 block text-xs text-[var(--text-muted)]">Primary</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={accentGold}
                                    onChange={(e) => { setAccentGold(e.target.value); setHasUnsavedChanges(true); }}
                                    className="h-10 w-10 cursor-pointer rounded border-0"
                                />
                                <Input
                                    type="text"
                                    value={accentGold}
                                    onChange={(e) => { setAccentGold(e.target.value); setHasUnsavedChanges(true); }}
                                    className="w-24 px-2 py-1 text-sm text-center"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-[var(--text-muted)]">Secondary</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={accentPink}
                                    onChange={(e) => { setAccentPink(e.target.value); setHasUnsavedChanges(true); }}
                                    className="h-10 w-10 cursor-pointer rounded border-0"
                                />
                                <Input
                                    type="text"
                                    value={accentPink}
                                    onChange={(e) => { setAccentPink(e.target.value); setHasUnsavedChanges(true); }}
                                    className="w-24 px-2 py-1 text-sm text-center"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <Button onClick={handleSave} disabled={!hasUnsavedChanges || isSaving}>
                    {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'Saved'}
                </Button>
            </div>
        </div>
    );
}
