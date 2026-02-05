/**
 * TabbedPlatformEditor - Unified editor with platform tabs
 * Why: Replaces separate Editor + CustomizationPanel with a single tabbed interface
 * for better UX and reduced horizontal space usage.
 */

'use client';

import { useState, useMemo, useCallback, useRef, useEffect, type DragEvent } from 'react';
import EmojiPicker, { EmojiStyle } from 'emoji-picker-react';
import {
    Bold,
    Italic,
    List,
    Hash,
    AtSign,
    Type,
    Smile,
    Image,
    Link,
    Sparkles,
    Bookmark,
    ChevronDown,
    Upload,
    Loader2,
    RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    PLATFORM_SPECS,
    type Platform,
    type PostType,
    formatPostType,
} from '@/lib/platform-config';
import { PlatformIcon } from './profile-selector';
import { CharacterCounter } from './inline-validation';
import { CharacterRingRow } from './character-ring';
import { PLATFORM_LIMITS } from '@/lib/validation';
import type { MediaInfo } from '@/lib/validation/types';
import { MediaCarousel } from './media-carousel';
import { MediaValidationSummary } from './media-validation-badge';
import { ToggleSwitch } from './customization-ui';
import { FirstCommentEditor } from './first-comment-editor';
import { ThumbnailPicker } from './thumbnail-picker';
import { LocationPicker } from './location-picker';
import type { PlatformSettings } from './customization-panel';
import type { SocialAccount } from './profile-selector';

export interface MediaItem {
    id: string;
    url: string;
    thumbnailUrl?: string;
    /** User-selected custom thumbnail (frame pick or upload) */
    customThumbnailUrl?: string;
    type: 'image' | 'video';
    width?: number;
    height?: number;
    duration?: number;
    size: number;
    filename?: string;
    mimeType?: string;
}

/** Tab can be 'all' or a specific platform */
type EditorTab = 'all' | Platform;

interface TabbedPlatformEditorProps {
    /** Global caption (used for "All" tab) */
    caption: string;
    /** Callback to update global caption ("All" tab) */
    onCaptionChange: (caption: string) => void;
    /** Per-platform caption overrides keyed by platform */
    platformCaptions?: Partial<Record<Platform, string>>;
    /** Callback to update platform-specific caption override */
    onPlatformCaptionChange?: (platform: Platform, caption: string) => void;
    selectedPlatforms: Platform[];
    /** Selected accounts for platform-specific API calls */
    selectedAccounts?: SocialAccount[];
    media: MediaItem[];
    onMediaChange: (media: MediaItem[]) => void;
    onAIAssist?: (activePlatform?: Platform | null) => void;
    onAddMedia?: () => void;
    onOpenTemplates?: () => void;
    /** Post types per platform for media validation */
    postTypes?: Record<string, string>;
    /** Platform settings for customization options */
    platformSettings: Record<string, PlatformSettings>;
    onSettingsChange: (platform: Platform, settings: Partial<PlatformSettings>) => void;
    /** First comment support - global value used for "All" tab */
    firstComment?: string;
    onFirstCommentChange?: (value: string) => void;
    /** Per-platform first comment overrides keyed by platform */
    platformFirstComments?: Partial<Record<Platform, string>>;
    /** Callback to update platform-specific first comment override */
    onPlatformFirstCommentChange?: (platform: Platform, value: string) => void;
    /** Callback when active platform tab changes (for syncing preview) */
    onActivePlatformChange?: (platform: Platform) => void;
    /** AI rewriting loading state - shows spinner on AI button */
    isAIRewriting?: boolean;
    className?: string;
}

/**
 * TabbedPlatformEditor - Editor with "All" + platform tabs
 */
