/**
 * Calendar Filter Components
 * Extracted from calendar page.tsx for 200-line standard compliance
 * 
 * Provides Platform, Post Type, and Status filter dropdowns
 */

'use client';

import { cn } from '@/lib/utils';
import { Filter, FileText, Clock, Check, Sparkles } from 'lucide-react';
import { type Platform, PLATFORMS, platformLabels } from '@/components/calendar/calendar-types';

// Post type filter options
const POST_TYPES = ['feed', 'reel', 'story', 'carousel', 'pin', 'video', 'article', 'thread'] as const;
export type PostTypeFilter = (typeof POST_TYPES)[number];

const postTypeLabels: Record<PostTypeFilter, string> = {
    feed: 'Feed',
    reel: 'Reel',
    story: 'Story',
    carousel: 'Carousel',
    pin: 'Pin',
    video: 'Video',
    article: 'Article',
    thread: 'Thread',
};

// Post status filter options (includes AI Draft as special case)
const POST_STATUSES = ['draft', 'scheduled', 'publishing', 'published', 'failed', 'ai_draft'] as const;
export type PostStatusFilter = (typeof POST_STATUSES)[number];

const postStatusLabels: Record<PostStatusFilter, string> = {
    draft: 'Draft',
    scheduled: 'Scheduled',
    publishing: 'Publishing',
    published: 'Published',
    failed: 'Failed',
    ai_draft: 'AI Draft',
};

export { POST_TYPES, POST_STATUSES };

// Shared dropdown wrapper component
interface FilterDropdownProps {
    label: string;
    icon: React.ReactNode;
    isOpen: boolean;
    onToggle: () => void;
    activeCount: number;
    totalCount: number;
    children: React.ReactNode;
    testId: string;
}

