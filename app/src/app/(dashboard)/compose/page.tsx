/**
 * Compose page for creating new posts
 * 4-column layout on desktop: Profile Selector | Platform Editor | Customization Panel | Platform Preview
 * 4-step stepper on mobile: Accounts → Content → Customize → Preview
 */

'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { X, Save, Send, Loader2, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfileSelector, type SocialAccount } from '@/components/compose/profile-selector';
import { PlatformEditor, type MediaItem } from '@/components/compose/platform-editor';
import {
    CustomizationPanel,
    getDefaultPlatformSettings,
    type PlatformSettings,
} from '@/components/compose/customization-panel';
import { AICaptionGenerator } from '@/components/compose/ai-caption-generator';
import { TemplatePicker } from '@/components/compose/template-picker';
import { FirstCommentInput } from '@/components/compose/first-comment-input';
import { PlatformPreview } from '@/components/compose/platform-previews';
import { UploadModal } from '@/components/media/upload-modal';
import { SchedulingCalendarModal } from '@/components/compose/scheduling-calendar-modal';
import { TimePicker } from '@/components/compose/time-picker';
import { DatePickerButton } from '@/components/compose/mini-calendar';
import { ComposeMobile } from './compose-mobile';
import { useIsMobile } from '@/hooks/use-mobile';
import { type MediaFolder } from '@/types/media';
import { type Platform } from '@/lib/platform-config';
import { toast } from '@/components/ui/toast';
import { useCelebration } from '@/components/ui/celebration';
import { format, parseISO } from 'date-fns';
import { saveDraft, getDrafts, deleteDraft } from '@/lib/offline-queue';
import { useWorkspace } from '@/hooks/use-workspace';
import { CloudOff } from 'lucide-react';

/**
 * Per-account settings that override the base post settings
 * Why: Each account may need different captions, post types, or CTAs
 */
export interface AccountSettings extends PlatformSettings {
    accountId: string;
    captionOverride?: string;
    mediaOverride?: string[];
}

