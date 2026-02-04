/**
 * Shared types and PhoneFrame for platform previews
 */

'use client';

import { cn } from '@/lib/utils';
import type { MediaItem } from '../platform-editor';

// Re-export for backward compatibility
export type { MediaItem };

export interface PreviewProps {
    caption: string;
    media: MediaItem[];
    accountName?: string;
}

interface PhoneFrameProps {
    children: React.ReactNode;
    dark?: boolean;
    className?: string;
}

/**
 * Helper component to render media with proper video fallback
 * Why: Videos without thumbnails should show a play button, not try to render video URL as img src
 */
interface MediaPreviewProps {
    media: MediaItem | undefined;
    className?: string;
    dark?: boolean;
}

export function MediaPreview({ media, className, dark = false }: MediaPreviewProps) {
    if (!media) return null;

    // Video without thumbnail - show play button fallback
    if (media.type === 'video' && !media.thumbnailUrl) {
        return (
            <div className={cn('flex h-full w-full items-center justify-center', dark ? 'bg-gray-800' : 'bg-gray-200', className)}>
                <div className={cn('flex h-12 w-12 items-center justify-center rounded-full', dark ? 'bg-white/20' : 'bg-white/90')}>
                    <div className={cn('ml-1 h-0 w-0 border-l-[12px] border-t-[8px] border-b-[8px] border-t-transparent border-b-transparent', dark ? 'border-l-white' : 'border-l-gray-800')} />
                </div>
            </div>
        );
    }

    // Image or video with thumbnail
    return (
        <img
            src={media.thumbnailUrl || media.url}
            alt=""
            className={cn('h-full w-full object-cover', className)}
        />
    );
}

/**
 * Reusable phone frame with iOS status bar
 */
export function PhoneFrame({ children, dark = false, className }: PhoneFrameProps) {
    return (
        <div className={cn('mx-auto max-w-[260px]', className)}>
            <div className="rounded-[28px] bg-black p-2">
                <div className={cn(
                    'overflow-hidden rounded-[22px]',
                    dark ? 'bg-black text-white' : 'bg-white text-gray-900'
                )}>
                    {/* Status Bar */}
                    <div className={cn(
                        'flex items-center justify-between px-4 py-1.5 text-[10px] font-medium',
                        dark ? 'text-white' : 'text-black'
                    )}>
                        <span>9:41</span>
                        <div className="flex items-center gap-1">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 3C7.5 3 3.75 6.03 2 10c1.75 3.97 5.5 7 10 7s8.25-3.03 10-7c-1.75-3.97-5.5-7-10-7z" opacity="0.3" />
                                <path d="M1 9l2 2m18 0l2-2M5 5l1.5 1.5M19 5l-1.5 1.5" />
                            </svg>
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2 17h20v4H2z" />
                                <path d="M4 13h16v2H4zM6 9h12v2H6zM9 5h6v2H9z" opacity="0.5" />
                            </svg>
                            <div className="flex items-center">
                                <div className="h-2.5 w-5 rounded-sm border border-current p-px">
                                    <div className="h-full w-3/4 rounded-sm bg-current" />
                                </div>
                            </div>
                        </div>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}

