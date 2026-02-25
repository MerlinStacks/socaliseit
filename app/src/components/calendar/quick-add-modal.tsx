/**
 * Quick Add Modal — Rapidly create draft placeholders on the calendar
 * Why: Streamlined UI to build a content calendar without writing captions
 * or uploading media, featuring content pillar color-coding.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, CalendarPlus, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import { toast } from '@/components/ui/toast';
import { useComposeAccounts } from '@/hooks/use-compose-data';
import { PlatformIcon } from '@/components/compose/platform-icons';
import { PostTypeIcon } from '@/components/compose/post-type-icon';
import { type PostType } from '@/lib/platform-config';
import { PLATFORMS } from '@/components/calendar/calendar-types';
import { useRouter } from 'next/navigation';
import { useComposerPreferencesStore } from '@/lib/stores/composer-preferences-store';

export interface QuickAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSaved: () => void;
    /** The date clicked on the calendar */
    defaultDate?: Date | null;
    /** Currently selected platform filters from calendar */
    selectedPlatforms?: string[];
}

interface ContentPillar {
    id: string;
    name: string;
    color: string;
}

const COMMON_POST_TYPES: { type: PostType; label: string }[] = [
    { type: 'feed', label: 'Feed' },
    { type: 'reel', label: 'Reel' },
    { type: 'story', label: 'Story' },
    { type: 'carousel', label: 'Carousel' },
];

