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

export interface PlatformSettings {
    postType: PostType;
    callToAction?: string;
    captionOverride?: string;
    mediaOverride?: string[];
    autoPublish: boolean;
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
    firstComment?: string;
    onFirstCommentChange?: (value: string) => void;
    selectedAccountIds?: string[];
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
    className,
}: CustomizationPanelProps) {
    const activeSpec = PLATFORM_SPECS[activePlatform];
    const activeSettings = settings[activePlatform] || { postType: 'feed' as PostType, autoPublish: true };

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
                console.error('Failed to fetch YouTube playlists:', err);
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
            console.error('Failed to fetch Pinterest boards:', err);
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

                {/* Caption Override */}
                <SettingSection title="Caption" subtitle="Click to edit caption" fullWidth>
                    <CaptionOverrideEditor
                        platform={activePlatform}
                        defaultCaption={caption}
                        override={activeSettings.captionOverride}
                        onChange={(value) => handleSettingChange('captionOverride', value)}
                    />
                </SettingSection>

                {/* First Comment - Now right after Caption */}
                {supportsFirstComment && onFirstCommentChange && (
                    <SettingSection title="First Comment" subtitle="Posted immediately after your content" fullWidth>
                        <FirstCommentEditor
                            value={firstComment || ''}
                            onChange={onFirstCommentChange}
                            platform={activePlatform}
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
                    <select
                        value={activeSettings.postType}
                        onChange={(e) => handleSettingChange('postType', e.target.value as PostType)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                    >
                        {activeSpec.supportedPostTypes.map((postType) => (
                            <option key={postType} value={postType}>
                                {formatPostType(postType, activePlatform)}
                            </option>
                        ))}
                    </select>
                </SettingSection>

                {/* YouTube Settings */}
                {activePlatform === 'youtube' && (
                    <YouTubeSettings
                        settings={activeSettings}
                        onSettingChange={handleSettingChange}
                        playlists={youtubePlaylists}
                        loadingPlaylists={loadingPlaylists}
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

                {/* Instagram Settings */}
                {activePlatform === 'instagram' && (
                    <InstagramSettings
                        settings={activeSettings}
                        onSettingChange={handleSettingChange}
                    />
                )}

                {/* Product Tagging - Only for Instagram/Facebook */}
                {activeSpec.features.productTagging && !['tiktok', 'youtube'].includes(activePlatform) && (
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
