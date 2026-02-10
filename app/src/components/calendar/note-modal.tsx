/**
 * NoteModal — Create/Edit dialog for calendar notes
 * Why: Provides a glassmorphism-styled form for note CRUD operations
 * with color palette, title, description, and visibility toggle
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Lock, Globe, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { type CalendarNote, NOTE_COLORS } from './calendar-types';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { toast } from '@/components/ui/toast';

export interface NoteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    /** Pre-filled date for new notes (ISO string, e.g. "2026-02-11") */
    defaultDate?: string;
    /** If provided, modal is in edit mode */
    note?: CalendarNote | null;
}

/**
 * Glassmorphism modal for creating or editing a calendar note.
 * Renders a color palette, title/description fields, and privacy toggle.
 */
export function NoteModal({ isOpen, onClose, onSaved, defaultDate, note }: NoteModalProps) {
    const isEdit = !!note;

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [color, setColor] = useState<string>(NOTE_COLORS[0]);
    const [isPrivate, setIsPrivate] = useState(false);
    const [date, setDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Why: Sync form state when note prop changes (switching between create/edit)
    useEffect(() => {
        if (note) {
            setTitle(note.title);
            setDescription(note.description || '');
            setColor(note.color);
            setIsPrivate(note.isPrivate);
            setDate(note.date.slice(0, 10));
        } else {
            setTitle('');
            setDescription('');
            setColor(NOTE_COLORS[0]);
            setIsPrivate(false);
            setDate(defaultDate || new Date().toISOString().slice(0, 10));
        }
        setShowDeleteConfirm(false);
    }, [note, defaultDate, isOpen]);

    const handleSave = useCallback(async () => {
        if (!title.trim()) {
            toast('error', 'Title required', 'Please enter a title for the note.');
            return;
        }

        setSaving(true);
        try {
            const payload = { title: title.trim(), description: description.trim() || null, date, color, isPrivate };

            if (isEdit && note) {
                const res = await fetch(`/api/calendar/notes/${note.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error('Failed to update note');
                toast('success', 'Note updated', 'Your calendar note has been updated.');
            } else {
                const res = await fetch('/api/calendar/notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error('Failed to create note');
                toast('success', 'Note created', 'Your calendar note has been added.');
            }

            onSaved();
            onClose();
        } catch (error) {
            logger.error({ error }, 'Failed to save calendar note');
            toast('error', 'Save failed', 'Could not save the note. Please try again.');
        } finally {
            setSaving(false);
        }
    }, [title, description, date, color, isPrivate, isEdit, note, onSaved, onClose]);

    const handleDelete = useCallback(async () => {
        if (!note) return;
        setDeleting(true);
        try {
            const res = await fetch(`/api/calendar/notes/${note.id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete note');
            toast('success', 'Note deleted', 'The calendar note has been removed.');
            onSaved();
            onClose();
        } catch (error) {
            logger.error({ error }, 'Failed to delete calendar note');
            toast('error', 'Delete failed', 'Could not delete the note. Please try again.');
        } finally {
            setDeleting(false);
        }
    }, [note, onSaved, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-md mx-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/95 backdrop-blur-xl shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
                    <h2 className="text-lg font-semibold">{isEdit ? 'Edit Note' : 'New Note'}</h2>
                    <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-tertiary)] transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="space-y-5 px-6 py-5">
                    {/* Color Palette */}
                    <div>
                        <label className="text-xs font-medium text-[var(--text-muted)] mb-2 block">Color</label>
                        <div className="flex gap-2">
                            {NOTE_COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    className={cn(
                                        'h-7 w-7 rounded-full transition-all duration-150',
                                        color === c ? 'ring-2 ring-offset-2 ring-[var(--text-primary)] ring-offset-[var(--bg-secondary)] scale-110' : 'hover:scale-105'
                                    )}
                                    style={{ backgroundColor: c }}
                                    title={c}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Title */}
                    <div>
                        <label htmlFor="note-title" className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">Title</label>
                        <input
                            id="note-title"
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="e.g. Campaign launch, Team standup"
                            maxLength={100}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)] placeholder:text-[var(--text-muted)]"
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label htmlFor="note-desc" className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">Description <span className="opacity-60">(optional)</span></label>
                        <textarea
                            id="note-desc"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Add details..."
                            rows={3}
                            maxLength={500}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)] placeholder:text-[var(--text-muted)]"
                        />
                    </div>

                    {/* Date */}
                    <div>
                        <label htmlFor="note-date" className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">Date</label>
                        <input
                            id="note-date"
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                        />
                    </div>

                    {/* Visibility Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                            {isPrivate ? <Lock className="h-4 w-4 text-amber-500" /> : <Globe className="h-4 w-4 text-green-500" />}
                            <span>{isPrivate ? 'Private — only you can see this' : 'Public — visible to all team members'}</span>
                        </div>
                        <button
                            onClick={() => setIsPrivate(!isPrivate)}
                            className={cn(
                                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
                                isPrivate ? 'bg-amber-500' : 'bg-[var(--bg-tertiary)]'
                            )}
                        >
                            <span className={cn(
                                'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                                isPrivate ? 'translate-x-5' : 'translate-x-0'
                            )} />
                        </button>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4">
                    <div>
                        {isEdit && !showDeleteConfirm && (
                            <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                            </Button>
                        )}
                        {isEdit && showDeleteConfirm && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-red-400">Sure?</span>
                                <Button variant="danger" size="sm" onClick={handleDelete} disabled={deleting}>
                                    {deleting ? 'Deleting...' : 'Confirm'}
                                </Button>
                                <Button variant="secondary" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving || !title.trim()}>
                            {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
