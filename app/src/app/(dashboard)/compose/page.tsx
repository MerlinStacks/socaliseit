/**
 * Compose page for creating new posts
 * 4-column layout on desktop: Profile Selector | Platform Editor | Customization Panel | Platform Preview
 * 4-step stepper on mobile: Accounts → Content → Customize → Preview
 */

'use client';

import { X, Save, Send, Loader2, Clock, Trash2, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileSelector } from '@/components/compose/profile-selector';
import { PlatformEditor } from '@/components/compose/platform-editor';
import { CustomizationPanel } from '@/components/compose/customization-panel';
import { AICaptionGenerator } from '@/components/compose/ai-caption-generator';
import { TemplatePicker } from '@/components/compose/template-picker';
import { PlatformPreview } from '@/components/compose/platform-previews';
import { UploadModal } from '@/components/media/upload-modal';
import { SchedulingCalendarModal } from '@/components/compose/scheduling-calendar-modal';

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
} from '@/lib/compose-actions';

export default function ComposePage() {
    const isMobile = useIsMobile();
    const isOnline = useOnlineStatus();
    const { celebratePublish } = useCelebration();

    // All compose state from centralized hook
    const compose = useCompose();

    // Draft caching
    useDraftCache({
        workspaceId: compose.workspace?.id,
        editPostId: compose.editPostId,
        caption: compose.caption,
        media: compose.media,
        selectedAccountIds: compose.selectedAccountIds,
        scheduledDate: compose.scheduledDate,
        selectedDate: compose.selectedDate,
        setCaption: compose.setCaption,
        setSelectedAccountIds: compose.setSelectedAccountIds,
    });

    // Action handlers using extracted functions
    const onSaveDraft = () => handleSaveDraft({
        caption: compose.caption,
        selectedAccountIds: compose.selectedAccountIds,
        media: compose.media,
        firstComment: compose.firstComment,
        effectiveAccountSettings: compose.effectiveAccountSettings,
        workspaceId: compose.workspace?.id,
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
        workspaceId: compose.workspace?.id,
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
        workspaceId: compose.workspace?.id,
        setIsPublishing: compose.setIsPublishing,
        celebratePublish,
        onSuccess: () => compose.router.push('/calendar'),
    });

    const onDiscardDraft = () => handleDiscardDraft({
        workspaceId: compose.workspace?.id,
        resetForm: compose.resetForm,
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

    // Desktop layout
    return (
        <div className="flex h-screen flex-col bg-[var(--bg-primary)]">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-semibold">New Post</h1>
                    <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        {compose.selectedAccountIds.length} profile{compose.selectedAccountIds.length !== 1 ? 's' : ''} selected
                    </span>
                    {!isOnline && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500 border border-amber-500/20">
                            <CloudOff className="h-3 w-3" />
                            Offline
                        </span>
                    )}
                </div>
                <button
                    onClick={() => compose.router.push('/calendar')}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                    <X className="h-5 w-5" />
                </button>
            </header>

            {/* Content - 4 Column Layout */}
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

                {/* Center - Platform Editor */}
                <div className="flex-1 max-w-[420px] overflow-hidden border-r border-[var(--border)]">
                    <div className="flex h-full flex-col">
                        <div className="flex-1 overflow-hidden">
                            <PlatformEditor
                                caption={compose.caption}
                                onCaptionChange={compose.setCaption}
                                selectedPlatforms={compose.uniquePlatforms}
                                media={compose.media}
                                onMediaChange={compose.setMedia}
                                onAIAssist={compose.handleAIAssist}
                                onAddMedia={compose.handleAddMedia}
                                onOpenTemplates={compose.handleOpenTemplates}
                            />
                        </div>
                    </div>
                </div>

                {/* Right - Customization Panel */}
                <div className="w-[360px] flex-shrink-0 overflow-hidden border-r border-[var(--border)]">
                    {compose.selectedAccounts.length > 0 && compose.activeAccount ? (
                        <CustomizationPanel
                            platforms={compose.uniquePlatforms}
                            activePlatform={compose.activeAccount.platform}
                            onActivePlatformChange={compose.handleActivePlatformChange}
                            settings={compose.activePlatformSettings}
                            onSettingsChange={compose.handlePlatformSettingsChange}
                            caption={compose.activeCaption}
                            media={compose.media}
                            onAddMedia={compose.handleAddMedia}
                            firstComment={compose.firstComment}
                            onFirstCommentChange={compose.setFirstComment}
                            selectedAccountIds={compose.selectedAccountIds}
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center p-6 text-center">
                            <p className="text-sm text-[var(--text-muted)]">
                                Select at least one profile to customize your post
                            </p>
                        </div>
                    )}
                </div>

                {/* Far Right - Platform Preview */}
                <div className="w-[320px] flex-shrink-0 overflow-y-auto bg-[var(--bg-secondary)]">
                    {compose.selectedAccounts.length > 0 && compose.activeAccount ? (
                        <div className="p-4">
                            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                Preview
                            </h4>
                            <PlatformPreview
                                platform={compose.activeAccount.platform}
                                postType={compose.effectiveAccountSettings[compose.activeAccount.id]?.postType || 'feed'}
                                caption={compose.activeCaption}
                                media={compose.media}
                                accountName={compose.activeAccount.name}
                            />
                        </div>
                    ) : (
                        <div className="flex h-full items-center justify-center p-6 text-center">
                            <p className="text-sm text-[var(--text-muted)]">
                                Preview will appear here
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer - Schedule Actions */}
            <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                <div className="flex items-center justify-end gap-4">
                    {/* Action Buttons */}
                    <div className="flex items-center gap-3">
                        <Button
                            variant="secondary"
                            onClick={onDiscardDraft}
                            disabled={compose.isSubmitting || (!compose.caption && compose.media.length === 0 && compose.selectedAccountIds.length === 0)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Discard
                        </Button>
                        <Button variant="secondary" onClick={onSaveDraft} isLoading={compose.isSaving} disabled={compose.isSubmitting}>
                            {!compose.isSaving && <Save className="mr-2 h-4 w-4" />}
                            Save Draft
                        </Button>
                        <Button variant="secondary" onClick={compose.handleOpenScheduleModal} disabled={compose.isSubmitting}>
                            <Clock className="mr-2 h-4 w-4" />
                            Schedule
                        </Button>
                        <Button onClick={onPublishNow} isLoading={compose.isPublishing} disabled={compose.isSubmitting}>
                            {!compose.isPublishing && <Send className="mr-2 h-4 w-4" />}
                            Publish Now
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
        </div>
    );
}
