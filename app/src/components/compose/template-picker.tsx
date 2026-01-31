/**
 * Template Picker Component
 * Modal/dropdown for selecting saved caption templates
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, FileText, Hash, Bookmark, X, Plus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface CaptionTemplate {
    id: string;
    name: string;
    caption: string;
    hashtags: string[];
    category: string | null;
    usageCount: number;
}

interface TemplatePickerProps {
    /**
     * Called when a template is selected
     * Why: Parent component handles caption replacement/append logic
     */
    onSelect: (caption: string, hashtags: string[]) => void;
    /**
     * Optional: Current caption to show in "Save as Template" flow
     */
    currentCaption?: string;
    /**
     * Controls modal visibility
     */
    isOpen: boolean;
    /**
     * Called when modal should close
     */
    onClose: () => void;
}

/**
 * Template Picker - allows users to select saved caption/hashtag templates
 * Why: Speed up repetitive content creation with reusable templates
 */
export function TemplatePicker({
    onSelect,
    currentCaption = '',
    isOpen,
    onClose,
}: TemplatePickerProps) {
    const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

    // Save template state
    const [isSaving, setIsSaving] = useState(false);
    const [showSaveForm, setShowSaveForm] = useState(false);
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateCategory, setNewTemplateCategory] = useState('');

    // Fetch templates
    const fetchTemplates = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch('/api/templates');
            if (!response.ok) throw new Error('Failed to load templates');
            const data = await response.json();
            setTemplates(data.templates || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load templates');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) {
            fetchTemplates();
        }
    }, [isOpen, fetchTemplates]);

    // Get unique categories
    const categories = useMemo(() => {
        const cats = new Set<string>();
        templates.forEach((t) => {
            if (t.category) cats.add(t.category);
        });
        return Array.from(cats).sort();
    }, [templates]);

    // Filter templates
    const filteredTemplates = useMemo(() => {
        return templates.filter((t) => {
            const matchesSearch =
                searchQuery === '' ||
                t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                t.caption.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCategory = !selectedCategory || t.category === selectedCategory;
            return matchesSearch && matchesCategory;
        });
    }, [templates, searchQuery, selectedCategory]);

    // Handle template selection
    const handleSelect = async (template: CaptionTemplate) => {
        // Increment usage count in background
        fetch(`/api/templates/${template.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ incrementUsage: true }),
        }).catch(() => {
            // Ignore errors - usage tracking is non-critical
        });

        onSelect(template.caption, template.hashtags);
        onClose();
    };

    // Handle save new template
    const handleSave = async () => {
        if (!newTemplateName.trim() || !currentCaption.trim()) return;

        try {
            setIsSaving(true);
            const response = await fetch('/api/templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newTemplateName.trim(),
                    caption: currentCaption,
                    category: newTemplateCategory.trim() || null,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to save template');
            }

            // Refresh templates and reset form
            await fetchTemplates();
            setShowSaveForm(false);
            setNewTemplateName('');
            setNewTemplateCategory('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save template');
        } finally {
            setIsSaving(false);
        }
    };

    // Handle delete template
    const handleDelete = async (templateId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Delete this template?')) return;

        try {
            const response = await fetch(`/api/templates/${templateId}`, {
                method: 'DELETE',
            });
            if (!response.ok) throw new Error('Failed to delete template');
            setTemplates((prev) => prev.filter((t) => t.id !== templateId));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to delete');
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Caption Templates</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 p-6 pt-0">
                    {/* Search and Filter */}
                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                placeholder="Search templates..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] py-2 pl-10 pr-3 text-sm outline-none focus:border-[var(--accent-gold)]"
                            />
                        </div>
                        {categories.length > 0 && (
                            <select
                                value={selectedCategory || ''}
                                onChange={(e) => setSelectedCategory(e.target.value || null)}
                                className="rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none"
                            >
                                <option value="">All Categories</option>
                                {categories.map((cat) => (
                                    <option key={cat} value={cat}>
                                        {cat}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Template List */}
                    <div className="max-h-[400px] overflow-y-auto">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-gold)]" />
                            </div>
                        ) : error ? (
                            <div className="py-8 text-center text-red-500">{error}</div>
                        ) : filteredTemplates.length === 0 ? (
                            <div className="py-8 text-center text-[var(--text-muted)]">
                                {templates.length === 0
                                    ? 'No templates saved yet'
                                    : 'No templates match your search'}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {filteredTemplates.map((template) => (
                                    <button
                                        key={template.id}
                                        onClick={() => handleSelect(template)}
                                        className="group flex flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-left transition-colors hover:border-[var(--accent-gold)]"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-[var(--accent-gold)]" />
                                                <span className="font-medium">{template.name}</span>
                                                {template.category && (
                                                    <span className="rounded bg-[var(--bg-tertiary)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
                                                        {template.category}
                                                    </span>
                                                )}
                                            </div>
                                            <button
                                                onClick={(e) => handleDelete(template.id, e)}
                                                className="opacity-0 transition-opacity group-hover:opacity-100"
                                            >
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                            </button>
                                        </div>
                                        <p className="line-clamp-2 text-sm text-[var(--text-muted)]">
                                            {template.caption}
                                        </p>
                                        {template.hashtags.length > 0 && (
                                            <div className="flex items-center gap-1 text-xs text-[var(--accent-gold)]">
                                                <Hash className="h-3 w-3" />
                                                <span>{template.hashtags.length} hashtags</span>
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Save Template Form */}
                    {showSaveForm ? (
                        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-4">
                            <div className="flex items-center justify-between">
                                <span className="font-medium">Save Current Caption as Template</span>
                                <button onClick={() => setShowSaveForm(false)}>
                                    <X className="h-4 w-4 text-[var(--text-muted)]" />
                                </button>
                            </div>
                            <input
                                type="text"
                                placeholder="Template name"
                                value={newTemplateName}
                                onChange={(e) => setNewTemplateName(e.target.value)}
                                className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            />
                            <input
                                type="text"
                                placeholder="Category (optional)"
                                value={newTemplateCategory}
                                onChange={(e) => setNewTemplateCategory(e.target.value)}
                                className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            />
                            <Button
                                onClick={handleSave}
                                disabled={!newTemplateName.trim() || !currentCaption.trim() || isSaving}
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Bookmark className="mr-2 h-4 w-4" />
                                        Save Template
                                    </>
                                )}
                            </Button>
                        </div>
                    ) : (
                        <Button
                            variant="secondary"
                            onClick={() => setShowSaveForm(true)}
                            disabled={!currentCaption.trim()}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Save Current Caption as Template
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
