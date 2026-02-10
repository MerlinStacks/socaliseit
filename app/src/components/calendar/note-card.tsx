/**
 * NoteCard — Compact calendar note display for day cells
 * Why: Shows note title with left-colored border, lock icon for private,
 * and opens note-modal on click for editing
 */

'use client';

import { Lock } from 'lucide-react';
import { type CalendarNote } from './calendar-types';
import { cn } from '@/lib/utils';

export interface NoteCardProps {
    note: CalendarNote;
    onClick: () => void;
    /** Compact mode for week view */
    compact?: boolean;
}

/**
 * Renders a single calendar note as a colored card.
 * The left border uses the note's chosen color for quick identification.
 */
export function NoteCard({ note, onClick, compact }: NoteCardProps) {
    return (
        <button
            data-testid="calendar-note"
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className={cn(
                'w-full text-left rounded-md border-l-[3px] transition-all duration-150',
                'bg-[var(--bg-secondary)]/80 hover:bg-[var(--bg-tertiary)]',
                'border border-transparent hover:border-[var(--border)]',
                compact ? 'p-1 gap-1' : 'p-1.5 gap-1.5'
            )}
            style={{ borderLeftColor: note.color }}
        >
            <div className="flex items-center gap-1 min-w-0">
                {/* Colored dot */}
                <span
                    className="h-2 w-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: note.color }}
                />

                {/* Title */}
                <span className={cn(
                    'truncate font-medium',
                    compact ? 'text-[9px]' : 'text-[10px]'
                )}>
                    {note.title}
                </span>

                {/* Private indicator */}
                {note.isPrivate && (
                    <Lock className="h-2.5 w-2.5 flex-shrink-0 text-amber-500" />
                )}
            </div>

            {/* Description preview (non-compact only) */}
            {!compact && note.description && (
                <p className="text-[9px] text-[var(--text-muted)] truncate mt-0.5 pl-3">
                    {note.description}
                </p>
            )}
        </button>
    );
}
