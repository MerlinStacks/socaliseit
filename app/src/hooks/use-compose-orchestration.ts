/**
 * Compose Orchestration Hook
 *
 * Why: The compose page had ~180 lines of validation, image-resize,
 * draft-caching, unsaved-changes, and action-wiring logic inlined in
 * the component body. This hook centralises that orchestration so the
 * page component is pure layout.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { validatePost, getValidationSummary, type ValidationContext } from '@/lib/validation';
import { buildCalendarQueryKey, calendarPrefetchFn, CALENDAR_STALE_TIME } from '@/hooks/use-calendar-data';
import { useCelebration } from '@/components/ui/celebration';
import { useCompose } from '@/hooks/use-compose';
import { useOnlineStatus, useDraftCache } from '@/lib/compose-offline';
import { useOfflinePublish } from '@/lib/compose-offline';
import { parseShareParams } from '@/lib/pwa-file-handler';
import { processLaunchQueueFiles } from '@/lib/pwa-file-handler';
import { logger } from '@/lib/logger';
import { toast } from '@/components/ui/toast';
import { handleDiscardDraft, handleDeletePost, handlePublishNow, handleSaveDraft, handleScheduleConfirm } from '@/lib/compose-actions';
import { deleteDraft } from '@/lib/offline-queue';
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useComposeOrchestration(initialPostData?: any | null) {
    const isOnline = useOnlineStatus();
    const { celebratePublish } = useCelebration();
    const compose = useCompose(initialPostData);
    const queryClient = useQueryClient();

    // Why: Queues posts to IndexedDB when offline so they sync on reconnect
    const { publishOffline } = useOfflinePublish({
        organizationId: compose.organization?.id,
        isOnline,
    });

    // Why: Share target params should only be consumed on initial page load.
    // Using a ref guard instead of eslint-disable so deps are properly tracked.
    const shareTargetHandled = useRef(false);
    useEffect(() => {
        if (shareTargetHandled.current) return;
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        // Why: manifest.json share_target sends title/text/url to /compose
        if (params.has('text') || params.has('title') || params.has('url')) {
            shareTargetHandled.current = true;
            const shared = parseShareParams(params);
            const parts = [shared.title, shared.text, shared.url].filter(Boolean);
            if (parts.length > 0 && !compose.caption) {
                compose.setCaption(parts.join('\n\n'));
            }
            // Clean URL without reloading
            window.history.replaceState({}, '', '/compose');
        }
    }, [compose.caption, compose.setCaption]);

    // Why: PWA file handler should only consume launch queue once per mount.
    const fileHandlerConsumed = useRef(false);
    useEffect(() => {
        if (fileHandlerConsumed.current) return;
        if (typeof window === 'undefined') return;
        // Why: PWA file_handler API — OS opens files with our app via launchQueue
        const win = window as Window & { launchQueue?: { setConsumer: (cb: (params: { files?: FileSystemFileHandle[] }) => void) => void } };
        if (!win.launchQueue) return;
        fileHandlerConsumed.current = true;
        win.launchQueue.setConsumer(async (launchParams) => {
            const result = await processLaunchQueueFiles(launchParams);
            if (result.files.length > 0) {
                // Why: Convert files to the media upload format the compose hook expects
                const uploaded = result.files.map((file, idx) => ({
                    id: `launch-${Date.now()}-${idx}`,
                    url: URL.createObjectURL(file),
                    type: (file.type.startsWith('video/') ? 'video' : 'image') as 'image' | 'video',
                    size: file.size,
                    mimeType: file.type,
                    filename: file.name,
                }));
                compose.handleMediaUpload(uploaded);
            }
            if (result.errors.length > 0) {
                logger.warn({ errors: result.errors }, 'Some launched files were rejected');
            }
        });
    }, [compose.handleMediaUpload]);

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
    /**
     * Why: Next.js Router Cache (`staleTimes.dynamic: 60`) restores the
     * calendar component from a snapshot on `router.back()`. Plain
     * `invalidateQueries` only marks inactive queries stale — the restored
     * component still sees the old cache. `fetchQuery` eagerly populates
     * the cache with fresh data so the restored `useQuery` finds it.
     */
    const invalidateCalendar = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['calendar'] });
        // Why: Pre-fetch fresh calendar data into the cache so
        // back-navigation finds updated data immediately.
        // Prefetch both desktop and mobile keys since we don't know
        // which view the user will land on.
        const orgId = compose.organization?.id;
        const fetchOpts = { queryFn: calendarPrefetchFn, staleTime: CALENDAR_STALE_TIME };
        queryClient
            .fetchQuery({ ...fetchOpts, queryKey: buildCalendarQueryKey(orgId) })
            .catch(() => { /* Non-fatal: calendar will fallback to stale-then-refetch */ });
        queryClient
            .fetchQuery({ ...fetchOpts, queryKey: buildCalendarQueryKey(orgId, true) })
            .catch(() => { /* Non-fatal */ });
    }, [queryClient, compose.organization?.id]);

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

        // Why: Validation rules need platform-specific config (e.g. Pinterest board)
        const platformSettings: Record<string, Record<string, unknown>> = {};
        for (const acc of compose.selectedAccounts) {
            const settings = compose.effectiveAccountSettings[acc.id];
            if (acc.platform === 'pinterest' && settings) {
                platformSettings.pinterest = { boardId: settings.boardId };
            }
            if (acc.platform === 'tiktok' && settings) {
                platformSettings.tiktok = {
                    tiktokPrivacyLevel: settings.tiktokPrivacyLevel,
                    tiktokContentDisclosure: settings.tiktokContentDisclosure,
                    tiktokBrandOrganicToggle: settings.tiktokBrandOrganicToggle,
                    tiktokBrandContentToggle: settings.tiktokBrandContentToggle,
                };
            }
            if (acc.platform === 'youtube' && settings) {
                platformSettings.youtube = {
                    videoTitle: settings.videoTitle,
                    videoTags: settings.videoTags,
                };
            }
        }

        // Why: common-rules.ts needs to know if stories-only so it can skip caption check
        const allPostsAreStories = compose.selectedAccounts.length > 0 &&
            compose.selectedAccounts.every(acc => {
                const st = compose.effectiveAccountSettings[acc.id];
                return st?.postType?.toLowerCase() === 'story';
            });

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
            selectedAccountCount: compose.selectedAccountIds.length,
            allPostsAreStories,
            // Why: Per-account caption overrides mean the main caption can be empty
            hasAnyCaptionOverride: compose.selectedAccounts.some(acc => {
                const st = compose.effectiveAccountSettings[acc.id];
                return st?.postType?.toLowerCase() !== 'story' && st?.captionOverride?.trim();
            }),
            platformSettings,
        };
    }, [compose.caption, compose.media, compose.uniquePlatforms, compose.selectedAccounts, compose.effectiveAccountSettings, compose.selectedAccountIds.length]);

    const validationResults = useMemo(() => validatePost(validationContext), [validationContext]);
    const validationSummary = useMemo(() => getValidationSummary(validationResults), [validationResults]);
    const hasValidationErrors = validationSummary.errors > 0;

    // ----- Post status helpers -----
    /** Why: Normalise to lowercase to prevent case-sensitivity bugs between
     *  API responses (lowercase) and DB enum values (UPPERCASE). */
    const normalizedStatus = compose.editPostStatus?.toLowerCase();
    const isPostPublishing = normalizedStatus === 'publishing';
    const isPostFailed = normalizedStatus === 'failed';
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
        onSuccess: () => {
            saveComposerPrefs();
            // Why: TikTok Point 5d — notify users that content takes time to process
            if (compose.uniquePlatforms.includes('tiktok')) {
                toast('info', 'TikTok Processing', 'Your TikTok content may take a few minutes to process and appear on your profile after publishing.');
            }
            compose.router.back();
        },
    });

    const onPublishNow = async () => {
        // Why: When offline, queue to IndexedDB instead of hitting the API
        if (!isOnline) {
            const success = await publishOffline({
                caption: compose.caption,
                mediaIds: compose.media.map(m => m.id),
                platformAccountIds: compose.selectedAccountIds,
                firstComment: compose.firstComment || undefined,
                platformSettings: Object.keys(compose.effectiveAccountSettings).length > 0
                    ? compose.effectiveAccountSettings as unknown as Record<string, Record<string, unknown>>
                    : undefined,
            });

            if (success) {
                if (compose.organization?.id) {
                    await deleteDraft(`draft-${compose.organization.id}`);
                }
                saveComposerPrefs();
                compose.router.back();
            }
            return;
        }
        handlePublishNow({
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
            onSuccess: () => {
                saveComposerPrefs();
                // Why: TikTok guidelines require notifying users that content takes time to process
                if (compose.uniquePlatforms.includes('tiktok')) {
                    toast('info', 'TikTok Processing', 'Your TikTok video may take a few minutes to appear on your profile.');
                }
                compose.router.back();
            },
        });
    };

    const onDiscardDraft = () => handleDiscardDraft({
        organizationId: compose.organization?.id,
        resetForm: compose.resetForm,
    });

    const onDeletePost = () => handleDeletePost({
        postId: compose.editPostId || '',
        organizationId: compose.organization?.id,
        setIsDeleting,
        setShowDeleteConfirm,
        onSuccess: () => { invalidateCalendar(); compose.router.back(); },
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
