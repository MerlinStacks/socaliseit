/**
 * Media Library Toolbar
 * Search, view toggle, and selection actions.
 */

'use client';

import React from 'react';
import { Search, Grid3x3, List, Trash2 } from 'lucide-react';

interface MediaToolbarProps {
    searchQuery: string;
    view: 'grid' | 'list';
    selectedCount: number;
    onSearchChange: (query: string) => void;
    onViewChange: (view: 'grid' | 'list') => void;
    onDelete: () => void;
    onClearSelection: () => void;
}

/**
 * Toolbar with search, view toggle, and selection actions.
 */
export function MediaToolbar({
    searchQuery,
    view,
    selectedCount,
    onSearchChange,
    onViewChange,
    onDelete,
    onClearSelection,
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
            </div>
        </div>
    );
}
