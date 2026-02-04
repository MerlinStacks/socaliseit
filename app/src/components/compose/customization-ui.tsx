/**
 * Shared UI components for customization panel
 * Extracted for reusability and maintainability
 */

'use client';

import { cn } from '@/lib/utils';

export interface SettingSectionProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}

/**
 * Standard section wrapper for settings groups
 */
export function SettingSection({ title, subtitle, children }: SettingSectionProps) {
    return (
        <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
                <div>
                    <div className="text-sm font-medium">{title}</div>
                    {subtitle && (
                        <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>
                    )}
                </div>
            </div>
            {children}
        </div>
    );
}

export interface ToggleSwitchProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
}

/**
 * Toggle switch for boolean settings
 */
export function ToggleSwitch({ enabled, onChange }: ToggleSwitchProps) {
    return (
        <button
            onClick={() => onChange(!enabled)}
            className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                enabled ? 'bg-[var(--accent-gold)]' : 'bg-[var(--bg-tertiary)]'
            )}
        >
            <span
                className={cn(
                    'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    enabled ? 'translate-x-5' : 'translate-x-0'
                )}
            />
        </button>
    );
}
