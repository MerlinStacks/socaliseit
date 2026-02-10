/**
 * Customization Panel Component
 * Right sidebar for per-platform customization and preview
 */

'use client';

import { useState, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    PLATFORM_SPECS,
    type Platform,
    type PostType,
    formatPostType,
} from '@/lib/platform-config';
import { PlatformIcon } from './profile-selector';
import { ProductTagging, type ProductTag } from './product-tagging';
import type { MediaItem } from './platform-editor';

// Extracted sub-components
import { SettingSection, ToggleSwitch } from './customization-ui';
import { CaptionOverrideEditor } from './caption-override-editor';
import { MediaOverrideEditor } from './media-override-editor';
import { FirstCommentEditor } from './first-comment-editor';
import { YouTubeSettings } from './youtube-settings';
import { PinterestSettings } from './pinterest-settings';
import { TikTokSettings } from './tiktok-settings';
import { InstagramSettings } from './instagram-settings';
import { showErrorToast } from '@/lib/api-error';
import { DeviceSelector } from './device-selector';

export interface PlatformSettings {
    postType: PostType;
    callToAction?: string;
    captionOverride?: string;
    firstCommentOverride?: string;
    mediaOverride?: string[];
    autoPublish: boolean;
    /** Device IDs to notify when autoPublish is off */
    notifyDeviceIds?: string[];
    productTags?: ProductTag[];

    // Location tagging (Instagram, TikTok, Facebook)
    location?: string;

    // YouTube-specific settings
    videoTitle?: string;
    privacy?: 'public' | 'private' | 'unlisted';
    commentsEnabled?: boolean;
    category?: string;
    playlist?: string;
    embeddable?: boolean;
    createFirstLike?: boolean;
    videoTags?: string[];
    notifySubscribers?: boolean;
    madeForKids?: boolean;

    // Pinterest-specific settings
    pinTitle?: string;
    pinLink?: string;
    boardId?: string;

    // TikTok-specific settings
    tiktokBrandOrganicToggle?: boolean;
    tiktokBrandContentToggle?: boolean;
    tiktokIsAigc?: boolean;
    tiktokCommentsEnabled?: boolean;
    tiktokDuetsEnabled?: boolean;
    tiktokStitchesEnabled?: boolean;
    // Instagram-specific settings
    instagramShareToFeed?: boolean;
    instagramComments?: boolean;
}

interface YouTubePlaylist {
    id: string;
    title: string;
    description?: string;
    thumbnailUrl?: string;
    itemCount?: number;
}

interface PinterestBoard {
    id: string;
    name: string;
    description?: string;
    privacy: 'PUBLIC' | 'SECRET' | 'PROTECTED';
    pinCount?: number;
}

interface CustomizationPanelProps {
    platforms: Platform[];
    activePlatform: Platform;
    onActivePlatformChange: (platform: Platform) => void;
    settings: Record<Platform, PlatformSettings>;
    onSettingsChange: (platform: Platform, settings: Partial<PlatformSettings>) => void;
    caption: string;
    media: MediaItem[];
    onAddMedia?: () => void;
    onMediaChange?: (media: MediaItem[]) => void;
    /** Global first comment value (used as default/placeholder) */
    firstComment?: string;
    /** Callback to update global first comment */
    onFirstCommentChange?: (value: string) => void;
    selectedAccountIds?: string[];
    /** Whether carousel mode is forced (multiple media selected) */
    isCarouselMode?: boolean;
    /** Whether YouTube Short mode is forced (video under 60s) */
    isYouTubeShortMode?: boolean;
    className?: string;
}

/**
 * Per-platform customization panel
 * Why: Different platforms have different requirements and options.
 */
