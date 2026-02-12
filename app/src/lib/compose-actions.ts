/**
 * Compose Actions - Submission and draft handlers for post composer
 * Extracted from compose/page.tsx to reduce file size and improve maintainability
 */

import { type MediaItem } from '@/components/compose/platform-editor';
import { toast } from '@/components/ui/toast';
import { deleteDraft } from '@/lib/offline-queue';
import { type AccountSettings } from '@/hooks/use-compose';
import { broadcastSync } from '@/lib/cross-tab-sync';

/**
 * Build the API payload for creating or updating a post
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
    /**
     * Map of accountId → resized MediaItem[]. When auto-resize is enabled,
     * each account gets its platform-specific resized media IDs.
     * Why: Different platforms need different dimensions, so resized copies differ per account.
     */
    resizedMediaMap?: Record<string, MediaItem[]>;
}) {
    const {
        caption,
        selectedAccountIds,
        media,
        firstComment,
        effectiveAccountSettings,
        scheduledAt,
        autoPublish,
        resizedMediaMap,
    } = options;

    const platformSettings: Record<string, {
        postType: string;
        callToAction?: string;
        caption?: string;
        mediaIds?: string[];
        firstComment?: string;
        // Pinterest-specific fields
        pinTitle?: string;
        pinLink?: string;
        boardId?: string;
        // Location tagging (Instagram, TikTok, Facebook)
        location?: string;
        // YouTube-specific fields
        videoTitle?: string;
        youtubeCategory?: string;
        youtubePlaylist?: string;
        videoTags?: string[];
        createFirstLike?: boolean;
        embeddable?: boolean;
        notifySubscribers?: boolean;
        madeForKids?: boolean;
        youtubePrivacy?: 'public' | 'private' | 'unlisted';
        // TikTok-specific fields
        tiktokBrandOrganic?: boolean;
        tiktokBrandContent?: boolean;
        tiktokIsAigc?: boolean;
        tiktokComments?: boolean;
        tiktokDuets?: boolean;
        tiktokStitches?: boolean;
        // Instagram-specific fields
        instagramShareToFeed?: boolean;
        instagramComments?: boolean;
    }> = {};

    selectedAccountIds.forEach((accountId) => {
        const settings = effectiveAccountSettings[accountId];
        if (settings) {
            platformSettings[accountId] = {
                postType: settings.postType,
                callToAction: settings.callToAction,
                caption: settings.captionOverride,
                // Use resized media IDs when available, fall back to override then default
                mediaIds: settings.mediaOverride
                    ?? (resizedMediaMap?.[accountId]?.map(m => m.id)),
                firstComment: settings.firstCommentOverride,
                // Pinterest-specific fields
                pinTitle: settings.pinTitle,
                pinLink: settings.pinLink,
                boardId: settings.boardId,
                // Location tagging
                location: settings.location,
                // YouTube-specific fields
                videoTitle: settings.videoTitle,
                youtubeCategory: settings.category,
                youtubePlaylist: settings.playlist,
                videoTags: settings.videoTags,
                createFirstLike: settings.createFirstLike,
                embeddable: settings.embeddable,
                notifySubscribers: settings.notifySubscribers,
                madeForKids: settings.madeForKids,
                youtubePrivacy: settings.privacy as 'public' | 'private' | 'unlisted' | undefined,
                // TikTok-specific fields mapping
                tiktokBrandOrganic: settings.tiktokBrandOrganicToggle,
                tiktokBrandContent: settings.tiktokBrandContentToggle,
                tiktokIsAigc: settings.tiktokIsAigc,
                tiktokComments: settings.tiktokCommentsEnabled,
                tiktokDuets: settings.tiktokDuetsEnabled,
                tiktokStitches: settings.tiktokStitchesEnabled,
                // Instagram-specific fields
                instagramShareToFeed: settings.instagramShareToFeed,
                instagramComments: settings.instagramComments,
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
 * Submit a post via create (POST) or update (PUT)
 * Why: Centralizes API call logic, choosing endpoint based on editPostId
 */
async function submitPost(
    payload: ReturnType<typeof buildPostPayload>,
    editPostId?: string | null
): Promise<Response> {
    if (editPostId) {
        // Update existing post
        return fetch(`/api/posts/${editPostId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }
    // Create new post
    return fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
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
    organizationId?: string;
    editPostId?: string | null;
    setIsSaving: (value: boolean) => void;
    onMutate?: () => void;
    onSuccess: () => void;
}) {
    const {
        caption,
        selectedAccountIds,
        media,
        firstComment,
        effectiveAccountSettings,
        organizationId,
        editPostId,
        setIsSaving,
        onSuccess,
    } = options;

    // Check if all selected accounts are stories (stories don't require captions)
    const allAccountsAreStories = selectedAccountIds.every((accountId) => {
        const settings = effectiveAccountSettings[accountId];
        return settings?.postType?.toLowerCase() === 'story';
    });

    if (selectedAccountIds.length === 0) {
        toast('error', 'Missing content', 'Select at least one account.');
        return;
    }

    // Allow empty main caption if every non-story account has a platform-specific caption override
    const allNonStoriesHaveCaptions = selectedAccountIds
        .filter(id => effectiveAccountSettings[id]?.postType?.toLowerCase() !== 'story')
        .every(id => effectiveAccountSettings[id]?.captionOverride?.trim());

    if (!allAccountsAreStories && !caption.trim() && !allNonStoriesHaveCaptions) {
        toast('error', 'Missing content', 'Add a caption (required for non-story posts).');
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

        const response = await submitPost(payload, editPostId);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to save draft');
        }

        // Clear the local cache draft since it's now saved to the server
        if (organizationId) {
            await deleteDraft(`draft-${organizationId}`);
        }

        const successMsg = editPostId ? 'Draft updated' : 'Draft saved';
        toast('success', successMsg, 'Your post has been saved as a draft.');
        broadcastSync('draft:saved');
        options.onMutate?.();
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
    organizationId?: string;
    editPostId?: string | null;
    setIsScheduleModalOpen: (value: boolean) => void;
    setIsScheduling: (value: boolean) => void;
    onMutate?: () => void;
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
        organizationId,
        editPostId,
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

            const response = await submitPost(payload, editPostId);

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to schedule post');
            }

            if (organizationId) {
                await deleteDraft(`draft-${organizationId}`);
            }

            const successMsg = editPostId ? 'Post updated' : 'Post scheduled';
            toast('success', successMsg, 'Your post will be published at the scheduled time.');
            broadcastSync(editPostId ? 'post:updated' : 'post:created');
        } else {
            // Per-platform scheduling: each account gets individual time
            // Note: Per-platform scheduling always creates individual posts,
            // so edit mode with per-platform schedules is not supported
            if (editPostId) {
                toast('warning', 'Edit mode', 'Per-platform scheduling will create new posts. Use unified scheduling to update the existing post.');
            }
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
                                firstComment: effectiveAccountSettings[accountId]?.firstCommentOverride,
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
                if (organizationId) {
                    await deleteDraft(`draft-${organizationId}`);
                }
                toast('success', 'Posts scheduled', `${results.length} posts scheduled with individual times.`);
                broadcastSync('post:created');
            }
        }

        options.onMutate?.();
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
    organizationId?: string;
    editPostId?: string | null;
    setIsPublishing: (value: boolean) => void;
    celebratePublish: () => void;
    onMutate?: () => void;
    onSuccess: () => void;
}) {
    const {
        caption,
        selectedAccountIds,
        media,
        firstComment,
        effectiveAccountSettings,
        organizationId,
        editPostId,
        setIsPublishing,
        celebratePublish,
        onSuccess,
    } = options;

    // Check if all selected accounts are stories (stories don't require captions)
    const allAccountsAreStories = selectedAccountIds.every((accountId) => {
        const settings = effectiveAccountSettings[accountId];
        return settings?.postType?.toLowerCase() === 'story';
    });

    if (selectedAccountIds.length === 0) {
        toast('error', 'Missing content', 'Select at least one account.');
        return;
    }

    // Allow empty main caption if every non-story account has a platform-specific caption override
    const allNonStoriesHaveCaptions = selectedAccountIds
        .filter(id => effectiveAccountSettings[id]?.postType?.toLowerCase() !== 'story')
        .every(id => effectiveAccountSettings[id]?.captionOverride?.trim());

    if (!allAccountsAreStories && !caption.trim() && !allNonStoriesHaveCaptions) {
        toast('error', 'Missing content', 'Add a caption (required for non-story posts).');
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

        const response = await submitPost(payload, editPostId);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to publish');
        }

        if (organizationId) {
            await deleteDraft(`draft-${organizationId}`);
        }

        toast('success', 'Publishing', 'Your post is being published to selected platforms.');
        broadcastSync(editPostId ? 'post:updated' : 'post:published');
        celebratePublish();
        options.onMutate?.();
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
    organizationId?: string;
    resetForm: () => void;
}) {
    const { organizationId, resetForm } = options;

    if (organizationId) {
        try {
            await deleteDraft(`draft-${organizationId}`);
        } catch (error) {
            console.error('Error deleting draft:', error);
        }
    }

    resetForm();
    toast('info', 'Draft discarded', 'Your draft has been cleared.');
}

/**
 * Delete an existing post
 * Why: Users need to delete scheduled posts directly from the editor
 */
export async function handleDeletePost(options: {
    postId: string;
    setIsDeleting: (value: boolean) => void;
    setShowDeleteConfirm: (value: boolean) => void;
    onSuccess: () => void;
}) {
    const { postId, setIsDeleting, setShowDeleteConfirm, onSuccess } = options;

    if (!postId) {
        toast('error', 'Error', 'No post ID provided');
        return;
    }

    setIsDeleting(true);
    try {
        const response = await fetch(`/api/posts/${postId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete post');
        }

        toast('success', 'Post deleted', 'The post has been permanently removed.');
        broadcastSync('post:deleted', postId);
        setShowDeleteConfirm(false);
        onSuccess();
    } catch (error) {
        toast('error', 'Delete failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
        setIsDeleting(false);
    }
}

