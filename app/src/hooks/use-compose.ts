/**
 * useCompose Hook - Centralized state management for post composer
 * Extracted from compose/page.tsx to reduce file size and improve maintainability
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { type MediaItem } from '@/components/compose/platform-editor';
import { type SocialAccount } from '@/components/compose/profile-selector';
import {
    getDefaultPlatformSettings,
    type PlatformSettings,
} from '@/components/compose/customization-panel';
import { sortPlatformsByOrder, type Platform } from '@/lib/platform-config';
import { toast } from '@/components/ui/toast';
import { useOrganization } from '@/hooks/use-organization';
import { showErrorToast } from '@/lib/api-error';
import { useComposerPreferencesStore } from '@/lib/stores/composer-preferences-store';
import { useComposeAccounts, useComposeFolders, useOptimalTimes } from '@/hooks/use-compose-data';
import { useComposeMedia } from '@/hooks/use-compose-media';

/**
 * Per-account settings that override the base post settings
 * Why: Each account may need different captions, post types, or CTAs
 */
export interface AccountSettings extends PlatformSettings {
    accountId: string;
    captionOverride?: string;
    firstCommentOverride?: string;
    mediaOverride?: string[];
}

/**
 * useCompose - Main hook for composer state management
 * Why: Centralizes all state, derived values, and basic handlers for the compose page
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCompose(initialPostData?: any | null) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { organization } = useOrganization();
    const editPostId = searchParams.get('edit');

    // --- Data queries (delegated to sub-hook) ---
    const { accounts, isLoadingAccounts, accountsError } = useComposeAccounts();
    const { mediaFolders } = useComposeFolders();
    const { optimalTimes } = useOptimalTimes();

    // --- Edit-post loading state ---
    const [isLoadingEditPost, setIsLoadingEditPost] = useState(false);
    const [editPostError, setEditPostError] = useState<string | null>(null);
    const [editPostStatus, setEditPostStatus] = useState<string | null>(null);
    const [editPostUpdatedAt, setEditPostUpdatedAt] = useState<Date | null>(null);

    // --- Submission states ---
    const [isSaving, setIsSaving] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);
    const [isAIRewriting, setIsAIRewriting] = useState(false);
    const isSubmitting = isSaving || isScheduling || isPublishing || isRetrying;

    // --- Post content state ---
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [caption, setCaption] = useState('');
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [firstComment, setFirstComment] = useState('');
    const [accountSettings, setAccountSettings] = useState<Record<string, AccountSettings>>({});
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

    // --- Modal states ---
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

    // --- Scheduling state ---
    const [selectedDate, setSelectedDate] = useState<Date>(() => {
        const dateParam = searchParams.get('date');
        if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
            return parseISO(dateParam);
        }
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
    });
    const [scheduledTime, setScheduledTime] = useState<string>('09:00');
    const scheduledDate = useMemo(() => {
        if (!selectedDate) return 'tomorrow';
        return format(selectedDate, 'yyyy-MM-dd');
    }, [selectedDate]);

    // --- Derived state ---
    const selectedAccounts = useMemo(
        () => accounts.filter((account) => selectedAccountIds.includes(account.id)),
        [accounts, selectedAccountIds],
    );

    const uniquePlatforms = useMemo((): Platform[] => {
        const platforms = new Set<Platform>();
        selectedAccounts.forEach((account) => platforms.add(account.platform));
        return sortPlatformsByOrder(Array.from(platforms));
    }, [selectedAccounts]);

    const activeAccount = useMemo(() => {
        if (!activeAccountId) return selectedAccounts[0] || null;
        return selectedAccounts.find((a) => a.id === activeAccountId) || selectedAccounts[0] || null;
    }, [activeAccountId, selectedAccounts]);

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

    const activePlatformSettings = useMemo((): Record<Platform, PlatformSettings> => {
        const result: Record<Platform, PlatformSettings> = {} as Record<Platform, PlatformSettings>;
        uniquePlatforms.forEach((platform) => {
            const accountForPlatform = selectedAccounts.find((a) => a.platform === platform);
            if (accountForPlatform) {
                const settings = effectiveAccountSettings[accountForPlatform.id];
                if (settings) result[platform] = settings;
            }
        });
        return result;
    }, [uniquePlatforms, selectedAccounts, effectiveAccountSettings]);

    const activeCaption = useMemo(() => {
        if (activeAccount) {
            const settings = effectiveAccountSettings[activeAccount.id];
            return settings?.captionOverride || caption;
        }
        return caption;
    }, [activeAccount, effectiveAccountSettings, caption]);

    const platformCaptions = useMemo((): Partial<Record<Platform, string>> => {
        const result: Partial<Record<Platform, string>> = {};
        uniquePlatforms.forEach((platform) => {
            const accountForPlatform = selectedAccounts.find((a) => a.platform === platform);
            if (accountForPlatform) {
                const settings = effectiveAccountSettings[accountForPlatform.id];
                if (settings?.captionOverride) result[platform] = settings.captionOverride;
            }
        });
        return result;
    }, [uniquePlatforms, selectedAccounts, effectiveAccountSettings]);

    const platformFirstComments = useMemo((): Partial<Record<Platform, string>> => {
        const result: Partial<Record<Platform, string>> = {};
        uniquePlatforms.forEach((platform) => {
            const accountForPlatform = selectedAccounts.find((a) => a.platform === platform);
            if (accountForPlatform) {
                const settings = effectiveAccountSettings[accountForPlatform.id];
                if (settings?.firstCommentOverride) result[platform] = settings.firstCommentOverride;
            }
        });
        return result;
    }, [uniquePlatforms, selectedAccounts, effectiveAccountSettings]);

    // --- Media sub-hook (carousel, YouTube shorts, upload) ---
    const {
        isCarouselMode,
        incompatiblePlatforms,
        isYouTubeShortMode,
        isMediaModalOpen,
        setIsMediaModalOpen,
        handleMediaUpload,
        handleAddMedia,
    } = useComposeMedia({
        accounts,
        selectedAccountIds,
        setSelectedAccountIds,
        media,
        setMedia,
        setAccountSettings,
        selectedAccounts,
    });

    // --- Load existing post data when in edit mode ---
    /** Why: Ref prevents the effect from re-running (and overwriting user edits)
     *  when accounts refetches and returns a new array reference. */
    const editPostLoadedRef = useRef(false);
    useEffect(() => {
        if (!editPostId || accounts.length === 0) return;
        if (editPostLoadedRef.current) return;

        // Why: If the server provided the data, don't fetch again client-side
        async function loadEditPost() {
            try {
                let post = initialPostData;

                if (!post || post.id !== editPostId) {
                    setIsLoadingEditPost(true);
                    setEditPostError(null);

                    const response = await fetch(`/api/posts/${editPostId}`);
                    if (!response.ok) throw new Error('Failed to load post');
                    post = await response.json();
                }

                editPostLoadedRef.current = true;

                setEditPostStatus(post.status);
                setEditPostUpdatedAt(post.updatedAt ? new Date(post.updatedAt) : null);
                setCaption(post.caption || '');
                setFirstComment(post.firstComment || '');

                if (post.platformAccountIds && Array.isArray(post.platformAccountIds)) {
                    setSelectedAccountIds(post.platformAccountIds);
                }

                if (post.media && Array.isArray(post.media)) {
                    setMedia(post.media.map((m: { id: string; url: string; thumbnailUrl?: string; type?: string; size?: number }) => ({
                        id: m.id,
                        url: m.url,
                        thumbnailUrl: m.thumbnailUrl,
                        type: m.type === 'video' ? 'video' : 'image',
                        size: m.size || 0,
                    })));
                }

                if (post.scheduledAt) {
                    const scheduledDate = new Date(post.scheduledAt);
                    setSelectedDate(scheduledDate);
                    setScheduledTime(format(scheduledDate, 'HH:mm'));
                }

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
                                mediaOverride: platform.customMediaIds?.length ? platform.customMediaIds : undefined,
                                /**
                                 * Why: All per-platform fields must be restored into
                                 * accountSettings so they round-trip through edit mode.
                                 */
                                firstCommentOverride: platform.firstComment || undefined,
                                autoPublish: platform.autoPublish ?? true,
                                location: platform.location || undefined,
                                // Pinterest
                                pinTitle: platform.pinTitle || undefined,
                                pinLink: platform.pinLink || undefined,
                                boardId: platform.boardId || undefined,
                                // YouTube
                                videoTitle: platform.videoTitle || undefined,
                                category: platform.youtubeCategory || undefined,
                                playlist: platform.youtubePlaylist || undefined,
                                videoTags: platform.videoTags?.length ? platform.videoTags : undefined,
                                privacy: platform.youtubePrivacy || undefined,
                                createFirstLike: platform.createFirstLike ?? undefined,
                                embeddable: platform.embeddable ?? undefined,
                                notifySubscribers: platform.notifySubscribers ?? undefined,
                                madeForKids: platform.madeForKids ?? undefined,
                                // TikTok
                                tiktokPrivacyLevel: platform.tiktokPrivacyLevel ?? undefined,
                                tiktokContentDisclosure: platform.tiktokContentDisclosure ?? undefined,
                                tiktokBrandOrganicToggle: platform.tiktokBrandOrganic ?? undefined,
                                tiktokBrandContentToggle: platform.tiktokBrandContent ?? undefined,
                                tiktokIsAigc: platform.tiktokIsAigc ?? undefined,
                                tiktokCommentsEnabled: platform.tiktokComments ?? undefined,
                                tiktokDuetsEnabled: platform.tiktokDuets ?? undefined,
                                tiktokStitchesEnabled: platform.tiktokStitches ?? undefined,
                                // Instagram
                                instagramShareToFeed: platform.instagramShareToFeed ?? undefined,
                                instagramComments: platform.instagramComments ?? undefined,
                            };
                        }
                    }
                    setAccountSettings(newAccountSettings);
                }

                toast('success', 'Post loaded for editing');
            } catch (error) {
                showErrorToast(error, 'Error loading post for edit');
                setEditPostError(error instanceof Error ? error.message : 'Failed to load post');
                toast('error', 'Failed to load post for editing');
            } finally {
                setIsLoadingEditPost(false);
            }
        }

        loadEditPost();
    }, [editPostId, accounts]);

    // --- Auto-select accounts for new posts ---
    useEffect(() => {
        if (editPostId || isLoadingAccounts || accounts.length === 0) return;
        if (selectedAccountIds.length > 0) return;

        const platformsParam = searchParams.get('platforms');
        if (platformsParam) {
            const filteredPlatforms = platformsParam.split(',').map(p => p.trim().toLowerCase());
            const matchingIds = accounts.filter(a => filteredPlatforms.includes(a.platform)).map(a => a.id);
            if (matchingIds.length > 0) { setSelectedAccountIds(matchingIds); return; }
        }

        const { lastSelectedAccountIds } = useComposerPreferencesStore.getState();
        if (lastSelectedAccountIds.length > 0) {
            const validIds = lastSelectedAccountIds.filter(id => accounts.some(a => a.id === id));
            if (validIds.length > 0) setSelectedAccountIds(validIds);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editPostId, isLoadingAccounts, accounts]);

    // Why: Share Target pre-fill is handled by use-compose-orchestration.ts
    // which has a proper guard (!compose.caption). Removed duplicate here.

    // --- Account settings handlers ---
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
        [accounts],
    );

    const handlePlatformSettingsChange = useCallback(
        (_platform: Platform, updates: Partial<PlatformSettings>) => {
            if (activeAccount) handleAccountSettingsChange(activeAccount.id, updates);
        },
        [activeAccount, handleAccountSettingsChange],
    );

    const handlePlatformCaptionChange = useCallback(
        (platform: Platform, newCaption: string) => {
            const accountForPlatform = selectedAccounts.find((a) => a.platform === platform);
            if (accountForPlatform) handleAccountSettingsChange(accountForPlatform.id, { captionOverride: newCaption });
        },
        [selectedAccounts, handleAccountSettingsChange],
    );

    const handlePlatformFirstCommentChange = useCallback(
        (platform: Platform, newFirstComment: string) => {
            const accountForPlatform = selectedAccounts.find((a) => a.platform === platform);
            if (accountForPlatform) handleAccountSettingsChange(accountForPlatform.id, { firstCommentOverride: newFirstComment });
        },
        [selectedAccounts, handleAccountSettingsChange],
    );

    const handleActivePlatformChange = useCallback(
        (platform: Platform) => {
            const account = selectedAccounts.find((a) => a.platform === platform);
            if (account) setActiveAccountId(account.id);
        },
        [selectedAccounts],
    );

    // --- AI handlers ---
    const handleAIAssist = useCallback(async (activePlatform?: Platform | null) => {
        const isAllTab = !activePlatform;
        const targetPlatform = activePlatform || uniquePlatforms[0] || 'instagram';
        const displayedCaption = isAllTab ? caption : platformCaptions[activePlatform] ?? caption;

        if (!displayedCaption.trim()) {
            toast('warning', 'Add a caption first', 'Type something to rewrite.');
            return;
        }
        if (isAIRewriting) return;

        setIsAIRewriting(true);
        try {
            const mediaContext = {
                hasVideo: media.some(m => m.type === 'video'),
                hasImage: media.some(m => m.type === 'image'),
                mediaCount: media.length,
            };

            const response = await fetch('/api/ai/rewrite-caption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caption: displayedCaption, platform: targetPlatform, mediaContext }),
            });

            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.error || 'Failed to rewrite caption');

            if (isAllTab) {
                setCaption(result.data.caption);
            } else {
                handlePlatformCaptionChange(activePlatform!, result.data.caption);
            }
            toast('success', 'Caption enhanced', `Caption rewritten for ${isAllTab ? 'all platforms' : targetPlatform}.`);
        } catch (error) {
            showErrorToast(error, '[AI Rewrite] Error');
            toast('error', 'Rewrite failed', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setIsAIRewriting(false);
        }
    }, [caption, platformCaptions, uniquePlatforms, media, isAIRewriting, handlePlatformCaptionChange]);

    const handleAICaptionSelect = useCallback((newCaption: string, _hashtags: string[]) => {
        setCaption(newCaption);
        setIsAIModalOpen(false);
    }, []);

    const handleTemplateSelect = useCallback((templateCaption: string, _hashtags: string[]) => {
        setCaption(templateCaption);
    }, []);

    const handleOpenTemplates = useCallback(() => { setIsTemplatePickerOpen(true); }, []);

    const handleOpenScheduleModal = useCallback(() => {
        if (selectedAccountIds.length === 0) {
            toast('error', 'Missing content', 'Select at least one account.');
            return;
        }
        const allAccountsAreStories = selectedAccountIds.every((accountId) => {
            const settings = effectiveAccountSettings[accountId];
            return settings?.postType?.toLowerCase() === 'story';
        });
        const allNonStoriesHaveCaptions = selectedAccountIds
            .filter(id => effectiveAccountSettings[id]?.postType?.toLowerCase() !== 'story')
            .every(id => effectiveAccountSettings[id]?.captionOverride?.trim());

        if (!allAccountsAreStories && !caption.trim() && !allNonStoriesHaveCaptions) {
            toast('error', 'Missing content', 'Add a caption (required for non-story posts).');
            return;
        }
        setIsScheduleModalOpen(true);
    }, [caption, selectedAccountIds, effectiveAccountSettings]);

    const resetForm = useCallback(() => {
        setCaption('');
        setMedia([]);
        setSelectedAccountIds([]);
        setFirstComment('');
        setAccountSettings({});
        setActiveAccountId(null);
    }, []);

    /** Retry publishing a failed or stuck post */
    const retryPublish = useCallback(async () => {
        if (!editPostId || isRetrying) return;
        setIsRetrying(true);
        try {
            const response = await fetch(`/api/posts/${editPostId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'retry' }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to retry post');
            setEditPostStatus('publishing');
            toast('success', 'Retry queued', 'Your post is being published again.');
        } catch (error) {
            showErrorToast(error, 'Failed to retry post');
            toast('error', 'Retry failed', error instanceof Error ? error.message : 'Please try again.');
        } finally {
            setIsRetrying(false);
        }
    }, [editPostId, isRetrying]);

    return {
        router,
        organization,

        // Loading states
        isLoadingAccounts, isLoadingEditPost, accountsError, editPostError,
        editPostId, editPostStatus, editPostUpdatedAt,

        // Submission states
        isSaving, setIsSaving, isScheduling, setIsScheduling,
        isPublishing, setIsPublishing, isSubmitting, isRetrying, retryPublish,

        // Accounts
        accounts, selectedAccountIds, setSelectedAccountIds, selectedAccounts,

        // Content
        caption, setCaption, media, setMedia, firstComment, setFirstComment,

        // Account settings
        accountSettings, setAccountSettings, effectiveAccountSettings,
        handleAccountSettingsChange, handlePlatformSettingsChange,

        // Active account/platform
        activeAccountId, setActiveAccountId, activeAccount,
        activePlatformSettings, activeCaption,
        platformCaptions, platformFirstComments,
        handleActivePlatformChange, handlePlatformCaptionChange, handlePlatformFirstCommentChange,
        uniquePlatforms,

        // Carousel & YouTube Short mode (from sub-hook)
        isCarouselMode, incompatiblePlatforms, isYouTubeShortMode,

        // Scheduling
        selectedDate, setSelectedDate, scheduledTime, setScheduledTime, scheduledDate, optimalTimes,

        // Media folders
        mediaFolders,

        // AI rewriting state
        isAIRewriting,

        // Modal states
        isAIModalOpen, setIsAIModalOpen,
        isTemplatePickerOpen, setIsTemplatePickerOpen,
        isMediaModalOpen, setIsMediaModalOpen,
        isScheduleModalOpen, setIsScheduleModalOpen,

        // Handlers
        handleAIAssist, handleAICaptionSelect, handleTemplateSelect,
        handleOpenTemplates, handleAddMedia, handleMediaUpload,
        handleOpenScheduleModal, resetForm,
    };
}