export function CustomizationPanel({
    platforms,
    activePlatform,
    onActivePlatformChange,
    settings,
    onSettingsChange,
    caption,
    media,
    onAddMedia,
    onMediaChange,
    firstComment,
    onFirstCommentChange,
    selectedAccountIds = [],
    isCarouselMode = false,
    isYouTubeShortMode = false,
    className,
}: CustomizationPanelProps) {
    const activeSpec = PLATFORM_SPECS[activePlatform];
    const activeSettings = settings[activePlatform] || { postType: 'feed' as PostType, autoPublish: true };

    /** Whether the current post type is a story — stories don't support caption, first comment, product tags, or reel-in-feed */
    const isStoryMode = activeSettings.postType === 'story';

    const supportsFirstComment = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'].includes(activePlatform);

    // Platform-specific data fetching
    const [youtubePlaylists, setYoutubePlaylists] = useState<YouTubePlaylist[]>([]);
    const [loadingPlaylists, setLoadingPlaylists] = useState(false);
    const [pinterestBoards, setPinterestBoards] = useState<PinterestBoard[]>([]);
    const [loadingBoards, setLoadingBoards] = useState(false);

    useEffect(() => {
        if (activePlatform !== 'youtube' || selectedAccountIds.length === 0) {
            setYoutubePlaylists([]);
            return;
        }
        const fetchPlaylists = async () => {
            const accountId = selectedAccountIds[0];
            if (!accountId) return;
            setLoadingPlaylists(true);
            try {
                const res = await fetch(`/api/platforms/youtube/playlists?accountId=${accountId}`);
                const data = await res.json();
                if (data.playlists) setYoutubePlaylists(data.playlists);
            } catch (err) {
                showErrorToast(err, 'Failed to fetch YouTube playlists');
            } finally {
                setLoadingPlaylists(false);
            }
        };
        fetchPlaylists();
    }, [activePlatform, selectedAccountIds]);

    const fetchPinterestBoards = async (refresh = false) => {
        if (activePlatform !== 'pinterest' || selectedAccountIds.length === 0) {
            setPinterestBoards([]);
            return;
        }
        const accountId = selectedAccountIds[0];
        if (!accountId) return;
        setLoadingBoards(true);
        try {
            const url = `/api/platforms/pinterest/boards?accountId=${accountId}${refresh ? '&refresh=true' : ''}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.boards) setPinterestBoards(data.boards);
        } catch (err) {
            showErrorToast(err, 'Failed to fetch Pinterest boards');
        } finally {
            setLoadingBoards(false);
        }
    };

    useEffect(() => {
        fetchPinterestBoards();
    }, [activePlatform, selectedAccountIds]);

    const handleSettingChange = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
        onSettingsChange(activePlatform, { [key]: value });
    };

    return (
        <div className={cn('flex h-full flex-col bg-[var(--bg-secondary)]', className)}>
            {/* Platform Tabs */}
            <div className="flex items-center gap-1 border-b border-[var(--border)] px-4 py-3">
                {platforms.map((platform) => {
                    const spec = PLATFORM_SPECS[platform];
                    const isActive = platform === activePlatform;
                    return (
                        <button
                            key={platform}
                            onClick={() => onActivePlatformChange(platform)}
                            className={cn(
                                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                                isActive ? 'bg-[var(--accent-gold-light)]' : 'hover:bg-[var(--bg-tertiary)]'
                            )}
                            style={{ color: isActive ? spec.color : 'var(--text-muted)' }}
                            title={spec.name}
                        >
                            <PlatformIcon platform={platform} size={20} />
                        </button>
                    );
                })}
            </div>

            {/* Customization Options */}
            <div className="flex-1 overflow-y-auto">
                <div className="flex items-center justify-between px-4 py-3">
                    <h3 className="text-sm font-semibold">Customize your post</h3>
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                </div>

                {/* Caption Override — hidden for stories (no caption support) */}
                {!isStoryMode && (
                    <SettingSection title="Caption" subtitle="Click to edit caption" fullWidth>
                        <CaptionOverrideEditor
                            platform={activePlatform}
                            defaultCaption={caption}
                            override={activeSettings.captionOverride}
                            onChange={(value) => handleSettingChange('captionOverride', value)}
                        />
                    </SettingSection>
                )}

                {/* First Comment — hidden for stories (not applicable) */}
                {supportsFirstComment && !isStoryMode && (
                    <SettingSection title="First Comment" subtitle="Posted immediately after your content" fullWidth>
                        <FirstCommentEditor
                            value={activeSettings.firstCommentOverride ?? ''}
                            onChange={(value) => handleSettingChange('firstCommentOverride', value || undefined)}
                            platform={activePlatform}
                            defaultValue={firstComment}
                        />
                    </SettingSection>
                )}

                {/* Media Override */}
                <SettingSection title="Media" subtitle="Click to edit media" fullWidth>
                    <MediaOverrideEditor
                        media={media}
                        override={activeSettings.mediaOverride}
                        onChange={(value) => handleSettingChange('mediaOverride', value)}
                        onAddMedia={onAddMedia}
                        onMediaChange={onMediaChange}
                    />
                </SettingSection>

                {/* Auto Publish */}
                <SettingSection title="Auto publish">
                    <ToggleSwitch
                        enabled={activeSettings.autoPublish}
                        onChange={(value) => handleSettingChange('autoPublish', value)}
                    />
                    {!activeSettings.autoPublish && (
                        <DeviceSelector
                            selectedIds={activeSettings.notifyDeviceIds || []}
                            onChange={(ids) => handleSettingChange('notifyDeviceIds', ids)}
                        />
                    )}
                </SettingSection>

                {/* Call to Action */}
                {activeSpec.callToActions && activeSpec.callToActions.length > 0 && (
                    <SettingSection title="Select call to action">
                        <select
                            value={activeSettings.callToAction || ''}
                            onChange={(e) => handleSettingChange('callToAction', e.target.value || undefined)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                        >
                            <option value="">No CTA</option>
                            {activeSpec.callToActions.map((cta) => (
                                <option key={cta.id} value={cta.id}>{cta.label}</option>
                            ))}
                        </select>
                    </SettingSection>
                )}

                {/* Post Type */}
                <SettingSection title="Select post type">
                    {(() => {
                        const isYouTubeShortLocked = isYouTubeShortMode && activePlatform === 'youtube';
                        const isPostTypeLocked = isCarouselMode || isYouTubeShortLocked;

                        return (
                            <>
                                <select
                                    value={activeSettings.postType}
                                    onChange={(e) => handleSettingChange('postType', e.target.value as PostType)}
                                    disabled={isPostTypeLocked}
                                    className={cn(
                                        'w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]',
                                        isPostTypeLocked && 'opacity-50 cursor-not-allowed'
                                    )}
                                >
                                    {activeSpec.supportedPostTypes.map((postType) => (
                                        <option key={postType} value={postType}>
                                            {formatPostType(postType, activePlatform)}
                                        </option>
                                    ))}
                                </select>
                                {isYouTubeShortLocked && (
                                    <p className="mt-1.5 text-xs text-amber-500">
                                        Short mode (video under 60 seconds)
                                    </p>
                                )}
                                {isCarouselMode && !isYouTubeShortLocked && (
                                    <p className="mt-1.5 text-xs text-amber-500">
                                        Carousel mode (multiple media selected)
                                    </p>
                                )}
                            </>
                        );
                    })()}
                </SettingSection>

                {/* YouTube Settings */}
                {activePlatform === 'youtube' && (
                    <YouTubeSettings
                        settings={activeSettings}
                        onSettingChange={handleSettingChange}
                        playlists={youtubePlaylists}
                        loadingPlaylists={loadingPlaylists}
                        caption={caption}
                    />
                )}

                {/* Pinterest Settings */}
                {activePlatform === 'pinterest' && (
                    <PinterestSettings
                        settings={activeSettings}
                        onSettingChange={handleSettingChange}
                        boards={pinterestBoards}
                        loadingBoards={loadingBoards}
                        onRefreshBoards={() => fetchPinterestBoards(true)}
                    />
                )}

                {/* TikTok Settings */}
                {activePlatform === 'tiktok' && (
                    <TikTokSettings
                        settings={activeSettings}
                        onSettingChange={handleSettingChange}
                    />
                )}

                {/* Instagram Settings — hidden for stories (reel-in-feed not applicable) */}
                {activePlatform === 'instagram' && !isStoryMode && (
                    <InstagramSettings
                        settings={activeSettings}
                        onSettingChange={handleSettingChange}
                    />
                )}

                {/* Product Tagging — hidden for stories (not supported) */}
                {activeSpec.features.productTagging && !isStoryMode && !['tiktok', 'youtube'].includes(activePlatform) && (
                    <SettingSection
                        title={['instagram', 'facebook'].includes(activePlatform) ? 'Product Tags' : 'Product Links'}
                        subtitle={['instagram', 'facebook'].includes(activePlatform)
                            ? 'Tag products to make this post shoppable'
                            : 'Add product links to include in your post'}
                    >
                        <ProductTagging
                            platform={activePlatform}
                            media={media}
                            selectedTags={activeSettings.productTags || []}
                            onTagsChange={(tags) => handleSettingChange('productTags', tags)}
                        />
                    </SettingSection>
                )}
            </div>
        </div>
    );
}

/**
 * Get default settings for a platform
 * Why: autoPublish is true by default so scheduled posts are automatically published
 */
export function getDefaultPlatformSettings(platform: Platform): PlatformSettings {
    const spec = PLATFORM_SPECS[platform];
    return {
        postType: spec.supportedPostTypes[0] || 'feed',
        autoPublish: true,
    };
}
