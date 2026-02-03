/**
 * Customization Panel Component
 * Right sidebar for per-platform customization and preview
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import { ChevronRight, Image, Play, Edit3, Check, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    PLATFORM_SPECS,
    type Platform,
    type PostType,
    formatPostType,
    getPostTypeIcon,
} from '@/lib/platform-config';
import { PlatformIcon } from './profile-selector';
import { ProductTagging, type ProductTag } from './product-tagging';
import { CharacterCounter } from './inline-validation';
import type { MediaItem } from './platform-editor';

export interface PlatformSettings {
    postType: PostType;
    callToAction?: string;
    captionOverride?: string;
    mediaOverride?: string[]; // Media IDs
    autoPublish: boolean;
    productTags?: ProductTag[];

    // YouTube-specific settings
    videoTitle?: string;
    privacy?: 'public' | 'private' | 'unlisted';
    commentsEnabled?: boolean;
    category?: string;
    playlist?: string;
    embeddable?: boolean;
    createFirstLike?: boolean;
    videoTags?: string[];

    // Pinterest-specific settings
    pinTitle?: string;
    pinLink?: string;
    boardId?: string;
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
    /** First comment text value */
    firstComment?: string;
    /** Called when first comment changes */
    onFirstCommentChange?: (value: string) => void;
    /** Selected account IDs for fetching platform-specific data */
    selectedAccountIds?: string[];
    className?: string;
}

