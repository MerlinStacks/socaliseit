/**
 * Compose client wrapper
 * Why: Previously `page.tsx`, now extracted to a client component to allow
 * server-side data fetching of the edit post in `page.tsx`.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { X, Save, Send, Loader2, Clock, Trash2, CloudOff, AlertCircle, ChevronDown, RefreshCw, Upload, ImageDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ValidationBadge } from '@/components/compose/validation-panel';
import { useIsMobile } from '@/hooks/use-mobile';
import { AutoSaveBadge } from '@/components/compose/auto-save-indicator';
import { useComposeOrchestration } from '@/hooks/use-compose-orchestration';
import { ProfileSelectorSkeleton, EditorSkeleton, PanelSkeleton } from '@/components/compose/compose-skeletons';

const AICaptionGenerator = dynamic(() => import('@/components/compose/ai-caption-generator').then(m => ({ default: m.AICaptionGenerator })), { ssr: false });
const TemplatePicker = dynamic(() => import('@/components/compose/template-picker').then(m => ({ default: m.TemplatePicker })), { ssr: false });
const PlatformPreview = dynamic(() => import('@/components/compose/platform-previews').then(m => ({ default: m.PlatformPreview })), { ssr: false });
const UploadModal = dynamic(() => import('@/components/media/upload-modal').then(m => ({ default: m.UploadModal })), { ssr: false });
const SchedulingCalendarModal = dynamic(() => import('@/components/compose/scheduling-calendar-modal').then(m => ({ default: m.SchedulingCalendarModal })), { ssr: false });
const ComposeMobile = dynamic(() => import('./compose-mobile').then(m => ({ default: m.ComposeMobile })), { ssr: false });
const ValidationPanel = dynamic(() => import('@/components/compose/validation-panel').then(m => ({ default: m.ValidationPanel })), { ssr: false });
const ContentPredictionCard = dynamic(() => import('@/components/compose/content-prediction-card').then(m => ({ default: m.ContentPredictionCard })), { ssr: false });
const ProfileSelector = dynamic(
    () => import('@/components/compose/profile-selector').then(m => ({ default: m.ProfileSelector })),
    { ssr: false, loading: () => <ProfileSelectorSkeleton /> }
);
const TabbedPlatformEditor = dynamic(
    () => import('@/components/compose/tabbed-platform-editor').then(m => ({ default: m.TabbedPlatformEditor })),
    { ssr: false, loading: () => <EditorSkeleton /> }
);
const CustomizationPanel = dynamic(
    () => import('@/components/compose/customization-panel').then(m => ({ default: m.CustomizationPanel })),
    { ssr: false, loading: () => <PanelSkeleton /> }
);

interface ComposeClientProps {
    initialPostData?: Record<string, unknown> | null;
}

export function ComposeClient({ initialPostData }: ComposeClientProps) {
    const isMobile = useIsMobile();
    const orch = useComposeOrchestration(initialPostData);
    const { compose } = orch;
    const {
        isOnline,
        showValidationDetails, setShowValidationDetails,
        showDeleteConfirm, setShowDeleteConfirm,
        isDeleting,
        showActionMenu, setShowActionMenu,
        autoResizeEnabled, setAutoResizeEnabled,
        resizedMedia, resizeAlerts, isResizing,
        dropHandlers, isDragOver, isDropUploading, dropProgress,
        validationContext, validationSummary, hasValidationErrors,
        isPostPublishing, isPostFailed, isStuckPublishing, hasChanges, hasTranscodingMedia,
        onSaveDraft, onScheduleConfirm, onPublishNow, onDiscardDraft, onDeletePost,
    } = orch;

    // Why: TikTok live API checks (rate-limit, video duration) can't be part of
    // the static validation system — they need creator_info from the API.
    const [tiktokPublishBlock, setTiktokPublishBlock] = useState<{ blocked: boolean; reason?: string }>({ blocked: false });
    const handleTiktokPublishBlock = useCallback((blocked: boolean, reason?: string) => {
        setTiktokPublishBlock({ blocked, reason });
    }, []);
    // Why: When TikTok is deselected, TikTokSettings unmounts and never calls
    // onPublishBlock(false). Clear the block so the publish button re-enables.
    const hasTiktok = compose.uniquePlatforms.includes('tiktok');
    useEffect(() => {
        if (!hasTiktok && tiktokPublishBlock.blocked) {
            setTiktokPublishBlock({ blocked: false });
        }
    }, [hasTiktok, tiktokPublishBlock.blocked]);

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
                    hasTranscodingMedia={hasTranscodingMedia}
                />
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div
                className="relative flex h-[90vh] w-[90vw] max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-[var(--bg-primary)] shadow-2xl"
                {...dropHandlers}
            >
                {isDragOver && (
                    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center rounded-2xl border-4 border-dashed border-[var(--accent-gold)] bg-[var(--accent-gold)]/10 backdrop-blur-sm">
                        <Upload className="mb-3 h-12 w-12 text-[var(--accent-gold)] animate-bounce" />
                        <p className="text-lg font-semibold text-[var(--accent-gold)]">Drop files to upload</p>
                        <p className="mt-1 text-sm text-[var(--text-muted)]">JPEG, PNG, WebP, GIF, MP4</p>
                    </div>
                )}
                {isDropUploading && (
                    <div className="absolute inset-x-0 top-0 z-[60]">
                        <div
                            className="h-1 bg-[var(--accent-gold)] transition-all duration-300"
                            style={{ width: `${dropProgress}%` }}
                        />
                    </div>
                )}
                <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-semibold">{compose.editPostId ? 'Edit Post' : 'New Post'}</h1>
                        <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                            {compose.selectedAccountIds.length} profile{compose.selectedAccountIds.length !== 1 ? 's' : ''} selected
                        </span>
                        {hasChanges && <AutoSaveBadge status="saved" />}
                        {!isOnline && (
                            <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500 border border-amber-500/20">
                                <CloudOff className="h-3 w-3" />
                                Offline
                            </span>
                        )}
                        {compose.selectedAccountIds.length > 0 && (
                            <ValidationBadge
                                context={validationContext}
                                onClick={() => setShowValidationDetails(!showValidationDetails)}
                            />
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Why: Show the existing schedule when editing a scheduled post so users
                         * can see the current time at a glance without opening the schedule modal */}
                        {compose.editPostId && compose.editPostStatus === 'scheduled' && compose.selectedDate && (
                            <span className="flex items-center gap-1.5 rounded-full bg-[var(--accent-gold)]/10 px-3 py-1 text-xs font-medium text-[var(--accent-gold)] border border-[var(--accent-gold)]/20">
                                <Clock className="h-3 w-3" />
                                {compose.selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                {' '}at {compose.scheduledTime}
                            </span>
                        )}
                        <button
                            onClick={() => compose.router.back()}
                            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </header>

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

                <div className="flex flex-1 overflow-hidden">
                    <div className="w-[180px] flex-shrink-0 border-r border-[var(--border)] overflow-hidden">
                        <ProfileSelector
                            accounts={compose.accounts}
                            selected={compose.selectedAccountIds}
                            onSelectionChange={compose.setSelectedAccountIds}
                            groupBy="organisation"
                            incompatiblePlatforms={compose.incompatiblePlatforms}
                        />
                    </div>

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

                    {compose.selectedAccounts.length > 0 && compose.activeAccount && (
                        <div className="flex-1 min-w-[440px] max-w-[560px] border-r border-[var(--border)] overflow-y-auto">
                            <CustomizationPanel
                                platforms={compose.uniquePlatforms}
                                activePlatform={compose.activeAccount.platform}
                                onActivePlatformChange={(platform) => {
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
                                selectedAccounts={compose.selectedAccounts}
                                isCarouselMode={compose.isCarouselMode}
                                isYouTubeShortMode={compose.isYouTubeShortMode}
                                onPublishBlock={handleTiktokPublishBlock}
                            />
                        </div>
                    )}

                    <div className="w-[280px] flex-shrink-0 overflow-y-auto bg-[var(--bg-secondary)]">
                        <div className="p-3">
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

                                    {compose.media.some(m => m.type === 'image') && (
                                        <div className={`mt-2 rounded-lg border p-2.5 ${resizeAlerts.length > 0
                                            ? 'border-blue-500/20 bg-blue-500/5'
                                            : 'border-[var(--border)] bg-[var(--bg-tertiary)]'
                                            }`}>
                                            {resizeAlerts.length > 0 && (
                                                <div className="flex items-start gap-2 mb-2">
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
                                            )}
                                            <div className={`flex items-center justify-between ${resizeAlerts.length > 0 ? 'border-t border-blue-500/10 pt-2' : ''
                                                }`}>
                                                <div className="flex items-center gap-1.5">
                                                    {resizeAlerts.length === 0 && (
                                                        <ImageDown className="h-3 w-3 text-[var(--text-muted)]" />
                                                    )}
                                                    <span className={`text-[10px] ${resizeAlerts.length > 0 ? 'text-blue-400/60' : 'text-[var(--text-muted)]'
                                                        }`}>
                                                        Auto-resize
                                                    </span>
                                                </div>
                                                <button
                                                    onClick={() => setAutoResizeEnabled(prev => !prev)}
                                                    className={`relative h-4 w-7 rounded-full transition-colors ${autoResizeEnabled
                                                        ? 'bg-blue-500'
                                                        : 'bg-[var(--bg-tertiary)] border border-[var(--border)]'
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

                                    <ContentPredictionCard
                                        caption={compose.activeCaption}
                                        platforms={compose.uniquePlatforms}
                                        hasMedia={compose.media.length > 0}
                                        mediaType={
                                            compose.media.length > 1 ? 'carousel' :
                                                compose.media[0]?.type === 'video' ? 'video' : 'image'
                                        }
                                        scheduledHour={compose.scheduledTime ? parseInt(compose.scheduledTime.split(':')[0], 10) : undefined}
                                        scheduledDayOfWeek={compose.scheduledDate ? new Date(compose.scheduledDate).getDay() : undefined}
                                        postType={compose.effectiveAccountSettings[compose.activeAccount.id]?.postType}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <footer className="border-t border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                    <div className="flex items-center justify-between gap-4">
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
                            <div className="relative">
                                <div className="flex">
                                    <Button
                                        onClick={compose.handleOpenScheduleModal}
                                        disabled={compose.isSubmitting || hasValidationErrors || hasTranscodingMedia || tiktokPublishBlock.blocked || (isPostPublishing && !isStuckPublishing)}
                                        className="rounded-r-none border-r border-white/20"
                                        title={
                                            hasTranscodingMedia
                                                ? 'Video is still being optimized...'
                                                : isPostPublishing && !isStuckPublishing
                                                    ? 'Post is currently publishing'
                                                    : tiktokPublishBlock.blocked
                                                        ? tiktokPublishBlock.reason || 'TikTok publishing blocked'
                                                        : hasValidationErrors
                                                            ? `Fix ${validationSummary.errors} validation error(s) first`
                                                            : 'Continue to schedule'
                                        }
                                    >
                                        {hasTranscodingMedia ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Optimizing video...
                                            </>
                                        ) : hasValidationErrors ? (
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
                                    <Button
                                        onClick={() => setShowActionMenu(!showActionMenu)}
                                        disabled={compose.isSubmitting}
                                        className="rounded-l-none px-2"
                                    >
                                        <ChevronDown className="h-4 w-4" />
                                    </Button>
                                </div>
                                {showActionMenu && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setShowActionMenu(false)}
                                        />
                                        <div className="absolute bottom-full right-0 mb-2 z-50 min-w-[200px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-xl">
                                            <button
                                                onClick={() => {
                                                    setShowActionMenu(false);
                                                    onPublishNow();
                                                }}
                                                disabled={compose.isSubmitting || hasValidationErrors || hasTranscodingMedia || tiktokPublishBlock.blocked}
                                                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {compose.isPublishing ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Send className="h-4 w-4" />
                                                )}
                                                Continue & publish now
                                            </button>
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
                                            <div className="my-1 border-t border-[var(--border)]" />
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

                <UploadModal
                    open={compose.isMediaModalOpen}
                    onOpenChange={compose.setIsMediaModalOpen}
                    folders={compose.mediaFolders}
                    defaultFolderId={null}
                    onUpload={compose.handleMediaUpload}
                />

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
