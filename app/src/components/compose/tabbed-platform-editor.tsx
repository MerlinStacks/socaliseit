/**
 * TabbedPlatformEditor - Unified editor with platform tabs
 * Why: Replaces separate Editor + CustomizationPanel with a single tabbed interface
 * for better UX and reduced horizontal space usage.
 */

'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import EmojiPicker from 'emoji-picker-react';
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
import { PLATFORM_LIMITS } from '@/lib/validation';
import type { MediaInfo } from '@/lib/validation/types';
import { MediaCarousel } from './media-carousel';
import { MediaValidationSummary } from './media-validation-badge';
import { ToggleSwitch } from './customization-ui';
import { FirstCommentEditor } from './first-comment-editor';
import type { PlatformSettings } from './customization-panel';

export interface MediaItem {
    id: string;
    url: string;
    thumbnailUrl?: string;
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
    caption: string;
    onCaptionChange: (caption: string) => void;
    selectedPlatforms: Platform[];
    media: MediaItem[];
    onMediaChange: (media: MediaItem[]) => void;
    onAIAssist?: () => void;
    onAddMedia?: () => void;
    onOpenTemplates?: () => void;
    /** Post types per platform for media validation */
    postTypes?: Record<string, string>;
    /** Platform settings for customization options */
    platformSettings: Record<string, PlatformSettings>;
    onSettingsChange: (platform: Platform, settings: Partial<PlatformSettings>) => void;
    /** First comment support */
    firstComment?: string;
    onFirstCommentChange?: (value: string) => void;
    className?: string;
}

/**
 * TabbedPlatformEditor - Editor with "All" + platform tabs
 */
export function TabbedPlatformEditor({
    caption,
    onCaptionChange,
    selectedPlatforms,
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
    className,
}: TabbedPlatformEditorProps) {
    const [activeTab, setActiveTab] = useState<EditorTab>('all');
    const [isFocused, setIsFocused] = useState(false);
    const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);

    // Reset to 'all' tab when platforms change
    useEffect(() => {
        if (activeTab !== 'all' && !selectedPlatforms.includes(activeTab as Platform)) {
            setActiveTab('all');
        }
    }, [selectedPlatforms, activeTab]);

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

    // Text manipulation helpers
    const insertAtCursor = useCallback((text: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = caption.substring(0, start) + text + caption.substring(end);
        onCaptionChange(newValue);
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
        });
    }, [caption, onCaptionChange]);

    const wrapSelection = useCallback((prefix: string, suffix: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = caption.substring(start, end);
        const newValue = caption.substring(0, start) + prefix + selectedText + suffix + caption.substring(end);
        onCaptionChange(newValue);
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + prefix.length, end + prefix.length);
        });
    }, [caption, onCaptionChange]);

    const toggleHeading = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        const cursorPos = textarea.selectionStart;
        const lineStart = caption.lastIndexOf('\n', cursorPos - 1) + 1;
        const lineEnd = caption.indexOf('\n', cursorPos);
        const actualEnd = lineEnd === -1 ? caption.length : lineEnd;
        const line = caption.substring(lineStart, actualEnd);
        const isHeading = line.startsWith('# ');
        const newLine = isHeading ? line.slice(2) : '# ' + line;
        const newValue = caption.substring(0, lineStart) + newLine + caption.substring(actualEnd);
        onCaptionChange(newValue);
        const offset = isHeading ? -2 : 2;
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(cursorPos + offset, cursorPos + offset);
        });
    }, [caption, onCaptionChange]);

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

    // Calculated stats
    const hashtags = useMemo(() => caption.match(/#[a-zA-Z0-9_]+/g) || [], [caption]);
    const mentions = useMemo(() => caption.match(/@[a-zA-Z0-9_]+/g) || [], [caption]);

    // Platforms to show character counts for
    const countPlatforms = activeTab === 'all' ? selectedPlatforms : [activeTab as Platform];

    // Check if first comment is supported
    const supportsFirstComment = activePlatform &&
        ['instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'].includes(activePlatform);

    return (
        <div className={cn('flex h-full flex-col bg-[var(--bg-primary)]', className)}>
            {/* Tab Bar */}
            <div className="flex items-center gap-1 border-b border-[var(--border)] px-4 py-3">
                {/* All Tab */}
                <button
                    onClick={() => setActiveTab('all')}
                    className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        activeTab === 'all'
                            ? 'bg-[var(--accent-gold)] text-white'
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
                            onClick={() => setActiveTab(platform)}
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

            {/* Editor Area */}
            <div className="flex-1 overflow-y-auto p-6">
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
                        value={caption}
                        onChange={(e) => onCaptionChange(e.target.value)}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        placeholder="What's on your mind? Share your thoughts, updates, or story..."
                        className="min-h-[200px] w-full resize-none rounded-xl bg-transparent p-4 text-sm outline-none placeholder:text-[var(--text-muted)]"
                    />

                    {/* Emoji Picker */}
                    {showEmojiPicker && (
                        <div ref={emojiPickerRef} className="absolute bottom-16 right-4 z-50 shadow-xl">
                            <EmojiPicker onEmojiClick={onEmojiClick} width={300} height={400} />
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
                            <ToolbarButton icon={Sparkles} label="AI Assistant" onClick={onAIAssist} />
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
                                <CharacterCounter text={caption} platform={platformKey} compact />
                            </div>
                        );
                    })}
                </div>

                {/* Platform-Specific Options (only on platform tabs) */}
                {activeTab !== 'all' && activeSettings && activeSpec && (
                    <div className="mt-4 space-y-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                            {activeSpec.name} Options
                        </h4>

                        {/* Post Type Selector */}
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

                        {/* Call to Action (if supported) */}
                        {activeSpec.callToActions && activeSpec.callToActions.length > 0 && (
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

                        {/* Auto Publish Toggle */}
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-[var(--text-secondary)]">Auto Publish</span>
                            <ToggleSwitch
                                enabled={activeSettings.autoPublish}
                                onChange={(value) => handleSettingChange('autoPublish', value)}
                            />
                        </div>

                        {/* First Comment */}
                        {supportsFirstComment && onFirstCommentChange && (
                            <div className="space-y-2">
                                <span className="text-sm text-[var(--text-secondary)]">First Comment</span>
                                <FirstCommentEditor
                                    value={firstComment || ''}
                                    onChange={onFirstCommentChange}
                                    platform={activePlatform}
                                />
                            </div>
                        )}
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

                {/* Media Carousel */}
                {media.length > 0 && (
                    <div className="mt-6">
                        <MediaCarousel
                            items={media}
                            selectedIds={selectedMediaIds}
                            onSelectionChange={setSelectedMediaIds}
                            onRemove={handleRemoveMedia}
                            onBulkRemove={handleBulkRemoveMedia}
                            onAddMore={onAddMedia}
                            platforms={countPlatforms}
                            postTypes={postTypes}
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
}

function ToolbarButton({ icon: Icon, label, onClick, isActive }: ToolbarButtonProps) {
    return (
        <button
            onClick={onClick}
            title={label}
            className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg transition-colors',
                isActive
                    ? 'bg-[var(--accent-gold)] text-white'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
            )}
        >
            <Icon className="h-4 w-4" />
        </button>
    );
}
