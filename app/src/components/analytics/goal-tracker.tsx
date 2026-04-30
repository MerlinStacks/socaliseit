/**
 * Goal Tracker Component
 * Let users set follower/engagement targets and track progress.
 *
 * Why: Goal tracking creates accountability and gives users a reason
 * to return to analytics. Uses localStorage to avoid schema migration.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Target, Plus, X, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Goal {
    id: string;
    platform: string;
    metric: 'followers' | 'engagement_rate' | 'posts_per_week';
    target: number;
    deadline: string; // ISO date
    createdAt: string;
}

interface GoalTrackerProps {
    currentFollowers: number;
    currentEngagementRate: number;
    currentPostsThisWeek: number;
}

const STORAGE_KEY = 'socialise-analytics-goals';

const METRIC_LABELS: Record<Goal['metric'], string> = {
    followers: 'Followers',
    engagement_rate: 'Engagement Rate (%)',
    posts_per_week: 'Posts / Week',
};

/**
 * Goal cards with progress rings and an add-goal modal.
 */
export function GoalTracker({
    currentFollowers,
    currentEngagementRate,
    currentPostsThisWeek,
}: GoalTrackerProps) {
    const [goals, setGoals] = useState<Goal[]>([]);
    const [showAdd, setShowAdd] = useState(false);

    /* Hydrate from localStorage on mount */
    useEffect(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) setGoals(JSON.parse(raw));
        } catch { /* ignore parse errors */ }
    }, []);

    const persist = useCallback((next: Goal[]) => {
        setGoals(next);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            // Ignore storage errors (private mode, quota exceeded)
        }
    }, []);

    const addGoal = useCallback((goal: Omit<Goal, 'id' | 'createdAt'>) => {
        const next = [...goals, { ...goal, id: crypto.randomUUID(), createdAt: new Date().toISOString() }];
        persist(next);
        setShowAdd(false);
    }, [goals, persist]);

    const removeGoal = useCallback((id: string) => {
        persist(goals.filter(g => g.id !== id));
    }, [goals, persist]);

    /** Resolve current value for a metric */
    const getCurrentValue = (metric: Goal['metric']): number => {
        switch (metric) {
            case 'followers': return currentFollowers;
            case 'engagement_rate': return currentEngagementRate;
            case 'posts_per_week': return currentPostsThisWeek;
        }
    };

    return (
        <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
                <Target className="h-4 w-4 text-emerald-500" />
                <h3 className="font-semibold">Goal Tracking</h3>
                <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto h-7 px-3 text-xs border-[var(--accent-gold)]/30 text-[var(--accent-gold)] hover:bg-[var(--accent-gold)]/10"
                    onClick={() => setShowAdd(true)}
                >
                    <Plus className="h-3 w-3 mr-1" /> Add Goal
                </Button>
            </div>

            {goals.length === 0 && !showAdd && (
                <div className="flex flex-col items-center justify-center py-8">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 mb-3">
                        <Target className="h-6 w-6 text-emerald-500" />
                    </div>
                    <p className="text-sm text-[var(--text-muted)] text-center max-w-xs">
                        Set follower or engagement targets to track progress over time.
                    </p>
                </div>
            )}

            {/* Goal Cards */}
            <div className="space-y-3">
                {goals.map(goal => {
                    const current = getCurrentValue(goal.metric);
                    const pct = goal.target > 0 ? Math.min((current / goal.target) * 100, 100) : 0;
                    const daysLeft = Math.max(0, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86_400_000));
                    const status = pct >= 100 ? 'complete' : daysLeft === 0 ? 'overdue' : pct >= 60 ? 'on-track' : 'behind';
                    const statusColor = {
                        complete: 'text-emerald-500',
                        'on-track': 'text-emerald-400',
                        behind: 'text-red-400',
                        overdue: 'text-red-500',
                    }[status];

                    return (
                        <div
                            key={goal.id}
                            className="relative rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] p-3"
                        >
                            <button
                                onClick={() => removeGoal(goal.id)}
                                className="absolute top-2 right-2 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                                title="Remove goal"
                            >
                                <Trash2 className="h-3 w-3" />
                            </button>
                            {/* Progress Ring */}
                            <div className="flex items-center gap-3 mb-2">
                                <svg width="40" height="40" viewBox="0 0 40 40" className="flex-shrink-0">
                                    <circle cx="20" cy="20" r="16" fill="none" stroke="var(--border)" strokeWidth="3" />
                                    <circle
                                        cx="20" cy="20" r="16" fill="none"
                                        stroke={pct >= 100 ? '#10b981' : pct >= 60 ? '#34d399' : '#f87171'}
                                        strokeWidth="3"
                                        strokeDasharray={`${(pct / 100) * 100.53} 100.53`}
                                        strokeLinecap="round"
                                        transform="rotate(-90 20 20)"
                                    />
                                    <text x="20" y="20" textAnchor="middle" dominantBaseline="central"
                                        className="fill-[var(--text-primary)] text-[9px] font-bold">
                                        {Math.round(pct)}%
                                    </text>
                                </svg>
                                <div className="min-w-0">
                                    <p className="text-xs font-medium truncate capitalize">{goal.platform}</p>
                                    <p className="text-xs text-[var(--text-muted)]">{METRIC_LABELS[goal.metric]}</p>
                                </div>
                            </div>
                            <div className="text-xs text-[var(--text-secondary)]">
                                <span className="font-medium">{formatDisplay(current, goal.metric)}</span>
                                <span className="text-[var(--text-muted)]"> / {formatDisplay(goal.target, goal.metric)}</span>
                            </div>
                            <p className={`text-xs mt-1 ${statusColor}`}>
                                {status === 'complete' ? '🎉 Goal reached!' : `${daysLeft}d remaining`}
                            </p>
                        </div>
                    );
                })}
            </div>

            {/* Add Goal Modal */}
            {showAdd && <AddGoalModal onAdd={addGoal} onClose={() => setShowAdd(false)} />}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Add Goal Modal
