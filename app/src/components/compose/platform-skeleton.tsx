'use client';

/**
 * Platform-Specific Skeleton Shapes
 * Custom loading states that match each platform's preview style
 * Why: Better perceived performance with contextually appropriate skeletons
 */

import { cn } from '@/lib/utils';
import type { Platform } from '@/lib/platform-config';

interface PlatformSkeletonProps {
    platform: Platform;
    className?: string;
}

/**
 * Instagram-style skeleton (square with profile header)
 */
function InstagramSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('w-full max-w-[320px] bg-white rounded-lg overflow-hidden', className)}>
            {/* Header */}
            <div className="flex items-center gap-3 p-3">
                <div className="h-8 w-8 rounded-full bg-gray-200 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
                    <div className="h-2 w-16 rounded bg-gray-100 animate-pulse" />
                </div>
            </div>
            {/* Image area (1:1 aspect) */}
            <div className="aspect-square w-full bg-gray-200 animate-pulse" />
            {/* Action bar */}
            <div className="flex items-center gap-4 p-3">
                <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
                <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
                <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
            </div>
            {/* Caption */}
            <div className="px-3 pb-3 space-y-2">
                <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-gray-200 animate-pulse" />
            </div>
        </div>
    );
}

/**
 * TikTok-style skeleton (9:16 vertical)
 */
function TikTokSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('w-full max-w-[200px] bg-black rounded-xl overflow-hidden', className)}>
            {/* Video area (9:16 aspect) */}
            <div className="aspect-[9/16] w-full bg-gray-800 animate-pulse relative">
                {/* Right-side action icons */}
                <div className="absolute right-2 bottom-20 space-y-4">
                    <div className="h-10 w-10 rounded-full bg-gray-700 animate-pulse" />
                    <div className="h-10 w-10 rounded-full bg-gray-700 animate-pulse" />
                    <div className="h-10 w-10 rounded-full bg-gray-700 animate-pulse" />
                </div>
                {/* Bottom text */}
                <div className="absolute left-3 bottom-3 right-14 space-y-2">
                    <div className="h-3 w-20 rounded bg-gray-700 animate-pulse" />
                    <div className="h-3 w-full rounded bg-gray-700 animate-pulse" />
                </div>
            </div>
        </div>
    );
}

/**
 * YouTube-style skeleton (16:9 horizontal)
 */
function YouTubeSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('w-full max-w-[360px] bg-white rounded-lg overflow-hidden', className)}>
            {/* Thumbnail (16:9 aspect) */}
            <div className="aspect-video w-full bg-gray-200 animate-pulse" />
            {/* Info row */}
            <div className="flex gap-3 p-3">
                <div className="h-9 w-9 rounded-full bg-gray-200 animate-pulse flex-shrink-0" />
                <div className="flex-1 space-y-2">
                    <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
                    <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
                    <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
                </div>
            </div>
        </div>
    );
}

/**
 * Facebook-style skeleton
 */
function FacebookSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('w-full max-w-[360px] bg-white rounded-lg overflow-hidden shadow', className)}>
            {/* Header */}
            <div className="flex items-center gap-3 p-3">
                <div className="h-10 w-10 rounded-full bg-gray-200 animate-pulse" />
                <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-28 rounded bg-gray-200 animate-pulse" />
                    <div className="h-2 w-20 rounded bg-gray-100 animate-pulse" />
                </div>
            </div>
            {/* Caption */}
            <div className="px-3 pb-3 space-y-2">
                <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-5/6 rounded bg-gray-200 animate-pulse" />
            </div>
            {/* Image */}
            <div className="aspect-[1.91/1] w-full bg-gray-200 animate-pulse" />
            {/* Reactions bar */}
            <div className="flex items-center justify-between p-3 border-t">
                <div className="h-4 w-16 rounded bg-gray-200 animate-pulse" />
                <div className="flex gap-6">
                    <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
                    <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
                </div>
            </div>
        </div>
    );
}

/**
 * LinkedIn-style skeleton
 */
function LinkedInSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('w-full max-w-[360px] bg-white rounded-lg overflow-hidden border', className)}>
            {/* Header */}
            <div className="flex items-center gap-3 p-4">
                <div className="h-12 w-12 rounded-full bg-gray-200 animate-pulse" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-32 rounded bg-gray-200 animate-pulse" />
                    <div className="h-2 w-24 rounded bg-gray-100 animate-pulse" />
                    <div className="h-2 w-16 rounded bg-gray-100 animate-pulse" />
                </div>
            </div>
            {/* Content */}
            <div className="px-4 pb-3 space-y-2">
                <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
                <div className="h-3 w-2/3 rounded bg-gray-200 animate-pulse" />
            </div>
            {/* Image */}
            <div className="aspect-[1.91/1] w-full bg-gray-200 animate-pulse" />
            {/* Actions */}
            <div className="flex justify-around p-3 border-t">
                <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
                <div className="h-4 w-12 rounded bg-gray-200 animate-pulse" />
            </div>
        </div>
    );
}

/**
 * Pinterest-style skeleton (2:3 vertical pin)
 */
function PinterestSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('w-full max-w-[236px] bg-white rounded-2xl overflow-hidden', className)}>
            {/* Pin image (2:3 aspect) */}
            <div className="aspect-[2/3] w-full bg-gray-200 animate-pulse" />
            {/* Info */}
            <div className="p-3 space-y-2">
                <div className="h-4 w-full rounded bg-gray-200 animate-pulse" />
                <div className="flex items-center gap-2">
                    <div className="h-6 w-6 rounded-full bg-gray-200 animate-pulse" />
                    <div className="h-3 w-20 rounded bg-gray-200 animate-pulse" />
                </div>
            </div>
        </div>
    );
}

/**
 * Threads-style skeleton (text-first microblog)
 * Why: Matches the text-heavy, thread-line layout of the Threads preview
 */
function ThreadsSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('w-full max-w-[320px] bg-white rounded-lg overflow-hidden', className)}>
            {/* Header */}
            <div className="flex items-center justify-center py-2 border-b border-gray-100">
                <div className="h-6 w-6 rounded bg-gray-200 animate-pulse" />
            </div>
            {/* Post row */}
            <div className="flex gap-3 p-3">
                <div className="flex flex-col items-center">
                    <div className="h-10 w-10 rounded-full bg-gray-200 animate-pulse" />
                    <div className="mt-1 flex-1 w-0.5 bg-gray-100 animate-pulse min-h-[16px]" />
                </div>
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-gray-200 animate-pulse" />
                    <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
                    <div className="h-3 w-5/6 rounded bg-gray-200 animate-pulse" />
                    <div className="h-3 w-2/3 rounded bg-gray-200 animate-pulse" />
                    {/* Action bar */}
                    <div className="flex gap-4 pt-1">
                        <div className="h-3 w-6 rounded bg-gray-100 animate-pulse" />
                        <div className="h-3 w-6 rounded bg-gray-100 animate-pulse" />
                        <div className="h-3 w-6 rounded bg-gray-100 animate-pulse" />
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * Generic/default skeleton
 */
function DefaultSkeleton({ className }: { className?: string }) {
    return (
        <div className={cn('w-full max-w-[320px] bg-[var(--bg-secondary)] rounded-lg overflow-hidden', className)}>
            <div className="aspect-square w-full bg-[var(--bg-tertiary)] animate-pulse" />
            <div className="p-4 space-y-2">
                <div className="h-4 w-3/4 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-[var(--bg-tertiary)] animate-pulse" />
            </div>
        </div>
    );
}

/**
 * Platform-specific preview skeleton
 */
export function PlatformSkeleton({ platform, className }: PlatformSkeletonProps) {
    const skeletons: Record<Platform, typeof InstagramSkeleton> = {
        instagram: InstagramSkeleton,
        tiktok: TikTokSkeleton,
        youtube: YouTubeSkeleton,
        facebook: FacebookSkeleton,
        linkedin: LinkedInSkeleton,
        pinterest: PinterestSkeleton,
        bluesky: DefaultSkeleton,
        threads: ThreadsSkeleton,
        google_business: DefaultSkeleton,
        manual: DefaultSkeleton,
    };

    const SkeletonComponent = skeletons[platform] || DefaultSkeleton;
    return <SkeletonComponent className={className} />;
}

export default PlatformSkeleton;
