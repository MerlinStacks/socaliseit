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
import { type Platform } from '@/lib/platform-config';
import { type MediaFolder } from '@/types/media';
import { toast } from '@/components/ui/toast';
import { useWorkspace } from '@/hooks/use-workspace';

/**
 * Per-account settings that override the base post settings
 * Why: Each account may need different captions, post types, or CTAs
 */
export interface AccountSettings extends PlatformSettings {
    accountId: string;
    captionOverride?: string;
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
    const { workspace } = useWorkspace();

    // Edit mode state
    const editPostId = searchParams.get('edit');
    const [isLoadingEditPost, setIsLoadingEditPost] = useState(!!editPostId);
    const [editPostError, setEditPostError] = useState<string | null>(null);

    // Account fetching state
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
    const [accountsError, setAccountsError] = useState<string | null>(null);

    // Individual submission states for per-button loading feedback
    const [isSaving, setIsSaving] = useState(false);
    const [isScheduling, setIsScheduling] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);

    // Derived: block all actions if any is in progress
    const isSubmitting = isSaving || isScheduling || isPublishing;

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
                console.error('Error fetching folders:', error);
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

    // Get caption for active account (use override if set)
    const activeCaption = useMemo(() => {
        if (activeAccount) {
            const settings = effectiveAccountSettings[activeAccount.id];
            return settings?.captionOverride || caption;
        }
        return caption;
    }, [activeAccount, effectiveAccountSettings, caption]);

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
        if (!caption.trim() || selectedAccountIds.length === 0) {
            toast('error', 'Missing content', 'Add a caption and select at least one account.');
            return;
        }
        setIsScheduleModalOpen(true);
    }, [caption, selectedAccountIds]);

    // Reset form state
    const resetForm = useCallback(() => {
        setCaption('');
        setMedia([]);
        setSelectedAccountIds([]);
        setFirstComment('');
        setAccountSettings({});
        setActiveAccountId(null);
    }, []);

    return {
        // Router
        router,

        // Workspace
        workspace,

        // Loading states
        isLoadingAccounts,
        isLoadingEditPost,
        accountsError,
        editPostError,
        editPostId,

        // Submission states
        isSaving,
        setIsSaving,
        isScheduling,
        setIsScheduling,
        isPublishing,
        setIsPublishing,
        isSubmitting,

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
        handleActivePlatformChange,
        uniquePlatforms,

        // Scheduling
        selectedDate,
        setSelectedDate,
        scheduledTime,
        setScheduledTime,
        scheduledDate,
        optimalTimes,

        // Media folders
        mediaFolders,

        // Modal states
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
