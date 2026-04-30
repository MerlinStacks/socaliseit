/**
 * Media Library Toolbar
 * Search, view toggle, filters, and selection actions.
 */

'use client';

import { Search, Grid3x3, List, Trash2, Image, Film, CircleDot, Layers } from 'lucide-react';

interface MediaToolbarProps {
    searchQuery: string;
    view: 'grid' | 'list';
    selectedCount: number;
    typeFilter: 'all' | 'image' | 'video';
    usageFilter: 'all' | 'used' | 'unused';
    onSearchChange: (query: string) => void;
    onViewChange: (view: 'grid' | 'list') => void;
    onTypeFilterChange: (filter: 'all' | 'image' | 'video') => void;
    onUsageFilterChange: (filter: 'all' | 'used' | 'unused') => void;
    onDelete: () => void;
    onClearSelection: () => void;
    groupDuplicates: boolean;
    onGroupDuplicatesChange: (grouped: boolean) => void;
}

/**
 * Toolbar with search, filters, view toggle, and selection actions.
 */
export function MediaToolbar({
    searchQuery,
    view,
    selectedCount,
    typeFilter,
    usageFilter,
    onSearchChange,
    onViewChange,
    onTypeFilterChange,
    onUsageFilterChange,
    onDelete,
    onClearSelection,
    groupDuplicates,
    onGroupDuplicatesChange,
}: MediaToolbarProps) {
    return (
        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-4">
            <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    <input
                        type="text"
                        placeholder="Search media..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-10 w-64 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] pl-10 pr-4 text-sm outline-none focus:border-[var(--accent-gold)]"
                    />
                </div>

                {/* Type Filter */}
                <div className="relative">
                    <select
                        value={typeFilter}
                        onChange={(e) => onTypeFilterChange(e.target.value as 'all' | 'image' | 'video')}
                        className="h-10 appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] pl-9 pr-8 text-sm outline-none focus:border-[var(--accent-gold)]"
                    >
                        <option value="all">All Types</option>
                        <option value="image">Images</option>
                        <option value="video">Videos</option>
                    </select>
                    {typeFilter === 'image' ? (
                        <Image className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    ) : typeFilter === 'video' ? (
                        <Film className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    ) : (
                        <Image className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                    )}
                </div>

                {/* Usage Filter */}
                <div className="relative">
                    <select
                        value={usageFilter}
                        onChange={(e) => onUsageFilterChange(e.target.value as 'all' | 'used' | 'unused')}
                        className="h-10 appearance-none rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] pl-9 pr-8 text-sm outline-none focus:border-[var(--accent-gold)]"
                    >
                        <option value="all">All Usage</option>
                        <option value="used">Used</option>
                        <option value="unused">Unused</option>
                    </select>
                    <CircleDot className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                </div>
            </div>

            <div className="flex items-center gap-2">
                {/* Selection actions */}
                {selectedCount > 0 && (
                    <div className="mr-4 flex items-center gap-2">
                        <span className="text-sm text-[var(--text-secondary)]">
                            {selectedCount} selected
                        </span>
                        <button
                            onClick={onDelete}
                            className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-[var(--text-muted)] hover:border-[var(--error)] hover:text-[var(--error)]"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                            onClick={onClearSelection}
                            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        >
                            Clear
                        </button>
                    </div>
                )}

                {/* View toggle */}
                <div className="flex rounded-lg bg-[var(--bg-tertiary)] p-1">
                    <button
                        onClick={() => onViewChange('grid')}
                        className={`rounded-md p-2 ${view === 'grid' ? 'bg-[var(--bg-secondary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                    >
                        <Grid3x3 className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => onViewChange('list')}
                        className={`rounded-md p-2 ${view === 'list' ? 'bg-[var(--bg-secondary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                    >
                        <List className="h-4 w-4" />
                    </button>
                </div>

                {/* Group duplicates toggle */}
                <button
                    onClick={() => onGroupDuplicatesChange(!groupDuplicates)}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition-all ${
                        groupDuplicates
                            ? 'border-[var(--accent-gold)] bg-[var(--accent-gold-light)] text-[var(--accent-gold)]'
                            : 'border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-muted)] hover:border-[var(--text-muted)]'
                    }`}
                    title={groupDuplicates ? 'Show all files individually' : 'Group duplicate & resized files'}
                >
                    <Layers className="h-4 w-4" />
                    <span className="hidden lg:inline">Group</span>
                </button>
            </div>
        </div>
    );
}
