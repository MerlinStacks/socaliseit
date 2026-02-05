'use client';

/**
 * Notification Preferences Component
 * Granular control over notification types
 * Why: Users need control over what alerts they receive
 */

import { useState } from 'react';
import { Bell, Mail, Smartphone, Globe, MessageSquare, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

interface NotificationChannel {
    id: string;
    label: string;
    icon: typeof Bell;
    enabled: boolean;
}

interface NotificationCategory {
    id: string;
    label: string;
    description: string;
    icon: typeof Bell;
    channels: {
        push: boolean;
        email: boolean;
        inApp: boolean;
    };
}

interface NotificationPreferencesProps {
    preferences?: NotificationCategory[];
    onSave?: (preferences: NotificationCategory[]) => Promise<void>;
    className?: string;
}

const defaultCategories: NotificationCategory[] = [
    {
        id: 'publish',
        label: 'Publishing',
        description: 'When posts are published or fail',
        icon: CheckCircle,
        channels: { push: true, email: true, inApp: true },
    },
    {
        id: 'engagement',
        label: 'Engagement',
        description: 'Comments, likes, and mentions',
        icon: MessageSquare,
        channels: { push: true, email: false, inApp: true },
    },
    {
        id: 'analytics',
        label: 'Analytics',
        description: 'Weekly reports and milestone alerts',
        icon: TrendingUp,
        channels: { push: false, email: true, inApp: true },
    },
    {
        id: 'errors',
        label: 'Errors & Warnings',
        description: 'Failed posts and connection issues',
        icon: AlertTriangle,
        channels: { push: true, email: true, inApp: true },
    },
];

const channelIcons = {
    push: Smartphone,
    email: Mail,
    inApp: Bell,
};

const channelLabels = {
    push: 'Push',
    email: 'Email',
    inApp: 'In-App',
};

/**
 * Notification preferences panel
 */
export function NotificationPreferences({
    preferences = defaultCategories,
    onSave,
    className,
}: NotificationPreferencesProps) {
    const [categories, setCategories] = useState<NotificationCategory[]>(preferences);
    const [isSaving, setIsSaving] = useState(false);

    const handleToggle = (categoryId: string, channel: 'push' | 'email' | 'inApp') => {
        setCategories(prev =>
            prev.map(cat =>
                cat.id === categoryId
                    ? { ...cat, channels: { ...cat.channels, [channel]: !cat.channels[channel] } }
                    : cat
            )
        );
    };

    const handleSave = async () => {
        if (!onSave) return;

        setIsSaving(true);
        try {
            await onSave(categories);
            toast('success', 'Preferences saved', 'Your notification settings have been updated.');
        } catch {
            toast('error', 'Save failed', 'Could not save notification preferences.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className={cn('space-y-6', className)}>
            <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Notification Preferences</h3>
                <p className="text-sm text-[var(--text-muted)]">Choose how and when you want to be notified.</p>
            </div>

            {/* Channel headers */}
            <div className="grid grid-cols-[1fr_repeat(3,60px)] gap-4 items-center px-4">
                <div />
                {(['push', 'email', 'inApp'] as const).map(channel => {
                    const Icon = channelIcons[channel];
                    return (
                        <div key={channel} className="flex flex-col items-center gap-1">
                            <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                            <span className="text-xs text-[var(--text-muted)]">{channelLabels[channel]}</span>
                        </div>
                    );
                })}
            </div>

            {/* Categories */}
            <div className="space-y-2">
                {categories.map(category => {
                    const Icon = category.icon;
                    return (
                        <div
                            key={category.id}
                            className="grid grid-cols-[1fr_repeat(3,60px)] gap-4 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3"
                        >
                            <div className="flex items-center gap-3">
                                <Icon className="h-5 w-5 text-[var(--accent-gold)]" />
                                <div>
                                    <p className="text-sm font-medium text-[var(--text-primary)]">{category.label}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{category.description}</p>
                                </div>
                            </div>
                            {(['push', 'email', 'inApp'] as const).map(channel => (
                                <div key={channel} className="flex justify-center">
                                    <button
                                        onClick={() => handleToggle(category.id, channel)}
                                        className={cn(
                                            'h-6 w-11 rounded-full transition-colors relative',
                                            category.channels[channel]
                                                ? 'bg-[var(--accent-gold)]'
                                                : 'bg-[var(--bg-tertiary)]'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                                                category.channels[channel]
                                                    ? 'translate-x-5'
                                                    : 'translate-x-0.5'
                                            )}
                                        />
                                    </button>
                                </div>
                            ))}
                        </div>
                    );
                })}
            </div>

            {/* Save button */}
            {onSave && (
                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={cn(
                            'px-4 py-2 rounded-lg font-medium text-sm',
                            'bg-[var(--accent-gold)] text-white',
                            'hover:bg-[var(--accent-gold-dark)] transition-colors',
                            'disabled:opacity-50 disabled:cursor-not-allowed'
                        )}
                    >
                        {isSaving ? 'Saving...' : 'Save Preferences'}
                    </button>
                </div>
            )}
        </div>
    );
}

export default NotificationPreferences;
