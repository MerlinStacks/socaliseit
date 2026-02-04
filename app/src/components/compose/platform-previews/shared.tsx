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
