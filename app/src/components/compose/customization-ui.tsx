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
    /** When true, children render below title (stacked layout) instead of beside it */
    fullWidth?: boolean;
}

/**
 * Standard section wrapper for settings groups
 * Why: Puts title/subtitle on left, control (toggle/select) on right in same row
 * fullWidth mode stacks children below for larger content like text editors
 */
export function SettingSection({ title, subtitle, children, fullWidth }: SettingSectionProps) {
    if (fullWidth) {
        return (
            <div className="border-b border-[var(--border)] px-4 py-3 space-y-2">
                <div>
                    <div className="text-sm font-medium">{title}</div>
                    {subtitle && (
                        <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>
                    )}
                </div>
                <div className="w-full">
                    {children}
                </div>
            </div>
        );
    }

    return (
        <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{title}</div>
                    {subtitle && (
                        <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>
                    )}
                </div>
                <div className="flex-shrink-0">
                    {children}
                </div>
            </div>
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
