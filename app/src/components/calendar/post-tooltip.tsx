/**
 * Post Tooltip Component
 * VistaSocial-style hover tooltip for calendar post cards
 * 
 * Why: Provides quick post details on hover without needing to click
 */

'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import Image from 'next/image';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
import { formatPostType, type Platform, type PostType } from '@/lib/platform-config';
import { type CalendarPost } from './calendar-types';

interface PostTooltipProps {
    post: CalendarPost;
    children: React.ReactNode;
}

/**
 * Get status display text and color
 */
function getStatusStyle(status: string): { label: string; className: string } {
    switch (status.toLowerCase()) {
        case 'published':
            return { label: 'Published', className: 'bg-green-600' };
        case 'scheduled':
            return { label: 'Scheduled', className: 'bg-blue-600' };
        case 'draft':
            return { label: 'Draft', className: 'bg-gray-600' };
        case 'failed':
            return { label: 'Failed', className: 'bg-red-600' };
        case 'publishing':
            return { label: 'Publishing', className: 'bg-yellow-600' };
        default:
            return { label: status, className: 'bg-gray-600' };
    }
}

/**
 * Thumbnail with error fallback for external CDN URLs
 * Why: External platform CDN URLs (TikTok) are user-session-specific
 * and fail with 403 during admin impersonation. Show platform initial as fallback.
 */
function ThumbnailWithFallback({ src, platform, isExternal }: { src: string; platform: string; isExternal: boolean }) {
    const [hasError, setHasError] = useState(false);

    if (hasError) {
        return (
            <div className="relative h-16 w-16 rounded overflow-hidden bg-[var(--bg-tertiary)] flex items-center justify-center">
                <span className="text-lg font-medium uppercase text-[var(--text-muted)]">
                    {platform.charAt(0)}
                </span>
            </div>
        );
    }

    return (
        <div className="relative h-16 w-16 rounded overflow-hidden bg-[var(--bg-tertiary)]">
            <Image
                src={src}
                alt=""
                fill
                className="object-cover"
                sizes="64px"
                unoptimized={isExternal}
                onError={() => setHasError(true)}
            />
        </div>
    );
}

/**
 * Hover tooltip showing post details in VistaSocial style
 */
export function PostTooltip({ post, children }: PostTooltipProps) {
    const postDate = new Date(post.time);
    const statusStyle = getStatusStyle(post.status);
    const postTypeLabel = formatPostType(post.postType as PostType, post.platform as Platform);

    return (
        <Tooltip.Root>
            <Tooltip.Trigger asChild>
                {children}
            </Tooltip.Trigger>
            <Tooltip.Portal>
                <Tooltip.Content
                    className={cn(
                        'z-50 min-w-[200px] max-w-[280px] rounded-lg shadow-xl',
                        'bg-[var(--bg-primary)] border border-[var(--border)]',
                        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
                    )}
                    sideOffset={5}
                    side="top"
                >
                    {/* Status Header - VistaSocial green style */}
                    <div className={cn(
                        'px-3 py-2 rounded-t-lg',
                        statusStyle.className
                    )}>
                        <p className="text-white text-sm font-medium">
                            {statusStyle.label} {postTypeLabel}.
                        </p>
                        <p className="text-white/80 text-xs">
                            {format(postDate, 'MMMM d, h:mm a')}
                            {post.accountName && ` by ${post.accountName.split(' ')[0]}`}
                        </p>
                    </div>

                    {/* Content */}
                    <div className="p-3 space-y-2">
                        {/* Thumbnail - with error fallback for external CDN URLs */}
                        {post.thumbnail && (
                            <ThumbnailWithFallback
                                src={post.thumbnail}
                                platform={post.platform}
                                isExternal={post.isExternal}
                            />
                        )}

                        {/* Account Name */}
                        {post.accountName && (
                            <div className="flex items-center gap-2">
                                <div className="h-5 w-5 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                                    <span className="text-[10px] font-medium uppercase">
                                        {post.platform.charAt(0)}
                                    </span>
                                </div>
                                <span className="text-sm text-[var(--text-primary)]">
                                    {post.accountName}
                                </span>
                            </div>
                        )}

                        {/* Caption preview */}
                        <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                            {post.caption || 'No caption'}
                        </p>

                        {/* Footer */}
                        <p className="text-[10px] text-[var(--text-muted)] pt-1 border-t border-[var(--border)]">
                            {post.isExternal ? 'Synced from platform' : 'Published via web'}
                        </p>
                    </div>

                    <Tooltip.Arrow className="fill-[var(--bg-primary)]" />
                </Tooltip.Content>
            </Tooltip.Portal>
        </Tooltip.Root>
    );
}

export default PostTooltip;