function FilterDropdown({
    label, icon, isOpen, onToggle, activeCount, totalCount, children, testId
}: FilterDropdownProps) {
    const isFiltered = activeCount < totalCount;

    return (
        <div className="relative">
            <button
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                data-testid={testId}
                className={cn(
                    "flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm",
                    isFiltered && "border-[var(--accent-gold)] text-[var(--accent-gold)]"
                )}
            >
                {icon}
                {label}
                {isFiltered && (
                    <span className="ml-1 rounded-full bg-[var(--accent-gold)] px-1.5 text-xs text-white">
                        {activeCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 z-50 min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-2 shadow-lg">
                    {children}
                </div>
            )}
        </div>
    );
}

// Filter option checkbox row
interface FilterOptionProps {
    label: string;
    isSelected: boolean;
    onToggle: () => void;
    testId: string;
    icon?: React.ReactNode;
}

function FilterOption({ label, isSelected, onToggle, testId, icon }: FilterOptionProps) {
    return (
        <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            data-testid={testId}
            className="flex w-full items-center gap-3 px-4 py-2 text-sm hover:bg-[var(--bg-tertiary)]"
        >
            <div className={cn(
                "h-4 w-4 rounded border flex items-center justify-center",
                isSelected
                    ? "bg-[var(--accent-gold)] border-[var(--accent-gold)]"
                    : "border-[var(--border)]"
            )}>
                {isSelected && (
                    <Check className="h-3 w-3 text-white" />
                )}
            </div>
            <span className="flex items-center gap-2">
                {label}
                {icon}
            </span>
        </button>
    );
}

// Filter header with Select All / Clear
interface FilterHeaderProps {
    onSelectAll: () => void;
    onClear: () => void;
}

function FilterHeader({ onSelectAll, onClear }: FilterHeaderProps) {
    return (
        <div className="border-b border-[var(--border)] mb-2 pb-2 px-4">
            <button
                onClick={(e) => { e.stopPropagation(); onSelectAll(); }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
                Select All
            </button>
            <span className="mx-2 text-[var(--text-muted)]">·</span>
            <button
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
                Clear
            </button>
        </div>
    );
}

// Platform Filter Component
interface PlatformFilterProps {
    selectedPlatforms: Platform[];
    setSelectedPlatforms: (platforms: Platform[]) => void;
    isOpen: boolean;
    onToggle: () => void;
}

export function PlatformFilter({
    selectedPlatforms, setSelectedPlatforms, isOpen, onToggle
}: PlatformFilterProps) {
    const togglePlatform = (platform: Platform) => {
        setSelectedPlatforms(
            selectedPlatforms.includes(platform)
                ? selectedPlatforms.filter(p => p !== platform)
                : [...selectedPlatforms, platform]
        );
    };

    return (
        <FilterDropdown
            label="Platform"
            icon={<Filter className="h-4 w-4" />}
            isOpen={isOpen}
            onToggle={onToggle}
            activeCount={selectedPlatforms.length}
            totalCount={PLATFORMS.length}
            testId="platform-filter"
        >
            <FilterHeader
                onSelectAll={() => setSelectedPlatforms([...PLATFORMS])}
                onClear={() => setSelectedPlatforms([])}
            />
            {PLATFORMS.map(platform => (
                <FilterOption
                    key={platform}
                    label={platformLabels[platform]}
                    isSelected={selectedPlatforms.includes(platform)}
                    onToggle={() => togglePlatform(platform)}
                    testId={`filter-${platform}`}
                />
            ))}
        </FilterDropdown>
    );
}

// Post Type Filter Component
interface PostTypeFilterProps {
    selectedPostTypes: PostTypeFilter[];
    setSelectedPostTypes: (types: PostTypeFilter[]) => void;
    isOpen: boolean;
    onToggle: () => void;
}

export function PostTypeFilterDropdown({
    selectedPostTypes, setSelectedPostTypes, isOpen, onToggle
}: PostTypeFilterProps) {
    const togglePostType = (type: PostTypeFilter) => {
        setSelectedPostTypes(
            selectedPostTypes.includes(type)
                ? selectedPostTypes.filter(t => t !== type)
                : [...selectedPostTypes, type]
        );
    };

    return (
        <FilterDropdown
            label="Type"
            icon={<FileText className="h-4 w-4" />}
            isOpen={isOpen}
            onToggle={onToggle}
            activeCount={selectedPostTypes.length}
            totalCount={POST_TYPES.length}
            testId="post-type-filter"
        >
            <FilterHeader
                onSelectAll={() => setSelectedPostTypes([...POST_TYPES])}
                onClear={() => setSelectedPostTypes([])}
            />
            {POST_TYPES.map(type => (
                <FilterOption
                    key={type}
                    label={postTypeLabels[type]}
                    isSelected={selectedPostTypes.includes(type)}
                    onToggle={() => togglePostType(type)}
                    testId={`filter-type-${type}`}
                />
            ))}
        </FilterDropdown>
    );
}

// Status Filter Component
interface StatusFilterProps {
    selectedStatuses: PostStatusFilter[];
    setSelectedStatuses: (statuses: PostStatusFilter[]) => void;
    isOpen: boolean;
    onToggle: () => void;
}

export function StatusFilterDropdown({
    selectedStatuses, setSelectedStatuses, isOpen, onToggle
}: StatusFilterProps) {
    const toggleStatus = (status: PostStatusFilter) => {
        setSelectedStatuses(
            selectedStatuses.includes(status)
                ? selectedStatuses.filter(s => s !== status)
                : [...selectedStatuses, status]
        );
    };

    return (
        <FilterDropdown
            label="Status"
            icon={<Clock className="h-4 w-4" />}
            isOpen={isOpen}
            onToggle={onToggle}
            activeCount={selectedStatuses.length}
            totalCount={POST_STATUSES.length}
            testId="status-filter"
        >
            <FilterHeader
                onSelectAll={() => setSelectedStatuses([...POST_STATUSES])}
                onClear={() => setSelectedStatuses([])}
            />
            {POST_STATUSES.map(status => (
                <FilterOption
                    key={status}
                    label={postStatusLabels[status]}
                    isSelected={selectedStatuses.includes(status)}
                    onToggle={() => toggleStatus(status)}
                    testId={`filter-status-${status}`}
                    icon={status === 'ai_draft' ? <Sparkles className="h-3 w-3 text-[var(--accent-gold)]" /> : undefined}
                />
            ))}
        </FilterDropdown>
    );
}
