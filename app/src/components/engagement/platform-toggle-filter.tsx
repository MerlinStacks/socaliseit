/**
 * Platform Toggle Filter Component
 * Horizontal row of clickable platform logo buttons for multi-select filtering
 * 
 * Why: Replaces dropdown with visual, touch-friendly toggle buttons
 */

'use client';

import { cn } from '@/lib/utils';
import { PlatformIcon } from '@/components/compose/profile-selector';
import { PLATFORM_SPECS, type Platform } from '@/lib/platform-config';

/** Platforms relevant for engagement (have comment APIs) */
const ENGAGEMENT_PLATFORMS: Platform[] = ['instagram', 'facebook', 'tiktok', 'youtube'];

interface PlatformToggleFilterProps {
    /** Currently selected platforms (empty = all) */
    selected: Platform[];
    /** Callback when selection changes */
    onChange: (platforms: Platform[]) => void;
    /** Optional: Override which platforms to show */
    platforms?: Platform[];
    /** Optional: Additional CSS classes */
    className?: string;
}

/**
 * Multi-select platform filter with logo buttons
 * Empty selection = "All" platforms (no filtering)
 */
export function PlatformToggleFilter({
    selected,
    onChange,
    platforms = ENGAGEMENT_PLATFORMS,
    className,
}: PlatformToggleFilterProps) {
    const togglePlatform = (platform: Platform) => {
        if (selected.includes(platform)) {
            // Deselect - remove from array
            onChange(selected.filter((p) => p !== platform));
        } else {
            // Select - add to array
            onChange([...selected, platform]);
        }
    };

    const clearAll = () => {
        onChange([]);
    };

    const isAllSelected = selected.length === 0;

    return (
        <div className={cn('flex items-center gap-2 flex-wrap', className)}>
            {/* All Button */}
            <button
                onClick={clearAll}
                className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200',
                    'border',
                    isAllSelected
                        ? 'bg-[var(--accent-gold)] text-white border-[var(--accent-gold)]'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--text-muted)]'
                )}
            >
                All
            </button>

            {/* Platform Buttons */}
            {platforms.map((platform) => {
                const spec = PLATFORM_SPECS[platform];
                const isSelected = selected.includes(platform);

                return (
                    <button
                        key={platform}
                        onClick={() => togglePlatform(platform)}
                        title={spec.name}
                        className={cn(
                            'relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200',
                            'border-2',
                            isSelected
                                ? 'scale-110 shadow-md'
                                : 'opacity-50 hover:opacity-75 grayscale hover:grayscale-0'
                        )}
                        style={{
                            backgroundColor: isSelected ? `${spec.color}20` : 'var(--bg-tertiary)',
                            borderColor: isSelected ? spec.color : 'transparent',
                            color: isSelected ? spec.color : 'var(--text-muted)',
                        }}
                    >
                        <PlatformIcon platform={platform} size={18} />
                    </button>
                );
            })}
        </div>
    );
}
