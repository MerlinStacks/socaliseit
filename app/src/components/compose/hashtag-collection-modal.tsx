'use client';

/**
 * Hashtag Collection Modal
 * Modal dialog for creating and editing hashtag collections.
 */

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { X, Hash } from 'lucide-react';
import type { HashtagCollection } from '@/hooks/use-hashtag-collections';

interface HashtagCollectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (name: string, hashtags: string[]) => Promise<void>;
    collection: HashtagCollection | null;
    isSaving: boolean;
}

/**
 * parseHashtags - Split input by commas, spaces, or newlines and normalize
 */
function parseHashtags(input: string): string[] {
    return input
        .split(/[\s,\n]+/)
        .map((tag) => tag.replace(/^#/, '').trim().toLowerCase())
        .filter((tag) => tag.length > 0);
}

export function HashtagCollectionModal({
    isOpen,
    onClose,
    onSave,
    collection,
    isSaving,
}: HashtagCollectionModalProps) {
    const [name, setName] = useState('');
    const [hashtagsInput, setHashtagsInput] = useState('');
    const [error, setError] = useState('');

    // Reset form when modal opens/closes or collection changes
    useEffect(() => {
        if (isOpen) {
            if (collection) {
                setName(collection.name);
                setHashtagsInput(collection.hashtags.join(', '));
            } else {
                setName('');
                setHashtagsInput('');
            }
            setError('');
        }
    }, [isOpen, collection]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const trimmedName = name.trim();
        if (!trimmedName) {
            setError('Name is required');
            return;
        }

        const hashtags = parseHashtags(hashtagsInput);
        if (hashtags.length === 0) {
            setError('At least one hashtag is required');
            return;
        }

        try {
            await onSave(trimmedName, hashtags);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save collection');
        }
    };

    if (!isOpen) return null;

    const parsedHashtags = parseHashtags(hashtagsInput);
    const isEditing = !!collection;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative w-full max-w-md mx-4 bg-[var(--bg-primary)] rounded-2xl shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient">
                            <Hash className="h-5 w-5 text-white" />
                        </div>
                        <h2 className="text-lg font-semibold">
                            {isEditing ? 'Edit Collection' : 'New Hashtag Collection'}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {/* Name Field */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Collection Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Summer Vibes"
                            className="w-full px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] focus:border-[var(--accent-gold)] focus:outline-none transition-colors"
                            autoFocus
                        />
                    </div>

                    {/* Hashtags Field */}
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Hashtags
                        </label>
                        <textarea
                            value={hashtagsInput}
                            onChange={(e) => setHashtagsInput(e.target.value)}
                            placeholder="Enter hashtags separated by commas, spaces, or new lines&#10;e.g., summer, beach, vacation"
                            rows={4}
                            className="w-full px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] focus:border-[var(--accent-gold)] focus:outline-none transition-colors resize-none"
                        />
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                            {parsedHashtags.length} hashtag{parsedHashtags.length !== 1 ? 's' : ''} detected
                        </p>
                    </div>

                    {/* Preview */}
                    {parsedHashtags.length > 0 && (
                        <div className="p-3 rounded-lg bg-[var(--bg-tertiary)]">
                            <label className="block text-xs font-medium text-[var(--text-muted)] mb-2">
                                Preview
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {parsedHashtags.slice(0, 10).map((tag, index) => (
                                    <span
                                        key={index}
                                        className="px-2 py-1 rounded-full text-xs bg-[var(--accent-gold-light)] text-[var(--accent-gold)]"
                                    >
                                        #{tag}
                                    </span>
                                ))}
                                {parsedHashtags.length > 10 && (
                                    <span className="px-2 py-1 rounded-full text-xs bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                                        +{parsedHashtags.length - 10} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <p className="text-sm text-[var(--error)]">{error}</p>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onClose}
                            disabled={isSaving}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSaving}
                            className="bg-gradient text-white"
                        >
                            {isSaving ? (
                                <LoadingSpinner size="sm" />
                            ) : isEditing ? (
                                'Save Changes'
                            ) : (
                                'Create Collection'
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
