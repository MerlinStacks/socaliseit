/**
 * useCompose Hook - Centralized state management for post composer
 * Extracted from compose/page.tsx to reduce file size and improve maintainability
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { format, parseISO } from 'date-fns';
import { type MediaItem } from '@/components/compose/platform-editor';
import { type SocialAccount } from '@/components/compose/profile-selector';
import {
    getDefaultPlatformSettings,
    type PlatformSettings,
} from '@/components/compose/customization-panel';
import { sortPlatformsByOrder, getPlatformSortIndex, platformSupportsMultipleMedia, type Platform } from '@/lib/platform-config';
import { type MediaFolder } from '@/types/media';
import { toast } from '@/components/ui/toast';
import { useOrganization } from '@/hooks/use-organization';
import { fetchWithRetry } from '@/hooks/use-retry';
import { showErrorToast } from '@/lib/api-error';

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
 * Optimal times response from analytics API
 */
interface OptimalTimesResponse {
    suggestions: Array<{ time: string; label: string; lift: number }>;
    dataPoints: number;
    confidence: 'high' | 'medium' | 'low';
}

/**
 * useCompose - Main hook for composer state management
 * Why: Centralizes all state, derived values, and basic handlers for the compose page
 */
export function useCompose() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { organization } = useOrganization();

    // Edit mode state
    const editPostId = searchParams.get('edit');
    const [isLoadingEditPost, setIsLoadingEditPost] = useState(!!editPostId);
    const [editPostError, setEditPostError] = useState<string | null>(null);
    const [editPostStatus, setEditPostStatus] = useState<string | null>(null);
    const [editPostUpdatedAt, setEditPostUpdatedAt] = useState<Date | null>(null);

    // Account fetching state
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
    const [accountsError, setAccountsError] = useState<string | null>(null);

    // Individual submission states for per-button loading feedback
    const [isSaving, setIsSaving] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [isRetrying, setIsRetrying] = useState(false);

    // AI rewriting state (inline, no modal)
    const [isAIRewriting, setIsAIRewriting] = useState(false);

    // Derived: block all actions if any is in progress
    const isSubmitting = isSaving || isScheduling || isPublishing || isRetrying;

    // Post state
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [caption, setCaption] = useState('');
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [firstComment, setFirstComment] = useState('');

    // Per-account settings (keyed by accountId, not platform)
    const [accountSettings, setAccountSettings] = useState<Record<string, AccountSettings>>({});

    // Active account for customization panel
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

    // Modal states
    const [isAIModalOpen, setIsAIModalOpen] = useState(false);
    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
    const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

    // Media folders for upload modal
    const [mediaFolders, setMediaFolders] = useState<MediaFolder[]>([]);

    // Scheduling state
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

    // Derive scheduledDate string from selectedDate for API compatibility
    const scheduledDate = useMemo(() => {
        if (!selectedDate) return 'tomorrow';
        return format(selectedDate, 'yyyy-MM-dd');
    }, [selectedDate]);

    // Fetch optimal posting times based on analytics
    const { data: optimalTimes } = useSWR<OptimalTimesResponse>(
        '/api/analytics/optimal-times',
        async (url: string) => {
            const res = await fetch(url);
            if (!res.ok) return { suggestions: [], dataPoints: 0, confidence: 'low' as const };
            return res.json();
        },
        { revalidateOnFocus: false }
    );

    // Fetch connected social accounts with retry
    useEffect(() => {
        async function fetchAccounts() {
            try {
                setIsLoadingAccounts(true);
                const response = await fetchWithRetry('/api/accounts', {
                    method: 'GET',
                });
                if (!response.ok) {
                    throw new Error('Failed to fetch accounts');
                }
                const data = await response.json();

                const transformedAccounts: SocialAccount[] = data.accounts.map((account: {
                    id: string;
                    platform: string;
                    name: string;
                    username?: string;
                    avatar?: string;
                    isActive?: boolean;
                    organizationId?: string | null;
                    organization?: { id: string; name: string; logo: string | null } | null;
                }) => ({
                    id: account.id,
                    platform: account.platform.toLowerCase() as Platform,
                    name: account.name,
                    username: account.username,
                    avatar: account.avatar,
                    isActive: account.isActive !== false,
                    organizationId: account.organizationId,
                    organization: account.organization,
                }));

                // Sort accounts by canonical platform order
                transformedAccounts.sort((a, b) => {
                    const diff = getPlatformSortIndex(a.platform) - getPlatformSortIndex(b.platform);
                    if (diff !== 0) return diff;
                    return a.name.localeCompare(b.name);
                });

                setAccounts(transformedAccounts);
            } catch (error) {
                showErrorToast(error, 'Error fetching accounts');
                setAccountsError(error instanceof Error ? error.message : 'Failed to load accounts');
            } finally {
                setIsLoadingAccounts(false);
            }
        }

        fetchAccounts();
    }, []);

    // Fetch media folders for the upload modal
    useEffect(() => {
        async function fetchFolders() {
            try {
                const response = await fetch('/api/media/folders');
                if (response.ok) {
                    const data = await response.json();
                    setMediaFolders(data.folders || []);
                }
            } catch (error) {
                showErrorToast(error, 'Error fetching folders');
            }
        }
        fetchFolders();
    }, []);

    // Load existing post data when in edit mode
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

                // Track post status for UI (PUBLISHING/FAILED show special banners)
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
                                mediaOverride: platform.customMediaIds || undefined,
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

    /**
     * Handle PWA Share Target API params
     * Why: When users share content to the PWA, pre-fill the caption with shared data
     */
    useEffect(() => {
        // Only run once on mount, and only if not editing a post
        if (editPostId) return;

        const sharedTitle = searchParams.get('title');
        const sharedText = searchParams.get('text');
        const sharedUrl = searchParams.get('url');

        // Build caption from shared content
        if (sharedTitle || sharedText || sharedUrl) {
            const parts: string[] = [];

            if (sharedTitle) parts.push(sharedTitle);
            if (sharedText && sharedText !== sharedTitle) parts.push(sharedText);
            if (sharedUrl) parts.push(sharedUrl);

            const sharedCaption = parts.join('\n\n');
            setCaption(sharedCaption);

            toast('info', 'Content shared', 'Pre-filled from shared content. Select accounts to post.');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run on mount

    // Derived state
    const selectedAccounts = useMemo(() => {
        return accounts.filter((account) => selectedAccountIds.includes(account.id));
    }, [accounts, selectedAccountIds]);

    const uniquePlatforms = useMemo((): Platform[] => {
        const platforms = new Set<Platform>();
        selectedAccounts.forEach((account) => platforms.add(account.platform));
        return sortPlatformsByOrder(Array.from(platforms));
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
    // Why: Build settings for ALL unique platforms, not just activeAccount
    // This ensures Post Details section renders on every platform tab
    const activePlatformSettings = useMemo((): Record<Platform, PlatformSettings> => {
        const result: Record<Platform, PlatformSettings> = {} as Record<Platform, PlatformSettings>;
        // For each unique platform, find a selected account and use its settings
        uniquePlatforms.forEach((platform) => {
            const accountForPlatform = selectedAccounts.find((a) => a.platform === platform);
            if (accountForPlatform) {
                const settings = effectiveAccountSettings[accountForPlatform.id];
                if (settings) {
                    result[platform] = settings;
                }
            }
        });
        return result;
    }, [uniquePlatforms, selectedAccounts, effectiveAccountSettings]);

    // Get caption for active account (use override if set)
    const activeCaption = useMemo(() => {
        if (activeAccount) {
            const settings = effectiveAccountSettings[activeAccount.id];
            return settings?.captionOverride || caption;
        }
        return caption;
    }, [activeAccount, effectiveAccountSettings, caption]);

    /**
     * Build per-platform caption overrides map
     * Why: TabbedPlatformEditor needs platform-keyed overrides to display correct caption per tab
     */
    const platformCaptions = useMemo((): Partial<Record<Platform, string>> => {
        const result: Partial<Record<Platform, string>> = {};
        uniquePlatforms.forEach((platform) => {
            const accountForPlatform = selectedAccounts.find((a) => a.platform === platform);
            if (accountForPlatform) {
                const settings = effectiveAccountSettings[accountForPlatform.id];
                if (settings?.captionOverride) {
                    result[platform] = settings.captionOverride;
                }
            }
        });
        return result;
    }, [uniquePlatforms, selectedAccounts, effectiveAccountSettings]);

    /**
     * Build per-platform first comment overrides map
     * Why: TabbedPlatformEditor needs platform-keyed first comments to display/edit per tab
     */
    const platformFirstComments = useMemo((): Partial<Record<Platform, string>> => {
        const result: Partial<Record<Platform, string>> = {};
        uniquePlatforms.forEach((platform) => {
            const accountForPlatform = selectedAccounts.find((a) => a.platform === platform);
            if (accountForPlatform) {
                const settings = effectiveAccountSettings[accountForPlatform.id];
                if (settings?.firstCommentOverride) {
                    result[platform] = settings.firstCommentOverride;
                }
            }
        });
        return result;
    }, [uniquePlatforms, selectedAccounts, effectiveAccountSettings]);

    /**
     * Carousel mode detection
     * Why: When multiple media items are selected, we need to:
     * 1. Force post type to 'carousel' for compatible platforms
     * 2. Disable incompatible platforms (TikTok, YouTube, etc.)
     */
    const isCarouselMode = useMemo(() => media.length > 1, [media.length]);

    /**
     * Get list of platforms that don't support multiple media
     * Why: Used to show visual indication in profile selector
     */
    const incompatiblePlatforms = useMemo((): Platform[] => {
        if (!isCarouselMode) return [];
        const platforms: Platform[] = ['instagram', 'facebook', 'youtube', 'tiktok', 'pinterest', 'linkedin', 'bluesky', 'google_business'];
        return platforms.filter(p => !platformSupportsMultipleMedia(p));
    }, [isCarouselMode]);

    /**
     * Auto-switch to carousel mode and deselect incompatible accounts
     * Why: When user adds multiple media, automatically handle the transition
     */
    useEffect(() => {
        if (!isCarouselMode) return;

        // Find accounts on incompatible platforms
        const incompatibleAccountIds = selectedAccountIds.filter(accountId => {
            const account = accounts.find(a => a.id === accountId);
            return account && !platformSupportsMultipleMedia(account.platform);
        });

        // Deselect incompatible accounts with warning
        if (incompatibleAccountIds.length > 0) {
            const incompatibleAccounts = accounts.filter(a => incompatibleAccountIds.includes(a.id));
            const platformNames = [...new Set(incompatibleAccounts.map(a => a.platform))].join(', ');

            setSelectedAccountIds(prev => prev.filter(id => !incompatibleAccountIds.includes(id)));
            toast('warning', 'Platforms removed', `${platformNames} doesn't support carousel posts. These accounts were deselected.`);
        }

        // Update post type to carousel for all compatible selected accounts
        setAccountSettings(prev => {
            const updated = { ...prev };
            selectedAccountIds.forEach(accountId => {
                const account = accounts.find(a => a.id === accountId);
                if (account && platformSupportsMultipleMedia(account.platform)) {
                    const currentSettings = updated[accountId] || {
                        ...getDefaultPlatformSettings(account.platform),
                        accountId,
                    };
                    // For Bluesky, keep as 'feed' since it supports 4 images in feed posts
                    if (account.platform === 'bluesky') {
                        updated[accountId] = { ...currentSettings, postType: 'feed' };
                    } else {
                        updated[accountId] = { ...currentSettings, postType: 'carousel' };
                    }
                }
            });
            return updated;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isCarouselMode]); // Only run when carousel mode changes

    /**
     * YouTube Shorts auto-detection
     * Why: When a single video under 60 seconds is selected and YouTube is active,
     * automatically switch to 'reel' (Short) post type
     */
    const isYouTubeShortMode = useMemo(() => {
        // Must have exactly 1 video
        if (media.length !== 1 || media[0].type !== 'video') return false;

        // Must have duration under 60 seconds
        const duration = media[0].duration;
        if (!duration || duration >= 60) return false;

        // Must have YouTube account selected
        const hasYouTube = selectedAccounts.some(a => a.platform === 'youtube');
        return hasYouTube;
    }, [media, selectedAccounts]);

    /**
     * Auto-switch YouTube to Shorts when video is under 60 seconds
     */
    useEffect(() => {
        if (!isYouTubeShortMode) return;

        // Update post type to 'reel' (Short) for YouTube accounts
        setAccountSettings(prev => {
            const updated = { ...prev };
            let changed = false;

            selectedAccountIds.forEach(accountId => {
                const account = accounts.find(a => a.id === accountId);
                if (account && account.platform === 'youtube') {
                    const currentSettings = updated[accountId] || {
                        ...getDefaultPlatformSettings(account.platform),
                        accountId,
                    };
                    // Only update if not already a reel/short
                    if (currentSettings.postType !== 'reel') {
                        updated[accountId] = { ...currentSettings, postType: 'reel' };
                        changed = true;
                    }
                }
            });

            if (changed) {
                toast('info', 'YouTube Short', 'Video is under 60 seconds, set as YouTube Short.');
            }

            return updated;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isYouTubeShortMode]); // Only run when short mode changes

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

    /**
     * Handle per-platform caption changes from TabbedPlatformEditor
     * Why: When user types in a platform-specific tab, update that platform's captionOverride
     */
    const handlePlatformCaptionChange = useCallback(
        (platform: Platform, newCaption: string) => {
            const accountForPlatform = selectedAccounts.find((a) => a.platform === platform);
            if (accountForPlatform) {
                handleAccountSettingsChange(accountForPlatform.id, { captionOverride: newCaption });
            }
        },
        [selectedAccounts, handleAccountSettingsChange]
    );

    /**
     * Handle per-platform first comment changes from TabbedPlatformEditor
     * Why: When user types in a platform-specific first comment, update that platform's firstCommentOverride
     */
    const handlePlatformFirstCommentChange = useCallback(
        (platform: Platform, newFirstComment: string) => {
            const accountForPlatform = selectedAccounts.find((a) => a.platform === platform);
            if (accountForPlatform) {
                handleAccountSettingsChange(accountForPlatform.id, { firstCommentOverride: newFirstComment });
            }
        },
        [selectedAccounts, handleAccountSettingsChange]
    );

    // Handle active account change via platform tabs
    const handleActivePlatformChange = useCallback(
        (platform: Platform) => {
            const account = selectedAccounts.find((a) => a.platform === platform);
            if (account) {
                setActiveAccountId(account.id);
            }
        },
        [selectedAccounts]
    );

    /**
     * Handle AI caption rewrite - inline, no modal
     * Why: Reads current context, brand voice, and past posts to rewrite caption in-place
     * @param activePlatform - The active platform tab (null = 'all' tab, Platform = specific platform)
     */
    const handleAIAssist = useCallback(async (activePlatform?: Platform | null) => {
        // Determine which caption to rewrite based on active platform
        const isAllTab = !activePlatform;
        const targetPlatform = activePlatform || uniquePlatforms[0] || 'instagram';

        // Get the displayed caption for the active tab
        const displayedCaption = isAllTab
            ? caption
            : platformCaptions[activePlatform] ?? caption;

        // Require a caption to rewrite
        if (!displayedCaption.trim()) {
            toast('warning', 'Add a caption first', 'Type something to rewrite.');
            return;
        }

        // Prevent concurrent rewrites
        if (isAIRewriting) return;

        setIsAIRewriting(true);
        try {
            // Build media context
            const mediaContext = {
                hasVideo: media.some(m => m.type === 'video'),
                hasImage: media.some(m => m.type === 'image'),
                mediaCount: media.length,
            };

            const response = await fetch('/api/ai/rewrite-caption', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    caption: displayedCaption,
                    platform: targetPlatform,
                    mediaContext,
                }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to rewrite caption');
            }

            // Update the correct caption based on active tab
            if (isAllTab) {
                // All tab: update global caption
                setCaption(result.data.caption);
            } else {
                // Platform tab: update platform-specific override via handlePlatformCaptionChange
                handlePlatformCaptionChange(activePlatform, result.data.caption);
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

    const handleOpenTemplates = useCallback(() => {
        setIsTemplatePickerOpen(true);
    }, []);

    const handleAddMedia = useCallback(() => {
        setIsMediaModalOpen(true);
    }, []);

    const handleMediaUpload = useCallback(async (uploadedMedia: Array<{
        id: string;
        url: string;
        thumbnailUrl?: string;
        type: 'image' | 'video' | 'audio';
        size: number;
    }>) => {
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

    const handleOpenScheduleModal = useCallback(() => {
        if (selectedAccountIds.length === 0) {
            toast('error', 'Missing content', 'Select at least one account.');
            return;
        }

        // Check if all selected accounts are stories (stories don't require captions)
        const allAccountsAreStories = selectedAccountIds.every((accountId) => {
            const settings = effectiveAccountSettings[accountId];
            return settings?.postType?.toLowerCase() === 'story';
        });

        if (!allAccountsAreStories && !caption.trim()) {
            toast('error', 'Missing content', 'Add a caption (required for non-story posts).');
            return;
        }
        setIsScheduleModalOpen(true);
    }, [caption, selectedAccountIds, effectiveAccountSettings]);

    // Reset form state
    const resetForm = useCallback(() => {
        setCaption('');
        setMedia([]);
        setSelectedAccountIds([]);
        setFirstComment('');
        setAccountSettings({});
        setActiveAccountId(null);
    }, []);

    /**
     * Retry publishing a failed or stuck post
     * Why: Clears stale Redis locks and re-queues the publish job
     */
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

            if (!response.ok) {
                throw new Error(result.error || 'Failed to retry post');
            }

            // Update local status to reflect retry in progress
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
        // Router
        router,

        // Organization
        organization,

        // Loading states
        isLoadingAccounts,
        isLoadingEditPost,
        accountsError,
        editPostError,
        editPostId,
        editPostStatus,
        editPostUpdatedAt,

        // Submission states
        isSaving,
        setIsSaving,
        isScheduling,
        setIsScheduling,
        isPublishing,
        setIsPublishing,
        isSubmitting,
        isRetrying,
        retryPublish,

        // Accounts
        accounts,
        selectedAccountIds,
        setSelectedAccountIds,
        selectedAccounts,

        // Content
        caption,
        setCaption,
        media,
        setMedia,
        firstComment,
        setFirstComment,

        // Account settings
        accountSettings,
        setAccountSettings,
        effectiveAccountSettings,
        handleAccountSettingsChange,
        handlePlatformSettingsChange,

        // Active account/platform
        activeAccountId,
        setActiveAccountId,
        activeAccount,
        activePlatformSettings,
        activeCaption,
        platformCaptions,
        platformFirstComments,
        handleActivePlatformChange,
        handlePlatformCaptionChange,
        handlePlatformFirstCommentChange,
        uniquePlatforms,

        // Carousel mode
        isCarouselMode,
        incompatiblePlatforms,

        // YouTube Short mode
        isYouTubeShortMode,

        // Scheduling
        selectedDate,
        setSelectedDate,
        scheduledTime,
        setScheduledTime,
        scheduledDate,
        optimalTimes,

        // Media folders
        mediaFolders,

        // AI rewriting state
        isAIRewriting,

        // Modal states (AI modal kept for backwards compatibility)
        isAIModalOpen,
        setIsAIModalOpen,
        isTemplatePickerOpen,
        setIsTemplatePickerOpen,
        isMediaModalOpen,
        setIsMediaModalOpen,
        isScheduleModalOpen,
        setIsScheduleModalOpen,

        // Handlers
        handleAIAssist,
        handleAICaptionSelect,
        handleTemplateSelect,
        handleOpenTemplates,
        handleAddMedia,
        handleMediaUpload,
        handleOpenScheduleModal,
        resetForm,
    };
}
