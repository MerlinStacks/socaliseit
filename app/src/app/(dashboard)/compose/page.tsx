/**
 * Compose page for creating new posts
 * 3-column layout on desktop: Profile Selector | Tabbed Editor | Platform Preview
 * 4-step stepper on mobile: Accounts → Content → Customize → Preview
 */

'use client';

import { useMemo, useState } from 'react';
import { X, Save, Send, Loader2, Clock, Trash2, CloudOff, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileSelector } from '@/components/compose/profile-selector';
import { TabbedPlatformEditor } from '@/components/compose/tabbed-platform-editor';
import { AICaptionGenerator } from '@/components/compose/ai-caption-generator';
import { TemplatePicker } from '@/components/compose/template-picker';
import { PlatformPreview } from '@/components/compose/platform-previews';
import { MediaCarousel } from '@/components/compose/media-carousel';
import { UploadModal } from '@/components/media/upload-modal';
import { SchedulingCalendarModal } from '@/components/compose/scheduling-calendar-modal';
import { ValidationBadge, ValidationPanel } from '@/components/compose/validation-panel';
import { validatePost, getValidationSummary, type ValidationContext } from '@/lib/validation';

import { ComposeMobile } from './compose-mobile';
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

export default function ComposePage() {
    const isMobile = useIsMobile();
    const isOnline = useOnlineStatus();
    const { celebratePublish } = useCelebration();
    const [showValidationDetails, setShowValidationDetails] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // All compose state from centralized hook
    const compose = useCompose();

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
        onSuccess: () => compose.router.push('/calendar'),
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
        onSuccess: () => compose.router.push('/calendar'),
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
        onSuccess: () => compose.router.push('/calendar'),
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
        onSuccess: () => compose.router.push('/calendar'),
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
                            className="w-full max-w-lg rounded-t-2xl bg-[var(--bg-primary)] p-4 max-h-[80vh] overflow-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
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
            <div className="flex h-[90vh] w-[90vw] max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-[var(--bg-primary)] shadow-2xl">
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
                        onClick={() => compose.router.push('/calendar')}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </header>

                {/* Content - 3 Column Layout */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left - Profile Selector */}
                    <div className="w-[280px] flex-shrink-0 border-r border-[var(--border)] overflow-hidden">
                        <ProfileSelector
                            accounts={compose.accounts}
                            selected={compose.selectedAccountIds}
                            onSelectionChange={compose.setSelectedAccountIds}
                            groupBy="organisation"
                        />
                    </div>

                    {/* Center - Tabbed Platform Editor */}
                    <div className="flex-1 overflow-hidden border-r border-[var(--border)]">
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
                            platformSettings={compose.activePlatformSettings}
                            onSettingsChange={compose.handlePlatformSettingsChange}
                            firstComment={compose.firstComment}
                            onFirstCommentChange={compose.setFirstComment}
                            platformFirstComments={compose.platformFirstComments}
                            onPlatformFirstCommentChange={compose.handlePlatformFirstCommentChange}
                            onActivePlatformChange={compose.handleActivePlatformChange}
                            isAIRewriting={compose.isAIRewriting}
                        />
                    </div>

                    {/* Right - Platform Preview + Media Management */}
                    <div className="w-[320px] flex-shrink-0 overflow-y-auto bg-[var(--bg-secondary)]">
                        <div className="p-4 space-y-6">
                            {/* Platform Preview */}
                            {compose.selectedAccounts.length > 0 && compose.activeAccount && (
                                <div>
                                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                        Preview
                                    </h4>
                                    <PlatformPreview
                                        platform={compose.activeAccount.platform}
                                        postType={compose.effectiveAccountSettings[compose.activeAccount.id]?.postType || 'feed'}
                                        caption={compose.activeCaption}
                                        media={compose.media}
                                        accountName={compose.activeAccount.name}
                                        accountAvatar={compose.activeAccount.avatar}
                                    />
                                </div>
                            )}

                            {/* Media Carousel - Below preview for management */}
                            {compose.media.length > 0 && (
                                <div>
                                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                        Media ({compose.media.length})
                                    </h4>
                                    <MediaCarousel
                                        items={compose.media}
                                        selectedIds={[]}
                                        onSelectionChange={() => { }}
                                        onRemove={(id) => compose.setMedia(compose.media.filter(m => m.id !== id))}
                                        onBulkRemove={(ids) => compose.setMedia(compose.media.filter(m => !ids.includes(m.id)))}
                                        onAddMore={compose.handleAddMedia}
                                        platforms={compose.uniquePlatforms}
                                        postTypes={validationContext.postTypes}
                                    />
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
                        {/* Right side - Action Buttons */}
                        <div className="flex items-center gap-3">
                            <Button
                                variant="secondary"
                                onClick={onDiscardDraft}
                                disabled={compose.isSubmitting || (!compose.caption && compose.media.length === 0 && compose.selectedAccountIds.length === 0)}
                            >
                                Discard Changes
                            </Button>
                            <Button variant="secondary" onClick={onSaveDraft} isLoading={compose.isSaving} disabled={compose.isSubmitting}>
                                {!compose.isSaving && <Save className="mr-2 h-4 w-4" />}
                                Save Draft
                            </Button>
                            <Button variant="secondary" onClick={compose.handleOpenScheduleModal} disabled={compose.isSubmitting}>
                                <Clock className="mr-2 h-4 w-4" />
                                Schedule
                            </Button>
                            <Button
                                onClick={onPublishNow}
                                isLoading={compose.isPublishing}
                                disabled={compose.isSubmitting || hasValidationErrors}
                                title={hasValidationErrors ? `Fix ${validationSummary.errors} validation error(s) before publishing` : undefined}
                            >
                                {!compose.isPublishing && (hasValidationErrors ? <AlertCircle className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />)}
                                {hasValidationErrors ? `Fix ${validationSummary.errors} Error${validationSummary.errors > 1 ? 's' : ''}` : 'Publish Now'}
                            </Button>
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
