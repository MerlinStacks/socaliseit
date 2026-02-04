/**
 * Media Override Editor
 * Allows per-platform media customization
 */

'use client';

import { Image, Play } from 'lucide-react';
import type { MediaItem } from './platform-editor';

interface MediaOverrideEditorProps {
    media: MediaItem[];
    override?: string[];
    onChange: (value?: string[]) => void;
    onAddMedia?: () => void;
}

/**
 * Media override editor showing thumbnails
 * Why: Allows different media to be used for different platforms
 */
export function MediaOverrideEditor({ media, override, onChange, onAddMedia }: MediaOverrideEditorProps) {
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
