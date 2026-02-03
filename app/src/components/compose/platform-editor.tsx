/**
 * Platform Editor Component
 * Central rich text editor with platform badges and character counts
 */

'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
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
import { formatDuration, formatFileSize } from '@/lib/formatters';

export interface MediaItem {
    id: string;
    url: string;
    thumbnailUrl?: string;
    type: 'image' | 'video';
    width?: number;
    height?: number;
    duration?: number;
    size: number;
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
    className,
}: PlatformEditorProps) {
    const [isFocused, setIsFocused] = useState(false);
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

    /**
     * Toggle bullet point at the start of the current line
     * Why: Allows users to create bulleted lists for content organization
     */
    const toggleList = useCallback(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const cursorPos = textarea.selectionStart;
        const lineStart = caption.lastIndexOf('\n', cursorPos - 1) + 1;
        const lineEnd = caption.indexOf('\n', cursorPos);
        const actualEnd = lineEnd === -1 ? caption.length : lineEnd;

        const line = caption.substring(lineStart, actualEnd);
        const isBulleted = line.startsWith('• ');

        const newLine = isBulleted ? line.slice(2) : '• ' + line;
        const newValue = caption.substring(0, lineStart) + newLine + caption.substring(actualEnd);

        onCaptionChange(newValue);

        // Restore cursor position, adjusting for bullet prefix change
        const offset = isBulleted ? -2 : 2;
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(cursorPos + offset, cursorPos + offset);
        });
    }, [caption, onCaptionChange]);

    /**
     * Handle toolbar button clicks for unimplemented features
     * Why: Provides feedback that the feature exists but isn't available yet
     */
    const handleComingSoon = useCallback((feature: string) => {
        toast('info', `${feature} coming soon`, 'This feature will be available in a future update.');
    }, []);

    // Calculate character counts per platform
    const characterCounts = useMemo(() => {
        return selectedPlatforms.map((platform) => {
            const spec = PLATFORM_SPECS[platform];
            const limit = spec.characterLimits.caption.max;
            const recommended = spec.characterLimits.caption.recommended;
            const count = caption.length;
            const percentage = (count / limit) * 100;

            let status: 'ok' | 'warning' | 'error' = 'ok';
            if (count > limit) {
                status = 'error';
            } else if (recommended && count > recommended) {
                status = 'warning';
            } else if (percentage > 80) {
                status = 'warning';
            }

            return {
                platform,
                spec,
                count,
                limit,
                recommended,
                percentage,
                status,
            };
        });
    }, [caption, selectedPlatforms]);

    // Extract hashtags from caption
    const hashtags = useMemo(() => {
        const matches = caption.match(/#[\w]+/g) || [];
        return matches.map((tag) => tag.toLowerCase());
    }, [caption]);

    // Extract mentions from caption
    const mentions = useMemo(() => {
        const matches = caption.match(/@[\w]+/g) || [];
        return matches;
    }, [caption]);

    // Undo toast for media removal
    const showUndoToast = useUndoToast();

    /**
     * Remove media with undo support
     * Why: Provides 5-second recovery window for accidental removals
     */
    const handleRemoveMedia = useCallback(
        (id: string) => {
            const removedItem = media.find((m) => m.id === id);
            if (!removedItem) return;

            // Remove immediately (optimistic)
            const newMedia = media.filter((m) => m.id !== id);
            onMediaChange(newMedia);

            showUndoToast({
                type: 'remove_media',
                description: `Media removed`,
                onUndo: async () => {
                    // Restore the removed item
                    onMediaChange([...newMedia, removedItem]);
                },
                // No onExecute needed - already removed optimistically
            });
        },
        [media, onMediaChange, showUndoToast]
    );

    return (
        <div className={cn('flex h-full flex-col bg-[var(--bg-primary)]', className)}>
            {/* Header with AI + Templates buttons */}
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
                    <button
                        onClick={onAIAssist}
                        className="flex items-center gap-2 rounded-lg border border-[var(--accent-gold)] bg-[var(--accent-gold-light)] px-4 py-2 text-sm font-medium text-[var(--accent-gold)] transition-colors hover:bg-[var(--accent-gold)] hover:text-white"
                    >
                        <Sparkles className="h-4 w-4" />
                        Use the AI Assistant
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
                            <ToolbarButton icon={Type} label="Formatting" onClick={() => handleComingSoon('Text formatting')} />
                            <ToolbarButton icon={Smile} label="Emoji" onClick={() => handleComingSoon('Emoji picker')} />
                            <ToolbarButton icon={Link} label="Link" onClick={() => handleComingSoon('Link insertion')} />
                        </div>
                        <div className="flex items-center gap-1">
                            <ToolbarButton icon={Image} label="Media" onClick={onAddMedia} />
                        </div>
                    </div>
                </div>

                {/* Platform Character Counts with Progress Bars */}
                <div className="mt-4 space-y-3">
                    {selectedPlatforms.map((platform) => {
                        // Map Platform type to PLATFORM_LIMITS key
                        const platformKey = platform as keyof typeof PLATFORM_LIMITS;
                        return (
                            <div key={platform} className="rounded-lg bg-[var(--bg-tertiary)] p-3">
                                <div className="mb-2 flex items-center gap-2">
                                    <PlatformIcon platform={platform} size={16} />
                                    <span className="text-xs font-medium capitalize text-[var(--text-secondary)]">
                                        {platform}
                                    </span>
                                </div>
                                <CharacterCounter
                                    text={caption}
                                    platform={platformKey}
                                    showRecommended
                                />
                                {hashtags.length > 0 && platformKey in PLATFORM_LIMITS && (
                                    <div className="mt-2">
                                        <HashtagCounter
                                            hashtags={hashtags}
                                            platform={platformKey}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Media Preview */}
                {media.length > 0 && (
                    <div className="mt-6">
                        <div className="mb-3 flex items-center justify-between">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                Media ({media.length})
                            </h4>
                            <button
                                onClick={onAddMedia}
                                className="text-xs font-medium text-[var(--accent-gold)] hover:underline"
                            >
                                + Add more
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-3">
                            {media.map((item) => (
                                <MediaThumbnail
                                    key={item.id}
                                    item={item}
                                    onRemove={() => handleRemoveMedia(item.id)}
                                />
                            ))}
                        </div>
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

interface MediaThumbnailProps {
    item: MediaItem;
    onRemove: () => void;
}

function MediaThumbnail({ item, onRemove }: MediaThumbnailProps) {
    return (
        <div className="group relative h-20 w-20 overflow-hidden rounded-lg">
            {/* Thumbnail */}
            <img
                src={item.thumbnailUrl || item.url}
                alt="Media thumbnail"
                className="h-full w-full object-cover"
            />

            {/* Video indicator */}
            {item.type === 'video' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90">
                        <div className="ml-0.5 h-0 w-0 border-l-[8px] border-t-[5px] border-b-[5px] border-l-[var(--text-primary)] border-t-transparent border-b-transparent" />
                    </div>
                </div>
            )}

            {/* Remove button */}
            <button
                onClick={onRemove}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-red-500 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100"
            >
                ✕
            </button>

            {/* Info overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[9px] text-white">
                {item.type === 'video' && item.duration
                    ? formatDuration(item.duration)
                    : item.width && item.height
                        ? `${item.width}×${item.height}`
                        : formatFileSize(item.size)}
            </div>
        </div>
    );
}
