/**
 * useComposeMedia — Media handlers and mode detection for the post composer
 * Why: Extracted from use-compose.ts to keep media logic isolated
 * under the 200-line cap.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { type MediaItem } from '@/components/compose/platform-editor';
import { type SocialAccount } from '@/components/compose/profile-selector';
import {
    getDefaultPlatformSettings,
    type PlatformSettings,
} from '@/components/compose/customization-panel';
import { platformSupportsMultipleMedia, type Platform } from '@/lib/platform-config';
import { toast } from '@/components/ui/toast';
import { type AccountSettings } from '@/hooks/use-compose';

interface UseComposeMediaOptions {
    /** All connected social accounts */
    accounts: SocialAccount[];
    /** Currently selected account IDs */
    selectedAccountIds: string[];
    setSelectedAccountIds: React.Dispatch<React.SetStateAction<string[]>>;
    /** Media items attached to the post */
    media: MediaItem[];
    setMedia: React.Dispatch<React.SetStateAction<MediaItem[]>>;
    /** Per-account settings (post type, etc.) */
    setAccountSettings: React.Dispatch<React.SetStateAction<Record<string, AccountSettings>>>;
    /** Currently selected accounts (derived) */
    selectedAccounts: SocialAccount[];
}

/**
 * Manages carousel mode, YouTube Shorts detection, and media upload handling
 * Why: These concerns are tightly coupled to media state but independent of
 * caption/scheduling/AI logic, making them a clean extraction boundary.
 */
export function useComposeMedia({
    accounts,
    selectedAccountIds,
    setSelectedAccountIds,
    media,
    setMedia,
    setAccountSettings,
    selectedAccounts,
}: UseComposeMediaOptions) {
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

    /** Handle uploaded media from the media modal or drag-and-drop */
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
    }, [setMedia]);

    /** Open the media modal */
    const handleAddMedia = useCallback(() => {
        setIsMediaModalOpen(true);
    }, []);

    const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);

    return {
        isCarouselMode,
        incompatiblePlatforms,
        isYouTubeShortMode,
        isMediaModalOpen,
        setIsMediaModalOpen,
        handleMediaUpload,
        handleAddMedia,
    };
}