// ---------------------------------------------------------------------------

function AddGoalModal({ onAdd, onClose }: {
    onAdd: (g: Omit<Goal, 'id' | 'createdAt'>) => void;
    onClose: () => void;
}) {
    const [platform, setPlatform] = useState('instagram');
    const [metric, setMetric] = useState<Goal['metric']>('followers');
    const [target, setTarget] = useState('');
    const [deadline, setDeadline] = useState('');

    return (
        <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold">New Goal</h4>
                <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                    <X className="h-4 w-4" />
                </button>
            </div>
            <div className="grid grid-cols-4 gap-3">
                <select
                    value={platform}
                    onChange={e => setPlatform(e.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs"
                >
                    {['instagram', 'facebook', 'tiktok', 'youtube', 'pinterest', 'linkedin', 'threads', 'google_business'].map(p => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                </select>
                <select
                    value={metric}
                    onChange={e => setMetric(e.target.value as Goal['metric'])}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs"
                >
                    <option value="followers">Followers</option>
                    <option value="engagement_rate">Engagement Rate</option>
                    <option value="posts_per_week">Posts / Week</option>
                </select>
                <input
                    type="number"
                    placeholder="Target"
                    value={target}
                    onChange={e => setTarget(e.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs"
                />
                <input
                    type="date"
                    value={deadline}
                    onChange={e => setDeadline(e.target.value)}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1.5 text-xs"
                />
            </div>
            <Button
                size="sm"
                className="mt-3 h-7 text-xs"
                disabled={!target || !deadline}
                onClick={() => onAdd({ platform, metric, target: Number(target), deadline })}
            >
                Add Goal
            </Button>
        </div>
    );
}

// ---------------------------------------------------------------------------

function formatDisplay(n: number, metric: Goal['metric']): string {
    if (metric === 'engagement_rate') return `${n.toFixed(2)}%`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
}
