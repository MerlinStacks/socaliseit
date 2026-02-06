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
    Upload,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type Platform } from '@/lib/platform-config';
import { CharacterRingRow } from './character-ring';
import { ThumbnailPicker } from './thumbnail-picker';
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
    selectedAccounts: _selectedAccounts = [],
    media,
    onMediaChange,
    onAIAssist,
    onAddMedia,
    onOpenTemplates,
    postTypes: _postTypes = {},
    // First comment props - kept for interface compatibility, handled by CustomizationPanel
    firstComment: _firstComment,
    onFirstCommentChange: _onFirstCommentChange,
    platformFirstComments: _platformFirstComments = {},
    onPlatformFirstCommentChange: _onPlatformFirstCommentChange,
    onActivePlatformChange,
    isAIRewriting,
    className,
}: TabbedPlatformEditorProps) {
    const [activeTab, setActiveTab] = useState<EditorTab>('all');
    const [contentKey, setContentKey] = useState(0);
    const [isFocused, setIsFocused] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const emojiPickerRef = useRef<HTMLDivElement>(null);

    // Handle tab change with animation (prefixed as may be needed for future features)
    const _handleTabChange = useCallback((newTab: EditorTab) => {
        if (newTab === activeTab) return;
        setActiveTab(newTab);
        setContentKey(prev => prev + 1); // Trigger content animation

        // Notify parent of platform change for preview sync
        if (newTab !== 'all') {
            onActivePlatformChange?.(newTab as Platform);
        } else if (selectedPlatforms.length > 0) {
            // When switching to 'all', default to first platform for preview
            onActivePlatformChange?.(selectedPlatforms[0]);
        }
    }, [activeTab, onActivePlatformChange, selectedPlatforms]);

    // Reset to 'all' tab when platforms change
    useEffect(() => {
        if (activeTab !== 'all' && !selectedPlatforms.includes(activeTab as Platform)) {
            setActiveTab('all');
            setContentKey(prev => prev + 1);
            if (selectedPlatforms.length > 0) {
                onActivePlatformChange?.(selectedPlatforms[0]);
            }
        }
    }, [selectedPlatforms, activeTab, onActivePlatformChange]);

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

    // Handle thumbnail change for a video
    const handleThumbnailChange = useCallback((videoId: string, thumbnailUrl: string) => {
        onMediaChange(media.map(m =>
            m.id === videoId ? { ...m, customThumbnailUrl: thumbnailUrl } : m
        ));
    }, [media, onMediaChange]);

    // Get the first video for thumbnail picker (if any)
    const firstVideo = media.find(m => m.type === 'video');

    // Platforms to show character counts for
    const countPlatforms = activeTab === 'all' ? selectedPlatforms : [activeTab as Platform];



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
            {/* Header Bar - Simplified */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
                <h3 className="text-sm font-semibold">Caption</h3>
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
                        className="min-h-[200px] w-full resize-none rounded-xl bg-transparent p-4 pb-12 text-sm outline-none placeholder:text-[var(--text-muted)]"
                    />

                    {/* Character Rings - Inside textarea, bottom-right */}
                    <div className="absolute bottom-2 right-3 flex items-center gap-1">
                        <CharacterRingRow
                            text={displayedCaption}
                            platforms={countPlatforms}
                            size={24}
                        />
                    </div>

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
