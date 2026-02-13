/**
 * Compose page for creating new posts
 * 3-column layout on desktop: Profile Selector | Tabbed Editor | Platform Preview
 * 4-step stepper on mobile: Accounts → Content → Customize → Preview
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { X, Save, Send, Loader2, Clock, Trash2, CloudOff, AlertCircle, ChevronDown, RefreshCw, Upload, ImageDown, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileSelector } from '@/components/compose/profile-selector';
import { TabbedPlatformEditor } from '@/components/compose/tabbed-platform-editor';
import { CustomizationPanel } from '@/components/compose/customization-panel';
import { ValidationBadge } from '@/components/compose/validation-panel';
import { validatePost, getValidationSummary, type ValidationContext } from '@/lib/validation';

import { useIsMobile } from '@/hooks/use-mobile';
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
import { AutoSaveBadge } from '@/components/compose/auto-save-indicator';
import { useComposerDrop } from '@/hooks/use-composer-drop';
import { useImageResize } from '@/hooks/use-image-resize';
import type { Platform } from '@/lib/platform-config';
import { useComposerPreferencesStore } from '@/lib/stores/composer-preferences-store';

// Lazy-load heavy conditional components — only downloaded when needed
const AICaptionGenerator = dynamic(() => import('@/components/compose/ai-caption-generator').then(m => ({ default: m.AICaptionGenerator })), { ssr: false });
const TemplatePicker = dynamic(() => import('@/components/compose/template-picker').then(m => ({ default: m.TemplatePicker })), { ssr: false });
const PlatformPreview = dynamic(() => import('@/components/compose/platform-previews').then(m => ({ default: m.PlatformPreview })), { ssr: false });
const UploadModal = dynamic(() => import('@/components/media/upload-modal').then(m => ({ default: m.UploadModal })), { ssr: false });
const SchedulingCalendarModal = dynamic(() => import('@/components/compose/scheduling-calendar-modal').then(m => ({ default: m.SchedulingCalendarModal })), { ssr: false });
const ComposeMobile = dynamic(() => import('./compose-mobile').then(m => ({ default: m.ComposeMobile })), { ssr: false });
const ValidationPanel = dynamic(() => import('@/components/compose/validation-panel').then(m => ({ default: m.ValidationPanel })), { ssr: false });

export default function ComposePage() {
    const isMobile = useIsMobile();
    const isOnline = useOnlineStatus();
    const { celebratePublish } = useCelebration();
    const [showValidationDetails, setShowValidationDetails] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [showActionMenu, setShowActionMenu] = useState(false);

    // Auto-resize toggle — persists in localStorage
    // Why: Lets users disable auto-resize if they prefer original dimensions
    const [autoResizeEnabled, setAutoResizeEnabled] = useState(() => {
        if (typeof window === 'undefined') return true;
        const stored = localStorage.getItem('compose-auto-resize');
        return stored !== 'false';
    });
    useEffect(() => {
        localStorage.setItem('compose-auto-resize', String(autoResizeEnabled));
    }, [autoResizeEnabled]);

    // All compose state from centralized hook
    const compose = useCompose();
    const queryClient = useQueryClient();

    /**
     * Invalidate calendar cache after post mutations
     * Why: So the calendar shows the new/updated post immediately when the user navigates back
     */
    const invalidateCalendar = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['calendar'] });
    }, [queryClient]);

    // Drag-and-drop media upload
    // Why: Lets users drop files directly onto the composer, matching upload-modal behaviour
    const handleDropUpload = useCallback(async (uploaded: Array<{ id: string; url: string; thumbnailUrl?: string; type: 'image' | 'video' | 'audio'; size: number; mimeType: string; filename: string }>) => {
        await compose.handleMediaUpload(uploaded);
    }, [compose.handleMediaUpload]);
    const { dropHandlers, isDragOver, isUploading: isDropUploading, progress: dropProgress } = useComposerDrop(handleDropUpload);

    // Build validation context from compose state
    // Why: Validation rules need structured data to check platform limits
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
                    compose.effectiveAccountSettings[acc.id]?.postType || 'feed'
                ])
            ),
        };
    }, [compose.caption, compose.media, compose.uniquePlatforms, compose.selectedAccounts, compose.effectiveAccountSettings]);

    // Get validation results
    const validationResults = useMemo(() => validatePost(validationContext), [validationContext]);
    const validationSummary = useMemo(() => getValidationSummary(validationResults), [validationResults]);
    const hasValidationErrors = validationSummary.errors > 0;

    // Post status checks for PUBLISHING/FAILED states
    const isPostPublishing = compose.editPostStatus === 'publishing';
    const isPostFailed = compose.editPostStatus === 'failed';
    const isStuckPublishing = useMemo(() => {
        if (!isPostPublishing || !compose.editPostUpdatedAt) return false;
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        return compose.editPostUpdatedAt.getTime() < fiveMinutesAgo;
    }, [isPostPublishing, compose.editPostUpdatedAt]);

    // Draft caching
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

    // Unsaved changes warning - prevent accidental navigation
    const hasChanges = compose.caption.length > 0 || compose.media.length > 0;
    useUnsavedChanges({ hasChanges });

    // Auto-resize images for active platform
    // Why: Platforms have different recommended dimensions; resize on-demand per platform
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

    // Persist selected accounts for next session
    // Why: So the next new post remembers which platforms were used
    const saveComposerPrefs = () => {
        useComposerPreferencesStore.getState().setLastSelectedAccountIds(compose.selectedAccountIds);
    };

    // Action handlers using extracted functions
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
        unifiedTime: string
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
        setIsPublishing: compose.setIsPublishing,
        celebratePublish,
        onMutate: invalidateCalendar,
        onSuccess: () => { saveComposerPrefs(); compose.router.back(); },
    });

    const onDiscardDraft = () => handleDiscardDraft({
        organizationId: compose.organization?.id,
        resetForm: compose.resetForm,
    });

    /**
     * Delete the post being edited
     * Why: Users need to delete scheduled posts directly from the editor
     */
    const onDeletePost = () => handleDeletePost({
        postId: compose.editPostId || '',
        setIsDeleting,
        setShowDeleteConfirm,
        onSuccess: () => compose.router.back(),
    });

    // Loading state
    if (compose.isLoadingAccounts) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
                    <span className="text-sm text-[var(--text-muted)]">Loading accounts...</span>
                </div>
            </div>
        );
    }

    // Error state
    if (compose.accountsError) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="text-red-500">Failed to load accounts</div>
                    <p className="text-sm text-[var(--text-muted)]">{compose.accountsError}</p>
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                </div>
            </div>
        );
    }

    // Mobile layout
    if (isMobile) {
        return (
            <>
                <ComposeMobile
                    accounts={compose.accounts}
                    selectedAccountIds={compose.selectedAccountIds}
                    onAccountToggle={(accountId) => {
                        compose.setSelectedAccountIds(prev =>
                            prev.includes(accountId)
                                ? prev.filter(id => id !== accountId)
                                : [...prev, accountId]
                        );
                    }}
                    isLoadingAccounts={compose.isLoadingAccounts}
                    caption={compose.caption}
                    onCaptionChange={compose.setCaption}
                    media={compose.media}
                    onAddMedia={compose.handleAddMedia}
                    selectedDate={compose.selectedDate}
                    selectedTime={compose.scheduledTime}
                    onOpenScheduleModal={() => compose.setIsScheduleModalOpen(true)}
                    onSave={onSaveDraft}
                    onSchedule={() => compose.setIsScheduleModalOpen(true)}
                    onPublish={onPublishNow}
                    onDiscardDraft={onDiscardDraft}
                    isSaving={compose.isSaving}
                    isScheduling={compose.isScheduling}
                    isPublishing={compose.isPublishing}
                    onAIAssist={compose.handleAIAssist}
                    onOpenTemplates={compose.handleOpenTemplates}
                    uniquePlatforms={compose.uniquePlatforms}
                    isPostPublishing={isPostPublishing}
                    isStuckPublishing={isStuckPublishing}
                    isPostFailed={isPostFailed}
                    isRetrying={compose.isRetrying}
                    onRetryPublish={compose.retryPublish}
                />
                {/* Mobile Modals */}
                <UploadModal
                    open={compose.isMediaModalOpen}
                    onOpenChange={compose.setIsMediaModalOpen}
                    folders={compose.mediaFolders}
                    defaultFolderId={null}
                    onUpload={compose.handleMediaUpload}
                />
                {compose.isAIModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => compose.setIsAIModalOpen(false)}>
                        <div
                            className="w-full max-w-lg rounded-t-2xl bg-[var(--bg-primary)] max-h-[80vh] overflow-auto animate-slide-up"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Bottom-sheet drag handle */}
                            <div className="flex justify-center py-3">
                                <div className="w-10 h-1 rounded-full bg-[var(--border)]" />
                            </div>
                            <div className="px-4 pb-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-semibold">AI Caption Assistant</h2>
                                    <button onClick={() => compose.setIsAIModalOpen(false)} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                                <AICaptionGenerator
                                    onSelect={compose.handleAICaptionSelect}
                                    platform={compose.uniquePlatforms[0] || 'instagram'}
                                    currentDraft={compose.caption}
                                />
                            </div>
                        </div>
                    </div>
                )}
                <TemplatePicker
                    isOpen={compose.isTemplatePickerOpen}
                    onClose={() => compose.setIsTemplatePickerOpen(false)}
                    onSelect={compose.handleTemplateSelect}
                    currentCaption={compose.caption}
                />
                <SchedulingCalendarModal
                    isOpen={compose.isScheduleModalOpen}
                    onClose={() => compose.setIsScheduleModalOpen(false)}
                    selectedAccounts={compose.selectedAccounts}
                    scheduledDate={compose.scheduledDate}
                    scheduledTime={compose.scheduledTime}
                    onSchedule={onScheduleConfirm}
                />
            </>
        );
    }

    // Desktop layout - Modal overlay
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            {/* Modal Container */}
            <div
                className="relative flex h-[90vh] w-[90vw] max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-[var(--bg-primary)] shadow-2xl"
                {...dropHandlers}
            >
                {/* Drag-and-drop overlay */}
                {isDragOver && (
                    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center rounded-2xl border-4 border-dashed border-[var(--accent-gold)] bg-[var(--accent-gold)]/10 backdrop-blur-sm">
                        <Upload className="mb-3 h-12 w-12 text-[var(--accent-gold)] animate-bounce" />
                        <p className="text-lg font-semibold text-[var(--accent-gold)]">Drop files to upload</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">JPEG, PNG, WebP, GIF, MP4</p>
                    </div>
                )}
                {/* Drop upload progress bar */}
                {isDropUploading && (
                    <div className="absolute inset-x-0 top-0 z-[60]">
                        <div
                            className="h-1 bg-[var(--accent-gold)] transition-all duration-300"
                            style={{ width: `${dropProgress}%` }}
                        />
                    </div>
                )}
                {/* Header */}
                <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-semibold">{compose.editPostId ? 'Edit Post' : 'New Post'}</h1>
                        <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                            {compose.selectedAccountIds.length} profile{compose.selectedAccountIds.length !== 1 ? 's' : ''} selected
                        </span>
                        {/* Auto-save indicator */}
                        {hasChanges && <AutoSaveBadge status="saved" />}
                        {!isOnline && (
                            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500 border border-amber-500/20">
                                <CloudOff className="h-3 w-3" />
                                Offline
                            </span>
                        )}
                        {/* Validation Badge */}
                        {compose.selectedAccountIds.length > 0 && (
                            <ValidationBadge
                                context={validationContext}
                                onClick={() => setShowValidationDetails(!showValidationDetails)}
                            />
                        )}
                    </div>
                    <button
                        onClick={() => compose.router.back()}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                {/* Status Banners for PUBLISHING/FAILED posts */}
                {isPostPublishing && (
                    <div className="flex items-center justify-between gap-4 border-b border-amber-500/20 bg-amber-500/10 px-6 py-3">
                        <div className="flex items-center gap-3">
                            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
                            <div>
                                <span className="text-sm font-medium text-amber-500">
                                    {isStuckPublishing ? 'Publishing appears stuck' : 'Publishing in progress...'}
                                </span>
                                {isStuckPublishing && (
                                    <p className="text-xs text-amber-500/80">
                                        This post has been publishing for over 5 minutes. You can retry.
                                    </p>
                                )}
                            </div>
                        </div>
                        {isStuckPublishing && (
                            <Button
                                size="sm"
                                variant="secondary"
                                onClick={compose.retryPublish}
                                disabled={compose.isRetrying}
                                className="bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 border-amber-500/30"
                            >
                                {compose.isRetrying ? (
                                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                                ) : (
                                    <RefreshCw className="mr-2 h-3 w-3" />
                                )}
                                Retry Publishing
                            </Button>
                        )}
                    </div>
                )}
                {isPostFailed && (
                    <div className="flex items-center justify-between gap-4 border-b border-red-500/20 bg-red-500/10 px-6 py-3">
                        <div className="flex items-center gap-3">
                            <AlertCircle className="h-4 w-4 text-red-500" />
                            <div>
                                <span className="text-sm font-medium text-red-500">
                                    This post failed to publish
                                </span>
                                <p className="text-xs text-red-500/80">
                                    You can edit the post and retry, or save your changes as a draft.
                                </p>
                            </div>
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={compose.retryPublish}
                            disabled={compose.isRetrying}
                            className="bg-red-500/20 text-red-500 hover:bg-red-500/30 border-red-500/30"
                        >
                            {compose.isRetrying ? (
                                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            ) : (
                                <RefreshCw className="mr-2 h-3 w-3" />
                            )}
                            Retry Publishing
                        </Button>
                    </div>
                )}

                {/* Content - 4 Column Layout */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left - Profile Selector - Fixed width */}
                    <div className="w-[180px] flex-shrink-0 border-r border-[var(--border)] overflow-hidden">
                        <ProfileSelector
                            accounts={compose.accounts}
                            selected={compose.selectedAccountIds}
                            onSelectionChange={compose.setSelectedAccountIds}
                            groupBy="organisation"
                            incompatiblePlatforms={compose.incompatiblePlatforms}
                        />
                    </div>

                    {/* Center - Caption Editor - Flexible, takes available space */}
                    <div className="flex-1 min-w-[380px] max-w-[480px] overflow-hidden border-r border-[var(--border)]">
                        <TabbedPlatformEditor
                            caption={compose.caption}
                            onCaptionChange={compose.setCaption}
                            platformCaptions={compose.platformCaptions}
                            onPlatformCaptionChange={compose.handlePlatformCaptionChange}
                            selectedPlatforms={compose.uniquePlatforms}
                            selectedAccounts={compose.selectedAccounts}
                            media={compose.media}
                            onMediaChange={compose.setMedia}
                            onAIAssist={compose.handleAIAssist}
                            onAddMedia={compose.handleAddMedia}
                            onOpenTemplates={compose.handleOpenTemplates}
                            postTypes={validationContext.postTypes}
                            firstComment={compose.firstComment}
                            onFirstCommentChange={compose.setFirstComment}
                            platformFirstComments={compose.platformFirstComments}
                            onPlatformFirstCommentChange={compose.handlePlatformFirstCommentChange}
                            onActivePlatformChange={compose.handleActivePlatformChange}
                            isAIRewriting={compose.isAIRewriting}
                        />
                    </div>

                    {/* Platform Settings - Flexible, takes available space */}
                    {compose.selectedAccounts.length > 0 && compose.activeAccount && (
                        <div className="flex-1 min-w-[440px] max-w-[560px] border-r border-[var(--border)] overflow-y-auto">
                            <CustomizationPanel
                                platforms={compose.uniquePlatforms}
                                activePlatform={compose.activeAccount.platform}
                                onActivePlatformChange={(platform) => {
                                    // Find an account with this platform and set it as active
                                    const account = compose.selectedAccounts.find(a => a.platform === platform);
                                    if (account) {
                                        compose.handleActivePlatformChange(platform);
                                    }
                                }}
                                settings={compose.activePlatformSettings}
                                onSettingsChange={compose.handlePlatformSettingsChange}
                                caption={compose.activeCaption}
                                media={compose.media}
                                onAddMedia={compose.handleAddMedia}
                                onMediaChange={compose.setMedia}
                                firstComment={compose.firstComment}
                                onFirstCommentChange={compose.setFirstComment}
                                selectedAccountIds={compose.selectedAccountIds}
                                isCarouselMode={compose.isCarouselMode}
                                isYouTubeShortMode={compose.isYouTubeShortMode}
                            />
                        </div>
                    )}

                    {/* Right - Platform Preview - Fixed compact width */}
                    <div className="w-[280px] flex-shrink-0 overflow-y-auto bg-[var(--bg-secondary)]">
                        <div className="p-3">
                            {/* Platform Preview */}
                            {compose.selectedAccounts.length > 0 && compose.activeAccount && (
                                <div>
                                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                        Preview
                                    </h4>
                                    <PlatformPreview
                                        platform={compose.activeAccount.platform}
                                        postType={compose.effectiveAccountSettings[compose.activeAccount.id]?.postType || 'feed'}
                                        caption={compose.activeCaption}
                                        media={autoResizeEnabled ? resizedMedia : compose.media}
                                        accountName={compose.activeAccount.name}
                                        accountAvatar={compose.activeAccount.avatar}
                                        videoTitle={compose.effectiveAccountSettings[compose.activeAccount.id]?.videoTitle}
                                    />

                                    {/* Auto-resize alert + toggle */}
                                    {resizeAlerts.length > 0 && (
                                        <div className="mt-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5">
                                            <div className="flex items-start gap-2">
                                                <ImageDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-medium text-blue-400">
                                                        {isResizing ? 'Resizing...' : 'Auto-resized'}
                                                    </p>
                                                    {resizeAlerts.map((alert) => (
                                                        <p key={alert.mediaId} className="text-[10px] text-blue-400/70 truncate">
                                                            {alert.originalFilename}: {alert.originalWidth}px → {alert.targetWidth}px
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                            {/* Toggle */}
                                            <div className="mt-2 flex items-center justify-between border-t border-blue-500/10 pt-2">
                                                <span className="text-[10px] text-blue-400/60">Auto-resize</span>
                                                <button
                                                    onClick={() => setAutoResizeEnabled(prev => !prev)}
                                                    className={`relative h-4 w-7 rounded-full transition-colors ${autoResizeEnabled
                                                        ? 'bg-blue-500'
                                                        : 'bg-[var(--bg-tertiary)]'
                                                        }`}
                                                    aria-label={autoResizeEnabled ? 'Disable auto-resize' : 'Enable auto-resize'}
                                                >
                                                    <span
                                                        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${autoResizeEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                                                            }`}
                                                    />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Toggle when no alerts but disabled */}
                                    {resizeAlerts.length === 0 && !autoResizeEnabled && compose.media.some(m => m.type === 'image') && (
                                        <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <Info className="h-3 w-3 text-[var(--text-muted)]" />
                                                    <span className="text-[10px] text-[var(--text-muted)]">Auto-resize disabled</span>
                                                </div>
                                                <button
                                                    onClick={() => setAutoResizeEnabled(true)}
                                                    className="relative h-4 w-7 rounded-full bg-[var(--bg-tertiary)] transition-colors"
                                                    aria-label="Enable auto-resize"
                                                >
                                                    <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white translate-x-0.5" />
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer - Schedule Actions */}
                <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
                        {/* Left side - Delete (only in edit mode) */}
                        <div>
                            {compose.editPostId && (
                                <Button
                                    variant="secondary"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    disabled={compose.isSubmitting || isDeleting}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete Post
                                </Button>
                            )}
                        </div>
                        {/* Right side - Action Buttons with Split Button */}
                        <div className="flex items-center gap-3">
                            <Button
                                variant="secondary"
                                onClick={onSaveDraft}
                                isLoading={compose.isSaving}
                                disabled={compose.isSubmitting}
                            >
                                {!compose.isSaving && <Save className="mr-2 h-4 w-4" />}
                                {compose.editPostId ? 'Save Changes' : 'Save Draft'}
                            </Button>
                            {/* Split Button - Continue with dropdown */}
                            <div className="relative">
                                <div className="flex">
                                    {/* Main Continue button */}
                                    <Button
                                        onClick={compose.handleOpenScheduleModal}
                                        disabled={compose.isSubmitting || hasValidationErrors || (isPostPublishing && !isStuckPublishing)}
                                        className="rounded-r-none border-r border-white/20"
                                        title={
                                            isPostPublishing && !isStuckPublishing
                                                ? 'Post is currently publishing'
                                                : hasValidationErrors
                                                    ? `Fix ${validationSummary.errors} validation error(s) first`
                                                    : 'Continue to schedule'
                                        }
                                    >
                                        {hasValidationErrors ? (
                                            <>
                                                <AlertCircle className="mr-2 h-4 w-4" />
                                                Fix {validationSummary.errors} Error{validationSummary.errors > 1 ? 's' : ''}
                                            </>
                                        ) : isPostPublishing && !isStuckPublishing ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Publishing...
                                            </>
                                        ) : (
                                            'Continue'
                                        )}
                                    </Button>
                                    {/* Dropdown arrow button */}
                                    <Button
                                        onClick={() => setShowActionMenu(!showActionMenu)}
                                        disabled={compose.isSubmitting}
                                        className="rounded-l-none px-2"
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </div>
                                {/* Dropdown Menu */}
                                {showActionMenu && (
                                    <>
                                        {/* Backdrop to close menu */}
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setShowActionMenu(false)}
                                        />
                                        <div className="absolute bottom-full right-0 mb-2 z-50 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-xl">
                                            {/* Publish Now */}
                                            <button
                                                onClick={() => {
                                                    setShowActionMenu(false);
                                                    onPublishNow();
                                                }}
                                                disabled={compose.isSubmitting || hasValidationErrors}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {compose.isPublishing ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Send className="h-4 w-4" />
                                                )}
                                                Continue & publish now
                                            </button>
                                            {/* Schedule */}
                                            <button
                                                onClick={() => {
                                                    setShowActionMenu(false);
                                                    compose.handleOpenScheduleModal();
                                                }}
                                                disabled={compose.isSubmitting}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                                            >
                                                <Clock className="h-4 w-4" />
                                                Continue & edit schedule
                                            </button>
                                            {/* Divider */}
                                            <div className="my-1 border-t border-[var(--border)]" />
                                            {/* Save as Draft */}
                                            <button
                                                onClick={() => {
                                                    setShowActionMenu(false);
                                                    onSaveDraft();
                                                }}
                                                disabled={compose.isSubmitting}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50"
                                            >
                                                <Save className="h-4 w-4" />
                                                {compose.editPostId ? 'Save changes' : 'Save as draft'}
                                            </button>
                                            {/* Discard */}
                                            <button
                                                onClick={() => {
                                                    setShowActionMenu(false);
                                                    onDiscardDraft();
                                                }}
                                                disabled={compose.isSubmitting || (!compose.caption && compose.media.length === 0 && compose.selectedAccountIds.length === 0)}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-[var(--bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                                Discard changes
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </footer>

                {/* AI Caption Generator Modal */}
                {compose.isAIModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--bg-secondary)] shadow-2xl">
                            <button
                                onClick={() => compose.setIsAIModalOpen(false)}
                                className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                            >
                                <X className="h-4 w-4" />
                            </button>
                            <AICaptionGenerator
                                onSelect={compose.handleAICaptionSelect}
                                platform={compose.uniquePlatforms[0] || 'instagram'}
                                currentDraft={compose.caption}
                            />
                        </div>
                    </div>
                )}

                {/* Media Upload Modal */}
                <UploadModal
                    open={compose.isMediaModalOpen}
                    onOpenChange={compose.setIsMediaModalOpen}
                    folders={compose.mediaFolders}
                    defaultFolderId={null}
                    onUpload={compose.handleMediaUpload}
                />

                {/* Template Picker Modal */}
                <TemplatePicker
                    isOpen={compose.isTemplatePickerOpen}
                    onClose={() => compose.setIsTemplatePickerOpen(false)}
                    onSelect={compose.handleTemplateSelect}
                    currentCaption={compose.caption}
                />

                {/* Scheduling Calendar Modal */}
                <SchedulingCalendarModal
                    isOpen={compose.isScheduleModalOpen}
                    onClose={() => compose.setIsScheduleModalOpen(false)}
                    selectedAccounts={compose.selectedAccounts}
                    scheduledDate={compose.scheduledDate}
                    scheduledTime={compose.scheduledTime}
                    onSchedule={onScheduleConfirm}
                />

                {/* Validation Details Modal */}
                {showValidationDetails && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--bg-secondary)] p-6 shadow-2xl">
                            <div className="mb-4 flex items-center justify-between">
                                <h2 className="text-lg font-semibold">Post Validation</h2>
                                <button
                                    onClick={() => setShowValidationDetails(false)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                            <ValidationPanel context={validationContext} />
                            <div className="mt-6 flex justify-end">
                                <Button variant="secondary" onClick={() => setShowValidationDetails(false)}>
                                    Close
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Delete Confirmation Modal */}
                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                        <div className="w-full max-w-md rounded-xl bg-[var(--bg-secondary)] p-6 shadow-2xl mx-4">
                            <h2 className="text-lg font-semibold mb-2">Delete Post?</h2>
                            <p className="text-sm text-[var(--text-muted)] mb-6">
                                This will permanently delete the scheduled post. This action cannot be undone.
                            </p>
                            <div className="flex gap-3 justify-end">
                                <Button
                                    variant="secondary"
                                    onClick={() => setShowDeleteConfirm(false)}
                                    disabled={isDeleting}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="danger"
                                    onClick={onDeletePost}
                                    isLoading={isDeleting}
                                >
                                    Delete Post
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
