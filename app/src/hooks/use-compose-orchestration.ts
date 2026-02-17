/**
 * Compose Orchestration Hook
 *
 * Why: The compose page had ~180 lines of validation, image-resize,
 * draft-caching, unsaved-changes, and action-wiring logic inlined in
 * the component body. This hook centralises that orchestration so the
 * page component is pure layout.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { validatePost, getValidationSummary, type ValidationContext } from '@/lib/validation';
import { useCelebration } from '@/components/ui/celebration';
import { useCompose } from '@/hooks/use-compose';
import { useOnlineStatus, useDraftCache } from '@/lib/compose-offline';
import {
    handleSaveDraft,
    handleScheduleConfirm,
    handlePublishNow,
    handleDiscardDraft,
    handleDeletePost,
} from '@/lib/compose-actions';
import { useUnsavedChanges } from '@/hooks/use-unsaved-changes';
import { useComposerDrop } from '@/hooks/use-composer-drop';
import { useImageResize } from '@/hooks/use-image-resize';
import type { Platform } from '@/lib/platform-config';
import { useComposerPreferencesStore } from '@/lib/stores/composer-preferences-store';

/**
 * Orchestrates validation, auto-resize, draft caching, unsaved-changes
 * guard, and action handlers on top of the core `useCompose()` hook.
 *
 * @returns Everything the compose page/mobile layout needs to render.
 */