export default function ComposePage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isMobile = useIsMobile();
    const { workspace } = useWorkspace();
    const [isOnline, setIsOnline] = useState(true);

    // Account fetching state
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
    const [accountsError, setAccountsError] = useState<string | null>(null);

    // Individual submission states for per-button loading feedback
    const [isSaving, setIsSaving] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    // Edit mode state
    const editPostId = searchParams.get('edit');
    const [isLoadingEditPost, setIsLoadingEditPost] = useState(!!editPostId);
    const [editPostError, setEditPostError] = useState<string | null>(null);

    // Derived: block all actions if any is in progress
    const isSubmitting = isSaving || isScheduling || isPublishing;

    // Celebration hook for milestone confetti
    const { celebratePublish } = useCelebration();

    // Post state
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [caption, setCaption] = useState('');
    const [media, setMedia] = useState<MediaItem[]>([]);

    // Per-account settings (keyed by accountId, not platform)
    const [accountSettings, setAccountSettings] = useState<Record<string, AccountSettings>>({});

    // Active account for customization panel
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

    // AI Caption Generator modal state
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);

    // Template Picker modal state
    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);

    // First Comment state
    const [firstComment, setFirstComment] = useState('');

    // Media upload modal state
    const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
    const [mediaFolders, setMediaFolders] = useState<MediaFolder[]>([]);

    // Scheduling calendar modal state
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

    /**
     * Initialize scheduledDate from URL param if provided (from calendar click)
     * Why: Enables clicking calendar days to pre-populate the schedule date
     */
    /**
     * Initialize scheduledDate from URL param if provided (from calendar click)
     * Uses Date object for proper calendar integration
     */
    const [selectedDate, setSelectedDate] = useState<Date>(() => {
        const dateParam = searchParams.get('date');
        if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
            return parseISO(dateParam);
        }
        // Default to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    });
    const [scheduledTime, setScheduledTime] = useState<string>('09:00');

    /**
     * Derive scheduledDate string from selectedDate for API compatibility
     */
    const scheduledDate = useMemo(() => {
        if (!selectedDate) return 'tomorrow';
        return format(selectedDate, 'yyyy-MM-dd');
    }, [selectedDate]);

    /**
     * Fetch optimal posting times based on analytics
     * Why: Provides dynamic AI suggestions instead of hardcoded values
     */
    const { data: optimalTimes } = useSWR<{
        suggestions: Array<{ time: string; label: string; lift: number }>;
        dataPoints: number;
        confidence: 'high' | 'medium' | 'low';
    }>('/api/analytics/optimal-times', async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) return { suggestions: [], dataPoints: 0, confidence: 'low' as const };
        return res.json();
    }, { revalidateOnFocus: false });


    // Fetch connected social accounts
    useEffect(() => {
        async function fetchAccounts() {
            try {
                setIsLoadingAccounts(true);
                const response = await fetch('/api/accounts');
                if (!response.ok) {
                    throw new Error('Failed to fetch accounts');
                }
                const data = await response.json();

                // Transform API response to SocialAccount format
                const transformedAccounts: SocialAccount[] = data.accounts.map((account: {
                    id: string;
                    platform: string;
                    name: string;
                    username?: string;
                    avatar?: string;
                    isActive?: boolean;
                }) => ({
                    id: account.id,
                    platform: account.platform.toLowerCase() as Platform,
                    name: account.name,
                    username: account.username,
                    avatar: account.avatar,
                    isActive: account.isActive !== false,
                }));

                setAccounts(transformedAccounts);
            } catch (error) {
                console.error('Error fetching accounts:', error);
                setAccountsError(error instanceof Error ? error.message : 'Failed to load accounts');
            } finally {
                setIsLoadingAccounts(false);
            }
        }

        fetchAccounts();
    }, []);

    /**
     * Fetch media folders for the upload modal
     * Why: Allows users to organize uploads into folders from the composer
     */
    useEffect(() => {
        async function fetchFolders() {
            try {
                const response = await fetch('/api/media/folders');
                if (response.ok) {
                    const data = await response.json();
                    setMediaFolders(data.folders || []);
                }
            } catch (error) {
                console.error('Error fetching folders:', error);
            }
        }
        fetchFolders();
    }, []);

    /**
     * Load existing post data when in edit mode
     * Why: Enables editing posts from calendar by pre-populating all form fields
     */
    useEffect(() => {
        if (!editPostId || accounts.length === 0) return;

        async function loadEditPost() {
            try {
                setIsLoadingEditPost(true);
                setEditPostError(null);

                const response = await fetch(`/api/posts/${editPostId}`);
                if (!response.ok) {
                    throw new Error('Failed to load post');
                }

                const post = await response.json();

                // Populate form state with existing post data
                setCaption(post.caption || '');
                setFirstComment(post.firstComment || '');

                // Set selected account IDs
                if (post.platformAccountIds && Array.isArray(post.platformAccountIds)) {
                    setSelectedAccountIds(post.platformAccountIds);
                }

                // Set media items
                if (post.media && Array.isArray(post.media)) {
                    setMedia(post.media.map((m: { id: string; url: string; thumbnailUrl?: string; type?: string }) => ({
                        id: m.id,
                        url: m.url,
                        thumbnailUrl: m.thumbnailUrl,
                        type: m.type === 'video' ? 'video' : 'image',
                    })));
                }

                // Set scheduled date and time
                if (post.scheduledAt) {
                    const scheduledDate = new Date(post.scheduledAt);
                    setSelectedDate(scheduledDate);
                    setScheduledTime(format(scheduledDate, 'HH:mm'));
                }

                // Set per-account settings
                if (post.platforms && Array.isArray(post.platforms)) {
                    const newAccountSettings: Record<string, AccountSettings> = {};
                    for (const platform of post.platforms) {
                        const account = accounts.find(a => a.id === platform.accountId);
                        if (account) {
                            newAccountSettings[platform.accountId] = {
                                ...getDefaultPlatformSettings(account.platform),
                                accountId: platform.accountId,
                                postType: platform.postType || 'feed',
                                callToAction: platform.callToAction || '',
                                captionOverride: platform.captionOverride || undefined,
                                mediaOverride: platform.customMediaIds || undefined,
                            };
                        }
                    }
                    setAccountSettings(newAccountSettings);
                }

                toast('success', 'Post loaded for editing');
            } catch (error) {
                console.error('Error loading post for edit:', error);
                setEditPostError(error instanceof Error ? error.message : 'Failed to load post');
                toast('error', 'Failed to load post for editing');
            } finally {
                setIsLoadingEditPost(false);
            }
        }

        loadEditPost();
    }, [editPostId, accounts]);

    // Derived state
    const selectedAccounts = useMemo(() => {
        return accounts.filter((account) => selectedAccountIds.includes(account.id));
    }, [accounts, selectedAccountIds]);

    const uniquePlatforms = useMemo((): Platform[] => {
        const platforms = new Set<Platform>();
        selectedAccounts.forEach((account) => platforms.add(account.platform));
        return Array.from(platforms);
    }, [selectedAccounts]);

    // Get active account (for customization panel)
    const activeAccount = useMemo(() => {
        if (!activeAccountId) return selectedAccounts[0] || null;
        return selectedAccounts.find((a) => a.id === activeAccountId) || selectedAccounts[0] || null;
    }, [activeAccountId, selectedAccounts]);

    // Ensure all selected accounts have settings
    const effectiveAccountSettings = useMemo(() => {
        const settings = { ...accountSettings };
        selectedAccounts.forEach((account) => {
            if (!settings[account.id]) {
                settings[account.id] = {
                    ...getDefaultPlatformSettings(account.platform),
                    accountId: account.id,
                };
            }
        });
        return settings;
    }, [accountSettings, selectedAccounts]);

    // Convert account settings to platform settings for CustomizationPanel compatibility
    const activePlatformSettings = useMemo((): Record<Platform, PlatformSettings> => {
        const result: Record<Platform, PlatformSettings> = {} as Record<Platform, PlatformSettings>;
        if (activeAccount) {
            const settings = effectiveAccountSettings[activeAccount.id];
            if (settings) {
                result[activeAccount.platform] = settings;
            }
        }
        return result;
    }, [activeAccount, effectiveAccountSettings]);

    // Handlers
    const handleAccountSettingsChange = useCallback(
        (accountId: string, updates: Partial<AccountSettings>) => {
            setAccountSettings((prev) => {
                const account = accounts.find((a) => a.id === accountId);
                const platform = account?.platform || 'instagram';
                return {
                    ...prev,
                    [accountId]: {
                        ...(prev[accountId] || { ...getDefaultPlatformSettings(platform), accountId }),
                        ...updates,
                    },
                };
            });
        },
        [accounts]
    );

    // Wrapper for CustomizationPanel that works with platform-based interface
    const handlePlatformSettingsChange = useCallback(
        (_platform: Platform, updates: Partial<PlatformSettings>) => {
            if (activeAccount) {
                handleAccountSettingsChange(activeAccount.id, updates);
            }
        },
        [activeAccount, handleAccountSettingsChange]
    );

    // Handle active account change via platform tabs
    const handleActivePlatformChange = useCallback(
        (platform: Platform) => {
            // Find first selected account with this platform
            const account = selectedAccounts.find((a) => a.platform === platform);
            if (account) {
                setActiveAccountId(account.id);
            }
        },
        [selectedAccounts]
    );

    const handleAIAssist = useCallback(() => {
        setIsAIModalOpen(true);
    }, []);

    /**
     * Handle caption selection from AI generator
     * Why: Updates the main caption and closes the modal
     */
    const handleAICaptionSelect = useCallback((newCaption: string, _hashtags: string[]) => {
        setCaption(newCaption);
        setIsAIModalOpen(false);
    }, []);

    /**
     * Handle template selection
     * Why: Replaces caption with selected template content
     */
    const handleTemplateSelect = useCallback((templateCaption: string, _hashtags: string[]) => {
        setCaption(templateCaption);
    }, []);

    /**
     * Open template picker
     */
    const handleOpenTemplates = useCallback(() => {
        setIsTemplatePickerOpen(true);
    }, []);

    /**
     * Open the media upload modal
     * Why: Allows users to upload media from the composer
     */
    const handleAddMedia = useCallback(() => {
        setIsMediaModalOpen(true);
    }, []);

    /**
     * Handle successful media upload
     * Why: Receives uploaded media directly from the modal callback
     */
    const handleMediaUpload = useCallback(async (uploadedMedia: Array<{
        id: string;
        url: string;
        thumbnailUrl?: string;
        type: 'image' | 'video' | 'audio';
        size: number;
    }>) => {
        // Convert uploaded media to MediaItem format and add to post
        const newItems: MediaItem[] = uploadedMedia
            .filter((m) => m.type === 'image' || m.type === 'video')
            .map((m) => ({
                id: m.id,
                url: m.url,
                thumbnailUrl: m.thumbnailUrl,
                type: m.type as 'image' | 'video',
                size: m.size,
            }));

        if (newItems.length > 0) {
            setMedia((prev) => [...prev, ...newItems]);
        }
    }, []);

    /**
     * Build the API payload for creating a post
     */
    const buildPostPayload = useCallback((options: { scheduledAt?: string | null; autoPublish?: boolean }) => {
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
            scheduledAt: options.scheduledAt,
            firstComment: firstComment || undefined,
            platformSettings,
            autoPublish: options.autoPublish,
        };
    }, [caption, selectedAccountIds, media, firstComment, effectiveAccountSettings]);

    const handleSaveDraft = useCallback(async () => {
        if (!caption.trim() || selectedAccountIds.length === 0) {
            toast('error', 'Missing content', 'Add a caption and select at least one account.');
            return;
        }

        setIsSaving(true);
        try {
            const payload = buildPostPayload({ scheduledAt: null });
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
            if (workspace?.id) {
                await deleteDraft(`draft-${workspace.id}`);
            }

            toast('success', 'Draft saved', 'Your post has been saved as a draft.');
            router.push('/calendar');
        } catch (error) {
            toast('error', 'Save failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsSaving(false);
        }
    }, [caption, selectedAccountIds, buildPostPayload, router]);

    /**
     * Open the scheduling calendar modal
     * Why: Validates content before showing the calendar modal
     */
    const handleOpenScheduleModal = useCallback(() => {
        if (!caption.trim() || selectedAccountIds.length === 0) {
            toast('error', 'Missing content', 'Add a caption and select at least one account.');
            return;
        }
        setIsScheduleModalOpen(true);
    }, [caption, selectedAccountIds]);

    /**
     * Handle schedule confirmation from the calendar modal
     * Why: Receives the selected date/time and creates the scheduled post
     * Supports both unified scheduling (all same time) and per-platform scheduling
     */
    const handleScheduleConfirm = useCallback(async (
        schedules: Record<string, { date: string; time: string }> | null,
        unifiedDate: string,
        unifiedTime: string
    ) => {
        setIsScheduleModalOpen(false);
        setIsScheduling(true);

        try {
            /**
             * Parse date string to local Date object
             * Why: Explicit parsing avoids UTC vs local timezone issues
             */
            const parseDateTimeLocal = (date: string, time: string): Date => {
                const [year, month, day] = date.split('-').map(Number);
                const [hours, minutes] = time.split(':').map(Number);
                return new Date(year, month - 1, day, hours, minutes, 0, 0);
            };

            if (schedules === null) {
                // Unified scheduling: all platforms get the same time
                const scheduledDate = parseDateTimeLocal(unifiedDate, unifiedTime);
                const scheduledAt = scheduledDate.toISOString();

                const payload = buildPostPayload({ scheduledAt });
                const response = await fetch('/api/posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to schedule post');
                }

                // Clear the local cache draft since it's now scheduled
                if (workspace?.id) {
                    await deleteDraft(`draft-${workspace.id}`);
                }

                toast('success', 'Post scheduled', `Your post will be published at the scheduled time.`);
            } else {
                // Per-platform scheduling: each account gets individual time
                // Create separate posts for each account with their respective scheduled times
                const results = await Promise.allSettled(
                    selectedAccountIds.map(async (accountId) => {
                        const schedule = schedules[accountId];
                        if (!schedule) return;

                        const scheduledDate = parseDateTimeLocal(schedule.date, schedule.time);
                        const scheduledAt = scheduledDate.toISOString();

                        // Build payload for single account
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
                    // Clear the local cache draft since all posts are scheduled
                    if (workspace?.id) {
                        await deleteDraft(`draft-${workspace.id}`);
                    }
                    toast('success', 'Posts scheduled', `${results.length} posts scheduled with individual times.`);
                }
            }

            router.push('/calendar');
        } catch (error) {
            toast('error', 'Schedule failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsScheduling(false);
        }
    }, [buildPostPayload, router, selectedAccountIds, caption, media, firstComment, effectiveAccountSettings]);

    const handlePublishNow = useCallback(async () => {
        if (!caption.trim() || selectedAccountIds.length === 0) {
            toast('error', 'Missing content', 'Add a caption and select at least one account.');
            return;
        }

        setIsPublishing(true);
        try {
            const payload = buildPostPayload({ autoPublish: true });
            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to publish');
            }

            // Clear the local cache draft since it's now published
            if (workspace?.id) {
                await deleteDraft(`draft-${workspace.id}`);
            }

            toast('success', 'Publishing', 'Your post is being published to selected platforms.');
            celebratePublish();
            router.push('/calendar');
        } catch (error) {
            toast('error', 'Publish failed', error instanceof Error ? error.message : 'Unknown error');
        } finally {
            setIsPublishing(false);
        }
    }, [caption, selectedAccountIds, buildPostPayload, router, celebratePublish]);

    /**
     * Discard the current draft
     * Why: Allows users to clear all form state and remove the cached draft
     */
    const handleDiscardDraft = useCallback(async () => {
        // Clear local IndexedDB draft if exists
        if (workspace?.id) {
            try {
                await deleteDraft(`draft-${workspace.id}`);
            } catch (error) {
                console.error('Error deleting draft:', error);
            }
        }

        // Reset all form state
        setCaption('');
        setMedia([]);
        setSelectedAccountIds([]);
        setFirstComment('');
        setAccountSettings({});
        setActiveAccountId(null);

        toast('info', 'Draft discarded', 'Your draft has been cleared.');
    }, [workspace?.id]);

    // Get caption for active account (use override if set)
    const activeCaption = useMemo(() => {
        if (activeAccount) {
            const settings = effectiveAccountSettings[activeAccount.id];
            return settings?.captionOverride || caption;
        }
        return caption;
    }, [activeAccount, effectiveAccountSettings, caption]);

    /**
     * Offline Support
     * Auto-save drafts locally and restore them
     */

    // Monitor online status
    useEffect(() => {
        if (typeof window === 'undefined') return;
        setIsOnline(navigator.onLine);
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Load draft from cache on mount (if not editing an existing post)
    useEffect(() => {
        if (editPostId || !workspace?.id) return;

        async function loadCachedDraft() {
            try {
                const drafts = await getDrafts(workspace!.id);
                // Get most recent draft
                const recentDraft = drafts.sort((a, b) => new Date(b.lastSavedAt).getTime() - new Date(a.lastSavedAt).getTime())[0];

                if (recentDraft) {
                    // Only restore if it's less than 24 hours old
                    const draftAge = Date.now() - new Date(recentDraft.lastSavedAt).getTime();
                    if (draftAge < 24 * 60 * 60 * 1000) {
                        setCaption(recentDraft.caption);
                        if (recentDraft.platformAccountIds) setSelectedAccountIds(recentDraft.platformAccountIds);
                        // Restoring media would require storing blob refs or base64, leaving for now as urls might expire
                        // But if mediaIds are stored, we assume they are already uploaded

                        toast('info', 'Draft restored', 'Your previous draft has been loaded.');
                    }
                }
            } catch (error) {
                console.error('Error loading draft:', error);
            }
        }

        loadCachedDraft();
    }, [editPostId, workspace?.id]);

    // Auto-save draft to cache
    useEffect(() => {
        if (!workspace?.id || !caption) return;

        const saveTimer = setTimeout(async () => {
            try {
                const draftId = `draft-${workspace.id}`;
                await saveDraft({
                    id: draftId,
                    workspaceId: workspace.id,
                    caption,
                    mediaIds: media.map(m => m.id),
                    platformAccountIds: selectedAccountIds,
                    scheduledAt: selectedDate ? scheduledDate : undefined,
                });
            } catch (error) {
                console.error('Error auto-saving draft:', error);
            }
        }, 1000); // Debounce 1s

        return () => clearTimeout(saveTimer);
    }, [workspace?.id, caption, media, selectedAccountIds, scheduledDate, selectedDate]);

    if (isLoadingAccounts) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
                    <span className="text-sm text-[var(--text-muted)]">Loading accounts...</span>
                </div>
            </div>
        );
    }

    if (accountsError) {
        return (
            <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="text-red-500">Failed to load accounts</div>
                    <p className="text-sm text-[var(--text-muted)]">{accountsError}</p>
                    <Button onClick={() => window.location.reload()}>Retry</Button>
                </div>
            </div>
        );
    }

    // Render mobile stepper layout on small screens
    if (isMobile) {
        return (
            <>
                <ComposeMobile
                    accounts={accounts}
                    selectedAccountIds={selectedAccountIds}
                    onAccountToggle={(accountId) => {
                        setSelectedAccountIds(prev =>
                            prev.includes(accountId)
                                ? prev.filter(id => id !== accountId)
                                : [...prev, accountId]
                        );
                    }}
                    isLoadingAccounts={isLoadingAccounts}
                    caption={caption}
                    onCaptionChange={setCaption}
                    media={media}
                    onAddMedia={handleAddMedia}
                    selectedDate={selectedDate}
                    selectedTime={scheduledTime}
                    onOpenScheduleModal={() => setIsScheduleModalOpen(true)}
                    onSave={handleSaveDraft}
                    onSchedule={() => setIsScheduleModalOpen(true)}
                    onPublish={handlePublishNow}
                    onDiscardDraft={handleDiscardDraft}
                    isSaving={isSaving}
                    isScheduling={isScheduling}
                    isPublishing={isPublishing}
                    onAIAssist={handleAIAssist}
                    onOpenTemplates={handleOpenTemplates}
                    uniquePlatforms={uniquePlatforms}
                />
                {/* Modals remain the same for mobile */}
                <UploadModal
                    open={isMediaModalOpen}
                    onOpenChange={setIsMediaModalOpen}
                    folders={mediaFolders}
                    defaultFolderId={null}
                    onUpload={handleMediaUpload}
                />
                {/* AI Caption Generator Modal Wrapper for Mobile */}
                {isAIModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => setIsAIModalOpen(false)}>
                        <div
                            className="w-full max-w-lg rounded-t-2xl bg-[var(--bg-primary)] p-4 max-h-[80vh] overflow-auto"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold">AI Caption Assistant</h2>
                                <button onClick={() => setIsAIModalOpen(false)} className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                            <AICaptionGenerator
                                onSelect={handleAICaptionSelect}
                                platform={uniquePlatforms[0] || 'instagram'}
                                currentDraft={caption}
                            />
                        </div>
                    </div>
                )}
                <TemplatePicker
                    isOpen={isTemplatePickerOpen}
                    onClose={() => setIsTemplatePickerOpen(false)}
                    onSelect={handleTemplateSelect}
                    currentCaption={caption}
                />
                <SchedulingCalendarModal
                    isOpen={isScheduleModalOpen}
                    onClose={() => setIsScheduleModalOpen(false)}
                    selectedAccounts={selectedAccounts}
                    scheduledDate={scheduledDate}
                    scheduledTime={scheduledTime}
                    onSchedule={handleScheduleConfirm}
                />
            </>
        );
    }

    return (
        <div className="flex h-screen flex-col bg-[var(--bg-primary)]">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-6 py-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-lg font-semibold">New Post</h1>
                    <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                        {selectedAccountIds.length} profile{selectedAccountIds.length !== 1 ? 's' : ''} selected
                    </span>
                    {!isOnline && (
                        <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500 border border-amber-500/20">
                            <CloudOff className="h-3 w-3" />
                            Offline
                        </span>
                    )}
                </div>
                <button
                    onClick={() => router.push('/calendar')}
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
                        accounts={accounts}
                        selected={selectedAccountIds}
                        onSelectionChange={setSelectedAccountIds}
                        groupBy="platform"
                    />
                </div>

                {/* Center - Platform Editor */}
                <div className="flex-1 overflow-hidden border-r border-[var(--border)]">
                    <div className="flex h-full flex-col">
                        <div className="flex-1 overflow-hidden">
                            <PlatformEditor
                                caption={caption}
                                onCaptionChange={setCaption}
                                selectedPlatforms={uniquePlatforms}
                                media={media}
                                onMediaChange={setMedia}
                                onAIAssist={handleAIAssist}
                                onAddMedia={handleAddMedia}
                                onOpenTemplates={handleOpenTemplates}
                            />
                        </div>
                        {/* First Comment Input */}
                        {uniquePlatforms.length > 0 && (
                            <div className="border-t border-[var(--border)] p-4">
                                <FirstCommentInput
                                    value={firstComment}
                                    onChange={setFirstComment}
                                    platform={uniquePlatforms[0]}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Right - Customization Panel */}
                <div className="w-[300px] flex-shrink-0 overflow-hidden border-r border-[var(--border)]">
                    {selectedAccounts.length > 0 && activeAccount ? (
                        <CustomizationPanel
                            platforms={uniquePlatforms}
                            activePlatform={activeAccount.platform}
                            onActivePlatformChange={handleActivePlatformChange}
                            settings={activePlatformSettings}
                            onSettingsChange={handlePlatformSettingsChange}
                            caption={activeCaption}
                            media={media}
                            onAddMedia={handleAddMedia}
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
                    {selectedAccounts.length > 0 && activeAccount ? (
                        <div className="p-4">
                            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                Preview
                            </h4>
                            <PlatformPreview
                                platform={activeAccount.platform}
                                postType={effectiveAccountSettings[activeAccount.id]?.postType || 'feed'}
                                caption={activeCaption}
                                media={media}
                                accountName={activeAccount.name}
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
                <div className="flex items-center justify-between gap-4">
                    {/* Date & Time Pickers */}
                    <div className="flex items-center gap-4">
                        <DatePickerButton
                            value={selectedDate}
                            onChange={setSelectedDate}
                        />
                        <TimePicker
                            value={scheduledTime}
                            onChange={setScheduledTime}
                            suggestedTime={optimalTimes?.suggestions?.[0]?.time}
                            suggestedLift={optimalTimes?.suggestions?.[0]?.lift}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3">
                        <Button
                            variant="secondary"
                            onClick={handleDiscardDraft}
                            disabled={isSubmitting || (!caption && media.length === 0 && selectedAccountIds.length === 0)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Discard
                        </Button>
                        <Button variant="secondary" onClick={handleSaveDraft} isLoading={isSaving} disabled={isSubmitting}>
                            {!isSaving && <Save className="mr-2 h-4 w-4" />}
                            Save Draft
                        </Button>
                        <Button variant="secondary" onClick={handleOpenScheduleModal} disabled={isSubmitting}>
                            <Clock className="mr-2 h-4 w-4" />
                            Schedule
                        </Button>
                        <Button onClick={handlePublishNow} isLoading={isPublishing} disabled={isSubmitting}>
                            {!isPublishing && <Send className="mr-2 h-4 w-4" />}
                            Publish Now
                        </Button>
                    </div>
                </div>
            </footer>

            {/* AI Caption Generator Modal */}
            {isAIModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-[var(--bg-secondary)] shadow-2xl">
                        {/* Close Button */}
                        <button
                            onClick={() => setIsAIModalOpen(false)}
                            className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        <AICaptionGenerator
                            onSelect={handleAICaptionSelect}
                            platform={uniquePlatforms[0] || 'instagram'}
                            currentDraft={caption}
                        />
                    </div>
                </div>
            )}

            {/* Media Upload Modal */}
            <UploadModal
                open={isMediaModalOpen}
                onOpenChange={setIsMediaModalOpen}
                folders={mediaFolders}
                defaultFolderId={null}
                onUpload={handleMediaUpload}
            />

            {/* Template Picker Modal */}
            <TemplatePicker
                isOpen={isTemplatePickerOpen}
                onClose={() => setIsTemplatePickerOpen(false)}
                onSelect={handleTemplateSelect}
                currentCaption={caption}
            />

            {/* Scheduling Calendar Modal */}
            <SchedulingCalendarModal
                isOpen={isScheduleModalOpen}
                onClose={() => setIsScheduleModalOpen(false)}
                selectedAccounts={selectedAccounts}
                scheduledDate={scheduledDate}
                scheduledTime={scheduledTime}
                onSchedule={handleScheduleConfirm}
            />
        </div>
    );
}
