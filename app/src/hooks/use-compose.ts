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
import { useOrganization } from '@/hooks/use-organization';
import { useComposerPreferencesStore } from '@/lib/stores/composer-preferences-store';
import { useComposeAccounts, useComposeFolders, useOptimalTimes } from '@/hooks/use-compose-data';
import { useComposeMedia } from '@/hooks/use-compose-media';
import { useComposeDraft } from '@/hooks/use-compose-draft';
import { useComposeAI } from '@/hooks/use-compose-ai';
import { useComposeSubmission } from '@/hooks/use-compose-submission';

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
export function useCompose(initialPostData?: unknown) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { organization } = useOrganization();
    const editPostId = searchParams.get('edit');

    // --- Data queries ---
    const { accounts, isLoadingAccounts, accountsError } = useComposeAccounts();
    const { mediaFolders } = useComposeFolders();
    const { optimalTimes } = useOptimalTimes();

    // --- Post content state ---
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [caption, setCaption] = useState('');
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [firstComment, setFirstComment] = useState('');
    const [accountSettings, setAccountSettings] = useState<Record<string, AccountSettings>>({});
    const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

    // --- Modal states ---
    const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
    const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

    // --- Edit-post state ---
    const [editPostStatus, setEditPostStatus] = useState<string | null>(null);
    const [editPostUpdatedAt, setEditPostUpdatedAt] = useState<Date | null>(null);
    const [editPostLatestError, setEditPostLatestError] = useState<{ message: string; suggestion: string | null } | null>(null);

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

    // --- Extracted logic hooks ---
    const { isLoadingEditPost, editPostError, isEditPostLoaded } = useComposeDraft({
        editPostId,
        initialPostData,
        accounts,
        setEditPostStatus,
        setEditPostUpdatedAt,
        setEditPostLatestError,
        setCaption,
        setFirstComment,
        setSelectedAccountIds,
        setMedia,
        setSelectedDate,
        setScheduledTime,
        setAccountSettings,
    });

    const {
        isSaving, setIsSaving,
        isScheduling, setIsScheduling,
        isPublishing, setIsPublishing,
        isRetrying, retryPublish,
        isSubmitting,
    } = useComposeSubmission(editPostId, setEditPostStatus);

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

    // --- AI Sub-hook ---
    const {
        isAIRewriting,
        isAIModalOpen, setIsAIModalOpen,
        handleAIAssist,
        handleAICaptionSelect
    } = useComposeAI({
        caption, media, platformCaptions, uniquePlatforms,
        handlePlatformCaptionChange, setCaption
    });

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

    // --- Auto-select accounts for new posts ---
    const autoSelectDone = useRef(false);
    useEffect(() => {
        if (editPostId || isLoadingAccounts || accounts.length === 0) return;
        if (autoSelectDone.current) return;
        if (selectedAccountIds.length > 0) { autoSelectDone.current = true; return; }

        autoSelectDone.current = true;

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
    }, [editPostId, isLoadingAccounts, accounts, selectedAccountIds, searchParams, setSelectedAccountIds]);

    const handleTemplateSelect = useCallback((templateCaption: string, _hashtags: string[]) => {
        setCaption(templateCaption);
    }, []);

    const handleOpenTemplates = useCallback(() => { setIsTemplatePickerOpen(true); }, []);

    const handleOpenScheduleModal = useCallback(() => {
        setIsScheduleModalOpen(true);
    }, []);

    const resetForm = useCallback(() => {
        setCaption('');
        setMedia([]);
        setSelectedAccountIds([]);
        setFirstComment('');
        setAccountSettings({});
        setActiveAccountId(null);
    }, []);

    return {
        router,
        organization,

        // Loading states
        isLoadingAccounts, isLoadingEditPost, isEditPostLoaded, accountsError, editPostError,
        editPostId, editPostStatus, editPostUpdatedAt, editPostLatestError,

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

        // Carousel & YouTube Short mode
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