export function useComposeOrchestration() {
    const isOnline = useOnlineStatus();
    const { celebratePublish } = useCelebration();
    const compose = useCompose();
    const queryClient = useQueryClient();

    // ----- Local UI state -----
    const [showValidationDetails, setShowValidationDetails] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showActionMenu, setShowActionMenu] = useState(false);

    // Why: Lets users disable auto-resize if they prefer original dimensions
    const [autoResizeEnabled, setAutoResizeEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem('compose-auto-resize');
        return stored !== 'false';
    });
    useEffect(() => {
        localStorage.setItem('compose-auto-resize', String(autoResizeEnabled));
    }, [autoResizeEnabled]);

    // ----- Calendar invalidation -----
    /** Why: So the calendar shows new/updated posts immediately */
    const invalidateCalendar = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['calendar'] });
    }, [queryClient]);

    // ----- Drag-and-drop -----
    const handleDropUpload = useCallback(
        async (uploaded: Array<{ id: string; url: string; thumbnailUrl?: string; type: 'image' | 'video' | 'audio'; size: number; mimeType: string; filename: string }>) => {
            await compose.handleMediaUpload(uploaded);
        },
        [compose.handleMediaUpload],
    );
    const { dropHandlers, isDragOver, isUploading: isDropUploading, progress: dropProgress } = useComposerDrop(handleDropUpload);

    // ----- Validation -----
    const validationContext: ValidationContext = useMemo(() => {
        const hashtags = compose.caption.match(/#\w+/g) || [];
        const mentions = compose.caption.match(/@\w+/g) || [];
        return {
            caption: compose.caption,
            hashtags,
            mentions,
            media: compose.media.map(m => ({
                id: m.id,
                type: m.type as 'image' | 'video',
                width: m.width || 0,
                height: m.height || 0,
                size: m.size || 0,
                duration: m.duration,
                mimeType: m.mimeType || '',
                format: m.filename?.split('.').pop() || '',
            })),
            platforms: compose.uniquePlatforms,
            postTypes: Object.fromEntries(
                compose.selectedAccounts.map(acc => [
                    acc.platform,
                    compose.effectiveAccountSettings[acc.id]?.postType || 'feed',
                ]),
            ),
        };
    }, [compose.caption, compose.media, compose.uniquePlatforms, compose.selectedAccounts, compose.effectiveAccountSettings]);

    const validationResults = useMemo(() => validatePost(validationContext), [validationContext]);
    const validationSummary = useMemo(() => getValidationSummary(validationResults), [validationResults]);
    const hasValidationErrors = validationSummary.errors > 0;

    // ----- Post status helpers -----
    const isPostPublishing = compose.editPostStatus === 'publishing';
    const isPostFailed = compose.editPostStatus === 'failed';
    const isStuckPublishing = useMemo(() => {
        if (!isPostPublishing || !compose.editPostUpdatedAt) return false;
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        return compose.editPostUpdatedAt.getTime() < fiveMinutesAgo;
    }, [isPostPublishing, compose.editPostUpdatedAt]);

    // ----- Draft caching -----
    useDraftCache({
        organizationId: compose.organization?.id,
        editPostId: compose.editPostId,
        caption: compose.caption,
        media: compose.media,
        selectedAccountIds: compose.selectedAccountIds,
        scheduledDate: compose.scheduledDate,
        selectedDate: compose.selectedDate,
        setCaption: compose.setCaption,
        setSelectedAccountIds: compose.setSelectedAccountIds,
    });

    // ----- Unsaved changes -----
    const hasChanges = compose.caption.length > 0 || compose.media.length > 0;
    useUnsavedChanges({ hasChanges });

    // ----- Auto-resize -----
    const activePlatform = compose.activeAccount?.platform as Platform | undefined;
    const activePostType = compose.activeAccount
        ? (compose.effectiveAccountSettings[compose.activeAccount.id]?.postType || 'feed')
        : undefined;
    const { resizedMedia, resizeAlerts, isResizing } = useImageResize(
        compose.media,
        activePlatform,
        activePostType,
        autoResizeEnabled,
    );

    const buildResizedMap = useCallback((): Record<string, Array<{ id: string; url: string; thumbnailUrl?: string; type: 'image' | 'video'; width?: number; height?: number; size: number; filename?: string; mimeType?: string }>> | undefined => {
        if (!activePlatform || resizedMedia === compose.media) return undefined;
        const map: Record<string, Array<{ id: string; url: string; thumbnailUrl?: string; type: 'image' | 'video'; width?: number; height?: number; size: number; filename?: string; mimeType?: string }>> = {};
        for (const acc of compose.selectedAccounts) {
            if (acc.platform === activePlatform) {
                map[acc.id] = resizedMedia;
            }
        }
        return Object.keys(map).length > 0 ? map : undefined;
    }, [activePlatform, resizedMedia, compose.media, compose.selectedAccounts]);

    // ----- Action handlers -----
    /** Why: So the next new post remembers which platforms were used */
    const saveComposerPrefs = () => {
        useComposerPreferencesStore.getState().setLastSelectedAccountIds(compose.selectedAccountIds);
    };

    const onSaveDraft = () => handleSaveDraft({
        caption: compose.caption,
        selectedAccountIds: compose.selectedAccountIds,
        media: compose.media,
        firstComment: compose.firstComment,
        effectiveAccountSettings: compose.effectiveAccountSettings,
        organizationId: compose.organization?.id,
        editPostId: compose.editPostId,
        scheduledDate: compose.scheduledDate,
        scheduledTime: compose.scheduledTime,
        setIsSaving: compose.setIsSaving,
        onMutate: invalidateCalendar,
        onSuccess: () => { saveComposerPrefs(); compose.router.back(); },
    });

    const onScheduleConfirm = (
        schedules: Record<string, { date: string; time: string }> | null,
        unifiedDate: string,
        unifiedTime: string,
    ) => handleScheduleConfirm({
        schedules,
        unifiedDate,
        unifiedTime,
        caption: compose.caption,
        selectedAccountIds: compose.selectedAccountIds,
        media: compose.media,
        firstComment: compose.firstComment,
        effectiveAccountSettings: compose.effectiveAccountSettings,
        organizationId: compose.organization?.id,
        editPostId: compose.editPostId,
        resizedMediaMap: autoResizeEnabled ? buildResizedMap() : undefined,
        setIsScheduleModalOpen: compose.setIsScheduleModalOpen,
        setIsScheduling: compose.setIsScheduling,
        onMutate: invalidateCalendar,
        onSuccess: () => { saveComposerPrefs(); compose.router.back(); },
    });

    const onPublishNow = () => handlePublishNow({
        caption: compose.caption,
        selectedAccountIds: compose.selectedAccountIds,
        media: compose.media,
        firstComment: compose.firstComment,
        effectiveAccountSettings: compose.effectiveAccountSettings,
        organizationId: compose.organization?.id,
        editPostId: compose.editPostId,
        resizedMediaMap: autoResizeEnabled ? buildResizedMap() : undefined,
        setIsPublishing: compose.setIsPublishing,
        celebratePublish,
        onMutate: invalidateCalendar,
        onSuccess: () => { saveComposerPrefs(); compose.router.back(); },
    });

    const onDiscardDraft = () => handleDiscardDraft({
        organizationId: compose.organization?.id,
        resetForm: compose.resetForm,
    });

    const onDeletePost = () => handleDeletePost({
        postId: compose.editPostId || '',
        setIsDeleting,
        setShowDeleteConfirm,
        onSuccess: () => compose.router.back(),
    });

    return {
        // Core compose state (pass-through)
        compose,

        // Online status
        isOnline,

        // UI state
        showValidationDetails,
        setShowValidationDetails,
        showDeleteConfirm,
        setShowDeleteConfirm,
        isDeleting,
        showActionMenu,
        setShowActionMenu,

        // Auto-resize
        autoResizeEnabled,
        setAutoResizeEnabled,
        resizedMedia,
        resizeAlerts,
        isResizing,

        // Drag-and-drop
        dropHandlers,
        isDragOver,
        isDropUploading,
        dropProgress,

        // Validation
        validationContext,
        validationSummary,
        hasValidationErrors,

        // Post status
        isPostPublishing,
        isPostFailed,
        isStuckPublishing,
        hasChanges,

        // Actions
        onSaveDraft,
        onScheduleConfirm,
        onPublishNow,
        onDiscardDraft,
        onDeletePost,
    };
}