/**
 * Per-platform customization panel with preview
 * Why: Different platforms have different requirements and options.
 * This panel allows users to customize content for each platform individually.
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
    firstComment,
    onFirstCommentChange,
    selectedAccountIds = [],
    className,
}: CustomizationPanelProps) {
    const activeSpec = PLATFORM_SPECS[activePlatform];
    const activeSettings = settings[activePlatform] || {
        postType: 'feed' as PostType,
        autoPublish: false,
    };

    // Platforms that support first comment
    const supportsFirstComment = ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'].includes(activePlatform);

    // YouTube playlists state
    const [youtubePlaylists, setYoutubePlaylists] = useState<YouTubePlaylist[]>([]);
    const [loadingPlaylists, setLoadingPlaylists] = useState(false);

    // Pinterest boards state
    const [pinterestBoards, setPinterestBoards] = useState<PinterestBoard[]>([]);
    const [loadingBoards, setLoadingBoards] = useState(false);

    // Fetch YouTube playlists when YouTube is active
    useEffect(() => {
        if (activePlatform !== 'youtube' || selectedAccountIds.length === 0) {
            setYoutubePlaylists([]);
            return;
        }

        const fetchPlaylists = async () => {
            // Find a YouTube account from selected accounts
            // In practice, you'd filter by platform - for now use first selected
            const accountId = selectedAccountIds[0];
            if (!accountId) return;

            setLoadingPlaylists(true);
            try {
                const res = await fetch(`/api/platforms/youtube/playlists?accountId=${accountId}`);
                const data = await res.json();
                if (data.playlists) {
                    setYoutubePlaylists(data.playlists);
                }
            } catch (err) {
                console.error('Failed to fetch YouTube playlists:', err);
            } finally {
                setLoadingPlaylists(false);
            }
        };

        fetchPlaylists();
    }, [activePlatform, selectedAccountIds]);

    // Fetch Pinterest boards when Pinterest is active
    useEffect(() => {
        if (activePlatform !== 'pinterest' || selectedAccountIds.length === 0) {
            setPinterestBoards([]);
            return;
        }

        const fetchBoards = async () => {
            // Find a Pinterest account from selected accounts
            const accountId = selectedAccountIds[0];
            if (!accountId) return;

            setLoadingBoards(true);
            try {
                const res = await fetch(`/api/platforms/pinterest/boards?accountId=${accountId}`);
                const data = await res.json();
                if (data.boards) {
                    setPinterestBoards(data.boards);
                }
            } catch (err) {
                console.error('Failed to fetch Pinterest boards:', err);
            } finally {
                setLoadingBoards(false);
            }
        };

        fetchBoards();
    }, [activePlatform, selectedAccountIds]);

    const handleSettingChange = <K extends keyof PlatformSettings>(
        key: K,
        value: PlatformSettings[K]
    ) => {
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
                                isActive
                                    ? 'bg-[var(--accent-gold-light)]'
                                    : 'hover:bg-[var(--bg-tertiary)]'
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
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3">
                    <h3 className="text-sm font-semibold">Customize your post</h3>
                    <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                </div>

                {/* Caption Override */}
                <SettingSection title="Caption" subtitle="Click to edit caption">
                    <CaptionOverrideEditor
                        platform={activePlatform}
                        defaultCaption={caption}
                        override={activeSettings.captionOverride}
                        onChange={(value) => handleSettingChange('captionOverride', value)}
                    />
                </SettingSection>

                {/* Media Override */}
                <SettingSection title="Media" subtitle="Click to edit media">
                    <MediaOverrideEditor
                        media={media}
                        override={activeSettings.mediaOverride}
                        onChange={(value) => handleSettingChange('mediaOverride', value)}
                        onAddMedia={onAddMedia}
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
                            onChange={(e) =>
                                handleSettingChange('callToAction', e.target.value || undefined)
                            }
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                        >
                            <option value="">No CTA</option>
                            {activeSpec.callToActions.map((cta) => (
                                <option key={cta.id} value={cta.id}>
                                    {cta.label}
                                </option>
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
                                {getPostTypeIcon(postType)} {formatPostType(postType)}
                            </option>
                        ))}
                    </select>
                </SettingSection>

                {/* === YouTube-Specific Settings === */}
                {activePlatform === 'youtube' && (
                    <>
                        {/* Video Title (Required) */}
                        <SettingSection title="Video title *" subtitle="Required for YouTube uploads">
                            <input
                                type="text"
                                value={activeSettings.videoTitle || ''}
                                onChange={(e) => handleSettingChange('videoTitle', e.target.value)}
                                placeholder="Enter video title..."
                                maxLength={100}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            />
                            <div className="mt-1 text-xs text-[var(--text-muted)]">
                                {(activeSettings.videoTitle || '').length} / 100
                            </div>
                        </SettingSection>

                        {/* Privacy Setting */}
                        <SettingSection title="Privacy">
                            <select
                                value={activeSettings.privacy || 'public'}
                                onChange={(e) => handleSettingChange('privacy', e.target.value as 'public' | 'private' | 'unlisted')}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            >
                                <option value="public">Public</option>
                                <option value="unlisted">Unlisted</option>
                                <option value="private">Private</option>
                            </select>
                        </SettingSection>

                        {/* Comments Setting */}
                        <SettingSection title="Post comments">
                            <select
                                value={activeSettings.commentsEnabled === false ? 'disabled' : 'enabled'}
                                onChange={(e) => handleSettingChange('commentsEnabled', e.target.value === 'enabled')}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            >
                                <option value="enabled">Enabled</option>
                                <option value="disabled">Disabled</option>
                            </select>
                        </SettingSection>

                        {/* Category Selector */}
                        <SettingSection title="Select category">
                            <select
                                value={activeSettings.category || ''}
                                onChange={(e) => handleSettingChange('category', e.target.value || undefined)}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            >
                                <option value="">Select category</option>
                                <option value="1">Film & Animation</option>
                                <option value="2">Autos & Vehicles</option>
                                <option value="10">Music</option>
                                <option value="15">Pets & Animals</option>
                                <option value="17">Sports</option>
                                <option value="19">Travel & Events</option>
                                <option value="20">Gaming</option>
                                <option value="22">People & Blogs</option>
                                <option value="23">Comedy</option>
                                <option value="24">Entertainment</option>
                                <option value="25">News & Politics</option>
                                <option value="26">Howto & Style</option>
                                <option value="27">Education</option>
                                <option value="28">Science & Technology</option>
                                <option value="29">Nonprofits & Activism</option>
                            </select>
                        </SettingSection>

                        {/* Playlist Selector */}
                        <SettingSection title="Select playlist">
                            <select
                                value={activeSettings.playlist || ''}
                                onChange={(e) => handleSettingChange('playlist', e.target.value || undefined)}
                                disabled={loadingPlaylists}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
                            >
                                <option value="">
                                    {loadingPlaylists ? 'Loading playlists...' : 'No playlist'}
                                </option>
                                {youtubePlaylists.map((playlist) => (
                                    <option key={playlist.id} value={playlist.id}>
                                        {playlist.title} {playlist.itemCount !== undefined ? `(${playlist.itemCount})` : ''}
                                    </option>
                                ))}
                            </select>
                        </SettingSection>

                        {/* Video Tags */}
                        <SettingSection title="Tag your video" subtitle="Separate tags with commas">
                            <input
                                type="text"
                                value={(activeSettings.videoTags || []).join(', ')}
                                onChange={(e) => {
                                    const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                                    handleSettingChange('videoTags', tags);
                                }}
                                placeholder="Tag 1, Tag 2, Tag 3..."
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            />
                        </SettingSection>

                        {/* Create First Like */}
                        <SettingSection title="Create first like">
                            <ToggleSwitch
                                enabled={activeSettings.createFirstLike || false}
                                onChange={(value) => handleSettingChange('createFirstLike', value)}
                            />
                        </SettingSection>

                        {/* Embeddable */}
                        <SettingSection title="Embeddable">
                            <ToggleSwitch
                                enabled={activeSettings.embeddable !== false}
                                onChange={(value) => handleSettingChange('embeddable', value)}
                            />
                        </SettingSection>
                    </>
                )}

                {/* === Pinterest-Specific Settings === */}
                {activePlatform === 'pinterest' && (
                    <>
                        {/* Pin Title */}
                        <SettingSection title="Pin title">
                            <input
                                type="text"
                                value={activeSettings.pinTitle || ''}
                                onChange={(e) => handleSettingChange('pinTitle', e.target.value)}
                                placeholder="Enter pin title..."
                                maxLength={100}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            />
                            <div className="mt-1 text-xs text-[var(--text-muted)]">
                                {(activeSettings.pinTitle || '').length} / 100
                            </div>
                        </SettingSection>

                        {/* Pin Link */}
                        <SettingSection title="Pin link" subtitle="Destination URL when pin is clicked">
                            <input
                                type="url"
                                value={activeSettings.pinLink || ''}
                                onChange={(e) => handleSettingChange('pinLink', e.target.value)}
                                placeholder="https://example.com/product"
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            />
                        </SettingSection>

                        {/* Board Selector */}
                        <SettingSection title="Select a board" subtitle="Required for Pinterest posts">
                            <select
                                value={activeSettings.boardId || ''}
                                onChange={(e) => handleSettingChange('boardId', e.target.value || undefined)}
                                disabled={loadingBoards}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
                            >
                                <option value="">
                                    {loadingBoards ? 'Loading boards...' : 'Select a board'}
                                </option>
                                {pinterestBoards.map((board) => (
                                    <option key={board.id} value={board.id}>
                                        {board.name} {board.pinCount !== undefined ? `(${board.pinCount} pins)` : ''}
                                    </option>
                                ))}
                            </select>
                        </SettingSection>
                    </>
                )}

                {/* Product Tagging (for platforms that support it) */}
                {activeSpec.features.productTagging && (
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

                {/* First Comment (for platforms that support it) */}
                {supportsFirstComment && onFirstCommentChange && (
                    <SettingSection
                        title="First Comment"
                        subtitle="Posted immediately after your main content"
                    >
                        <FirstCommentEditor
                            value={firstComment || ''}
                            onChange={onFirstCommentChange}
                            platform={activePlatform}
                        />
                    </SettingSection>
                )}
            </div>
        </div>
    );
}