export function QuickAddModal({ isOpen, onClose, onSaved, defaultDate, selectedPlatforms }: QuickAddModalProps) {
    const router = useRouter();
    const { accounts, isLoadingAccounts } = useComposeAccounts();

    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
    const [selectedPostType, setSelectedPostType] = useState<PostType>('feed');
    const [selectedPillarId, setSelectedPillarId] = useState<string | null>(null);
    const [time, setTime] = useState('12:00');

    const [pillars, setPillars] = useState<ContentPillar[]>([]);
    const [isLoadingPillars, setIsLoadingPillars] = useState(false);
    const [saving, setSaving] = useState(false);

    // Reset state & fetch pillars when opened
    useEffect(() => {
        if (isOpen) {
            if (accounts.length > 0) {
                if (selectedPlatforms && selectedPlatforms.length > 0 && selectedPlatforms.length < PLATFORMS.length) {
                    // Preselect accounts that match the filtered platforms
                    const matchedIds = accounts
                        .filter(a => selectedPlatforms.includes(a.platform.toLowerCase()))
                        .map(a => a.id);
                    setSelectedAccountIds(matchedIds);
                } else {
                    // Fall back to remembered accounts from last composer use
                    const { lastSelectedAccountIds } = useComposerPreferencesStore.getState();
                    if (lastSelectedAccountIds && lastSelectedAccountIds.length > 0) {
                        const validIds = lastSelectedAccountIds.filter(id => accounts.some(a => a.id === id));
                        setSelectedAccountIds(validIds);
                    } else {
                        setSelectedAccountIds([]);
                    }
                }
            }

            setSelectedPostType('feed');
            setSelectedPillarId(null);
            setTime('12:00');

            if (pillars.length === 0) {
                setIsLoadingPillars(true);
                fetch('/api/pillars')
                    .then(res => res.json())
                    .then(data => {
                        if (data.pillars) setPillars(data.pillars);
                    })
                    .catch(err => logger.error({ err }, 'Failed to fetch pillars'))
                    .finally(() => setIsLoadingPillars(false));
            }
        }
    }, [isOpen, accounts, selectedPlatforms, pillars.length]);

    const handleSave = useCallback(async () => {
        if (selectedAccountIds.length === 0) {
            toast('error', 'Select profiles', 'Please select at least one social profile.');
            return;
        }
        if (!defaultDate) return;

        setSaving(true);
        try {
            // Combine date and time
            const [hours, minutes] = time.split(':').map(Number);
            const scheduledAt = new Date(defaultDate);
            scheduledAt.setHours(hours, minutes, 0, 0);

            // Construct platformSettings object with the selected postType
            const platformSettings = selectedAccountIds.reduce((acc, accountId) => {
                acc[accountId] = { postType: selectedPostType };
                return acc;
            }, {} as Record<string, { postType: string }>);

            const payload = {
                platformAccountIds: selectedAccountIds,
                scheduledAt: scheduledAt.toISOString(),
                pillarId: selectedPillarId,
                autoPublish: false, // Placeholders are always drafts by default unless scheduled from compose
                platformSettings,
            };

            const res = await fetch('/api/posts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create placeholders');
            }

            toast('success', 'Placeholders added', 'Quick-added drafts to your calendar.');
            onSaved();
            onClose();
        } catch (error) {
            logger.error({ error }, 'Failed to quick add posts');
            toast('error', 'Failed to add', error instanceof Error ? error.message : 'Could not add placeholders.');
        } finally {
            setSaving(false);
        }
    }, [selectedAccountIds, selectedPostType, selectedPillarId, time, defaultDate, onSaved, onClose]);

    const handleOpenComposer = () => {
        if (!defaultDate) return;
        const dateStr = defaultDate.toISOString().slice(0, 10);
        const params = new URLSearchParams({ date: dateStr, time });
        if (selectedAccountIds.length > 0) {
            params.set('accounts', selectedAccountIds.join(','));
        }
        if (selectedPillarId) {
            params.set('pillar', selectedPillarId);
        }
        router.push(`/compose?${params.toString()}`);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-lg mx-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/95 backdrop-blur-xl shadow-2xl flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 flex-shrink-0">
                    <div className="flex items-center gap-2 text-lg font-semibold">
                        <CalendarPlus className="h-5 w-5 text-[var(--accent-gold)]" />
                        Quick Add
                    </div>
                    <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-[var(--bg-tertiary)] transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Body (Scrollable) */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

                    {/* Time Input */}
                    <div>
                        <label className="text-xs font-medium text-[var(--text-muted)] mb-1.5 block">Scheduled Time</label>
                        <input
                            type="time"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            className="w-full max-w-[150px] rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                        />
                    </div>

                    {/* Profiles */}
                    <div>
                        <label className="text-xs font-medium text-[var(--text-muted)] mb-2 block flex justify-between">
                            <span>Select Profiles</span>
                            <span className="text-[10px] font-normal">{selectedAccountIds.length} selected</span>
                        </label>
                        {isLoadingAccounts ? (
                            <div className="text-sm text-[var(--text-muted)] animate-pulse">Loading profiles...</div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                {accounts.map(account => {
                                    const isSelected = selectedAccountIds.includes(account.id);
                                    return (
                                        <div
                                            key={account.id}
                                            onClick={() => {
                                                if (isSelected) {
                                                    setSelectedAccountIds(prev => prev.filter(id => id !== account.id));
                                                } else {
                                                    setSelectedAccountIds(prev => [...prev, account.id]);
                                                }
                                            }}
                                            className={cn(
                                                "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors",
                                                isSelected
                                                    ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/5"
                                                    : "border-[var(--border)] hover:bg-[var(--bg-tertiary)] hover:border-[var(--border-strong)]"
                                            )}
                                        >
                                            <div className={cn(
                                                "flex-shrink-0 h-4 w-4 rounded-full border flex items-center justify-center transition-colors",
                                                isSelected ? "bg-[var(--accent-gold)] border-[var(--accent-gold)]" : "border-[var(--text-muted)]"
                                            )}>
                                                {isSelected && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                                            </div>
                                            <PlatformIcon platform={account.platform} size={14} className="flex-shrink-0" />
                                            <span className="text-sm truncate font-medium">{account.name}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {accounts.length === 0 && !isLoadingAccounts && (
                            <div className="text-sm text-amber-500 bg-amber-500/10 p-2 rounded">No connected profiles found.</div>
                        )}
                    </div>

                    {/* Post Type */}
                    <div>
                        <label className="text-xs font-medium text-[var(--text-muted)] mb-2 block">Post Type</label>
                        <div className="flex flex-wrap gap-2">
                            {COMMON_POST_TYPES.map(pt => (
                                <button
                                    key={pt.type}
                                    onClick={() => setSelectedPostType(pt.type)}
                                    className={cn(
                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                                        selectedPostType === pt.type
                                            ? "border-[var(--accent-gold)] bg-[var(--accent-gold)] text-[var(--bg-primary)]"
                                            : "border-[var(--border)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                                    )}
                                >
                                    <PostTypeIcon postType={pt.type} size={12} className={selectedPostType === pt.type ? "text-[var(--bg-primary)]" : "text-[var(--text-muted)]"} />
                                    {pt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content Pillar */}
                    <div>
                        <label className="text-xs font-medium text-[var(--text-muted)] mb-2 block">Content Pillar (Optional)</label>
                        {isLoadingPillars ? (
                            <div className="text-sm text-[var(--text-muted)] animate-pulse">Loading pillars...</div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    onClick={() => setSelectedPillarId(null)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                                        selectedPillarId === null
                                            ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--bg-primary)]"
                                            : "border-[var(--border)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                                    )}
                                >
                                    None
                                </button>
                                {pillars.map(pillar => (
                                    <button
                                        key={pillar.id}
                                        onClick={() => setSelectedPillarId(pillar.id)}
                                        className={cn(
                                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                                            selectedPillarId === pillar.id
                                                ? "border-transparent ring-2 ring-offset-1 ring-offset-[var(--bg-secondary)]"
                                                : "border-[var(--border)] hover:bg-[var(--bg-tertiary)]"
                                        )}
                                        style={{
                                            ...(selectedPillarId === pillar.id
                                                ? { backgroundColor: pillar.color, color: '#fff', '--tw-ring-color': pillar.color } as React.CSSProperties
                                                : { color: 'var(--text-secondary)' })
                                        }}
                                    >
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: selectedPillarId === pillar.id ? '#fff' : pillar.color }} />
                                        {pillar.name}
                                    </button>
                                ))}
                            </div>
                        )}
                        {pillars.length === 0 && !isLoadingPillars && (
                            <div className="text-xs text-[var(--text-muted)] mt-1 italic">
                                Create content pillars in settings to color-code your calendar.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-4 flex-shrink-0 bg-[var(--bg-secondary)]/95 rounded-b-2xl">
                    <Button variant="ghost" size="sm" onClick={handleOpenComposer} className="text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                        <ExternalLink className="h-4 w-4 mr-1.5" /> Open in Composer
                    </Button>
                    <div className="flex gap-2">
                        <Button variant="secondary" onClick={onClose}>Cancel</Button>
                        <Button onClick={handleSave} disabled={saving || selectedAccountIds.length === 0}>
                            {saving ? 'Adding...' : 'Add Placeholders'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
