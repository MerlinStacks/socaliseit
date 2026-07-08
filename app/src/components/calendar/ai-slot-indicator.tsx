
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiRecommendedSlot } from '@/hooks/use-ai-recommended-slots';
import { Platform } from '@/generated/prisma/enums';
import {
    InstagramIcon,
    FacebookIcon,
    LinkedinIcon,
    YoutubeIcon,
    TikTokIcon,
} from '@/components/settings/connected-accounts/platform-icons';

interface AiSlotIndicatorProps {
    /** The AI-recommended slot data */
    slot: AiRecommendedSlot;
    /** Whether to show compact version (icon only) */
    compact?: boolean;
    /** Click handler to create a post at this time */
    onClick?: () => void;
    /** Additional CSS classes */
    className?: string;
}

const PlatformIcon = ({ platform, className }: { platform: Platform, className?: string }) => {
    switch (platform) {
        case 'INSTAGRAM': return <InstagramIcon className={className} />;
        case 'FACEBOOK': return <FacebookIcon className={className} />;
        case 'LINKEDIN': return <LinkedinIcon className={className} />;
        case 'YOUTUBE': return <YoutubeIcon className={className} />;
        case 'TIKTOK': return <TikTokIcon className={className} />;
        default: return <Sparkles className={className} />;
    }
};

const PlatformColor: Record<Platform, string> = {
    INSTAGRAM: 'text-pink-500',
    FACEBOOK: 'text-blue-600',
    LINKEDIN: 'text-blue-700',
    YOUTUBE: 'text-red-600',
    TIKTOK: 'text-black dark:text-white',
    PINTEREST: 'text-red-700',
    GOOGLE_BUSINESS: 'text-blue-500',
    BLUESKY: 'text-blue-400',
    META: 'text-blue-600',
    THREADS: 'text-black dark:text-white',
    MANUAL: 'text-gray-500',
};

/**
 * Displays a subtle indicator for AI-recommended posting times.
 * Shows a faded sparkle icon with tooltip on hover.
 */
export function AiSlotIndicator({
    slot,
    compact = false,
    onClick,
    className,
}: AiSlotIndicatorProps) {
    const formattedTime = formatTime(slot.hour, slot.minute);
    const platformColor = PlatformColor[slot.platform] || 'text-[var(--accent-gold)]';

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group flex items-center gap-1.5 rounded-md transition-all',
                'opacity-60 hover:opacity-100',
                platformColor,
                compact ? 'p-1' : 'px-2 py-1',
                onClick && 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800',
                className
            )}
            title={`Best time to post on ${slot.platform} – ${formattedTime}\n${slot.reason}`}
            aria-label={`AI recommends posting on ${slot.platform} at ${formattedTime}: ${slot.reason}`}
        >
            <PlatformIcon platform={slot.platform} className={cn('shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />

            {!compact && (
                <span className="text-xs font-medium">
                    {formattedTime}
                </span>
            )}

            {/* Tooltip on hover */}
            <div className={cn(
                'absolute left-full ml-2 z-50 hidden group-hover:block',
                'whitespace-nowrap rounded-lg px-3 py-2',
                'bg-popover border border-border shadow-lg',
                'text-xs text-popover-foreground'
            )}>
                <div className="flex items-center gap-1.5 font-medium">
                    <PlatformIcon platform={slot.platform} className={cn("h-3 w-3", platformColor)} />
                    Best for {slot.platform}
                </div>
                <p className="mt-1 text-muted-foreground">
                    {slot.reason}
                </p>
                <p className="mt-0.5 text-green-500 font-medium">
                    +{slot.reachImprovement}% reach
                </p>
            </div>
        </button>
    );
}

/**
 * Inline AI recommendation badge for empty slots
 */
export function AiSlotBadge({
    slot,
    onClick,
    className,
}: Omit<AiSlotIndicatorProps, 'compact'>) {
    const platformColor = PlatformColor[slot.platform] || 'text-[var(--accent-gold)]';

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'flex items-center gap-1 rounded px-1.5 py-0.5',
                'bg-gray-100 dark:bg-gray-800',
                platformColor,
                'opacity-70 hover:opacity-100 transition-opacity',
                'text-xs',
                className
            )}
            title={`${slot.platform}: ${slot.reason} • +${slot.reachImprovement}% reach`}
        >
            <PlatformIcon platform={slot.platform} className="h-2.5 w-2.5" />
            <span>AI</span>
        </button>
    );
}

import { format } from 'date-fns';

/**
 * Format hour/minute to display time
 * Why: Uses date-fns format() for deterministic SSR/CSR output
 */
function formatTime(hour: number, minute: number): string {
    const date = new Date(2000, 0, 1, hour, minute, 0);
    return minute > 0 ? format(date, 'h:mm a') : format(date, 'h a');
}