interface SettingSectionProps {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}

function SettingSection({ title, subtitle, children }: SettingSectionProps) {
    return (
        <div className="border-b border-[var(--border)] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
                <div>
                    <div className="text-sm font-medium">{title}</div>
                    {subtitle && (
                        <div className="text-xs text-[var(--text-muted)]">{subtitle}</div>
                    )}
                </div>
            </div>
            {children}
        </div>
    );
}

interface ToggleSwitchProps {
    enabled: boolean;
    onChange: (enabled: boolean) => void;
}

function ToggleSwitch({ enabled, onChange }: ToggleSwitchProps) {
    return (
        <button
            onClick={() => onChange(!enabled)}
            className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                enabled ? 'bg-[var(--accent-gold)]' : 'bg-[var(--bg-tertiary)]'
            )}
        >
            <span
                className={cn(
                    'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                    enabled ? 'translate-x-5' : 'translate-x-0'
                )}
            />
        </button>
    );
}

interface CaptionOverrideEditorProps {
    platform: Platform;
    defaultCaption: string;
    override?: string;
    onChange: (value?: string) => void;
}

function CaptionOverrideEditor({
    platform,
    defaultCaption,
    override,
    onChange,
}: CaptionOverrideEditorProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(override || '');
    const spec = PLATFORM_SPECS[platform];
    const displayCaption = override || defaultCaption;
    const charCount = displayCaption.length;
    const limit = spec.characterLimits.caption.max;

    /**
     * Sync local state when override or platform changes
     * Why: Prevents edits in one platform's caption from affecting others
     * when switching between platforms
     */
    useEffect(() => {
        setLocalValue(override || '');
        setIsEditing(false);
    }, [override, platform]);

    if (isEditing) {
        return (
            <div className="space-y-2">
                <textarea
                    value={localValue}
                    onChange={(e) => setLocalValue(e.target.value)}
                    placeholder={defaultCaption || 'Enter caption...'}
                    className="min-h-[100px] w-full resize-none rounded-lg border border-[var(--accent-gold)] bg-[var(--bg-tertiary)] p-3 text-sm outline-none"
                />
                <div className="flex items-center justify-between">
                    <span
                        className={cn(
                            'text-xs',
                            charCount > limit ? 'text-red-500' : 'text-[var(--text-muted)]'
                        )}
                    >
                        {localValue.length} / {limit.toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                        <button
                            onClick={() => {
                                setLocalValue('');
                                setIsEditing(false);
                            }}
                            className="rounded px-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => {
                                onChange(localValue || undefined);
                                setIsEditing(false);
                            }}
                            className="flex items-center gap-1 rounded bg-[var(--accent-gold)] px-2 py-1 text-xs text-white"
                        >
                            <Check className="h-3 w-3" />
                            Save
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <button
            onClick={() => {
                setLocalValue(override || defaultCaption);
                setIsEditing(true);
            }}
            className="group flex w-full items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3 text-left hover:border-[var(--accent-gold)]"
        >
            <Edit3 className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--text-muted)] group-hover:text-[var(--accent-gold)]" />
            <div className="flex-1 min-w-0">
                <p className="line-clamp-2 text-sm text-[var(--text-secondary)]">
                    {displayCaption || 'No caption'}
                </p>
                <p
                    className={cn(
                        'mt-1 text-xs',
                        charCount > limit ? 'text-red-500' : 'text-[var(--text-muted)]'
                    )}
                >
                    {charCount} / {limit.toLocaleString()}
                </p>
            </div>
        </button>
    );
}

