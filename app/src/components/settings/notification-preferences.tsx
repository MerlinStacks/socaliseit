'use client';

/**
 * Shared Notification Preferences Toggle Section
 *
 * Why: Extracted to allow reuse in both the full Notifications tab
 * and the compact Profile tab without duplicating state/mutation logic.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/** Notification preference field keys */
type PreferenceKey = 'postPublished' | 'postFailed' | 'postReadyToPublish' | 'tokenExpiring' | 'weeklyDigest' | 'newComment' | 'newDM' | 'newMention' | 'newReview';

interface NotificationPreferences {
    postPublished: boolean;
    postFailed: boolean;
    postReadyToPublish: boolean;
    tokenExpiring: boolean;
    weeklyDigest: boolean;
    newComment: boolean;
    newDM: boolean;
    newMention: boolean;
    newReview: boolean;
}

const PREFERENCE_CONFIG: { key: PreferenceKey; label: string; description: string; group?: string }[] = [
    { key: 'postPublished', label: 'Post published', description: 'When your scheduled posts are published' },
    { key: 'postFailed', label: 'Post failed', description: 'When a post fails to publish' },
    { key: 'postReadyToPublish', label: 'Ready to publish', description: 'When a non-auto-publish post reaches its scheduled time' },
    { key: 'tokenExpiring', label: 'Token expiring', description: 'When a connected account token is expiring' },
    { key: 'weeklyDigest', label: 'Weekly digest', description: 'Weekly summary of your analytics' },
    // Why: Inbox alerts are separated visually so users can quickly find engagement toggles.
    { key: 'newComment', label: 'New comments', description: 'When new comments arrive in your inbox', group: 'Inbox Alerts' },
    { key: 'newDM', label: 'New messages', description: 'When new direct messages are received', group: 'Inbox Alerts' },
    { key: 'newMention', label: 'New mentions', description: 'When you are mentioned or tagged', group: 'Inbox Alerts' },
    { key: 'newReview', label: 'New reviews', description: 'When new reviews are posted', group: 'Inbox Alerts' },
];

/**
 * Renders toggle switches for each notification preference.
 * Fetches settings on mount and patches individual toggles with optimistic updates.
 */
export function NotificationPreferencesSection() {
    const queryClient = useQueryClient();

    const { data: preferences, isLoading } = useQuery<NotificationPreferences>({
        queryKey: ['notification-settings'],
        queryFn: async () => {
            const res = await fetch('/api/settings/notifications');
            if (!res.ok) throw new Error('Failed to fetch notification settings');
            return res.json();
        },
        staleTime: 5 * 60_000, // 5 min — only changes via mutations which invalidate the cache
    });

    const mutation = useMutation({
        mutationFn: async (update: Partial<NotificationPreferences>) => {
            const res = await fetch('/api/settings/notifications', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(update),
            });
            if (!res.ok) throw new Error('Failed to save notification settings');
            return res.json();
        },
        onMutate: async (update) => {
            await queryClient.cancelQueries({ queryKey: ['notification-settings'] });
            const previous = queryClient.getQueryData<NotificationPreferences>(['notification-settings']);
            queryClient.setQueryData<NotificationPreferences>(['notification-settings'], (old) => ({
                ...old!,
                ...update,
            }));
            return { previous };
        },
        onError: (_err, _update, context) => {
            if (context?.previous) {
                queryClient.setQueryData(['notification-settings'], context.previous);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['notification-settings'] });
        },
    });

    function handleToggle(key: PreferenceKey, checked: boolean) {
        mutation.mutate({ [key]: checked });
    }

    if (isLoading) {
        return (
            <div className="card p-6">
                <h3 className="font-semibold mb-4">Notification Preferences</h3>
                <div className="space-y-4">
                    {PREFERENCE_CONFIG.map((item) => (
                        <div key={item.key} className="flex items-center justify-between animate-pulse">
                            <div className="space-y-2">
                                <div className="h-4 w-24 bg-[var(--bg-tertiary)] rounded" />
                                <div className="h-3 w-48 bg-[var(--bg-tertiary)] rounded" />
                            </div>
                            <div className="h-6 w-11 bg-[var(--bg-tertiary)] rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="card p-6">
            <h3 className="font-semibold mb-4">Notification Preferences</h3>
            <div className="space-y-4">
                {PREFERENCE_CONFIG.map((item, idx) => {
                    /* Why: Show a separator + heading when entering a new group. */
                    const prevGroup = idx > 0 ? PREFERENCE_CONFIG[idx - 1].group : undefined;
                    const showGroupHeader = item.group && item.group !== prevGroup;

                    return (
                        <div key={item.key}>
                            {showGroupHeader && (
                                <div className="pt-3 pb-1 border-t border-[var(--border)]">
                                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                                        {item.group}
                                    </p>
                                </div>
                            )}
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium">{item.label}</p>
                                    <p className="text-sm text-[var(--text-muted)]">{item.description}</p>
                                </div>
                                <label className="relative inline-flex cursor-pointer items-center">
                                    <input
                                        type="checkbox"
                                        checked={preferences?.[item.key] ?? true}
                                        onChange={(e) => handleToggle(item.key, e.target.checked)}
                                        className="peer sr-only"
                                    />
                                    <div className="h-6 w-11 rounded-full bg-[var(--bg-tertiary)] peer-checked:bg-[var(--accent-gold)] peer-focus:ring-2 peer-focus:ring-[var(--accent-gold)]/50 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full" />
                                </label>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
