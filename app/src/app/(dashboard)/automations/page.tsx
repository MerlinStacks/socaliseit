/**
 * Automations Page
 * Manage DM automations - now with real database integration
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
    Zap, Plus, Play, Pause, Trash2,
    MessageCircle, UserPlus, Hash, TrendingUp,
    Loader2, X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SkeletonAutomationCard } from '@/components/ui/skeleton';

interface Automation {
    id: string;
    name: string;
    trigger: string;
    platform: string;
    message: string;
    isActive: boolean;
    stats: {
        triggered: number;
        delivered: number;
        responseRate: number;
    };
}

export default function AutomationsPage() {
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const fetchAutomations = useCallback(async () => {
        try {
            const response = await fetch('/api/automations');
            if (!response.ok) throw new Error('Failed to fetch automations');
            const data = await response.json();
            setAutomations(data.automations);
        } catch (error) {
            console.error('Error fetching automations:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchAutomations();
    }, [fetchAutomations]);

    /**
     * Toggle automation active state - Optimistic Update
     * Updates UI instantly, reverts if API call fails
     */
    const handleToggle = async (id: string, currentState: boolean) => {
        // Optimistically update UI immediately (instant feedback)
        setAutomations(prev => prev.map(a =>
            a.id === id ? { ...a, isActive: !currentState } : a
        ));

        try {
            const response = await fetch('/api/automations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, isActive: !currentState })
            });

            if (!response.ok) throw new Error('Failed to update automation');

            // Success - state already updated, no action needed
        } catch (error) {
            // Revert to previous state on error
            setAutomations(prev => prev.map(a =>
                a.id === id ? { ...a, isActive: currentState } : a
            ));
            console.error('Error toggling automation:', error);
        }
    };

    /**
     * Delete an automation
     */
    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this automation?')) return;

        try {
            const response = await fetch(`/api/automations?id=${id}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete automation');
            setAutomations(prev => prev.filter(a => a.id !== id));
        } catch (error) {
            console.error('Error deleting automation:', error);
        }
    };

    const triggerIcons: Record<string, React.ElementType> = {
        keyword: Hash,
        new_follower: UserPlus,
        story_mention: MessageCircle,
        comment: MessageCircle,
    };

    const triggerLabels: Record<string, string> = {
        keyword: 'Keyword in DMs',
        new_follower: 'New Follower',
        story_mention: 'Story Mention',
        comment: 'Comment Reply',
    };

    return (
        <div className="flex h-screen flex-col">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)] px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient">
                        <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold">Automations</h1>
                        <p className="text-sm text-[var(--text-muted)]">
                            Auto-respond to DMs, comments, and mentions
                        </p>
                    </div>
                </div>
                <Button onClick={() => setShowCreateModal(true)}>
                    <Plus className="h-4 w-4" />
                    New Automation
                </Button>
            </header>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
                {loading ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        <SkeletonAutomationCard />
                        <SkeletonAutomationCard />
                        <SkeletonAutomationCard />
                    </div>
                ) : automations.length === 0 ? (
                    <div className="text-center py-12">
                        <Zap className="mx-auto h-12 w-12 text-[var(--text-muted)]" />
                        <h3 className="mt-4 text-lg font-medium">No automations yet</h3>
                        <p className="text-sm text-[var(--text-muted)]">
                            Create your first automation to auto-respond to followers
                        </p>
                        <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
                            <Plus className="h-4 w-4" />
                            Create Automation
                        </Button>
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {automations.map((automation) => {
                            const TriggerIcon = triggerIcons[automation.trigger] || MessageCircle;

                            return (
                                <div
                                    key={automation.id}
                                    className={cn(
                                        'rounded-xl border p-6 transition-colors',
                                        automation.isActive
                                            ? 'border-[var(--accent-gold)]/30 bg-[var(--bg-secondary)]'
                                            : 'border-[var(--border)] bg-[var(--bg-tertiary)] opacity-60'
                                    )}
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                'flex h-10 w-10 items-center justify-center rounded-lg',
                                                automation.isActive ? 'bg-[var(--accent-gold)]/10' : 'bg-[var(--bg-tertiary)]'
                                            )}>
                                                <TriggerIcon className={cn(
                                                    'h-5 w-5',
                                                    automation.isActive ? 'text-[var(--accent-gold)]' : 'text-[var(--text-muted)]'
                                                )} />
                                            </div>
                                            <div>
                                                <h3 className="font-medium">{automation.name}</h3>
                                                <p className="text-xs text-[var(--text-muted)]">
                                                    {triggerLabels[automation.trigger] || automation.trigger}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleToggle(automation.id, automation.isActive)}
                                            className={cn(
                                                'rounded-full p-2 transition-colors',
                                                automation.isActive
                                                    ? 'bg-[var(--success)]/10 text-[var(--success)]'
                                                    : 'bg-[var(--bg-tertiary)] text-[var(--text-muted)]'
                                            )}
                                        >
                                            {automation.isActive ? (
                                                <Play className="h-4 w-4" />
                                            ) : (
                                                <Pause className="h-4 w-4" />
                                            )}
                                        </button>
                                    </div>

                                    <p className="mt-4 text-sm text-[var(--text-secondary)] line-clamp-2">
                                        {automation.message}
                                    </p>

                                    <div className="mt-4 flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-4">
                                            <span className="flex items-center gap-1 text-[var(--text-muted)]">
                                                <TrendingUp className="h-3 w-3" />
                                                {automation.stats.triggered} triggered
                                            </span>
                                            <span className="text-[var(--text-muted)]">
                                                {automation.stats.responseRate}% rate
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(automation.id)}
                                            className="text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <CreateAutomationModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(newAuto) => {
                        setAutomations(prev => [newAuto, ...prev]);
                        setShowCreateModal(false);
                    }}
                />
            )}
        </div>
    );
}

/**
 * Modal for creating new automations
 */
function CreateAutomationModal({
    onClose,
    onCreated
}: {
    onClose: () => void;
    onCreated: (automation: Automation) => void;
}) {
    const [name, setName] = useState('');
    const [trigger, setTrigger] = useState('keyword');
    const [platform, setPlatform] = useState('instagram');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !message) return;

        setSaving(true);
        try {
            const response = await fetch('/api/automations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, trigger, platform, message })
            });

            if (!response.ok) throw new Error('Failed to create automation');
            const data = await response.json();
            onCreated(data);
        } catch (error) {
            console.error('Error creating automation:', error);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl bg-[var(--bg-secondary)] p-6">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">New Automation</h2>
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
                            placeholder="e.g., Link in Bio Response"
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1">Trigger</label>
                            <select
                                value={trigger}
                                onChange={(e) => setTrigger(e.target.value)}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            >
                                <option value="keyword">Keyword in DMs</option>
                                <option value="new_follower">New Follower</option>
                                <option value="story_mention">Story Mention</option>
                                <option value="comment">Comment Reply</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-1">Platform</label>
                            <select
                                value={platform}
                                onChange={(e) => setPlatform(e.target.value)}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            >
                                <option value="instagram">Instagram</option>
                                <option value="facebook">Facebook</option>
                                <option value="tiktok">TikTok</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1">Message</label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Enter the auto-reply message..."
                            rows={4}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-gold)]"
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="secondary" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving || !name || !message}>
                            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            Create
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
