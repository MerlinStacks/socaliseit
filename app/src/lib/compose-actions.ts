/**
 * Compose Actions - Submission and draft handlers for post composer
 * Extracted from compose/page.tsx to reduce file size and improve maintainability
 */

import { type MediaItem } from '@/components/compose/platform-editor';
import { toast } from '@/components/ui/toast';
import { deleteDraft } from '@/lib/offline-queue';
import { type AccountSettings } from '@/hooks/use-compose';

/**
 * Build the API payload for creating a post
 * Why: Centralizes payload construction for consistency across save/schedule/publish
 */
export function buildPostPayload(options: {
    caption: string;
    selectedAccountIds: string[];
    media: MediaItem[];
    firstComment: string;
    effectiveAccountSettings: Record<string, AccountSettings>;
    scheduledAt?: string | null;
    autoPublish?: boolean;
}) {
    const {
        caption,
        selectedAccountIds,
        media,
        firstComment,
        effectiveAccountSettings,
        scheduledAt,
        autoPublish,
    } = options;

    const platformSettings: Record<string, {
        postType: string;
        callToAction?: string;
        caption?: string;
        mediaIds?: string[];
        firstComment?: string;
    }> = {};

    selectedAccountIds.forEach((accountId) => {
        const settings = effectiveAccountSettings[accountId];
        if (settings) {
            platformSettings[accountId] = {
                postType: settings.postType,
                callToAction: settings.callToAction,
                caption: settings.captionOverride,
                mediaIds: settings.mediaOverride,
            };
        }
    });

    return {
        caption,
        platformAccountIds: selectedAccountIds,
        mediaIds: media.map(m => m.id),
        scheduledAt,
        firstComment: firstComment || undefined,
        platformSettings,
        autoPublish,
    };
}

/**
 * Save post as draft
 */
export async function handleSaveDraft(options: {
    caption: string;
    selectedAccountIds: string[];
    media: MediaItem[];
    firstComment: string;
    effectiveAccountSettings: Record<string, AccountSettings>;
    workspaceId?: string;
    setIsSaving: (value: boolean) => void;
    onSuccess: () => void;
}) {
    const {
        caption,
        selectedAccountIds,
        media,
        firstComment,
        effectiveAccountSettings,
        workspaceId,
        setIsSaving,
        onSuccess,
    } = options;

    if (!caption.trim() || selectedAccountIds.length === 0) {
        toast('error', 'Missing content', 'Add a caption and select at least one account.');
        return;
    }

    setIsSaving(true);
    try {
        const payload = buildPostPayload({
            caption,
            selectedAccountIds,
            media,
            firstComment,
            effectiveAccountSettings,
            scheduledAt: null,
        });

        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save draft');
        }

        // Clear the local cache draft since it's now saved to the server
        if (workspaceId) {
            await deleteDraft(`draft-${workspaceId}`);
        }

        toast('success', 'Draft saved', 'Your post has been saved as a draft.');
        onSuccess();
    } catch (error) {
        toast('error', 'Save failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
        setIsSaving(false);
    }
}

/**
 * Parse date string to local Date object
 * Why: Explicit parsing avoids UTC vs local timezone issues
 */
