/**
 * Platform Editor Component
 * Central rich text editor with platform badges and character counts
 */

'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
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
    AlertCircle,
    Bookmark,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';
import { PlatformIcon } from './profile-selector';
import { CharacterCounter, HashtagCounter } from './inline-validation';
import { PLATFORM_LIMITS } from '@/lib/validation';
import { useUndoToast } from '@/components/ui/undo-toast';
import { toast } from '@/components/ui/toast';
import { MediaCarousel } from './media-carousel';

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

interface PlatformEditorProps {
    caption: string;
    onCaptionChange: (caption: string) => void;
    selectedPlatforms: Platform[];
    media: MediaItem[];
    onMediaChange: (media: MediaItem[]) => void;
    onAIAssist?: () => void;
    onAddMedia?: () => void;
    onOpenTemplates?: () => void;
    labels?: string[];
    selectedLabels?: string[];
    onLabelsChange?: (labels: string[]) => void;
    /** Post types per platform for media validation */
    postTypes?: Record<string, string>;
    className?: string;
}

/**
 * Rich text editor with platform-aware character counting
 * Why: Enables users to compose content with real-time feedback on
 * platform-specific limits and formatting options
 */
export function PlatformEditor({
    caption,
    onCaptionChange,
    selectedPlatforms,
    media,
    onMediaChange,
    onAIAssist,
    onAddMedia,
    onOpenTemplates,
    labels = [],
    selectedLabels = [],
    onLabelsChange,
    postTypes = {},
    className,
}: PlatformEditorProps) {
    const [isFocused, setIsFocused] = useState(false);
    const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    /**
     * Insert text at cursor position in textarea
     * Why: Enables toolbar buttons to insert characters at the current cursor position
     */
    const insertAtCursor = useCallback((text: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = caption.substring(0, start) + text + caption.substring(end);
        onCaptionChange(newValue);

        // Restore cursor position after the inserted text
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + text.length, start + text.length);
        });
    }, [caption, onCaptionChange]);

    /**
     * Wrap selected text with prefix and suffix (markdown-style formatting)
     * Why: Enables Bold (**) and Italic (_) formatting around selected text
     */
    const wrapSelection = useCallback((prefix: string, suffix: string) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = caption.substring(start, end);

        const newValue = caption.substring(0, start)
            + prefix + selectedText + suffix
            + caption.substring(end);

        onCaptionChange(newValue);

        // Reselect the wrapped text (excluding markers)
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(start + prefix.length, end + prefix.length);
        });
    }, [caption, onCaptionChange]);

    // [NEW] Emoji Picker State
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const emojiPickerRef = useRef<HTMLDivElement>(null);

    // [NEW] Close emoji picker on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target as Node)) {
                setShowEmojiPicker(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const onEmojiClick = (emojiObject: { emoji: string }) => {
        insertAtCursor(emojiObject.emoji);
        setShowEmojiPicker(false);
    };

    /**
     * [NEW] Toggle Heading (# ) at start of line
     */
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

    /**
     * [NEW] Insert Link (markdown style)
     */
    const insertLink = useCallback(() => {
        const url = window.prompt('Enter URL:');
        if (url) {
            wrapSelection('[', `](${url})`);
        }
    }, [wrapSelection]);

    const toggleList = useCallback(() => {
        insertAtCursor('\n- ');
    }, [insertAtCursor]);

    const handleRemoveMedia = useCallback((id: string) => {
        const newMedia = media.filter(m => m.id !== id);
        onMediaChange(newMedia);
        if (selectedMediaIds.includes(id)) {
            setSelectedMediaIds(prev => prev.filter(sid => sid !== id));
        }
    }, [media, onMediaChange, selectedMediaIds]);

    const handleBulkRemoveMedia = useCallback((ids: string[]) => {
        const newMedia = media.filter(m => !ids.includes(m.id));
        onMediaChange(newMedia);
        setSelectedMediaIds([]);
    }, [media, onMediaChange]);


    // Calculated stats
    const hashtags = useMemo(() => {
        return (caption.match(/#[a-zA-Z0-9_]+/g) || []);
    }, [caption]);

    const mentions = useMemo(() => {
        return (caption.match(/@[a-zA-Z0-9_]+/g) || []);
    }, [caption]);

    return (
        <div className={cn('flex h-full flex-col bg-[var(--bg-primary)]', className)}>
            {/* ... existing header ... */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
                <span className="text-sm text-[var(--text-muted)]">Write your content or</span>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onOpenTemplates}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
                    >
                        <Bookmark className="h-4 w-4" />
                        Templates
                    </button>
                </div>
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

                    {/* Emoji Picker Popover */}
                    {showEmojiPicker && (
                        <div ref={emojiPickerRef} className="absolute bottom-16 right-4 z-50 shadow-xl">
                            <EmojiPicker onEmojiClick={onEmojiClick} width={300} height={400} />
                        </div>
                    )}

                    {/* Formatting Toolbar */}
                    <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-2">
                        <div className="flex items-center gap-1">
                            <ToolbarButton icon={Bold} label="Bold" onClick={() => wrapSelection('**', '**')} testId="format-bold" />
                            <ToolbarButton icon={Italic} label="Italic" onClick={() => wrapSelection('_', '_')} testId="format-italic" />
                            <div className="mx-2 h-4 w-px bg-[var(--border)]" />
                            <ToolbarButton icon={List} label="List" onClick={toggleList} testId="format-list" />
                            <ToolbarButton icon={Hash} label="Hashtag" onClick={() => insertAtCursor('#')} />
                            <ToolbarButton icon={AtSign} label="Mention" onClick={() => insertAtCursor('@')} />
                            <div className="mx-2 h-4 w-px bg-[var(--border)]" />
                            <ToolbarButton icon={Type} label="Heading" onClick={toggleHeading} />
                            <ToolbarButton
                                icon={Smile}
                                label="Emoji"
                                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                                isActive={showEmojiPicker}
                            />
                            <ToolbarButton icon={Link} label="Link" onClick={insertLink} />
                        </div>
                        <div className="flex items-center gap-1">
                            <ToolbarButton icon={Sparkles} label="AI Assistant" onClick={onAIAssist} />
                            <ToolbarButton icon={Image} label="Media" onClick={onAddMedia} />
                        </div>
                    </div>
                </div>

                {/* Platform Character Counts - Compact Horizontal Row */}
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-[var(--bg-tertiary)] p-3">
                    {selectedPlatforms.map((platform) => {
                        // Map Platform type to PLATFORM_LIMITS key
                        const platformKey = platform as keyof typeof PLATFORM_LIMITS;
                        return (
                            <div key={platform} className="flex items-center gap-2">
                                <PlatformIcon platform={platform} size={16} />
                                <CharacterCounter
                                    text={caption}
                                    platform={platformKey}
                                    compact
                                />
                            </div>
                        );
                    })}
                </div>

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
                            platforms={selectedPlatforms}
                            postTypes={postTypes}
                        />
                    </div>
                )}

                {/* Labels */}
                {labels.length > 0 && (
                    <div className="mt-6">
                        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                            Labels
                        </h4>
                        <div className="flex flex-wrap gap-2">
                            {labels.map((label) => (
                                <button
                                    key={label}
                                    onClick={() => {
                                        if (onLabelsChange) {
                                            if (selectedLabels.includes(label)) {
                                                onLabelsChange(selectedLabels.filter((l) => l !== label));
                                            } else {
                                                onLabelsChange([...selectedLabels, label]);
                                            }
                                        }
                                    }}
                                    className={cn(
                                        'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                                        selectedLabels.includes(label)
                                            ? 'bg-[var(--accent-gold)] text-white'
                                            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]'
                                    )}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Stats */}
                <div className="mt-6 flex items-center gap-6 text-xs text-[var(--text-muted)]">
                    <span>
                        <strong className="text-[var(--text-primary)]">{hashtags.length}</strong> hashtags
                    </span>
                    <span>
                        <strong className="text-[var(--text-primary)]">{mentions.length}</strong> mentions
                    </span>
                    <span>
                        <strong className="text-[var(--text-primary)]">{media.length}</strong> media files
                    </span>
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
    testId?: string;
}

function ToolbarButton({ icon: Icon, label, onClick, isActive, testId }: ToolbarButtonProps) {
    return (
        <button
            onClick={onClick}
            title={label}
            data-testid={testId}
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