export function TabbedPlatformEditor({
    caption,
    onCaptionChange,
    platformCaptions = {},
    onPlatformCaptionChange,
    selectedPlatforms,
    selectedAccounts = [],
    media,
    onMediaChange,
    onAIAssist,
    onAddMedia,
    onOpenTemplates,
    postTypes = {},
    platformSettings,
    onSettingsChange,
    firstComment,
    onFirstCommentChange,
    platformFirstComments = {},
    onPlatformFirstCommentChange,
    onActivePlatformChange,
    isAIRewriting,
    className,
}: TabbedPlatformEditorProps) {
    const [activeTab, setActiveTab] = useState<EditorTab>('all');
    const [previousTab, setPreviousTab] = useState<EditorTab | null>(null);
    const [flashColor, setFlashColor] = useState<string | null>(null);
    const [contentKey, setContentKey] = useState(0);
    const [isFocused, setIsFocused] = useState(false);
    const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);

    // Pinterest boards state
    const [pinterestBoards, setPinterestBoards] = useState<Array<{ id: string; name: string; pinCount?: number }>>([]);
    const [loadingBoards, setLoadingBoards] = useState(false);

    // Reset to 'all' tab when platforms change
    useEffect(() => {
        if (activeTab !== 'all' && !selectedPlatforms.includes(activeTab as Platform)) {
            handleTabChange('all');
        }
    }, [selectedPlatforms, activeTab]);

    // Handle tab change with animation
    const handleTabChange = (newTab: EditorTab) => {
        if (newTab === activeTab) return;
        setPreviousTab(activeTab);
        setActiveTab(newTab);
        setContentKey(prev => prev + 1); // Trigger content animation

        // Set flash color based on target platform
        if (newTab !== 'all') {
            const spec = PLATFORM_SPECS[newTab as Platform];
            setFlashColor(spec?.color || null);
            // Clear flash after animation
            setTimeout(() => setFlashColor(null), 300);
            // Notify parent of platform change for preview sync
            onActivePlatformChange?.(newTab as Platform);
        } else if (selectedPlatforms.length > 0) {
            // When switching to 'all', default to first platform for preview
            onActivePlatformChange?.(selectedPlatforms[0]);
        }
    };

    // Close emoji picker on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Get active platform settings
    const activePlatform = activeTab === 'all' ? selectedPlatforms[0] : activeTab;
    const activeSettings = activePlatform ? platformSettings[activePlatform] : null;
    const activeSpec = activePlatform ? PLATFORM_SPECS[activePlatform] : null;

    // Fetch Pinterest boards
    const fetchPinterestBoards = useCallback(async () => {
        const isPinterest = activePlatform === 'pinterest';
        if (!isPinterest || selectedAccounts.length === 0) {
            setPinterestBoards([]);
            return;
        }
        // Find the Pinterest account from selected accounts
        const pinterestAccount = selectedAccounts.find(acc => acc.platform === 'pinterest');
        if (!pinterestAccount) {
            setPinterestBoards([]);
            return;
        }

        setLoadingBoards(true);
        try {
            const res = await fetch(`/api/platforms/pinterest/boards?accountId=${pinterestAccount.id}`);
            const data = await res.json();
            if (data.boards) {
                setPinterestBoards(data.boards);
            } else if (data.error) {
                console.error('Pinterest boards API error:', data.error);
            }
        } catch (err) {
            console.error('Failed to fetch Pinterest boards:', err);
        } finally {
            setLoadingBoards(false);
        }
    }, [activePlatform, selectedAccounts]);

    // Fetch Pinterest boards when Pinterest is selected or account changes
    useEffect(() => {
        fetchPinterestBoards();
    }, [fetchPinterestBoards]);

    /**
     * Compute the displayed caption based on active tab
     * Why: "All" tab shows global caption; platform tabs show override or fallback to global
     */
    const displayedCaption = useMemo(() => {
        if (activeTab === 'all') return caption;
        const override = platformCaptions[activeTab as Platform];
        return override !== undefined ? override : caption;
    }, [activeTab, caption, platformCaptions]);

    /**
     * Compute the displayed first comment based on active tab
     * Why: "All" tab shows global first comment; platform tabs show override or fallback to global
     */
    const displayedFirstComment = useMemo(() => {
        if (activeTab === 'all') return firstComment || '';
        const override = platformFirstComments[activeTab as Platform];
        return override !== undefined ? override : (firstComment || '');
    }, [activeTab, firstComment, platformFirstComments]);

    /**
     * Handle caption change based on active tab
     * Why: "All" tab updates global caption; platform tabs update per-platform override
     */
    const handleCaptionChange = useCallback((newValue: string) => {
        if (activeTab === 'all') {
            onCaptionChange(newValue);
        } else if (onPlatformCaptionChange) {
            onPlatformCaptionChange(activeTab as Platform, newValue);
        }
    }, [activeTab, onCaptionChange, onPlatformCaptionChange]);

    /**
     * Handle first comment change based on active tab
     * Why: "All" tab updates global first comment; platform tabs update per-platform override
     */
    const handleFirstCommentChange = useCallback((newValue: string) => {
        if (activeTab === 'all') {
            onFirstCommentChange?.(newValue);
        } else if (onPlatformFirstCommentChange) {
            onPlatformFirstCommentChange(activeTab as Platform, newValue);
        }
    }, [activeTab, onFirstCommentChange, onPlatformFirstCommentChange]);

    // Text manipulation helpers
    const insertAtCursor = useCallback((text: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = displayedCaption.substring(0, start) + text + displayedCaption.substring(end);
        handleCaptionChange(newValue);
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
        });
    }, [displayedCaption, handleCaptionChange]);

    const wrapSelection = useCallback((prefix: string, suffix: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = displayedCaption.substring(start, end);
        const newValue = displayedCaption.substring(0, start) + prefix + selectedText + suffix + displayedCaption.substring(end);
        handleCaptionChange(newValue);
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + prefix.length, end + prefix.length);
        });
    }, [displayedCaption, handleCaptionChange]);

    const toggleHeading = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const cursorPos = textarea.selectionStart;
        const lineStart = displayedCaption.lastIndexOf('\n', cursorPos - 1) + 1;
        const lineEnd = displayedCaption.indexOf('\n', cursorPos);
        const actualEnd = lineEnd === -1 ? displayedCaption.length : lineEnd;
        const line = displayedCaption.substring(lineStart, actualEnd);
        const isHeading = line.startsWith('# ');
        const newLine = isHeading ? line.slice(2) : '# ' + line;
        const newValue = displayedCaption.substring(0, lineStart) + newLine + displayedCaption.substring(actualEnd);
        handleCaptionChange(newValue);
        const offset = isHeading ? -2 : 2;
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(cursorPos + offset, cursorPos + offset);
        });
    }, [displayedCaption, handleCaptionChange]);

    const insertLink = useCallback(() => {
        const url = window.prompt('Enter URL:');
        if (url) wrapSelection('[', `](${url})`);
    }, [wrapSelection]);

    const toggleList = useCallback(() => insertAtCursor('\n- '), [insertAtCursor]);

    const onEmojiClick = (emojiObject: { emoji: string }) => {
        insertAtCursor(emojiObject.emoji);
        setShowEmojiPicker(false);
    };

    // Media handlers
    const handleRemoveMedia = useCallback((id: string) => {
        onMediaChange(media.filter(m => m.id !== id));
        setSelectedMediaIds(prev => prev.filter(sid => sid !== id));
    }, [media, onMediaChange]);

    const handleBulkRemoveMedia = useCallback((ids: string[]) => {
        onMediaChange(media.filter(m => !ids.includes(m.id)));
        setSelectedMediaIds([]);
    }, [media, onMediaChange]);

    // Settings change handler for current platform
    const handleSettingChange = <K extends keyof PlatformSettings>(key: K, value: PlatformSettings[K]) => {
        if (activePlatform) {
            onSettingsChange(activePlatform, { [key]: value });
        }
    };

    // Handle thumbnail change for a video
    const handleThumbnailChange = useCallback((videoId: string, thumbnailUrl: string) => {
        onMediaChange(media.map(m =>
            m.id === videoId ? { ...m, customThumbnailUrl: thumbnailUrl } : m
        ));
    }, [media, onMediaChange]);

    // Get the first video for thumbnail picker (if any)
    const firstVideo = media.find(m => m.type === 'video');

    // Calculated stats (based on displayed caption for current tab)
    const hashtags = useMemo(() => displayedCaption.match(/#[a-zA-Z0-9_]+/g) || [], [displayedCaption]);
    const mentions = useMemo(() => displayedCaption.match(/@[a-zA-Z0-9_]+/g) || [], [displayedCaption]);

    // Platforms to show character counts for
    const countPlatforms = activeTab === 'all' ? selectedPlatforms : [activeTab as Platform];

    // Check if first comment is supported
    const supportsFirstComment = activePlatform &&
        ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'].includes(activePlatform);

    // Drag and drop handlers
    const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        // Only hide if leaving the container (not entering a child)
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        if (
            e.clientX <= rect.left ||
            e.clientX >= rect.right ||
            e.clientY <= rect.top ||
            e.clientY >= rect.bottom
        ) {
            setIsDragOver(false);
        }
    }, []);

    const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const files = e.dataTransfer.files;
        if (files.length > 0 && onAddMedia) {
            // Trigger the add media modal - the actual file handling would be done there
            // For now, we'll just open the modal. In a full implementation,
            // you'd pass the files directly to the upload handler.
            onAddMedia();
        }
    }, [onAddMedia]);

    return (
        <div className={cn('flex h-full flex-col bg-[var(--bg-primary)]', className)}>
            {/* Tab Bar */}
            <div className="flex items-center gap-1 border-b border-[var(--border)] px-4 py-3">
                {/* All Tab */}
                <button
                    onClick={() => handleTabChange('all')}
                    className={cn(
                        'relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                        activeTab === 'all'
                            ? 'bg-[var(--accent-gold)] text-white scale-[1.02]'
                            : 'text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]'
                    )}
                >
                    All
                </button>

                {/* Platform Tabs */}
                {selectedPlatforms.map((platform) => {
                    const spec = PLATFORM_SPECS[platform];
                    const isActive = activeTab === platform;
                    return (
                        <button
                            key={platform}
                            onClick={() => handleTabChange(platform)}
                            className={cn(
                                'relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-150',
                                isActive ? 'bg-[var(--accent-gold-light)] scale-[1.05]' : 'hover:bg-[var(--bg-tertiary)]'
                            )}
                            style={{ color: isActive ? spec.color : 'var(--text-muted)' }}
                            title={spec.name}
                        >
                            <PlatformIcon platform={platform} size={20} />
                            {/* Platform color flash on activation */}
                            {isActive && flashColor && activeTab === platform && (
                                <span
                                    className="tab-flash"
                                    style={{ backgroundColor: spec.color }}
                                />
                            )}
                        </button>
                    );
                })}

                <div className="flex-1" />

                {/* Templates Button */}
                <button
                    onClick={onOpenTemplates}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
                >
                    <Bookmark className="h-4 w-4" />
                    Templates
                </button>
            </div>

            {/* Editor Area - with content fade animation and drag-drop support */}
            <div
                key={contentKey}
                className="relative flex-1 overflow-y-auto p-6 animate-tab-content"
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
            >
                {/* Drag and Drop Overlay */}
                {isDragOver && (
                    <div className="absolute inset-0 z-40 m-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--accent-gold)] bg-[var(--accent-gold-light)]/80 backdrop-blur-sm">
                        <Upload className="h-12 w-12 text-[var(--accent-gold)] mb-3" />
                        <p className="text-lg font-semibold text-[var(--accent-gold)]">Drop media here</p>
                        <p className="text-sm text-[var(--text-muted)]">Images and videos</p>
                    </div>
                )}

                {/* Text Area */}
                <div
                    className={cn(
                        'relative rounded-xl border-2 transition-colors',
                        isFocused
                            ? 'border-[var(--accent-gold)] bg-[var(--bg-secondary)]'
                            : 'border-[var(--border)] bg-[var(--bg-tertiary)]'
                    )}
                >
                    <textarea
                        ref={textareaRef}
                        value={displayedCaption}
                        onChange={(e) => handleCaptionChange(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder="What's on your mind? Share your thoughts, updates, or story..."
                        className="min-h-[200px] w-full resize-none rounded-xl bg-transparent p-4 text-sm outline-none placeholder:text-[var(--text-muted)]"
                    />

                    {/* Emoji Picker - positioned above toolbar to avoid overflow clipping */}
                    {showEmojiPicker && (
                        <div
                            ref={emojiPickerRef}
                            className="absolute right-4 z-[100] shadow-xl rounded-lg"
                            style={{ bottom: 'calc(100% - 180px)' }}
                        >
                            <EmojiPicker
                                onEmojiClick={onEmojiClick}
                                width={320}
                                height={400}
                                emojiVersion="16.0"
                                emojiStyle={EmojiStyle.NATIVE}
                                searchPlaceHolder="Search emojis..."
                                previewConfig={{ showPreview: false }}
                            />
                        </div>
                    )}

                    {/* Formatting Toolbar */}
                    <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2">
                        <div className="flex items-center gap-1">
                            <ToolbarButton icon={Bold} label="Bold" onClick={() => wrapSelection('**', '**')} />
                            <ToolbarButton icon={Italic} label="Italic" onClick={() => wrapSelection('_', '_')} />
                            <div className="mx-2 h-4 w-px bg-[var(--border)]" />
                            <ToolbarButton icon={List} label="List" onClick={toggleList} />
                            <ToolbarButton icon={Hash} label="Hashtag" onClick={() => insertAtCursor('#')} />
                            <ToolbarButton icon={AtSign} label="Mention" onClick={() => insertAtCursor('@')} />
                            <div className="mx-2 h-4 w-px bg-[var(--border)]" />
                            <ToolbarButton icon={Type} label="Heading" onClick={toggleHeading} />
                            <ToolbarButton icon={Smile} label="Emoji" onClick={() => setShowEmojiPicker(!showEmojiPicker)} isActive={showEmojiPicker} />
                            <ToolbarButton icon={Link} label="Link" onClick={insertLink} />
                        </div>
                        <div className="flex items-center gap-1">
                            <ToolbarButton icon={Sparkles} label="AI Assistant" onClick={() => onAIAssist?.(activeTab === 'all' ? null : activeTab as Platform)} isLoading={isAIRewriting} />
                            <ToolbarButton icon={Image} label="Media" onClick={onAddMedia} />
                        </div>
                    </div>
                </div>

                {/* Character Count Row */}
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3">
                    {countPlatforms.map((platform) => {
                        const platformKey = platform as keyof typeof PLATFORM_LIMITS;
                        return (
                            <div key={platform} className="flex items-center gap-2">
                                <PlatformIcon platform={platform} size={16} />
                                <CharacterCounter text={displayedCaption} platform={platformKey} compact />
                            </div>
                        );
                    })}
                </div>

                {/* Circular Character Rings - Visual Progress */}
                <CharacterRingRow
                    text={displayedCaption}
                    platforms={countPlatforms}
                    size={32}
                    className="mt-3"
                />

                {/* Post Details Options (shown on all tabs) */}
                {activeSettings && activeSpec && (
                    <div className="mt-4 space-y-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                            {activeTab === 'all' ? 'Post Details' : `${activeSpec.name} Options`}
                        </h4>

                        {/* First Comment (listed first) */}
                        {supportsFirstComment && (onFirstCommentChange || onPlatformFirstCommentChange) && (
                            <div className="space-y-2">
                                <span className="text-sm text-[var(--text-secondary)]">First Comment</span>
                                <FirstCommentEditor
                                    value={displayedFirstComment}
                                    onChange={handleFirstCommentChange}
                                    platform={activePlatform}
                                />
                            </div>
                        )}

                        {/* Post Type Selector (on platform tabs, OR on "All" when single platform selected) */}
                        {(activeTab !== 'all' || selectedPlatforms.length === 1) && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-[var(--text-secondary)]">Post Type</span>
                                <div className="relative">
                                    <select
                                        value={activeSettings.postType}
                                        onChange={(e) => handleSettingChange('postType', e.target.value as PostType)}
                                        className="appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] pl-3 pr-8 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                                    >
                                        {activeSpec.supportedPostTypes.map((postType) => (
                                            <option key={postType} value={postType}>
                                                {formatPostType(postType)}
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                                </div>
                            </div>
                        )}

                        {/* Call to Action (if supported, on platform tabs OR "All" when single platform) */}
                        {(activeTab !== 'all' || selectedPlatforms.length === 1) && activeSpec.callToActions && activeSpec.callToActions.length > 0 && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-[var(--text-secondary)]">Call to Action</span>
                                <div className="relative">
                                    <select
                                        value={activeSettings.callToAction || ''}
                                        onChange={(e) => handleSettingChange('callToAction', e.target.value || undefined)}
                                        className="appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] pl-3 pr-8 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                                    >
                                        <option value="">No CTA</option>
                                        {activeSpec.callToActions.map((cta) => (
                                            <option key={cta.id} value={cta.id}>{cta.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                                </div>
                            </div>
                        )}

                        {/* Location Picker (if supported, on platform tabs OR "All" when single platform) */}
                        {(activeTab !== 'all' || selectedPlatforms.length === 1) && activeSpec.features.locationTagging && (
                            <div className="space-y-2">
                                <span className="text-sm text-[var(--text-secondary)]">Location</span>
                                <LocationPicker
                                    value={activeSettings.location}
                                    onChange={(location) => handleSettingChange('location', location)}
                                    platform={activePlatform}
                                />
                            </div>
                        )}

                        {/* Pinterest-specific fields */}
                        {(activeTab !== 'all' || selectedPlatforms.length === 1) && activePlatform === 'pinterest' && (
                            <>
                                {/* Pin Title */}
                                <div className="space-y-2">
                                    <span className="text-sm text-[var(--text-secondary)]">Pin Title</span>
                                    <input
                                        type="text"
                                        value={activeSettings.pinTitle || ''}
                                        onChange={(e) => handleSettingChange('pinTitle', e.target.value)}
                                        placeholder="Enter pin title..."
                                        maxLength={100}
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                                    />
                                    <div className="text-xs text-[var(--text-muted)]">
                                        {(activeSettings.pinTitle || '').length} / 100
                                    </div>
                                </div>

                                {/* Pin Link */}
                                <div className="space-y-2">
                                    <div className="flex flex-col">
                                        <span className="text-sm text-[var(--text-secondary)]">Pin Link</span>
                                        <span className="text-xs text-[var(--text-muted)]">Destination URL when pin is clicked</span>
                                    </div>
                                    <input
                                        type="url"
                                        value={activeSettings.pinLink || ''}
                                        onChange={(e) => handleSettingChange('pinLink', e.target.value)}
                                        placeholder="https://example.com/product"
                                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                                    />
                                </div>

                                {/* Board Selector */}
                                <div className="space-y-2">
                                    <div className="flex flex-col">
                                        <span className="text-sm text-[var(--text-secondary)]">Board</span>
                                        <span className="text-xs text-[var(--text-muted)]">Required for Pinterest posts</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1">
                                            <select
                                                value={activeSettings.boardId || ''}
                                                onChange={(e) => handleSettingChange('boardId', e.target.value || undefined)}
                                                disabled={loadingBoards}
                                                className="w-full appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] pl-3 pr-8 py-2 text-sm outline-none focus:border-[var(--accent-gold)] disabled:opacity-50"
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
                                            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={fetchPinterestBoards}
                                            disabled={loadingBoards}
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                                            title="Refresh boards"
                                        >
                                            <RefreshCw className={`h-4 w-4 ${loadingBoards ? 'animate-spin' : ''}`} />
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* Auto Publish Toggle */}
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-[var(--text-secondary)]">Auto Publish</span>
                            <ToggleSwitch
                                enabled={activeSettings.autoPublish}
                                onChange={(value) => handleSettingChange('autoPublish', value)}
                            />
                        </div>
                    </div>
                )}

                {/* Media Validation Summary */}
                {media.length > 0 && (
                    <MediaValidationSummary
                        media={media.map((item): MediaInfo => ({
                            id: item.id,
                            type: item.type,
                            width: item.width || 0,
                            height: item.height || 0,
                            size: item.size || 0,
                            duration: item.duration,
                            mimeType: item.mimeType || '',
                            format: item.filename?.split('.').pop() || '',
                        }))}
                        platforms={countPlatforms}
                        postTypes={postTypes}
                        className="mt-4"
                    />
                )}


                {/* Video Thumbnail Picker - Show when there's a video */}
                {firstVideo && (
                    <div className="mt-6">
                        <ThumbnailPicker
                            videoUrl={firstVideo.url}
                            currentThumbnail={firstVideo.customThumbnailUrl || firstVideo.thumbnailUrl}
                            onThumbnailChange={(url) => handleThumbnailChange(firstVideo.id, url)}
                            onUploadCustom={onAddMedia}
                        />
                    </div>
                )}

                {/* Stats */}
                <div className="mt-6 flex items-center gap-6 text-xs text-[var(--text-muted)]">
                    <span><strong className="text-[var(--text-primary)]">{hashtags.length}</strong> hashtags</span>
                    <span><strong className="text-[var(--text-primary)]">{mentions.length}</strong> mentions</span>
                    <span><strong className="text-[var(--text-primary)]">{media.length}</strong> media files</span>
                </div>
            </div>
        </div>
    );
}

interface ToolbarButtonProps {
    icon: React.ElementType;
    label: string;
    onClick?: () => void;
    isActive?: boolean;
    isLoading?: boolean;
}

function ToolbarButton({ icon: Icon, label, onClick, isActive, isLoading }: ToolbarButtonProps) {
    return (
        <button
            onClick={onClick}
            title={label}
            disabled={isLoading}
            className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                isLoading && 'cursor-wait opacity-70',
                isActive
                    ? 'bg-[var(--accent-gold)] text-white'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
            )}
        >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        </button>
    );
}
