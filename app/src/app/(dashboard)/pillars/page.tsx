/**
 * Content Pillars Page
 * Manage content strategy with pillars - now with real database integration
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Plus, TrendingUp, BarChart3,
    FileText, Trash2, Edit2, Target, Loader2, X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Pillar {
    id: string;
    name: string;
    description: string | null;
    color: string;
    icon: string | null;
    posts: number;
    percentage: number;
}

export default function PillarsPage() {
    const [pillars, setPillars] = useState<Pillar[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingPillar, setEditingPillar] = useState<Pillar | null>(null);

    const fetchPillars = useCallback(async () => {
        try {
            const response = await fetch('/api/pillars');
            if (!response.ok) throw new Error('Failed to fetch pillars');
            const data = await response.json();
            setPillars(data.pillars);
        } catch (error) {
            console.error('Error fetching pillars:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPillars();
    }, [fetchPillars]);

    /**
     * Delete a content pillar
     */
    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure? Posts using this pillar will be unassigned.')) return;

        try {
            const response = await fetch(`/api/pillars?id=${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete pillar');
            setPillars(prev => prev.filter(p => p.id !== id));
        } catch (error) {
            console.error('Error deleting pillar:', error);
        }
    };

    const totalPosts = pillars.reduce((sum, p) => sum + p.posts, 0);

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <Target className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">Content Pillars</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Organize your content strategy
                        </p>
                    </div>
                </div>
                <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4" />
                    New Pillar
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent-gold)]" />
                    </div>
                ) : pillars.length === 0 ? (
                    <div className="text-center py-12">
                        <Target className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                        <h3 className="mt-4 text-lg font-medium">No content pillars yet</h3>
                        <p className="text-sm text-[var(--text-muted)]">
                            Create pillars to organize your content by topic or category
                        </p>
                        <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
                            <Plus className="h-4 w-4" />
                            Create First Pillar
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Content Balance Overview */}
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <BarChart3 className="h-5 w-5 text-[var(--accent-gold)]" />
                                Content Balance
                            </h2>
                            <div className="flex gap-1 h-4 rounded-full overflow-hidden bg-[var(--bg-tertiary)]">
                                {pillars.map((pillar) => (
                                    <div
                                        key={pillar.id}
                                        className="h-full transition-all"
                                        style={{
                                            width: `${pillar.percentage}%`,
                                            backgroundColor: pillar.color,
                                            minWidth: pillar.percentage > 0 ? '4px' : '0'
                                        }}
                                        title={`${pillar.name}: ${pillar.percentage}%`}
                                    />
                                ))}
                            </div>
                            <div className="flex flex-wrap gap-4 mt-4">
                                {pillars.map((pillar) => (
                                    <div key={pillar.id} className="flex items-center gap-2 text-sm">
                                        <div
                                            className="h-3 w-3 rounded-full"
                                            style={{ backgroundColor: pillar.color }}
                                        />
                                        <span>{pillar.name}</span>
                                        <span className="text-[var(--text-muted)]">{pillar.percentage}%</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Pillars Grid */}
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {pillars.map((pillar) => (
                                <div
                                    key={pillar.id}
                                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="flex h-10 w-10 items-center justify-center rounded-lg"
                                                style={{ backgroundColor: `${pillar.color}20` }}
                                            >
                                                <FileText className="h-5 w-5" style={{ color: pillar.color }} />
                                            </div>
                                            <div>
                                                <h3 className="font-medium">{pillar.name}</h3>
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    {pillar.posts} post{pillar.posts !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => setEditingPillar(pillar)}
                                                className="p-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                            >
                                                <Edit2 className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(pillar.id)}
                                                className="p-2 text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {pillar.description && (
                                        <p className="mt-4 text-sm text-[var(--text-secondary)]">
                                            {pillar.description}
                                        </p>
                                    )}

                                    <div className="mt-4 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                        <TrendingUp className="h-3 w-3" />
                                        <span>{pillar.percentage}% of content</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Stats Footer */}
                        <div className="text-center text-sm text-[var(--text-muted)]">
                            {totalPosts} total post{totalPosts !== 1 ? 's' : ''} across {pillars.length} pillar{pillars.length !== 1 ? 's' : ''}
                        </div>
                    </div>
                )}
            </div>

            {/* Create/Edit Modal */}
            {(showCreateModal || editingPillar) && (
                <PillarModal
                    pillar={editingPillar}
                    onClose={() => {
                        setShowCreateModal(false);
                        setEditingPillar(null);
                    }}
                    onSaved={(savedPillar) => {
                        if (editingPillar) {
                            setPillars(prev => prev.map(p => p.id === savedPillar.id ? savedPillar : p));
                        } else {
                            setPillars(prev => [...prev, savedPillar]);
                        }
                        setShowCreateModal(false);
                        setEditingPillar(null);
                    }}
                />
            )}
        </div>
    );
}

/**
 * Modal for creating/editing pillars
 */
function PillarModal({
    pillar,
    onClose,
    onSaved
}: {
    pillar: Pillar | null;
    onClose: () => void;
    onSaved: (pillar: Pillar) => void;
}) {
    const [name, setName] = useState(pillar?.name || '');
    const [description, setDescription] = useState(pillar?.description || '');
    const [color, setColor] = useState(pillar?.color || '#D4A574');
    const [saving, setSaving] = useState(false);

    const colors = [
        '#D4A574', '#E8B4B8', '#A8D5BA', '#B4C4D4', '#D4B4E8',
        '#E8D4B4', '#B4D4D4', '#D4B4B4', '#B4B4D4', '#D4D4B4'
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name) return;

        setSaving(true);
        try {
            const response = await fetch('/api/pillars', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description: description || null, color })
            });

            if (!response.ok) {
                const errorData = await response.json();
                alert(errorData.error || 'Failed to save pillar');
                return;
            }

            const data = await response.json();
            onSaved({ ...data, posts: 0, percentage: 0 });
        } catch (error) {
            console.error('Error saving pillar:', error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl bg-[var(--bg-secondary)] p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">
                        {pillar ? 'Edit Pillar' : 'New Pillar'}
                    </h2>
                    <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Educational"
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Description (optional)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="What type of content belongs here..."
                            rows={3}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Color</label>
                        <div className="flex flex-wrap gap-2">
                            {colors.map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setColor(c)}
                                    className={cn(
                                        'h-8 w-8 rounded-full transition-transform',
                                        color === c && 'ring-2 ring-offset-2 ring-[var(--accent-gold)] scale-110'
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving || !name}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            {pillar ? 'Save' : 'Create'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