interface MediaOverrideEditorProps {
    media: MediaItem[];
    override?: string[];
    onChange: (value?: string[]) => void;
    onAddMedia?: () => void;
}

function MediaOverrideEditor({ media, override, onChange, onAddMedia }: MediaOverrideEditorProps) {
    const displayMedia = override
        ? media.filter((m) => override.includes(m.id))
        : media;

    if (displayMedia.length === 0) {
        return (
            <button
                onClick={() => onAddMedia?.()}
                className="flex w-full items-center gap-3 rounded-lg border border-dashed border-[var(--border)] bg-transparent p-4 text-[var(--text-muted)] hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
            >
                <Image className="h-5 w-5" />
                <span className="text-sm">Add media for this platform</span>
            </button>
        );
    }

    return (
        <div className="flex gap-2">
            {displayMedia.slice(0, 4).map((item) => (
                <div
                    key={item.id}
                    className="relative h-14 w-14 overflow-hidden rounded-lg"
                >
                    <img
                        src={item.thumbnailUrl || item.url}
                        alt=""
                        className="h-full w-full object-cover"
                    />
                    {item.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Play className="h-4 w-4 text-white" fill="white" />
                        </div>
                    )}
                </div>
            ))}
            {displayMedia.length > 4 && (
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--bg-tertiary)] text-sm font-medium text-[var(--text-muted)]">
                    +{displayMedia.length - 4}
                </div>
            )}
        </div>
    );
}

// PlatformPreview is now imported from './platform-previews'

/**
 * First Comment Editor for customization panel
 * Why: Inline editor for first comment with platform-specific character limits
 */
interface FirstCommentEditorProps {
    value: string;
    onChange: (value: string) => void;
    platform: Platform;
}

function FirstCommentEditor({ value, onChange, platform }: FirstCommentEditorProps) {
    // Get comment character limit for platform
    const getCommentLimit = (p: Platform): number => {
        switch (p) {
            case 'instagram':
                return 2200;
            case 'facebook':
                return 8000;
            case 'tiktok':
                return 150;
            case 'youtube':
                return 10000;
            case 'linkedin':
                return 1250;
            default:
                return 2200;
        }
    };

    const characterLimit = getCommentLimit(platform);
    const isOverLimit = value.length > characterLimit;

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <MessageCircle className="h-3 w-3" />
                <span>Great for hashtags, CTAs, or questions</span>
            </div>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Add your first comment..."
                rows={2}
                className={cn(
                    'w-full resize-none rounded-lg border bg-[var(--bg-tertiary)] p-2 text-sm outline-none transition-colors',
                    isOverLimit
                        ? 'border-red-500'
                        : 'border-[var(--border)] focus:border-[var(--accent-gold)]'
                )}
            />
            <div className="flex items-center justify-between">
                <span className="text-xs text-[var(--text-muted)]">
                    {value.length > 0 ? `${value.length} / ${characterLimit}` : ''}
                </span>
            </div>
        </div>
    );
}

/**
 * Get default settings for a platform
 */
export function getDefaultPlatformSettings(platform: Platform): PlatformSettings {
    const spec = PLATFORM_SPECS[platform];
    return {
        postType: spec.supportedPostTypes[0] || 'feed',
        autoPublish: false,
    };
}
