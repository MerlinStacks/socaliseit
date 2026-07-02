/**
 * Compose Actions - Submission and draft handlers for post composer
 * Extracted from compose/page.tsx to reduce file size and improve maintainability
 */

import { type MediaItem } from '@/components/compose/platform-editor';
import { toast } from '@/components/ui/toast';
import { deleteDraft } from '@/lib/offline-queue';
import { type AccountSettings } from '@/hooks/use-compose';
import { broadcastSync } from '@/lib/cross-tab-sync';
import { type PlatformSettingsInput } from '@/types/platform-settings';

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

    /** Why: Uses shared PlatformSettingsInput to stay in sync with server-side type */
    const platformSettings: Record<string, PlatformSettingsInput & { postType: string }> = {};

    selectedAccountIds.forEach((accountId) => {
        const settings = effectiveAccountSettings[accountId];
        if (settings) {
            platformSettings[accountId] = {
                postType: settings.postType,
                callToAction: settings.callToAction,
                caption: settings.captionOverride,
                // Why (BUG-AUDIT-4): Check length so an empty `[]` from a
                // cleared override doesn't block resized media from being used.
                mediaIds: (settings.mediaOverride?.length ? settings.mediaOverride : undefined)
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
                youtubeCommentsEnabled: settings.commentsEnabled,
                // TikTok-specific fields mapping
                tiktokPrivacyLevel: settings.tiktokPrivacyLevel,
                tiktokContentDisclosure: settings.tiktokContentDisclosure,
                tiktokBrandOrganic: settings.tiktokBrandOrganicToggle,
                tiktokBrandContent: settings.tiktokBrandContentToggle,
                tiktokIsAigc: settings.tiktokIsAigc,
                tiktokComments: settings.tiktokCommentsEnabled,
                tiktokDuets: settings.tiktokDuetsEnabled,
                tiktokStitches: settings.tiktokStitchesEnabled,
                // Instagram-specific fields
                instagramShareToFeed: settings.instagramShareToFeed,
                instagramComments: settings.instagramComments,
                isTrialReel: settings.isTrialReel,
                // Threads-specific fields
                threadsTopicTag: settings.threadsTopicTag,
                threadsQuotePostId: settings.threadsQuotePostId,
                // Alt text for accessibility
                altText: settings.altText,
                // LinkedIn-specific fields
                linkedinVisibility: settings.linkedinVisibility,
                autoPublish: settings.autoPublish,
                notifyDeviceIds: settings.notifyDeviceIds,
                productTags: settings.productTags?.map(tag => ({
                    platformProductId: tag.platformProductId,
                    productName: tag.product?.name || 'Unknown',
                    mediaIndex: tag.mediaIndex,
                    positionX: tag.positionX,
                    positionY: tag.positionY,
                })),
            };
        }
    });

    return {
        caption,
        platformAccountIds: selectedAccountIds,
        // Why (BUG-FIX): Sending `[]` would trigger the server to delete all existing
        // PostMedia records. Send undefined instead so the server preserves existing media.
        mediaIds: media.length > 0 ? media.map(m => m.id) : undefined,
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
export async function submitPost(
    payload: ReturnType<typeof buildPostPayload>,
    editPostId?: string | null,
    options?: { idempotencyKey?: string }
): Promise<Response> {
    if (editPostId) {
        return fetch(`/api/posts/${editPostId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (options?.idempotencyKey) {
        headers['X-Idempotency-Key'] = options.idempotencyKey;
    }

    return fetch('/api/posts', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });
}

async function clearCachedDraft(organizationId?: string) {
    if (!organizationId) return;

    const draftId = `draft-${organizationId}`;
    await deleteDraft(draftId);

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('draft-cache:discard', { detail: { organizationId } }));
        window.localStorage.removeItem(`draft-flush-${organizationId}`);
    }

    await fetch(`/api/drafts?draftId=${encodeURIComponent(draftId)}`, {
        method: 'DELETE',
    }).catch(() => {
        // Non-fatal: local discard must still complete if cloud cleanup fails.
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
    onMutate?: () => void | Promise<void>;
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

    setIsSaving(true);
    try {
        /**
         * Why: When editing, omit scheduledAt (undefined) so the server preserves
         * the existing value. Reconstructing the date from form state causes drift
         * (seconds/ms lost via parseDateTimeLocal) and unnecessary rescheduling.
         */
        const payload = buildPostPayload({
            caption,
            selectedAccountIds,
            media,
            firstComment,
            effectiveAccountSettings,
            scheduledAt: editPostId ? undefined : null,
        });

        const response = await submitPost(payload, editPostId);

        if (!response.ok) {
            let errorMsg = `Failed to save draft (HTTP ${response.status})`;
            try {
                const error = await response.json();
                errorMsg = error.error || errorMsg;
            } catch { /* non-JSON response body */ }
            throw new Error(errorMsg);
        }

        await clearCachedDraft(organizationId);

        const successMsg = editPostId ? 'Draft updated' : 'Draft saved';
        toast('success', successMsg, 'Your post has been saved as a draft.');
        broadcastSync('draft:saved');
        await options.onMutate?.();
        onSuccess();
    } catch (error) {
        toast('error', 'Save failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
        setIsSaving(false);
    }
}

// Why: Schedule logic extracted to schedule-actions.ts to keep this file focused.
// Re-export preserves existing import paths.
export { parseDateTimeLocal, handleScheduleConfirm } from '@/lib/schedule-actions';
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
    /** Why: Resized media per-account so each platform gets correctly sized images */
    resizedMediaMap?: Record<string, MediaItem[]>;
    setIsPublishing: (value: boolean) => void;
    celebratePublish: () => void;
    onMutate?: () => void | Promise<void>;
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
        resizedMediaMap,
        setIsPublishing,
        celebratePublish,
        onSuccess,
    } = options;

    // Why: Duplicate "no accounts" and "no caption" checks removed.
    // These are now handled by the validation system (common-rules.ts)
    // and the publish button is disabled when validation errors exist.

    setIsPublishing(true);
    try {
        const payload = buildPostPayload({
            caption,
            selectedAccountIds,
            media,
            firstComment,
            effectiveAccountSettings,
            resizedMediaMap,
            // Why: Explicit null prevents inheriting a stale scheduledAt from
            // edit-mode form state, which would route to schedulePost() instead
            // of publishNow().
            scheduledAt: null,
            autoPublish: true,
        });

        const response = await submitPost(payload, editPostId);

        if (!response.ok) {
            // Why (BUG-39): Safe JSON parse — server may return non-JSON
            let errorMsg = `Failed to publish (HTTP ${response.status})`;
            try {
                const error = await response.json();
                errorMsg = error.error || errorMsg;
            } catch { /* non-JSON response body */ }
            throw new Error(errorMsg);
        }

        await clearCachedDraft(organizationId);

        toast('success', 'Publishing', 'Your post is being published to selected platforms.');
        broadcastSync(editPostId ? 'post:updated' : 'post:published');
        celebratePublish();
        await options.onMutate?.();
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

    try {
        await clearCachedDraft(organizationId);
    } catch (error) {
        // Non-fatal: draft deletion failure shouldn't block the discard flow
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
    /** Why: Needed to clear the auto-saved IndexedDB draft so it doesn't resurface in the next compose */
    organizationId?: string;
    setIsDeleting: (value: boolean) => void;
    setShowDeleteConfirm: (value: boolean) => void;
    onSuccess: () => void;
}) {
    const { postId, organizationId, setIsDeleting, setShowDeleteConfirm, onSuccess } = options;

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
            // Why (BUG-39): Safe JSON parse — server may return non-JSON
            let errorMsg = `Failed to delete post (HTTP ${response.status})`;
            try {
                const error = await response.json();
                errorMsg = error.error || errorMsg;
            } catch { /* non-JSON response body */ }
            throw new Error(errorMsg);
        }

        // Why: The auto-save in useDraftCache writes the edit-mode caption to IndexedDB.
        // Without clearing it here, the deleted post's content resurfaces as a draft.
        await clearCachedDraft(organizationId);

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
