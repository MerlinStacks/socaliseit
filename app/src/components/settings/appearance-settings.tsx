'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Generates a lighter variant of a hex color for use in backgrounds.
 * This approximates the accent-*-light CSS variables.
 */
function generateLightVariant(hex: string, isDark: boolean): string {
    // Convert hex to RGB
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    if (isDark) {
        // For dark mode, return rgba with low opacity
        return `rgba(${r}, ${g}, ${b}, 0.15)`;
    }
    // For light mode, blend with white (lighter background)
    const blend = 0.9;
    const newR = Math.round(r + (255 - r) * blend);
    const newG = Math.round(g + (255 - g) * blend);
    const newB = Math.round(b + (255 - b) * blend);
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

export function AppearanceSettings() {
    const [accentGold, setAccentGold] = useState('#D4A574');
    const [accentPink, setAccentPink] = useState('#E8B4B8');
    const [darkMode, setDarkMode] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const presets = [
        { gold: '#D4A574', pink: '#E8B4B8', name: 'Warm Neutral' },
        { gold: '#7C3AED', pink: '#EC4899', name: 'Violet Pink' },
        { gold: '#059669', pink: '#10B981', name: 'Emerald' },
        { gold: '#2563EB', pink: '#60A5FA', name: 'Ocean Blue' },
    ];

    // Load saved preferences on mount
    useEffect(() => {
        const saved = localStorage.getItem('socialiseit-appearance');
        if (saved) {
            try {
                const prefs = JSON.parse(saved);
                if (prefs.accentGold) setAccentGold(prefs.accentGold);
                if (prefs.accentPink) setAccentPink(prefs.accentPink);
                if (typeof prefs.darkMode === 'boolean') setDarkMode(prefs.darkMode);
            } catch {
                // Ignore parsing errors
            }
        }
        // Also check current document state
        const currentTheme = document.documentElement.getAttribute('data-theme');
        if (currentTheme === 'dark') setDarkMode(true);
    }, []);

    // Apply theme changes immediately when state changes
    useEffect(() => {
        // Apply dark mode
        if (darkMode) {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        // Apply accent colors to CSS custom properties
        document.documentElement.style.setProperty('--accent-gold', accentGold);
        document.documentElement.style.setProperty('--accent-pink', accentPink);
        document.documentElement.style.setProperty('--accent-gold-light', generateLightVariant(accentGold, darkMode));
        document.documentElement.style.setProperty('--accent-pink-light', generateLightVariant(accentPink, darkMode));

        setHasUnsavedChanges(true);
    }, [accentGold, accentPink, darkMode]);

    function handleSave() {
        // Persist to localStorage
        const prefs = { accentGold, accentPink, darkMode };
        localStorage.setItem('socialiseit-appearance', JSON.stringify(prefs));
        setHasUnsavedChanges(false);
    }

    function handlePresetClick(gold: string, pink: string) {
        setAccentGold(gold);
        setAccentPink(pink);
    }

    function handleThemeToggle(isDark: boolean) {
        setDarkMode(isDark);
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
                                    onChange={(e) => setAccentGold(e.target.value)}
                                    className="h-10 w-10 cursor-pointer rounded border-0"
                                />
                                <Input
                                    type="text"
                                    value={accentGold}
                                    onChange={(e) => setAccentGold(e.target.value)}
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
                                    onChange={(e) => setAccentPink(e.target.value)}
                                    className="h-10 w-10 cursor-pointer rounded border-0"
                                />
                                <Input
                                    type="text"
                                    value={accentPink}
                                    onChange={(e) => setAccentPink(e.target.value)}
                                    className="w-24 px-2 py-1 text-sm text-center"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <Button onClick={handleSave} disabled={!hasUnsavedChanges}>
                    {hasUnsavedChanges ? 'Save Changes' : 'Saved'}
                </Button>
            </div>
        </div>
    );
}
