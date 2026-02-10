/**
 * Platform Activity Banner
 * Shows last post/story times and next scheduled times per connected platform.
 *
 * Why: Gives users an at-a-glance overview of posting cadence across
 * all their connected social accounts without navigating to the calendar.
 */

'use client';

import { Instagram, Youtube, Facebook, Linkedin } from 'lucide-react';
import {
    TikTokIcon,
    PinterestIcon,
    GoogleIcon,
    BlueskyIcon,
    ThreadsIcon,
} from '@/components/settings/connected-accounts/platform-icons';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';
import { PLATFORM_GRADIENTS } from '@/lib/platforms/ui';
import { formatDistanceToNow } from 'date-fns';

/** Shape of activity data passed from the server component */
export interface PlatformActivity {
    platform: Platform;
    accountName: string;
    lastPostAt: string | null;
    lastStoryAt: string | null;
    nextPostAt: string | null;
    nextStoryAt: string | null;
}

/** Map platform IDs to their icon components */
const PLATFORM_ICON_MAP: Record<
    Platform,
    React.ComponentType<{ className?: string }>
> = {
    instagram: Instagram,
    facebook: Facebook,
    youtube: Youtube,
    linkedin: Linkedin,
    tiktok: TikTokIcon,
    pinterest: PinterestIcon,
    google_business: GoogleIcon,
    bluesky: BlueskyIcon,
    threads: ThreadsIcon,
};

/**
 * Format a relative time string, handling ISO strings from the server.
 * Returns a human-readable string like "3 hours ago" or "in 2 days".
 */
function formatRelativeTime(isoString: string | null, direction: 'past' | 'future'): string {
    if (!isoString) return direction === 'past' ? 'No posts yet' : 'None scheduled';
    const date = new Date(isoString);
    return formatDistanceToNow(date, { addSuffix: true });
}

interface PlatformActivityBannerProps {
    activity: PlatformActivity[];
}

/**
 * Renders a horizontally scrollable row of per-platform activity cards
 */
export function PlatformActivityBanner({ activity }: PlatformActivityBannerProps) {
    if (activity.length === 0) return null;

    return (
        <div className="mb-6">
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">
                Platform Activity
            </h3>
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                {activity.map((item) => (
                    <PlatformActivityCard key={`${item.platform}-${item.accountName}`} item={item} />
                ))}
            </div>
        </div>
    );
}

/** Whether a platform supports story post type */
function supportsStories(platform: Platform): boolean {
    return PLATFORM_SPECS[platform].supportedPostTypes.includes('story');
}

interface PlatformActivityCardProps {
    item: PlatformActivity;
}

/**
 * Individual platform card with gradient border, icon, and timing rows
 */
function PlatformActivityCard({ item }: PlatformActivityCardProps) {
    const Icon = PLATFORM_ICON_MAP[item.platform];
    const spec = PLATFORM_SPECS[item.platform];
    const gradients = PLATFORM_GRADIENTS[item.platform];
    const hasStories = supportsStories(item.platform);

    return (
        <div
            className={`
                relative flex-shrink-0 w-[260px] rounded-xl
                bg-[var(--bg-secondary)] border border-[var(--border-primary)]
                overflow-hidden transition-all duration-200
                hover:border-transparent ${gradients.hoverGlow}
            `}
        >
            {/* Gradient top accent bar */}
            <div
                className={`h-1 w-full bg-gradient-to-r ${gradients.gradient}`}
            />

            <div className="p-4">
                {/* Header: icon + platform name */}
                <div className="flex items-center gap-2.5 mb-3">
                    <div
                        className={`
                            flex h-8 w-8 items-center justify-center rounded-lg
                            ${gradients.iconBg} text-white
                        `}
                    >
                        <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{spec.name}</p>
                        <p className="text-[11px] text-[var(--text-muted)] truncate">
                            {item.accountName}
                        </p>
                    </div>
                </div>

                {/* Timing rows */}
                <div className="space-y-1.5 text-xs">
                    <TimingRow
                        label="Last Post"
                        value={formatRelativeTime(item.lastPostAt, 'past')}
                        isEmpty={!item.lastPostAt}
                    />
                    {hasStories && (
                        <TimingRow
                            label="Last Story"
                            value={formatRelativeTime(item.lastStoryAt, 'past')}
                            isEmpty={!item.lastStoryAt}
                        />
                    )}
                    <TimingRow
                        label="Next Post"
                        value={formatRelativeTime(item.nextPostAt, 'future')}
                        isEmpty={!item.nextPostAt}
                        isFuture
                    />
                    {hasStories && (
                        <TimingRow
                            label="Next Story"
                            value={formatRelativeTime(item.nextStoryAt, 'future')}
                            isEmpty={!item.nextStoryAt}
                            isFuture
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

interface TimingRowProps {
    label: string;
    value: string;
    isEmpty: boolean;
    isFuture?: boolean;
}

/**
 * Single label–value row inside a platform card
 */
function TimingRow({ label, value, isEmpty, isFuture }: TimingRowProps) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-[var(--text-muted)] whitespace-nowrap">{label}</span>
            <span
                className={`
                    font-medium truncate text-right
                    ${isEmpty
                        ? 'text-[var(--text-muted)] italic'
                        : isFuture
                            ? 'text-[var(--accent-gold)]'
                            : 'text-[var(--text-primary)]'
                    }
                `}
            >
                {value}
            </span>
        </div>
    );
}