function parseDateTimeLocal(date: string, time: string): Date {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/**
 * Handle schedule confirmation from the calendar modal
 * Supports both unified scheduling (all same time) and per-platform scheduling
 */
export async function handleScheduleConfirm(options: {
    schedules: Record<string, { date: string; time: string }> | null;
    unifiedDate: string;
    unifiedTime: string;
    caption: string;
    selectedAccountIds: string[];
    media: MediaItem[];
    firstComment: string;
    effectiveAccountSettings: Record<string, AccountSettings>;
    workspaceId?: string;
    setIsScheduleModalOpen: (value: boolean) => void;
    setIsScheduling: (value: boolean) => void;
    onSuccess: () => void;
}) {
    const {
        schedules,
        unifiedDate,
        unifiedTime,
        caption,
        selectedAccountIds,
        media,
        firstComment,
        effectiveAccountSettings,
        workspaceId,
        setIsScheduleModalOpen,
        setIsScheduling,
        onSuccess,
    } = options;

    setIsScheduleModalOpen(false);
    setIsScheduling(true);

    try {
        if (schedules === null) {
            // Unified scheduling: all platforms get the same time
            const scheduledDate = parseDateTimeLocal(unifiedDate, unifiedTime);
            const scheduledAt = scheduledDate.toISOString();

            const payload = buildPostPayload({
                caption,
                selectedAccountIds,
                media,
                firstComment,
                effectiveAccountSettings,
                scheduledAt,
            });

            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to schedule post');
            }

            if (workspaceId) {
                await deleteDraft(`draft-${workspaceId}`);
            }

            toast('success', 'Post scheduled', 'Your post will be published at the scheduled time.');
        } else {
            // Per-platform scheduling: each account gets individual time
            const results = await Promise.allSettled(
                selectedAccountIds.map(async (accountId) => {
                    const schedule = schedules[accountId];
                    if (!schedule) return;

                    const scheduledDate = parseDateTimeLocal(schedule.date, schedule.time);
                    const scheduledAt = scheduledDate.toISOString();

                    const payload = {
                        caption,
                        platformAccountIds: [accountId],
                        mediaIds: media.map(m => m.id),
                        scheduledAt,
                        firstComment: firstComment || undefined,
                        platformSettings: {
                            [accountId]: {
                                postType: effectiveAccountSettings[accountId]?.postType || 'feed',
                                callToAction: effectiveAccountSettings[accountId]?.callToAction,
                                caption: effectiveAccountSettings[accountId]?.captionOverride,
                                mediaIds: effectiveAccountSettings[accountId]?.mediaOverride,
                            },
                        },
                    };

                    const response = await fetch('/api/posts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                    });

                    if (!response.ok) {
                        const error = await response.json();
                        throw new Error(error.error || `Failed to schedule for account ${accountId}`);
                    }

                    return accountId;
                })
            );

            const failures = results.filter(r => r.status === 'rejected');
            if (failures.length > 0) {
                const successCount = results.length - failures.length;
                toast('warning', 'Partial success', `${successCount} of ${results.length} posts scheduled.`);
            } else {
                if (workspaceId) {
                    await deleteDraft(`draft-${workspaceId}`);
                }
                toast('success', 'Posts scheduled', `${results.length} posts scheduled with individual times.`);
            }
        }

        onSuccess();
    } catch (error) {
        toast('error', 'Schedule failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
        setIsScheduling(false);
    }
}

/**
 * Publish post immediately
 */
export async function handlePublishNow(options: {
    caption: string;
    selectedAccountIds: string[];
    media: MediaItem[];
    firstComment: string;
    effectiveAccountSettings: Record<string, AccountSettings>;
    workspaceId?: string;
    setIsPublishing: (value: boolean) => void;
    celebratePublish: () => void;
    onSuccess: () => void;
}) {
    const {
        caption,
        selectedAccountIds,
        media,
        firstComment,
        effectiveAccountSettings,
        workspaceId,
        setIsPublishing,
        celebratePublish,
        onSuccess,
    } = options;

    if (!caption.trim() || selectedAccountIds.length === 0) {
        toast('error', 'Missing content', 'Add a caption and select at least one account.');
        return;
    }

    setIsPublishing(true);
    try {
        const payload = buildPostPayload({
            caption,
            selectedAccountIds,
            media,
            firstComment,
            effectiveAccountSettings,
            autoPublish: true,
        });

        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to publish');
        }

        if (workspaceId) {
            await deleteDraft(`draft-${workspaceId}`);
        }

        toast('success', 'Publishing', 'Your post is being published to selected platforms.');
        celebratePublish();
        onSuccess();
    } catch (error) {
        toast('error', 'Publish failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
        setIsPublishing(false);
    }
}

/**
 * Discard the current draft
 */
export async function handleDiscardDraft(options: {
    workspaceId?: string;
    resetForm: () => void;
}) {
    const { workspaceId, resetForm } = options;

    if (workspaceId) {
        try {
            await deleteDraft(`draft-${workspaceId}`);
        } catch (error) {
            console.error('Error deleting draft:', error);
        }
    }

    resetForm();
    toast('info', 'Draft discarded', 'Your draft has been cleared.');
}
